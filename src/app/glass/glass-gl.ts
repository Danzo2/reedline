import type { ToolcraftImageAsset } from "@/toolcraft/runtime";

import { glassFragmentShaderSource, glassVertexShaderSource } from "./glass-shader";
import { glassPatternTypeIndex, type GlassParameters } from "./glass-values";

export type GlassSourceMapping = Readonly<{
  assetHeight: number;
  assetWidth: number;
  cropHeight: number;
  cropOriginX: number;
  cropOriginY: number;
  cropWidth: number;
  flipX: number;
  flipY: number;
  rotationRad: number;
}>;

export type GlassFrameInput = Readonly<{
  backingHeight: number;
  backingWidth: number;
  noiseSeed: number;
  parameters: GlassParameters;
  sceneHeight: number;
  sceneWidth: number;
  shift: number;
  source: GlassSourceMapping;
}>;

const uniformNames = [
  "uSource",
  "uSceneSize",
  "uPixelScale",
  "uSourceRotation",
  "uSourceFlip",
  "uAssetSize",
  "uCropOrigin",
  "uCropSize",
  "uAmount",
  "uDispersion",
  "uFrost",
  "uReflection",
  "uReflectionScale",
  "uPatternType",
  "uRepeats",
  "uAngle",
  "uContrast",
  "uImperfections",
  "uImperfectionScale",
  "uShift",
  "uNoiseAmount",
  "uNoiseSize",
  "uNoiseSeed",
] as const;

type UniformName = (typeof uniformNames)[number];

export class GlassRendererError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GlassRendererError";
  }
}

/**
 * Cover-fits the (rotated/flipped) source photo into the product scene, which is
 * the editable output artboard: scale proportionally until the scene is fully
 * covered, then crop the overflow (no letterbox, no distortion).
 */
/** Natural size plus runtime transform of the refracted photo or clip. */
export type GlassSourceGeometry = Readonly<{
  sourceSize: Readonly<{ height: number; width: number }>;
  transform?: ToolcraftImageAsset["transform"];
}>;

export function getGlassSourceMapping(
  asset: GlassSourceGeometry,
  sceneWidth: number,
  sceneHeight: number,
): GlassSourceMapping {
  const rotationDeg = asset.transform?.rotationDeg ?? 0;
  const quarterTurn = rotationDeg === 90 || rotationDeg === 270;
  const sourceWidth = Math.max(1, asset.sourceSize.width);
  const sourceHeight = Math.max(1, asset.sourceSize.height);
  const rotatedWidth = quarterTurn ? sourceHeight : sourceWidth;
  const rotatedHeight = quarterTurn ? sourceWidth : sourceHeight;
  const scale = Math.max(sceneWidth / rotatedWidth, sceneHeight / rotatedHeight);
  return Object.freeze({
    assetHeight: sourceHeight * scale,
    assetWidth: sourceWidth * scale,
    cropHeight: 1,
    cropOriginX: 0,
    cropOriginY: 0,
    cropWidth: 1,
    flipX: asset.transform?.flipHorizontal ? -1 : 1,
    flipY: asset.transform?.flipVertical ? -1 : 1,
    rotationRad: (rotationDeg * Math.PI) / 180,
  });
}

function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new GlassRendererError("Could not allocate a WebGL shader.");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? "unknown error";
    gl.deleteShader(shader);
    throw new GlassRendererError(`Reeded glass shader failed to compile: ${log}`);
  }
  return shader;
}

/** One WebGL program bound to one canvas. Owns texture + buffers. */
export class GlassGlRenderer {
  private readonly canvas: HTMLCanvasElement | OffscreenCanvas;
  private readonly gl: WebGLRenderingContext;
  private readonly program: WebGLProgram;
  private readonly buffer: WebGLBuffer;
  private readonly texture: WebGLTexture;
  private readonly uniforms: Record<UniformName, WebGLUniformLocation | null>;
  private uploadedSource: TexImageSource | null = null;
  private disposed = false;

  constructor(canvas: HTMLCanvasElement | OffscreenCanvas) {
    this.canvas = canvas;
    const gl = canvas.getContext("webgl", {
      alpha: true,
      antialias: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: true,
    }) as WebGLRenderingContext | null;
    if (!gl) throw new GlassRendererError("WebGL is unavailable in this browser.");
    this.gl = gl;
    const vertex = compileShader(gl, gl.VERTEX_SHADER, glassVertexShaderSource);
    const fragment = compileShader(gl, gl.FRAGMENT_SHADER, glassFragmentShaderSource);
    const program = gl.createProgram();
    if (!program) throw new GlassRendererError("Could not allocate a WebGL program.");
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new GlassRendererError(
        `Reeded glass program failed to link: ${gl.getProgramInfoLog(program) ?? "unknown"}`,
      );
    }
    this.program = program;
    const buffer = gl.createBuffer();
    const texture = gl.createTexture();
    if (!buffer || !texture) throw new GlassRendererError("Could not allocate WebGL resources.");
    this.buffer = buffer;
    this.texture = texture;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    this.uniforms = Object.fromEntries(
      uniformNames.map((name) => [name, gl.getUniformLocation(program, name)]),
    ) as Record<UniformName, WebGLUniformLocation | null>;
  }

  get maxBackingSize(): number {
    return Math.min(
      this.gl.getParameter(this.gl.MAX_RENDERBUFFER_SIZE) as number,
      this.gl.getParameter(this.gl.MAX_VIEWPORT_DIMS)[0] as number,
    );
  }

  /**
   * Uploads the source texture. Images upload once per bitmap; a video element
   * keeps its identity across frames, so `refresh` re-uploads its current frame.
   */
  setSource(source: TexImageSource, options?: Readonly<{ refresh?: boolean }>): void {
    if (this.disposed || (this.uploadedSource === source && !options?.refresh)) return;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    this.uploadedSource = source;
  }

  render(input: GlassFrameInput): void {
    if (this.disposed) throw new GlassRendererError("Reeded glass renderer was disposed.");
    if (!this.uploadedSource) throw new GlassRendererError("Reeded glass source is not ready.");
    const gl = this.gl;
    const width = Math.max(1, Math.round(input.backingWidth));
    const height = Math.max(1, Math.round(input.backingHeight));
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    const position = gl.getAttribLocation(this.program, "aPosition");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);

    const u = this.uniforms;
    const p = input.parameters;
    const s = input.source;
    gl.uniform1i(u.uSource, 0);
    gl.uniform2f(u.uSceneSize, input.sceneWidth, input.sceneHeight);
    gl.uniform1f(u.uPixelScale, width / Math.max(input.sceneWidth, 1e-6));
    gl.uniform1f(u.uSourceRotation, s.rotationRad);
    gl.uniform2f(u.uSourceFlip, s.flipX, s.flipY);
    gl.uniform2f(u.uAssetSize, s.assetWidth, s.assetHeight);
    gl.uniform2f(u.uCropOrigin, s.cropOriginX, s.cropOriginY);
    gl.uniform2f(u.uCropSize, s.cropWidth, s.cropHeight);
    gl.uniform1f(u.uAmount, p.amount);
    gl.uniform1f(u.uDispersion, p.dispersion);
    gl.uniform1f(u.uFrost, p.frost);
    gl.uniform1f(u.uReflection, p.reflection);
    gl.uniform1f(u.uReflectionScale, p.reflectionScale);
    gl.uniform1f(u.uPatternType, glassPatternTypeIndex[p.patternType]);
    gl.uniform1f(u.uRepeats, p.repeats);
    gl.uniform1f(u.uAngle, (p.angleDeg * Math.PI) / 180);
    gl.uniform1f(u.uContrast, p.contrast);
    gl.uniform1f(u.uImperfections, p.imperfections);
    gl.uniform1f(u.uImperfectionScale, p.imperfectionScale);
    gl.uniform1f(u.uShift, input.shift);
    gl.uniform1f(u.uNoiseAmount, p.noiseAmount);
    gl.uniform1f(u.uNoiseSize, p.noiseSize);
    gl.uniform1f(u.uNoiseSeed, input.noiseSeed);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  /** Composites the last rendered frame into a Canvas2D destination. */
  drawTo(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
  ): void {
    context.drawImage(this.canvas, x, y, width, height);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const gl = this.gl;
    gl.deleteTexture(this.texture);
    gl.deleteBuffer(this.buffer);
    gl.deleteProgram(this.program);
    this.uploadedSource = null;
    // The context stays alive: a remounted renderer may reuse the same canvas.
  }
}
