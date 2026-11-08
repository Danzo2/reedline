import {
  defineToolcraftDiscreteFixtureAdapter,
  defineToolcraftFixtureAdapter,
  deriveToolcraftPerformancePaths,
  type ToolcraftEnvelopePerformanceConfig,
  type ToolcraftPerformanceScenario,
} from "@/toolcraft/runtime";

import { appSchema } from "../app-schema";
import { GLASS_MAX_EDGE_PX, GLASS_MAX_PREVIEW_PIXELS, GLASS_MAX_SOURCE_PIXELS } from "./glass-limits";

/** Default 1920×1080 artboard at 100% zoom, DPR 1 and Resolution scale 2. */
export const GLASS_DEFAULT_PREVIEW_PIXELS = 3840 * 2160;
/** Default source workload: one 12-megapixel photo (4000 × 3000). */
export const GLASS_DEFAULT_SOURCE_PIXELS = 4000 * 3000;

export type GlassPixelFixture = Readonly<{
  backingHeight: number;
  backingWidth: number;
  canvasHeight: number;
  canvasWidth: number;
}>;

/** Finds an exact even backing at render scale 2 whose product is `value`. */
function createPreviewPixelFixture(value: number): GlassPixelFixture {
  const whole = Math.round(value);
  if (!Number.isSafeInteger(whole) || Math.abs(whole - value) > 1e-6 || whole <= 0) {
    throw new Error(`Preview pixels must be a positive whole count, received ${value}.`);
  }
  for (let backingWidth = GLASS_MAX_EDGE_PX; backingWidth >= 2; backingWidth -= 2) {
    const backingHeight = whole / backingWidth;
    if (
      Number.isSafeInteger(backingHeight) &&
      backingHeight >= 2 &&
      backingHeight <= GLASS_MAX_EDGE_PX &&
      backingHeight % 2 === 0
    ) {
      return Object.freeze({
        backingHeight,
        backingWidth,
        canvasHeight: backingHeight / 2,
        canvasWidth: backingWidth / 2,
      });
    }
  }
  throw new Error(`Preview pixel count ${value} has no exact render-scale-2 canvas fixture.`);
}

/** Finds an exact source image size whose pixel count is `value`. */
function createSourcePixelFixture(value: number): Readonly<{ height: number; width: number }> {
  const whole = Math.round(value);
  if (!Number.isSafeInteger(whole) || Math.abs(whole - value) > 1e-6 || whole <= 0) {
    throw new Error(`Source pixels must be a positive whole count, received ${value}.`);
  }
  for (let width = GLASS_MAX_EDGE_PX; width >= 1; width -= 1) {
    const height = whole / width;
    if (Number.isSafeInteger(height) && height >= 1 && height <= GLASS_MAX_EDGE_PX) {
      return Object.freeze({ height, width });
    }
  }
  throw new Error(`Source pixel count ${value} has no exact image fixture.`);
}

export const glassFixtureAdapters = {
  dimensions: {
    "export-long-edge": defineToolcraftDiscreteFixtureAdapter({
      dimensionId: "export-long-edge",
      domain: {
        kind: "schema-options",
        optionValues: ["2k", "4k", "8k"],
        target: "export.image.resolution",
      },
      entries: [
        { appliedValue: "2k", value: 2048 },
        { appliedValue: "4k", value: 4096 },
        { appliedValue: "8k", value: 8192 },
      ],
    }),
    "preview-pixels": defineToolcraftFixtureAdapter<GlassPixelFixture>({
      apply: createPreviewPixelFixture,
      dimensionId: "preview-pixels",
      observe: ({ backingHeight, backingWidth }) => backingHeight * backingWidth,
    }),
    "source-pixels": defineToolcraftFixtureAdapter<Readonly<{ height: number; width: number }>>({
      apply: createSourcePixelFixture,
      dimensionId: "source-pixels",
      observe: ({ height, width }) => height * width,
    }),
  },
};

export const glassWorkloadEnvelope = {
  dimensions: [
    {
      batchMax: GLASS_MAX_PREVIEW_PIXELS,
      defaultValue: GLASS_DEFAULT_PREVIEW_PIXELS,
      id: "preview-pixels",
      interactiveMax: GLASS_MAX_PREVIEW_PIXELS,
      mapping: "direct",
      source: {
        kind: "runtime-state",
        path: "canvas.backingPixelsAtSelectedRenderScale",
      },
      unit: "pixels",
    },
    {
      batchMax: GLASS_MAX_SOURCE_PIXELS,
      defaultValue: GLASS_DEFAULT_SOURCE_PIXELS,
      id: "source-pixels",
      interactiveMax: GLASS_MAX_SOURCE_PIXELS,
      mapping: "direct",
      source: { id: "uploaded-photo-pixels", kind: "external-input" },
      unit: "pixels",
    },
    {
      batchMax: 8192,
      defaultValue: 4096,
      id: "export-long-edge",
      mapping: "direct",
      source: { kind: "schema-target", target: "export.image.resolution" },
      unit: "pixels",
    },
  ],
} satisfies ToolcraftEnvelopePerformanceConfig["workloadEnvelope"];

export function deriveGlassPerformancePaths(performance: ToolcraftEnvelopePerformanceConfig) {
  return deriveToolcraftPerformancePaths(appSchema, performance);
}

function getScenarioLocator(
  path: Readonly<{ interaction: string; targets: readonly string[] }>,
): Readonly<Record<string, string>> {
  if (path.interaction === "timeline-playback" || path.interaction === "timeline-scrub") {
    return { uiSelector: '[aria-label="Playback position"]' };
  }
  if (path.interaction === "media-import") {
    return { uiSelector: '[data-toolcraft-control-target="source.image"]' };
  }
  if (path.interaction === "control-drag" || path.interaction === "control-change") {
    return { uiSelector: '[data-reeded-glass-output=""]' };
  }
  return {};
}

export function createGlassPerformanceScenarios(
  performance: ToolcraftEnvelopePerformanceConfig,
): ToolcraftPerformanceScenario[] {
  return deriveGlassPerformancePaths(performance).map((path): ToolcraftPerformanceScenario => {
    const common = {
      automated: true,
      automatedTestName: `perf: reeded glass ${path.id}`,
      browser: true,
      browserTestName: `browser perf: reeded glass ${path.id}`,
      coversTargets: path.targets,
      expectedObservable: `The ${path.interaction} path keeps the reeded glass preview at full selected quality.`,
      fixture: "uploaded photo fixture",
      id: `glass-${path.id}`,
      pathId: path.id,
      ...(path.targets.length === 1 ? { target: path.targets[0] } : {}),
    };
    if (path.interaction === "export") {
      return {
        ...common,
        actionValue: "export.png",
        completionEvidence: "download",
        controlLabel: "Export PNG",
        interaction: "export",
      };
    }
    return { ...common, ...getScenarioLocator(path), interaction: path.interaction };
  });
}
