import {
  getToolcraftFiniteArtboardRect,
  type ToolcraftCanvasSize,
  type ToolcraftProductSceneBoundsProvider,
  type ToolcraftSceneRect,
} from "@/toolcraft/runtime";

import { getGlassActiveSource } from "./glass-values";

/**
 * The product scene is the editable output artboard (`canvas.size`, kept
 * dormant in Infinity mode). The photo or clip is cover-cropped into it, so the
 * output has no letterbox; a fresh upload refits the artboard to its aspect.
 */
export function getReededGlassSceneRect(
  state: Readonly<{ canvas: Readonly<{ size: ToolcraftCanvasSize }> }>,
): ToolcraftSceneRect {
  return getToolcraftFiniteArtboardRect(state.canvas.size);
}

export const reededGlassSceneBounds: ToolcraftProductSceneBoundsProvider = ({ state }) =>
  getGlassActiveSource(state.mediaAssets) ? [getReededGlassSceneRect(state)] : [];
