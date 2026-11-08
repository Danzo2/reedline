import {
  registerToolcraftRendererPipeline,
  type ToolcraftRendererPipelinePassContract,
} from "@/toolcraft/runtime";

import type { GlassDecodedSource } from "./glass-source";

/** Every product value target consumed by the reeded glass shader. */
export const glassShaderSliderTargets = [
  "glass.amount",
  "glass.dispersion",
  "glass.frost",
  "glass.reflection",
  "glass.reflectionScale",
  "pattern.repeats",
  "pattern.angle",
  "pattern.contrast",
  "pattern.imperfections",
  "pattern.imperfectionScale",
  "motion.shiftSpeed",
  "noise.amount",
  "noise.size",
] as const;

export const glassShaderChangeTargets = ["pattern.type"] as const;

const intrinsicSceneBounds = {
  kind: "intrinsic",
  reason:
    "The reeded glass output is the refracted source photo or video clip inside the artboard frame; refraction samples are mirrored inside the source, so no output exists outside that frame.",
} as const;

type GlassPasses = {
  "glass-export": ToolcraftRendererPipelinePassContract<void>;
  "glass-preview": ToolcraftRendererPipelinePassContract<void>;
  "source-decode": ToolcraftRendererPipelinePassContract<
    GlassDecodedSource,
    GlassDecodedSource,
    readonly [string]
  >;
};

export const glassRendererPipelineRegistration =
  registerToolcraftRendererPipeline<GlassPasses>()({
    interactionInvalidation: [
      {
        interaction: "initial-render",
        invalidates: ["source-decode", "glass-preview"],
        targets: ["canvas.initial-render"],
      },
      {
        interaction: "media-import",
        invalidates: ["source-decode", "glass-preview"],
        targets: ["source.image", "source.video"],
      },
      {
        interaction: "control-drag",
        invalidates: ["glass-preview"],
        mustNotInvalidate: ["source-decode"],
        retainedAccesses: ["source-decode"],
        targets: [...glassShaderSliderTargets],
      },
      {
        interaction: "control-change",
        invalidates: ["glass-preview"],
        mustNotInvalidate: ["source-decode"],
        retainedAccesses: ["source-decode"],
        targets: [
          ...glassShaderChangeTargets,
          "export.includeBackground",
          "appearance.background",
          "canvas.infinity",
          "canvas.aspectRatio",
          "canvas.size.width",
          "canvas.size.height",
          "canvas.renderScale",
        ],
      },
      {
        interaction: "timeline-playback",
        invalidates: ["glass-preview"],
        mustNotInvalidate: ["source-decode"],
        retainedAccesses: ["source-decode"],
        targets: ["timeline.time"],
      },
      {
        interaction: "timeline-scrub",
        invalidates: ["glass-preview"],
        mustNotInvalidate: ["source-decode"],
        retainedAccesses: ["source-decode"],
        targets: ["timeline.time"],
      },
      {
        interaction: "viewport-drag",
        invalidates: [],
        mustNotInvalidate: ["source-decode", "glass-preview"],
        targets: ["canvas.viewport.offset"],
      },
      {
        interaction: "viewport-zoom",
        invalidates: ["glass-preview"],
        mustNotInvalidate: ["source-decode"],
        retainedAccesses: ["source-decode"],
        targets: ["canvas.viewport.zoom"],
      },
      {
        interaction: "export",
        invalidates: ["glass-export"],
        mustNotInvalidate: ["source-decode"],
        retainedAccesses: ["source-decode"],
        targets: ["actions.output"],
      },
    ],
    passes: [
      {
        cacheKey: ["source.resourceRef"],
        cost: { dimensions: ["source-pixels"], frequency: "once", relationship: "linear" },
        id: "source-decode",
        inputs: ["source.image", "source.video"],
        invalidatedBy: ["source.image", "source.video"],
        kind: "decode",
        lifecycle: { cache: "retained-resource", resourceScope: "source" },
        output: "source",
        quality: "full",
        runsOn: "main",
        sceneBounds: intrinsicSceneBounds,
      },
      {
        cost: { dimensions: ["preview-pixels"], frequency: "frame", relationship: "linear" },
        gpu: {
          resources: "sampled-textures",
          stage: "render",
          state: "stateless",
          surfaces: ["preview"],
        },
        id: "glass-preview",
        inputs: [
          "source-decode",
          ...glassShaderSliderTargets,
          ...glassShaderChangeTargets,
          "timeline.time",
          "canvas.backing.width",
          "canvas.backing.height",
        ],
        invalidatedBy: [
          "source-decode",
          ...glassShaderSliderTargets,
          ...glassShaderChangeTargets,
          "timeline.time",
          "canvas.backing.width",
          "canvas.backing.height",
        ],
        kind: "composite",
        lifecycle: { cache: "none", resourceScope: "call" },
        output: "preview",
        quality: "retina",
        runsOn: "gpu",
        sceneBounds: intrinsicSceneBounds,
      },
      {
        cost: { dimensions: ["export-long-edge"], frequency: "batch", relationship: "quadratic" },
        gpu: {
          resources: "sampled-textures",
          stage: "render",
          state: "stateless",
          surfaces: ["export"],
        },
        id: "glass-export",
        inputs: [
          "source-decode",
          ...glassShaderSliderTargets,
          ...glassShaderChangeTargets,
          "timeline.time",
        ],
        invalidatedBy: [
          "source-decode",
          ...glassShaderSliderTargets,
          ...glassShaderChangeTargets,
          "timeline.time",
        ],
        kind: "export",
        lifecycle: { cache: "none", resourceScope: "call" },
        output: "export",
        quality: "export",
        runsOn: "gpu",
      },
    ],
    runtimeId: "reeded-glass-webgl-v1",
  });

export const glassSourceDecodePass =
  glassRendererPipelineRegistration.getPass("source-decode");
export const glassPreviewPass = glassRendererPipelineRegistration.getPass("glass-preview");
export const glassExportPass = glassRendererPipelineRegistration.getPass("glass-export");
