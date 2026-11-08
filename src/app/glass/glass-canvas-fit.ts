/**
 * Auto-fits the finite canvas to the source photo's or clip's aspect ratio.
 *
 * A freshly uploaded or rotated photo, or a freshly uploaded clip, resizes the
 * canvas so the reeded glass output matches its proportions instead of
 * cropping it; a clip also sets the loop length to the clip's duration. The
 * current long edge is preserved, so a user-chosen output scale carries over.
 * Restored and default sources arrive in the `restoring` lifecycle and never
 * trigger a fit, so saved and reloaded sizes stay as the user left them.
 */

import * as React from "react";

import type { ToolcraftImageAsset } from "@/toolcraft/runtime";
import { useToolcraftDispatch, useToolcraftSelector } from "@/toolcraft/runtime/react";

type FitSize = Readonly<{ height: number; width: number }>;

function evenDimension(value: number): number {
  return Math.max(2, Math.round(value / 2) * 2);
}

/** Oriented (post-rotation) source size of a canvas image. */
export function getGlassOrientedSourceSize(
  asset: Readonly<{ sourceSize: FitSize; transform?: ToolcraftImageAsset["transform"] }>,
): FitSize {
  const quarterTurn = asset.transform?.rotationDeg === 90 || asset.transform?.rotationDeg === 270;
  const { height, width } = asset.sourceSize;
  return quarterTurn ? { height: width, width: height } : { height, width };
}

/**
 * Canvas size with the source's aspect ratio and the current canvas's long edge.
 * Returns null when the source size is unusable or the canvas already fits.
 */
export function computeGlassCanvasFit(source: FitSize, canvas: FitSize): FitSize | null {
  if (!(source.width > 0 && source.height > 0 && canvas.width > 0 && canvas.height > 0)) {
    return null;
  }
  const longEdge = evenDimension(Math.max(canvas.width, canvas.height));
  const ratio = source.width / source.height;
  const next =
    ratio >= 1
      ? { height: evenDimension(longEdge / ratio), width: longEdge }
      : { height: longEdge, width: evenDimension(longEdge * ratio) };
  return next.width === canvas.width && next.height === canvas.height ? null : next;
}

/**
 * What auto-fit tracks for the active source. `key` changes when a different
 * photo/clip (or photo orientation) becomes active; `size` is null until a clip
 * has loaded its natural size; `clipSeconds` is set for clips only.
 */
export type GlassFitSource = Readonly<{
  clipSeconds?: number;
  key: string;
  lifecycle: ToolcraftImageAsset["lifecycle"];
  size: FitSize | null;
}>;

/** Fit source for a photo: its oriented size is known from runtime state. */
export function getGlassImageFitSource(asset: ToolcraftImageAsset): GlassFitSource {
  const size = getGlassOrientedSourceSize(asset);
  return {
    key: `image:${asset.resourceRef}:${size.width}x${size.height}`,
    lifecycle: asset.lifecycle,
    size,
  };
}

/** Clip durations are stored to the millisecond. */
export function roundGlassClipSeconds(seconds: number): number {
  return Math.round(seconds * 1000) / 1000;
}

/**
 * Fits the canvas (and, for clips, the loop length) to a freshly uploaded or
 * rotated source. A restored, default or initially mounted source never fits.
 */
export function useGlassCanvasAutoFit(source: GlassFitSource | null): void {
  const dispatch = useToolcraftDispatch();
  const canvasSize = useToolcraftSelector((state) => state.canvas.size);
  const canvasMode = useToolcraftSelector((state) => state.canvas.mode);
  const canvasRef = React.useRef<{ mode: typeof canvasMode; size: typeof canvasSize }>({
    mode: canvasMode,
    size: canvasSize,
  });
  canvasRef.current = { mode: canvasMode, size: canvasSize };
  // undefined until the first observation, so the mounted source never refits.
  const lastKeyRef = React.useRef<string | null | undefined>(undefined);
  // A fresh source whose clip size is still loading.
  const pendingKeyRef = React.useRef<string | null>(null);

  const key = source?.key ?? null;
  const lifecycle = source?.lifecycle;
  const width = source?.size?.width ?? 0;
  const height = source?.size?.height ?? 0;
  const clipSeconds = source?.clipSeconds;

  React.useEffect(() => {
    const previous = lastKeyRef.current;
    if (key !== previous) {
      lastKeyRef.current = key;
      pendingKeyRef.current =
        previous !== undefined && key !== null && lifecycle === "ready" ? key : null;
    }
    if (key === null || pendingKeyRef.current !== key || !(width > 0 && height > 0)) return;
    pendingKeyRef.current = null;
    const { mode, size } = canvasRef.current;
    const next = computeGlassCanvasFit({ height, width }, size);
    if (next) {
      // History is skipped: the canvas follows the source, so undoing an upload
      // refits to the previous source without clearing the redo stack.
      dispatch({
        history: "skip",
        mode,
        size: { height: next.height, unit: "px", width: next.width },
        type: "canvas.applySettings",
      });
    }
    if (clipSeconds !== undefined && clipSeconds > 0) {
      // The loop (and exported video) covers the clip once; user edits win later.
      dispatch({ durationSeconds: roundGlassClipSeconds(clipSeconds), type: "timeline.setDuration" });
    }
  }, [clipSeconds, dispatch, height, key, lifecycle, width]);
}
