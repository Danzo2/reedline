import {
  defineToolcraftPerformance,
  type ToolcraftEnvelopePerformanceConfig,
} from "@/toolcraft/runtime";

import { glassRendererPipelineRegistration } from "./glass/glass-pipeline";
import {
  createGlassPerformanceScenarios,
  deriveGlassPerformancePaths,
  glassFixtureAdapters,
  glassWorkloadEnvelope,
} from "./glass/glass-workload";

export { glassRendererPipelineRegistration as appRendererPipelineRegistration };

const webglSurface = {
  backend: "webgl",
  exception: {
    evidence:
      "The reeded glass filter is one stateless fragment pass (no compute, storage or feedback). The editor and its MP4/WebM/PNG export must run in every browser that opens the app, including Safari/Firefox builds and headless Chromium CI where WebGPU is unavailable or disabled, so WebGL is the primary provider.",
    kind: "browser-compatibility",
  },
  provider: "native",
} as const;

const basePerformance = defineToolcraftPerformance({
  fixtureAdapters: glassFixtureAdapters,
  rendererPipeline: glassRendererPipelineRegistration,
  rendererStrategy: "webgl",
  rendererTechnique: {
    exportRenderer: "webgl",
    fidelityRisks: [
      "Preview and export must evaluate the same shader with the same loop phase, cover-crop and image transform.",
      "Very large sources are downscaled to an 8192 px long edge before upload to the GPU.",
    ],
    gpu: { export: webglSurface, preview: webglSurface },
    intentionalRasterizationReason:
      "The product refracts photo pixels; output is inherently raster.",
    layers: [
      {
        content: ["shader"],
        exportMode: "included",
        id: "reededGlass",
        kind: "product-foreground",
        primitiveCount: "low",
        renderer: "webgl",
        uiSelector: '[data-reeded-glass-output=""]',
      },
    ],
    performanceRisks: [
      "Retina backing at high zoom multiplies fragment work; backing is capped at 8192 px per edge.",
      "8K image export renders a 37-megapixel WebGL frame.",
    ],
    previewExportDifferenceReason:
      "Preview draws into the on-canvas WebGL surface; export renders the same shader into a working WebGL canvas and composites it into the runtime-supplied Canvas2D frame.",
    previewRenderer: "webgl",
    productRepresentation: "pixel",
    rendererStrategy: "webgl",
    sourceRepresentation: "image-media",
    whyNotAlternativeStrategies: [
      "Canvas 2D cannot refract per pixel with RGB dispersion at retina resolution in real time.",
      "WebGPU/VGPU is not universally available and this stateless pass has no compute or storage pressure.",
    ],
  },
  scenarios: [],
  usesCustomRenderer: true,
  workloadEnvelope: glassWorkloadEnvelope,
} satisfies ToolcraftEnvelopePerformanceConfig);

export const appPerformance: ToolcraftEnvelopePerformanceConfig = defineToolcraftPerformance({
  ...basePerformance,
  scenarios: createGlassPerformanceScenarios(basePerformance),
});

export const appPerformancePaths = deriveGlassPerformancePaths(appPerformance);
