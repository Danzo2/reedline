import type { ToolcraftRendererPipelineClient } from "@/toolcraft/runtime";

import { getGlassSourceMapping, type GlassFrameInput, type GlassSourceGeometry } from "./glass-gl";
import { glassPreviewPass, glassSourceDecodePass } from "./glass-pipeline";
import {
  decodeGlassSource,
  decodeGlassVideo,
  releaseGlassSource,
  type GlassDecodedSource,
} from "./glass-source";
import {
  getGlassLoopShift,
  getGlassNoiseSeed,
  type GlassActiveSource,
  type GlassParameters,
} from "./glass-values";

/**
 * Decodes (or reuses) the retained source for the active photo or clip. A clip
 * gets one element for the live preview and a separate one for export, so
 * export seeks never disturb preview playback.
 */
export function acquireGlassSource(
  pipeline: ToolcraftRendererPipelineClient,
  source: GlassActiveSource,
  signal?: AbortSignal,
  purpose: "export" | "preview" = "preview",
): Promise<GlassDecodedSource> {
  const { resourceRef } = source.asset;
  const key = source.kind === "video" && purpose === "export" ? `${resourceRef}#export` : resourceRef;
  return pipeline.runPass(
    glassSourceDecodePass,
    { "source.resourceRef": key },
    (context) =>
      context.getOrCreateResource(
        [key],
        (): Promise<GlassDecodedSource> =>
          source.kind === "video"
            ? decodeGlassVideo(resourceRef, signal)
            : decodeGlassSource(resourceRef, signal),
        releaseGlassSource,
      ),
  );
}

/**
 * Mapping geometry: the photo's runtime frame, or the clip's coded size with
 * its display rotation (portrait phone clips are stored rotated).
 */
export function getGlassSourceGeometry(
  source: GlassActiveSource,
  decoded: GlassDecodedSource,
): GlassSourceGeometry {
  if (source.kind === "image") return source.asset;
  if (decoded.kind !== "video") return { sourceSize: { height: decoded.height, width: decoded.width } };
  return {
    sourceSize: { height: decoded.height, width: decoded.width },
    transform: { rotationDeg: decoded.rotationDeg },
  };
}

export function getGlassLoopProgress(timeSeconds: number, durationSeconds: number): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return 0;
  if (!Number.isFinite(timeSeconds)) return 0;
  const wrapped = ((timeSeconds % durationSeconds) + durationSeconds) % durationSeconds;
  return wrapped / durationSeconds;
}

export function createGlassFrameInput({
  asset,
  backingHeight,
  backingWidth,
  durationSeconds,
  parameters,
  sceneHeight,
  sceneWidth,
  timeSeconds,
}: Readonly<{
  asset: GlassSourceGeometry;
  backingHeight: number;
  backingWidth: number;
  durationSeconds: number;
  parameters: GlassParameters;
  sceneHeight: number;
  sceneWidth: number;
  timeSeconds: number;
}>): GlassFrameInput {
  const progress = getGlassLoopProgress(timeSeconds, durationSeconds);
  return Object.freeze({
    backingHeight,
    backingWidth,
    noiseSeed: getGlassNoiseSeed(parameters, progress * durationSeconds),
    parameters,
    sceneHeight,
    sceneWidth,
    shift: getGlassLoopShift(parameters, progress),
    source: getGlassSourceMapping(asset, sceneWidth, sceneHeight),
  });
}

/** Runs one preview draw through the registered preview pass (or directly). */
export async function runGlassPreviewDraw(
  pipeline: ToolcraftRendererPipelineClient | null,
  draw: () => void,
): Promise<void> {
  if (!pipeline) {
    draw();
    return;
  }
  await pipeline.runPass(glassPreviewPass, undefined, draw);
}
