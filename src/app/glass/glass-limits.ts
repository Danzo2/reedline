import { TOOLCRAFT_MAX_EXPORT_EDGE_PX } from "@/toolcraft/runtime";

/** Enforced per-edge ceiling for live preview backing and decoded sources. */
export const GLASS_MAX_EDGE_PX = TOOLCRAFT_MAX_EXPORT_EDGE_PX;

/** Enforced ceiling on live preview backing pixels (8192 × 8192). */
export const GLASS_MAX_PREVIEW_PIXELS = GLASS_MAX_EDGE_PX * GLASS_MAX_EDGE_PX;

/** Enforced ceiling on decoded source pixels (sources are downscaled to fit). */
export const GLASS_MAX_SOURCE_PIXELS = GLASS_MAX_EDGE_PX * GLASS_MAX_EDGE_PX;

/**
 * Fits a backing size inside the enforced per-edge ceiling (and any lower GPU
 * limit) while preserving aspect ratio.
 */
export function fitGlassBacking(
  width: number,
  height: number,
  gpuLimit: number,
): Readonly<{ height: number; width: number }> {
  const limit = Math.min(GLASS_MAX_EDGE_PX, Math.max(1, gpuLimit));
  const overflow = Math.max(width / limit, height / limit, 1);
  return Object.freeze({
    height: Math.max(1, Math.floor(height / overflow)),
    width: Math.max(1, Math.floor(width / overflow)),
  });
}

/** Source decode size: long edge capped at the enforced ceiling. */
export function fitGlassSourceSize(
  width: number,
  height: number,
): Readonly<{ height: number; resized: boolean; width: number }> {
  const overflow = Math.max(width / GLASS_MAX_EDGE_PX, height / GLASS_MAX_EDGE_PX, 1);
  return Object.freeze({
    height: Math.max(1, Math.round(height / overflow)),
    resized: overflow > 1,
    width: Math.max(1, Math.round(width / overflow)),
  });
}
