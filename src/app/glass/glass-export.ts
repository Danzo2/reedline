import type { ToolcraftProductExportRenderer } from "@/toolcraft/runtime";

import { GlassGlRenderer, GlassRendererError } from "./glass-gl";
import { fitGlassBacking } from "./glass-limits";
import { glassExportPass } from "./glass-pipeline";
import {
  acquireGlassSource,
  createGlassFrameInput,
  getGlassSourceGeometry,
} from "./glass-render-input";
import { getGlassActiveSource, getGlassVideoTime, readGlassParameters } from "./glass-values";

let exportRenderer: GlassGlRenderer | null = null;

function getExportRenderer(): GlassGlRenderer {
  if (exportRenderer) return exportRenderer;
  if (typeof OffscreenCanvas === "undefined") {
    throw new GlassRendererError("Reeded glass export requires OffscreenCanvas WebGL support.");
  }
  // GPU working surface only; runtime owns the artifact canvas and encoding.
  exportRenderer = new GlassGlRenderer(new OffscreenCanvas(1, 1));
  return exportRenderer;
}

export const reededGlassExportRenderer: ToolcraftProductExportRenderer = {
  baseFileName: "reeded-glass",
  async renderFrame({ context, frame, pixelRatio, rendererPipeline, signal, state, timeSeconds }) {
    signal.throwIfAborted();
    const active = getGlassActiveSource(state.mediaAssets);
    if (!active || active.asset.lifecycle !== "ready") return;
    if (!rendererPipeline) {
      throw new GlassRendererError("Reeded glass export requires its renderer pipeline.");
    }
    const source = await acquireGlassSource(rendererPipeline, active, signal, "export");
    signal.throwIfAborted();
    // Frame-accurate: the export decoder session yields this frame's clip time.
    const clipFrame =
      source.kind === "video"
        ? await source.clip.frameAt(
            getGlassVideoTime(timeSeconds, state.timeline.durationSeconds, source.durationSeconds),
            signal,
          )
        : null;
    const videoFrame = clipFrame?.frame ?? null;
    const parameters = readGlassParameters(state.values);
    try {
      signal.throwIfAborted();
      await rendererPipeline.runPass(glassExportPass, undefined, () => {
        const renderer = getExportRenderer();
        const { height: backingHeight, width: backingWidth } = fitGlassBacking(
          Math.max(1, Math.round(frame.width * pixelRatio)),
          Math.max(1, Math.round(frame.height * pixelRatio)),
          renderer.maxBackingSize,
        );
        if (videoFrame) renderer.setSource(videoFrame, { refresh: true });
        else if (source.kind === "image") renderer.setSource(source.bitmap);
        renderer.render(
          createGlassFrameInput({
            asset: getGlassSourceGeometry(active, source),
            backingHeight,
            backingWidth,
            durationSeconds: state.timeline.durationSeconds,
            parameters,
            sceneHeight: frame.height,
            sceneWidth: frame.width,
            timeSeconds,
          }),
        );
        context.save();
        try {
          context.imageSmoothingEnabled = true;
          context.imageSmoothingQuality = "high";
          renderer.drawTo(context, frame.x, frame.y, frame.width, frame.height);
        } finally {
          context.restore();
        }
      });
    } finally {
      videoFrame?.close();
    }
  },
};
