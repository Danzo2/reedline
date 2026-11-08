import type {
  ToolcraftComponentAcceptance,
  ToolcraftControlSectionInventoryEntry,
  ToolcraftExportRequestEvidence,
  ToolcraftProductReadiness,
  ToolcraftTransferMode,
} from "./acceptance/types";
import { appSchema, REEDED_GLASS_LOOP_SECONDS } from "./app-schema";

const persistenceSlices =
  appSchema.persistence.storage === "localStorage"
    ? appSchema.persistence.include
    : [];

const REQUEST_MESSAGE_TEXT =
  "Using toolcraft, Build an app that applies a reeded glass effect to an uploaded image and start a local preview. The app should by default show an animated loop motion for the reeded glass and have the ability to export in video and image (png & jpeg) formats. The app should also have the ability to add noise. See the attached example, we need our app to achieve this same effect and feel. We should also have the attached controls implemented as well along with any others you think is good to include. I've attached two example images as reference. Part of the validation criteria for your build should be ensuring the output from our app has the same look as the attached examples and equivalent for the video output. Note how the app should support multiple pattern types.";

const REQUEST_MESSAGE_REF =
  "Claude Code session 5945cc30-e023-4f53-a0b3-d6fd3e9aa1e6, first user message (uuid 30fac330-78b0-42b2-9459-9fe04e22f8c8)";

const exportRequestEvidence: ToolcraftExportRequestEvidence = {
  messageRef: REQUEST_MESSAGE_REF,
  messageText: REQUEST_MESSAGE_TEXT,
  quote: "have the ability to export in video and image (png & jpeg) formats",
  source: "user-message",
};

export const appTransferMode: ToolcraftTransferMode = {
  animationIntent: {
    loopDuration: {
      evidence:
        "The inspected reference panel shows a 5.0 second shift loop (shift loop (sec) 5.0, timeline 5.0s); the product loop maps one integer reed shift to the runtime timeline duration.",
      seconds: REEDED_GLASS_LOOP_SECONDS,
      source: "reference",
    },
    mode: "timeline-playback",
  },
  mode: "new-toolcraft-app",
  referenceInputs: [],
};

export const appProductReadiness: ToolcraftProductReadiness = {
  exportIntent: {
    image: { evidence: exportRequestEvidence, mode: "user-requested" },
    svg: { mode: "not-requested" },
    video: { evidence: exportRequestEvidence, mode: "user-requested" },
  },
  interactionOwnership: [
    {
      alternative: {
        reason:
          "A canvas rotation handle would cover the refracted photo the user is judging and duplicate a precise numeric angle.",
        surface: "canvas",
      },
      capability: "property-edit",
      evidence: {
        detail:
          "The inspected reference exposes reed angle, repeats, amount and every glass property as panel sliders with no canvas handles.",
        source: "reference",
      },
      id: "glass-properties-panel",
      reason:
        "Glass and pattern properties are global numeric parameters edited precisely in the panel while the full canvas shows the result.",
      selectionScope: { mode: "global" },
      surface: "panel",
      target: "pattern.angle",
    },
  ],
  mode: "product",
  productName: "Reeded Glass",
  productSummary:
    "Applies an animated reeded (fluted) glass refraction with dispersion, imperfections and optional film grain to an uploaded photo, and exports PNG/JPG stills and seamless MP4/WebM loops.",
  requestedBehavior:
    "Upload a photo, view it through a looping reeded glass effect with multiple pattern types and adjustable glass, pattern, motion and noise controls, then export image (PNG/JPG) or video (MP4/WebM).",
  viewInteraction: {
    mode: "non-spatial",
    reason:
      "The product is a flat two-dimensional image filter; there is no three-dimensional scene or model to orbit.",
  },
};

const GLASS_SPEC = "e2e/product-glass.spec.ts" as const;
const MEDIA_SPEC = "e2e/product-source.spec.ts" as const;
const EXPORT_SPEC = "e2e/product-export.spec.ts" as const;
const TIMELINE_SPEC = "e2e/product-timeline.spec.ts" as const;
const RUNTIME_SPEC = "e2e/product-canvas.spec.ts" as const;

type SliderRow = Readonly<{
  id: string;
  label: string;
  observable: string;
  target: string;
}>;

const shaderSliderRows: readonly SliderRow[] = [
  { id: "glass.amount", label: "Amount", observable: "Refraction offset at the reed seams grows or shrinks.", target: "glass.amount" },
  { id: "glass.dispersion", label: "Dispersion", observable: "Red/blue colour fringes at reed seams widen.", target: "glass.dispersion" },
  { id: "glass.frost", label: "Frost", observable: "The refracted photo softens.", target: "glass.frost" },
  { id: "glass.reflection", label: "Reflection", observable: "A bright specular streak appears along each reed.", target: "glass.reflection" },
  { id: "glass.reflectionScale", label: "Reflection scale", observable: "The reflection streak widens.", target: "glass.reflectionScale" },
  { id: "pattern.repeats", label: "Repeats", observable: "The number of reed seams across the photo changes.", target: "pattern.repeats" },
  { id: "pattern.angle", label: "Angle", observable: "Reed seams rotate away from vertical.", target: "pattern.angle" },
  { id: "pattern.contrast", label: "Contrast", observable: "Reed profile sharpness and seam shading change.", target: "pattern.contrast" },
  { id: "pattern.imperfections", label: "Imperfections", observable: "Seams gain blocky irregular offsets.", target: "pattern.imperfections" },
  { id: "pattern.imperfectionScale", label: "Imperfection scale", observable: "Imperfection steps become finer or coarser.", target: "pattern.imperfectionScale" },
  { id: "motion.shiftSpeed", label: "Shift speed", observable: "Reeds at a fixed timeline time sit at a different offset.", target: "motion.shiftSpeed" },
  { id: "noise.amount", label: "Amount", observable: "Film grain appears over the glass.", target: "noise.amount" },
  { id: "noise.size", label: "Grain size", observable: "Grain cells become larger.", target: "noise.size" },
];

function sliderAcceptance(row: SliderRow): ToolcraftComponentAcceptance {
  return {
    ...(row.target === "pattern.angle" ? { interactionId: "glass-properties-panel" } : {}),
    automated: true,
    automatedTestName: `glass control ${row.id} maps to a shader parameter`,
    browser: {
      budget: "standard",
      file: GLASS_SPEC,
      testName: `browser: ${row.id} slider drag changes reeded glass pixels live`,
    },
    componentType: "slider",
    evidence: "rendered-pixels",
    expectedObservable: row.observable,
    fixture: "uploaded photo fixture with default glass settings",
    id: row.id.startsWith("glass.") ? row.id : `glass.${row.id}`,
    kind: "control",
    target: row.target,
    userAction: `Drag the ${row.label} slider thumb.`,
  };
}

export const appAcceptance: readonly ToolcraftComponentAcceptance[] = [
  ...shaderSliderRows.map(sliderAcceptance),
  {
    automated: true,
    automatedTestName: "glass control pattern.type maps every pattern to a distinct shader profile",
    browser: {
      budget: "standard",
      file: GLASS_SPEC,
      testName: "browser: pattern type select renders each reed profile",
    },
    componentType: "select",
    evidence: "rendered-pixels",
    expectedObservable: "Each pattern type renders a different glass structure (block grid, reeds, bubble or hexagon lenses); Ripple keeps everything vertical (fixed reed strips that each ripple softly, no horizontal row bands), moves at a steady speed without stalling and returns exactly at the loop end.",
    fixture: "uploaded photo fixture with default glass settings",
    id: "glass.pattern.type",
    kind: "control",
    optionCoverage: "each-visible-item",
    target: "pattern.type",
    userAction: "Choose Blocks, Rounded, Bubbles, Hexagons, Fluted, Prism and Ripple in the Profile select.",
  },
  {
    automated: true,
    automatedTestName: "glass source mapping cover-crops the photo into the artboard",
    browser: {
      budget: "extended-io",
      file: MEDIA_SPEC,
      testName: "browser: photo upload, transform, remove and reset drive the glass output",
    },
    componentType: "fileDrop",
    evidence: "media-lifecycle",
    expectedObservable:
      "First open shows the saved default dandelion photo; uploading a WebP or PNG replaces it with the refracted photo and fits the artboard to the photo's aspect ratio; rotate refits it and rotate/flip change the output; remove clears it; Reset restores the default photo.",
    fixture: "mismatched-aspect WebP photo replacing the saved default photo, then a PNG",
    id: "source.image",
    kind: "control",
    mediaLifecycleCoverage: ["upload", "remove", "reset", "rotate", "flip", "transform-output"],
    target: "source.image",
    userAction: "Open the app, upload a photo, rotate and flip it, remove it, upload again and reset the Source section.",
  },
  {
    automated: true,
    automatedTestName: "glass video clip time follows the timeline loop",
    browser: {
      budget: "extended-io",
      file: MEDIA_SPEC,
      testName: "browser: MP4 clip upload, playback, remove and reset drive the glass output",
    },
    componentType: "fileDrop",
    evidence: "media-lifecycle",
    expectedObservable:
      "Uploading an MP4 clip replaces the photo with the refracted clip, fits the artboard to the clip's aspect ratio and sets the timeline duration to the clip's length; scrubbing shows the clip frame at that time; removing the clip returns to the photo; Reset of the Source section removes the clip.",
    fixture: "2 s 640x360 MP4 clip whose colour changes over time, uploaded over the default photo",
    id: "source.video",
    kind: "control",
    mediaLifecycleCoverage: ["upload", "remove", "reset"],
    target: "source.video",
    userAction: "Upload an MP4 clip, scrub the timeline, remove the clip, upload it again and reset the Source section.",
  },
  {
    automated: true,
    automatedTestName: "glass background stays runtime owned",
    backgroundOutputCoverage: "all-required-background-output",
    browser: {
      budget: "extended-io",
      file: EXPORT_SPEC,
      testName: "browser: background switch and color drive preview and exports",
    },
    componentType: "switch",
    evidence: "exported-bytes",
    expectedObservable:
      "Background off removes runtime fill around the glass and makes PNG alpha transparent outside the photo while video keeps the background.",
    fixture: "uploaded photo",
    id: "export.includeBackground",
    kind: "control",
    target: "export.includeBackground",
    userAction: "Toggle Background and export PNG and video.",
  },
  {
    automated: true,
    automatedTestName: "glass background color is a runtime fill",
    browser: {
      budget: "standard",
      file: EXPORT_SPEC,
      testName: "browser: background color changes the runtime fill",
    },
    componentType: "color",
    evidence: "rendered-pixels",
    expectedObservable: "The runtime background fill around the artboard changes colour.",
    fixture: "uploaded photo in Infinity canvas",
    id: "export.background-color",
    kind: "control",
    target: "appearance.background",
    userAction: "Pick a new background color.",
  },
  {
    actionCoverage: ["export.png", "export.video"],
    automated: true,
    automatedTestName: "glass image export renders the shader frame",
    browser: {
      budget: "extended-io",
      file: EXPORT_SPEC,
      testName: "browser: image export writes PNG and JPG reeded glass artifacts",
    },
    componentType: "panelActions",
    evidence: "exported-bytes",
    exportArtifactCoverage: "all-required-image-export-behavior",
    expectedObservable: "Downloaded PNG/JPG decode at the selected resolution and contain the reeded glass frame.",
    fixture: "uploaded photo",
    id: "export.image",
    kind: "control",
    target: "actions.output",
    userAction: "Choose PNG/JPG and 2K/4K/8K and click Export.",
  },
  {
    actionCoverage: ["export.png", "export.video"],
    automated: true,
    automatedTestName: "glass video export renders seamless loop frames",
    browser: {
      budget: "extended-io",
      file: EXPORT_SPEC,
      testName: "browser: video export writes MP4 and WebM reeded glass loops",
    },
    componentType: "panelActions",
    evidence: "exported-bytes",
    exportArtifactCoverage: "all-required-video-export-behavior",
    expectedObservable:
      "Downloaded MP4/WebM have the timeline duration at 30 FPS with distinct animated reeded glass frames.",
    fixture: "uploaded photo",
    id: "export.video",
    kind: "control",
    target: "actions.output",
    userAction: "Choose MP4/WebM and Current/4K and click Export.",
  },
  {
    automated: true,
    automatedTestName: "glass image export format options",
    browser: {
      budget: "standard",
      file: EXPORT_SPEC,
      testName: "browser: image format options select PNG and JPG",
    },
    componentType: "select",
    evidence: "product-output",
    expectedObservable: "PNG and JPG are selectable and the export button label follows the format.",
    fixture: "uploaded photo",
    id: "export.image.format",
    kind: "control",
    optionCoverage: ["png", "jpg"],
    target: "export.image.format",
    userAction: "Select PNG and JPG.",
  },
  {
    automated: true,
    automatedTestName: "glass image export resolution options",
    browser: {
      budget: "standard",
      file: EXPORT_SPEC,
      testName: "browser: image resolution options select 2K 4K and 8K",
    },
    componentType: "select",
    evidence: "product-output",
    expectedObservable: "2K, 4K and 8K are selectable image resolutions.",
    fixture: "uploaded photo",
    id: "export.image.resolution",
    kind: "control",
    optionCoverage: ["2k", "4k", "8k"],
    target: "export.image.resolution",
    userAction: "Select 2K, 4K and 8K.",
  },
  {
    automated: true,
    automatedTestName: "glass video export format options",
    browser: {
      budget: "standard",
      file: EXPORT_SPEC,
      testName: "browser: video format options select MP4 and WebM",
    },
    componentType: "select",
    evidence: "product-output",
    expectedObservable: "MP4 and WebM are selectable and the export button label follows the format.",
    fixture: "uploaded photo",
    id: "export.video.format",
    kind: "control",
    optionCoverage: ["mp4", "webm"],
    target: "export.video.format",
    userAction: "Select MP4 and WebM.",
  },
  {
    automated: true,
    automatedTestName: "glass video export resolution options",
    browser: {
      budget: "standard",
      file: EXPORT_SPEC,
      testName: "browser: video resolution options select Current and 4K",
    },
    componentType: "select",
    evidence: "product-output",
    expectedObservable: "Current and 4K are selectable video resolutions.",
    fixture: "uploaded photo",
    id: "export.video.resolution",
    kind: "control",
    optionCoverage: ["current", "4k"],
    target: "export.video.resolution",
    userAction: "Select Current and 4K.",
  },
  {
    automated: true,
    automatedTestName: "glass scene bounds follow the artboard in both canvas modes",
    browser: {
      budget: "standard",
      file: RUNTIME_SPEC,
      testName: "browser: infinity canvas keeps the glass frame renderer and backing",
    },
    componentType: "canvas",
    evidence: "viewport-side-effect",
    expectedObservable:
      "Infinity mode removes only the artboard boundary; glass frame, renderer identity and backing stay continuous and finite size restores.",
    fixture: "uploaded photo",
    id: "canvas.infinity-mode",
    infinityCanvasCoverage: "mode-continuity-and-restoration",
    kind: "runtime",
    target: "canvas.infinity",
    userAction: "Toggle Infinity canvas on and off.",
  },
  {
    automated: true,
    automatedTestName: "glass infinity image export keeps scene bounds",
    browser: {
      budget: "extended-io",
      file: EXPORT_SPEC,
      testName: "browser: infinity image export contains the full glass frame",
    },
    componentType: "canvas",
    evidence: "exported-bytes",
    expectedObservable: "Infinity PNG export has the glass scene bounds, dimensions and decoded content.",
    fixture: "uploaded photo",
    id: "export.infinity-image",
    infinityCanvasCoverage: "scene-bounds-image-export",
    kind: "runtime",
    target: "canvas.infinity",
    userAction: "Enable Infinity canvas and export PNG.",
  },
  {
    automated: true,
    automatedTestName: "glass infinity video export keeps the saved artboard",
    browser: {
      budget: "extended-io",
      file: EXPORT_SPEC,
      testName: "browser: infinity video export keeps the saved artboard",
    },
    componentType: "canvas",
    evidence: "exported-bytes",
    expectedObservable: "Infinity video export keeps the saved artboard dimensions, duration and frames.",
    fixture: "uploaded photo",
    id: "export.infinity-video",
    infinityCanvasCoverage: "scene-bounds-video-export",
    kind: "runtime",
    target: "canvas.infinity",
    userAction: "Enable Infinity canvas and export video.",
  },
  {
    automated: true,
    automatedTestName: "glass loop shift is seamless and forward",
    browser: {
      budget: "standard",
      file: TIMELINE_SPEC,
      testName: "browser: playback timeline loops the reeded glass seamlessly",
    },
    componentType: "timeline",
    evidence: "timeline-output",
    expectedObservable:
      "Reeds slide forward through one loop; first and last frames match; duration edits keep the seam.",
    fixture: "uploaded photo",
    id: "timeline.playback",
    kind: "runtime",
    target: "timeline.playback",
    timelineCoverage: "playback",
    timelineLoopProof: {
      direction: "forward-only",
      durationChange: "reproved-after-edit",
      reversePlayback: "forbidden",
      seam: "first-last-match",
    },
    timelinePlaybackCoverage: "all-playback-behavior",
    userAction: "Play, pause, scrub, edit duration and observe the loop seam.",
  },
  {
    automated: true,
    automatedTestName: "glass preview backing follows render scale",
    browser: {
      budget: "standard",
      file: RUNTIME_SPEC,
      testName: "browser: resolution scale sets exact glass backing pixels",
    },
    componentType: "slider",
    evidence: "rendered-pixels",
    expectedObservable: "Glass canvas backing equals CSS size × DPR × Resolution scale.",
    fixture: "uploaded photo",
    id: "canvas.renderScale",
    kind: "runtime",
    renderScaleCoverage: {
      kind: "selected-backing-pixels",
      states: ["interaction", "playback", "steady"],
    },
    target: "canvas.renderScale",
    userAction: "Change Resolution scale while idle, playing and interacting.",
  },
  {
    automated: true,
    automatedTestName: "declares production reload coverage for the reeded glass schema",
    browser: {
      budget: "extended-io",
      file: "e2e/app-persistence.spec.ts",
      testName: "browser: app restores exact canvas, values, and panel workspace slices after reload",
    },
    componentType: "persistence",
    evidence: "persistence-state",
    expectedObservable:
      "Canvas size and zoom, their runtime values, and the moved and collapsed Controls workspace remain visibly restored after a real browser reload.",
    fixture: "uploaded photo with edited settings",
    id: "persistence.reload",
    kind: "runtime",
    persistenceCoverage: "reload",
    persistenceSlices,
    target: "canvas.size.width",
    userAction: "Edit Canvas width and zoom, move and collapse Controls, wait for persistence, and reload the page.",
  },
];

export const appControlSectionInventory: readonly ToolcraftControlSectionInventoryEntry[] = [
  {
    entity: "Source photo or video",
    entityId: "source-photo",
    finiteSelectors: [],
    groupingReason:
      "The uploaded photo or MP4 clip is the single source the glass refracts; an attached clip takes priority over the photo, so both uploaders share one section and reset scope.",
    id: "source",
    targets: ["source.image", "source.video"],
    title: "Source",
  },
  {
    entity: "Glass material",
    entityId: "glass-material",
    finiteSelectors: [],
    groupingReason:
      "Refraction amount, dispersion, frost and reflection describe the optical material of the glass sheet.",
    id: "glass",
    targets: [
      "glass.amount",
      "glass.dispersion",
      "glass.frost",
      "glass.reflection",
      "glass.reflectionScale",
    ],
    title: "Glass",
  },
  {
    entity: "Reed pattern",
    entityId: "reed-pattern",
    finiteSelectors: [
      {
        reason: "Pattern type changes the reed cross-section of the rendered glass only.",
        role: "parameter",
        target: "pattern.type",
      },
    ],
    groupingReason:
      "Pattern type, repeats, angle, contrast and imperfections define the reed geometry.",
    id: "pattern",
    targets: [
      "pattern.type",
      "pattern.repeats",
      "pattern.angle",
      "pattern.contrast",
      "pattern.imperfections",
      "pattern.imperfectionScale",
    ],
    title: "Pattern",
  },
  {
    entity: "Glass motion",
    entityId: "glass-motion",
    finiteSelectors: [
      {
        reason: "Shift speed changes only how many reeds the glass slides per loop.",
        role: "parameter",
        target: "motion.shiftSpeed",
      },
    ],
    groupingReason: "Shift speed sets how far the reeds slide over one timeline loop.",
    id: "motion",
    targets: ["motion.shiftSpeed"],
    title: "Motion",
  },
  {
    entity: "Film grain",
    entityId: "film-grain",
    finiteSelectors: [],
    groupingReason: "Grain amount and size describe one film-grain overlay.",
    id: "noise",
    targets: ["noise.amount", "noise.size"],
    title: "Noise",
  },
  {
    entity: "Output background",
    entityId: "output-background",
    finiteSelectors: [
      {
        affectedTargets: ["appearance.background"],
        reason: "Background inclusion determines whether its color affects output.",
        role: "branch",
        target: "export.includeBackground",
      },
    ],
    groupingReason: "Inclusion and color jointly define the runtime background fill.",
    id: "background",
    targets: ["export.includeBackground", "appearance.background"],
    title: "Background",
  },
  {
    entity: "Image delivery",
    entityId: "image-delivery",
    finiteSelectors: [
      { reason: "Image format changes its own exported encoding.", role: "parameter", target: "export.image.format" },
      { reason: "Image resolution changes its own exported dimensions.", role: "parameter", target: "export.image.resolution" },
    ],
    groupingReason: "Format and resolution configure the exported still.",
    id: "runtime.image-export",
    targets: ["export.image.format", "export.image.resolution"],
    title: "Image Export",
  },
  {
    entity: "Video delivery",
    entityId: "video-delivery",
    finiteSelectors: [
      { reason: "Video format changes its own exported container.", role: "parameter", target: "export.video.format" },
      { reason: "Video resolution changes its own exported dimensions.", role: "parameter", target: "export.video.resolution" },
    ],
    groupingReason: "Format and resolution configure the exported loop.",
    id: "runtime.video-export",
    targets: ["export.video.format", "export.video.resolution"],
    title: "Video Export",
  },
];
