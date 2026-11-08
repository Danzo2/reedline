import { composeToolcraftApp } from "@/toolcraft/runtime/react";

import { appSchema } from "./app-schema";
import { reededGlassExportRenderer } from "./glass/glass-export";
import { glassRendererPipelineRegistration } from "./glass/glass-pipeline";
import { reededGlassSceneBounds } from "./glass/glass-scene";
import { ReededGlassCanvas } from "./glass/reeded-glass-canvas";

export const appComposition = composeToolcraftApp(appSchema, {
  renderer: { pipelineRegistration: glassRendererPipelineRegistration },
  scene: {
    canvasContent: <ReededGlassCanvas />,
    rasterFrameRenderer: reededGlassExportRenderer,
    renderDefaultCanvasMedia: false,
    sceneBoundsProvider: reededGlassSceneBounds,
  },
});
