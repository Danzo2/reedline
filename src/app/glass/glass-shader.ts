/**
 * Reeded glass fragment shader (GLSL ES 1.00 for broad WebGL support).
 *
 * Coordinates: `vScene` is the product scene position in world pixels relative
 * to the scene centre (y down). Reeds are laid out in glass space (scene
 * rotated by the pattern angle). Each reed refracts the source sideways according
 * to its cross-section profile; dispersion splits RGB refraction strengths.
 */
export const glassVertexShaderSource = `
attribute vec2 aPosition;
uniform vec2 uSceneSize;
varying vec2 vScene;
void main() {
  vScene = vec2(aPosition.x, -aPosition.y) * 0.5 * uSceneSize;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

export const glassFragmentShaderSource = `
precision highp float;

varying vec2 vScene;

uniform sampler2D uSource;
uniform vec2 uSceneSize;
uniform float uPixelScale;
uniform float uSourceRotation;
uniform vec2 uSourceFlip;
uniform vec2 uAssetSize;
uniform vec2 uCropOrigin;
uniform vec2 uCropSize;

uniform float uAmount;
uniform float uDispersion;
uniform float uFrost;
uniform float uReflection;
uniform float uReflectionScale;
uniform float uPatternType;
uniform float uRepeats;
uniform float uAngle;
uniform float uContrast;
uniform float uImperfections;
uniform float uImperfectionScale;
uniform float uShift;
uniform float uNoiseAmount;
uniform float uNoiseSize;
uniform float uNoiseSeed;

mat2 rotation(float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return mat2(c, s, -s, c);
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int octave = 0; octave < 4; octave++) {
    value += amplitude * valueNoise(p);
    p = p * 2.03 + vec2(17.1, 9.7);
    amplitude *= 0.5;
  }
  return value;
}

vec2 mirrorUv(vec2 uv) {
  return 1.0 - abs(1.0 - mod(uv, 2.0));
}

// Maps a scene position (world px from centre) to source texture UV, following
// the runtime image transform (rotate, then flip) and its cover crop.
vec2 sceneToSource(vec2 scenePosition) {
  vec2 local = rotation(-uSourceRotation) * scenePosition;
  local *= uSourceFlip;
  vec2 imageUv = local / uAssetSize + 0.5;
  return mirrorUv(uCropOrigin + imageUv * uCropSize);
}

// Pattern indices (match glassPatternTypeIndex):
// 0 blocks (staggered small block lenses), 1 rounded reeds, 2 bubble lenses,
// 3 hexagon lenses, 4 fluted (concave) reeds, 5 prism (sawtooth) reeds,
// 6 ripple (smooth shimmering waves).

// Profile sharpness: higher contrast keeps the reed centre clear and pushes the
// refraction toward the seams (flat face, steep bevel).
float profileExponent() {
  return 1.0 + max(uContrast, 0.0) * 0.5;
}

// 1D reed refraction offset in reed widths for x in [-1, 1] across a reed.
float reedDisplacement(float x) {
  float k = profileExponent();
  float shaped = sign(x) * pow(abs(x), k);
  if (uPatternType < 1.5) return -0.16 * shaped;   // rounded convex reed
  if (uPatternType < 4.5) return 0.16 * shaped;    // fluted concave reed
  return -0.14 * x;                                 // prism facet
}

float reedSlope(float x) {
  float k = profileExponent();
  if (uPatternType < 1.5) return pow(abs(x), k) * sign(x);
  if (uPatternType < 4.5) return -pow(abs(x), k) * sign(x);
  return 0.35;
}

// Hexagonal lattice: returns (local offset from the nearest cell centre in cell
// units, cell id). Cells repeat every 1 unit along x.
vec4 hexCell(vec2 p) {
  vec2 lattice = vec2(1.0, 1.7320508);
  vec4 centres = floor(vec4(p, p - vec2(0.5, 0.8660254)) / lattice.xyxy) + 0.5;
  vec4 local = vec4(p - centres.xy * lattice, p - (centres.zw + 0.5) * lattice);
  return dot(local.xy, local.xy) < dot(local.zw, local.zw)
    ? vec4(local.xy, centres.xy)
    : vec4(local.zw, centres.zw + 0.5);
}

float hexEdgeDistance(vec2 q) {
  vec2 a = abs(q);
  return max(dot(a, vec2(0.5, 0.8660254)), a.x);
}

// Returns straight (non-premultiplied) RGB plus source alpha for a glass-space
// refraction offset (in scene pixels).
vec4 sampleRefracted(vec2 glassPos, float reedWidth, vec2 offset, float spreadGain) {
  mat2 toScene = rotation(uAngle);
  vec2 strength = offset * uAmount;
  // Chromatic split follows the refraction direction but its width is capped,
  // so large folds or magnification never turn whole regions into rainbows.
  vec2 chroma = strength * uDispersion * 0.9 * spreadGain;
  float chromaLength = length(chroma);
  float chromaLimit = uDispersion * reedWidth * 0.12;
  if (chromaLength > chromaLimit) chroma *= chromaLimit / chromaLength;
  vec3 color = vec3(0.0);
  float alpha = 0.0;
  float weight = 0.0;
  for (int tap = -2; tap <= 2; tap++) {
    float t = float(tap);
    float tapWeight = 1.0 - abs(t) * 0.18;
    vec2 basePos = glassPos + vec2(t * uFrost * reedWidth * 0.05, t * uFrost * reedWidth * 0.02);
    vec4 rSample = texture2D(uSource, sceneToSource(toScene * (basePos + strength - chroma)));
    vec4 gSample = texture2D(uSource, sceneToSource(toScene * (basePos + strength)));
    vec4 bSample = texture2D(uSource, sceneToSource(toScene * (basePos + strength + chroma)));
    color += tapWeight * vec3(rSample.r, gSample.g, bSample.b);
    alpha += tapWeight * gSample.a;
    weight += tapWeight;
    if (uFrost <= 0.0) break;
  }
  return vec4(color / weight, alpha / weight);
}

// Blocky glass imperfections: stepped value noise along the reed length plus a
// slow wobble. Keyed in image space so the loop stays seamless while reeds slide.
float imperfectionOffset(vec2 scenePos, float reedWidth) {
  float extent = max(uSceneSize.x, uSceneSize.y);
  vec2 cell = vec2(scenePos.x / reedWidth * 0.5, scenePos.y / extent * uImperfectionScale * 4.0);
  float stepped = valueNoise(vec2(floor(cell.x), cell.y));
  stepped = smoothstep(0.46, 0.54, stepped) - 0.5;
  float wobble = fbm(scenePos / extent * uImperfectionScale * vec2(0.3, 1.2)) - 0.5;
  return uImperfections * (stepped * 0.26 + wobble * 0.06);
}

void main() {
  float reedWidth = max(uSceneSize.x, uSceneSize.y) / max(uRepeats, 1.0);
  vec2 glassPos = rotation(-uAngle) * vScene;
  float warp = uImperfections > 0.0 ? imperfectionOffset(vScene, reedWidth) : 0.0;

  vec2 offset;
  float x;          // lighting coordinate in [-1, 1]
  float shade = 1.0;
  float specularX;  // coordinate for the reflection streak

  if (uPatternType > 5.5) {
    // Ripple: fixed vertical reed strips, each holding its own softly rippled
    // glass. Ripples travel smoothly up or down every strip (sideways wobble
    // plus a slight vertical breathing). Each strip has its own phase,
    // wavelength and resting offset, so the wobble never lines up into
    // horizontal rows and edges break at the seams. Every wave advances a
    // whole number of cycles per unit of shift at constant speed, so the
    // motion never stalls and the loop end matches the start.
    float extent = max(uSceneSize.x, uSceneSize.y);
    float smoothWarp = uImperfections > 0.0
      ? (fbm(vScene / extent * uImperfectionScale * vec2(0.6, 1.0)) - 0.5) * uImperfections
      : 0.0;
    float uc = glassPos.x / reedWidth + 0.5;
    float reed = floor(uc);
    float xr = fract(uc) * 2.0 - 1.0;
    float h1 = hash12(vec2(reed, 3.1));
    float h2 = hash12(vec2(reed, 7.7));
    float h3 = hash12(vec2(reed, 11.3));
    float t = 6.2831853 * uShift;
    float dir = h3 < 0.5 ? -1.0 : 1.0;
    float yr = glassPos.y / reedWidth + smoothWarp * 0.8;
    float waveA = sin(6.2831853 * (yr / (0.16 + 0.06 * h1) + h2) - dir * 2.0 * t);
    float waveB = sin(6.2831853 * (yr / (0.55 + 0.15 * h2) + h1) + dir * 1.0 * t);
    float breathe = sin(6.2831853 * (yr / 0.5 + h3) - dir * 1.0 * t);
    float lens = -0.05 * xr * xr * xr;
    float rest = (h1 - 0.5) * 0.05;
    offset = vec2(
      (0.011 * waveA + 0.016 * waveB) * (0.75 + 0.25 * (1.0 - xr * xr)) + lens + rest + smoothWarp * 0.2,
      0.012 * breathe
    ) * reedWidth;
    x = xr;
    shade -= uContrast * 0.004 * xr;
    shade -= uContrast * 0.008 * pow(abs(xr), 24.0);
    specularX = xr;
  } else if (uPatternType < 0.5) {
    // Blocks: a staggered grid of small rectangular lens blocks (4 per reed
    // across, 5 per reed down). Each block magnifies and nudges what is behind
    // it, so edges break into stepped, dispersed segments. The grid slides four
    // blocks per unit of shift, which keeps the loop seamless.
    vec2 blockSize = vec2(reedWidth / 4.0, reedWidth / 5.0);
    float row = floor(glassPos.y / blockSize.y);
    float stagger = mod(row, 2.0) * 0.5;
    vec2 blockPos = vec2(glassPos.x / blockSize.x + uShift * 4.0 + stagger + warp * 0.6,
      glassPos.y / blockSize.y);
    vec2 blockId = floor(blockPos);
    vec2 q = fract(blockPos) - 0.5;
    vec2 lens = sin(3.14159265 * q) / 3.14159265;
    float jitter = hash12(vec2(mod(blockId.x, 64.0), blockId.y)) - 0.5;
    offset = -lens * blockSize * 0.38
      + vec2(jitter * blockSize.x * (0.08 + uImperfections * 0.3), 0.0);
    x = q.x * 2.0;
    shade += uContrast * 0.006 * (q.x - q.y) * 2.0;
    specularX = x;
  } else if (uPatternType > 1.5 && uPatternType < 3.5) {
    // 2D lens lattices; the lattice slides one cell per unit of shift (seamless).
    float cellSize = reedWidth;
    vec2 cellPos = glassPos / cellSize + vec2(uShift, 0.0) + vec2(warp * 0.3, 0.0);
    vec4 cell = hexCell(cellPos);
    vec2 q = cell.xy;
    if (uPatternType < 2.5) {
      // Bubbles: a smooth egg-crate of soft dimples. Each cell magnifies its
      // centre and eases back to zero at the cell boundary (no hard rims).
      float r = clamp(length(q) / 0.55, 0.0, 1.0);
      float falloff = pow(1.0 - r * r, 2.0);
      offset = -q * 0.5 * falloff * cellSize;
      x = r * sign(q.x + 1e-4);
      shade += uContrast * 0.015 * (q.x - q.y) * falloff * 2.0;
    } else {
      // Hexagons: faceted convex tiles that magnify and bevel at each edge.
      float edge = hexEdgeDistance(q) / 0.5;
      float bevel = smoothstep(0.82, 1.0, edge);
      offset = -q * (0.28 + 0.2 * bevel) * cellSize;
      x = clamp(edge, 0.0, 1.0) * sign(q.x + 1e-4);
      shade += uContrast * 0.025 * (q.x - q.y) * 2.0;
      shade -= uContrast * 0.015 * pow(edge, 16.0);
    }
    offset += vec2(warp * 0.5 * reedWidth, 0.0);
    specularX = x;
  } else {
    float u = glassPos.x / reedWidth + 0.5 + uShift + warp * 0.3;
    x = fract(u) * 2.0 - 1.0;
    offset = vec2((reedDisplacement(x) + warp * 0.5) * reedWidth, 0.0);
    shade += uContrast * 0.012 * reedSlope(x);
    shade -= uContrast * 0.012 * pow(abs(x), 24.0);
    specularX = x;
  }

  vec4 refracted = sampleRefracted(glassPos, reedWidth, offset, 1.0);
  vec3 color = refracted.rgb * shade;

  // Specular streak along each reed.
  if (uReflection > 0.0) {
    float width = 0.09 * max(uReflectionScale, 0.05);
    float streak = exp(-pow((specularX - 0.38) / width, 2.0));
    float glint = exp(-pow((specularX + 0.72) / (width * 0.6), 2.0)) * 0.45;
    color += uReflection * (streak + glint) * 0.55;
  }

  if (uNoiseAmount > 0.0) {
    vec2 grainCell = floor(gl_FragCoord.xy / max(uNoiseSize * uPixelScale, 1.0));
    float grain = hash12(grainCell + vec2(uNoiseSeed * 7.123, uNoiseSeed * 3.917)) - 0.5;
    color += grain * uNoiseAmount * 0.6;
  }

  // Premultiplied output: transparent source regions stay transparent so the
  // runtime background (or PNG alpha) shows through.
  float outAlpha = clamp(refracted.a, 0.0, 1.0);
  gl_FragColor = vec4(clamp(color, 0.0, 1.0) * outAlpha, outAlpha);
}
`;
