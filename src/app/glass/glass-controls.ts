import type { ToolcraftControlSchema } from "@/toolcraft/runtime";

import { GLASS_SOURCE_TARGET, GLASS_VIDEO_TARGET, glassDefaults } from "./glass-values";

type ProductSection = {
  controls: Record<string, ToolcraftControlSchema>;
  description?: string;
  id: string;
  layoutGroups?: readonly Readonly<{
    columns: 2;
    controls: readonly string[];
    layout: "inline";
  }>[];
  title: string;
};

const always = { mode: "always" } as const;
const shaderReason =
  "Updates one shader uniform; the preview re-renders the same full-resolution pass.";

export const sourceSection: ProductSection = {
  controls: {
    image: {
      accept: "image/*",
      applicability: always,
      assetKind: "image",
      label: "Photo",
      performanceRole: "responsiveness",
      performanceReason:
        "Upload runs one retained source decode (modelled as the external source-pixels dimension); later edits reuse it.",
      target: GLASS_SOURCE_TARGET,
      type: "fileDrop",
    },
    video: {
      accept: "video/mp4,.mp4",
      applicability: always,
      assetKind: "file",
      description:
        "An MP4 clip replaces the photo as the glass source while attached. A new clip sets the loop length to its duration and fits the canvas to its aspect ratio; exports render every frame of the clip.",
      label: "Video",
      performanceRole: "responsiveness",
      performanceReason:
        "Upload runs one retained clip load (the external source-pixels dimension); each preview or export frame then uploads the current clip frame inside the existing glass pass.",
      target: GLASS_VIDEO_TARGET,
      type: "fileDrop",
    },
  },
  id: "source",
  title: "Source",
};

export const glassSection: ProductSection = {
  controls: {
    amount: {
      applicability: always,
      defaultValue: glassDefaults.amount,
      description: "How strongly each reed bends the photo behind it.",
      label: "Amount",
      max: 2,
      min: 0,
      performanceRole: "responsiveness",
      performanceReason: shaderReason,
      sliderValueKind: "continuous",
      step: 0.01,
      target: "glass.amount",
      type: "slider",
    },
    dispersion: {
      applicability: always,
      defaultValue: glassDefaults.dispersion,
      description: "Splits red, green and blue refraction for prismatic fringes at reed edges.",
      label: "Dispersion",
      max: 1,
      min: 0,
      performanceRole: "responsiveness",
      performanceReason: shaderReason,
      sliderValueKind: "continuous",
      step: 0.01,
      target: "glass.dispersion",
      type: "slider",
    },
    frost: {
      applicability: always,
      defaultValue: glassDefaults.frost,
      description: "Softens the refracted photo like lightly frosted glass.",
      label: "Frost",
      max: 1,
      min: 0,
      performanceRole: "responsiveness",
      performanceReason: shaderReason,
      sliderValueKind: "continuous",
      step: 0.01,
      target: "glass.frost",
      type: "slider",
    },
    reflection: {
      applicability: always,
      defaultValue: glassDefaults.reflection,
      description: "Adds a specular light streak running along every reed.",
      label: "Reflection",
      max: 1,
      min: 0,
      performanceRole: "responsiveness",
      performanceReason: shaderReason,
      sliderValueKind: "continuous",
      step: 0.01,
      target: "glass.reflection",
      type: "slider",
    },
    reflectionScale: {
      applicability: always,
      defaultValue: glassDefaults.reflectionScale,
      description: "Width of the reflection streak.",
      label: "Reflection scale",
      max: 4,
      min: 0.1,
      performanceRole: "responsiveness",
      performanceReason: shaderReason,
      sliderValueKind: "continuous",
      step: 0.01,
      target: "glass.reflectionScale",
      type: "slider",
    },
  },
  id: "glass",
  title: "Glass",
};

export const patternSection: ProductSection = {
  controls: {
    type: {
      applicability: always,
      defaultValue: glassDefaults.patternType,
      description:
        "Glass structure: Blocks, Rounded, Bubbles and Hexagons are the classic reeded glass lens shapes; Fluted and Prism are extra reed profiles; Ripple is a subtle shimmering wave that sways back and forth each loop.",
      label: "Profile",
      options: [
        { label: "Blocks", value: "blocks" },
        { label: "Rounded", value: "rounded" },
        { label: "Bubbles", value: "bubbles" },
        { label: "Hexagons", value: "hexagons" },
        { label: "Fluted", value: "fluted" },
        { label: "Prism", value: "prism" },
        { label: "Ripple", value: "ripple" },
      ],
      performanceRole: "responsiveness",
      performanceReason: shaderReason,
      target: "pattern.type",
      type: "select",
    },
    repeats: {
      applicability: always,
      defaultValue: glassDefaults.repeats,
      description: "Number of reeds across the photo width.",
      label: "Repeats",
      max: 48,
      min: 1,
      performanceRole: "responsiveness",
      performanceReason: shaderReason,
      sliderValueKind: "discrete",
      step: 1,
      target: "pattern.repeats",
      type: "slider",
      variant: "continuous",
    },
    angle: {
      applicability: always,
      defaultValue: glassDefaults.angle,
      label: "Angle",
      max: 90,
      min: -90,
      performanceRole: "responsiveness",
      performanceReason: shaderReason,
      sliderValueKind: "continuous",
      step: 1,
      target: "pattern.angle",
      type: "slider",
      unit: "°",
    },
    contrast: {
      applicability: always,
      defaultValue: glassDefaults.contrast,
      description:
        "Sharpens each reed profile: low values bend the whole reed evenly, high values keep the centre clear and concentrate refraction, light and shadow at the seams.",
      label: "Contrast",
      max: 10,
      min: 0,
      performanceRole: "responsiveness",
      performanceReason: shaderReason,
      sliderValueKind: "continuous",
      step: 0.1,
      target: "pattern.contrast",
      type: "slider",
    },
    imperfections: {
      applicability: always,
      defaultValue: glassDefaults.imperfections,
      description: "Irregular waviness that makes the reeds look hand-made.",
      label: "Imperfections",
      max: 1,
      min: 0,
      performanceRole: "responsiveness",
      performanceReason: shaderReason,
      sliderValueKind: "continuous",
      step: 0.01,
      target: "pattern.imperfections",
      type: "slider",
    },
    imperfectionScale: {
      applicability: always,
      defaultValue: glassDefaults.imperfectionScale,
      description: "Frequency of the imperfection waviness; higher values are finer.",
      label: "Imperfection scale",
      max: 50,
      min: 1,
      performanceRole: "responsiveness",
      performanceReason: shaderReason,
      sliderValueKind: "continuous",
      step: 0.1,
      target: "pattern.imperfectionScale",
      type: "slider",
    },
  },
  id: "pattern",
  title: "Pattern",
};

export const motionSection: ProductSection = {
  controls: {
    shiftSpeed: {
      applicability: always,
      defaultValue: glassDefaults.shiftSpeed,
      description:
        "Reeds the glass slides per loop. Whole numbers keep the loop seamless; negative values slide left; 0 holds still. Loop length is the timeline duration.",
      label: "Shift speed",
      max: 6,
      min: -6,
      performanceRole: "responsiveness",
      performanceReason: shaderReason,
      markerCount: 13,
      sliderValueKind: "discrete",
      step: 1,
      target: "motion.shiftSpeed",
      type: "slider",
      variant: "discrete",
    },
  },
  id: "motion",
  title: "Motion",
};

export const noiseSection: ProductSection = {
  controls: {
    amount: {
      applicability: always,
      defaultValue: glassDefaults.noiseAmount,
      description: "Film-grain noise layered over the glass.",
      label: "Amount",
      max: 1,
      min: 0,
      performanceRole: "responsiveness",
      performanceReason: shaderReason,
      sliderValueKind: "continuous",
      step: 0.01,
      target: "noise.amount",
      type: "slider",
    },
    size: {
      applicability: always,
      defaultValue: glassDefaults.noiseSize,
      description: "Grain size in photo pixels.",
      label: "Grain size",
      max: 8,
      min: 0.5,
      performanceRole: "responsiveness",
      performanceReason: shaderReason,
      sliderValueKind: "continuous",
      step: 0.1,
      target: "noise.size",
      type: "slider",
      unit: "px",
    },
  },
  id: "noise",
  title: "Noise",
};

export const backgroundSection: ProductSection = {
  controls: {
    includeBackground: {
      applicability: always,
      defaultValue: glassDefaults.includeBackground,
      label: "Include",
      performanceRole: "responsiveness",
      performanceReason: "Runtime toggles its background fill; the glass pass is unchanged.",
      target: "export.includeBackground",
      type: "switch",
    },
    background: {
      applicability: always,
      defaultValue: glassDefaults.background,
      label: false,
      performanceRole: "responsiveness",
      performanceReason: "Runtime repaints its background fill; the glass pass is unchanged.",
      target: "appearance.background",
      type: "color",
    },
  },
  id: "background",
  layoutGroups: [
    { columns: 2, controls: ["includeBackground", "background"], layout: "inline" },
  ],
  title: "Background",
};

export const glassControlSections = [
  sourceSection,
  glassSection,
  patternSection,
  motionSection,
  noiseSection,
  backgroundSection,
] as const;
