import type {
  ToolcraftFileAsset,
  ToolcraftImageAsset,
  ToolcraftMediaAsset,
} from "@/toolcraft/runtime";

export const GLASS_SOURCE_TARGET = "source.image";
export const GLASS_VIDEO_TARGET = "source.video";

export const glassPatternTypes = ["blocks", "rounded", "bubbles", "hexagons", "fluted", "prism", "ripple"] as const;
export type GlassPatternType = (typeof glassPatternTypes)[number];

export const glassPatternTypeIndex: Readonly<Record<GlassPatternType, number>> =
  Object.freeze({ blocks: 0, bubbles: 2, fluted: 4, hexagons: 3, prism: 5, ripple: 6, rounded: 1 });

export const glassDefaults = Object.freeze({
  amount: 1,
  angle: 0,
  background: "#000000",
  contrast: 4,
  dispersion: 0.3,
  frost: 0,
  imperfectionScale: 10,
  imperfections: 0.3,
  includeBackground: true,
  noiseAmount: 0,
  noiseAnimated: true,
  noiseSize: 1,
  patternType: "rounded" as GlassPatternType,
  reflection: 0,
  reflectionScale: 1,
  repeats: 7,
  shiftSpeed: 1,
});

/** Canonical renderer parameters derived from runtime values. */
export type GlassParameters = Readonly<{
  amount: number;
  angleDeg: number;
  contrast: number;
  dispersion: number;
  frost: number;
  imperfectionScale: number;
  imperfections: number;
  noiseAmount: number;
  noiseAnimated: boolean;
  noiseSize: number;
  patternType: GlassPatternType;
  reflection: number;
  reflectionScale: number;
  repeats: number;
  shiftSpeed: number;
}>;

function readNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readPatternType(value: unknown): GlassPatternType {
  return glassPatternTypes.includes(value as GlassPatternType)
    ? (value as GlassPatternType)
    : glassDefaults.patternType;
}

export function readGlassParameters(
  values: Readonly<Record<string, unknown>>,
): GlassParameters {
  return Object.freeze({
    amount: readNumber(values["glass.amount"], glassDefaults.amount),
    angleDeg: readNumber(values["pattern.angle"], glassDefaults.angle),
    contrast: readNumber(values["pattern.contrast"], glassDefaults.contrast),
    dispersion: readNumber(values["glass.dispersion"], glassDefaults.dispersion),
    frost: readNumber(values["glass.frost"], glassDefaults.frost),
    imperfectionScale: readNumber(
      values["pattern.imperfectionScale"],
      glassDefaults.imperfectionScale,
    ),
    imperfections: readNumber(
      values["pattern.imperfections"],
      glassDefaults.imperfections,
    ),
    noiseAmount: readNumber(values["noise.amount"], glassDefaults.noiseAmount),
    noiseAnimated: glassDefaults.noiseAnimated,
    noiseSize: readNumber(values["noise.size"], glassDefaults.noiseSize),
    patternType: readPatternType(values["pattern.type"]),
    reflection: readNumber(values["glass.reflection"], glassDefaults.reflection),
    reflectionScale: readNumber(
      values["glass.reflectionScale"],
      glassDefaults.reflectionScale,
    ),
    repeats: Math.max(1, readNumber(values["pattern.repeats"], glassDefaults.repeats)),
    shiftSpeed: Math.round(
      readNumber(values["motion.shiftSpeed"], glassDefaults.shiftSpeed),
    ),
  });
}

export function getGlassSourceImage(
  mediaAssets: readonly ToolcraftMediaAsset[],
): ToolcraftImageAsset | null {
  for (const asset of mediaAssets) {
    if (
      asset.assetKind === "image" &&
      asset.lifecycle !== "unavailable" &&
      (asset.sourceTarget ?? GLASS_SOURCE_TARGET) === GLASS_SOURCE_TARGET
    ) {
      return asset;
    }
  }
  return null;
}

/** The uploaded MP4 clip, if one is attached to the Video uploader. */
export function getGlassSourceVideo(
  mediaAssets: readonly ToolcraftMediaAsset[],
): ToolcraftFileAsset | null {
  for (const asset of mediaAssets) {
    if (
      asset.assetKind === "file" &&
      asset.lifecycle !== "unavailable" &&
      asset.sourceTarget === GLASS_VIDEO_TARGET
    ) {
      return asset;
    }
  }
  return null;
}

/**
 * The source the glass refracts: an attached video clip takes priority over
 * the photo, so uploading a clip switches the output without removing the photo.
 */
export type GlassActiveSource =
  | Readonly<{ asset: ToolcraftImageAsset; kind: "image" }>
  | Readonly<{ asset: ToolcraftFileAsset; kind: "video" }>;

export function getGlassActiveSource(
  mediaAssets: readonly ToolcraftMediaAsset[],
): GlassActiveSource | null {
  const video = getGlassSourceVideo(mediaAssets);
  if (video) return { asset: video, kind: "video" };
  const image = getGlassSourceImage(mediaAssets);
  return image ? { asset: image, kind: "image" } : null;
}

/**
 * Clip time shown at a timeline time: the loop position, wrapped into the
 * clip's length and kept just inside its last frame so the element never ends.
 */
export function getGlassVideoTime(
  timeSeconds: number,
  durationSeconds: number,
  clipSeconds: number,
): number {
  if (!Number.isFinite(clipSeconds) || clipSeconds <= 0) return 0;
  const loopTime =
    Number.isFinite(durationSeconds) && durationSeconds > 0 && Number.isFinite(timeSeconds)
      ? ((timeSeconds % durationSeconds) + durationSeconds) % durationSeconds
      : 0;
  const wrapped = loopTime % clipSeconds;
  return Math.min(wrapped, Math.max(0, clipSeconds - 1 / 120));
}

/**
 * Loop phase in [0, 1). The shift advances an integer number of reeds per
 * loop, so phase 0 and phase 1 render identical frames (seamless forward loop).
 */
export function getGlassLoopShift(parameters: GlassParameters, loopProgress: number): number {
  const progress = Number.isFinite(loopProgress) ? loopProgress - Math.floor(loopProgress) : 0;
  return parameters.shiftSpeed * progress;
}

/** Grain seed that changes per 30 FPS frame and wraps with the loop. */
export function getGlassNoiseSeed(
  parameters: GlassParameters,
  loopTimeSeconds: number,
): number {
  if (!parameters.noiseAnimated) return 0;
  return Math.floor(Math.max(0, loopTimeSeconds) * 30 + 1e-6) % 100_000;
}
