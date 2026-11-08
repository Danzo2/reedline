import type { Download, Page } from "@playwright/test";

import {
  expectToolcraftBackgroundOutputSemantics,
  expectToolcraftFiniteBackgroundMediaStacking,
  type ToolcraftFiniteBackgroundStackingObservation,
} from "./browser-background-output-evidence";
import {
  expectToolcraftInfinityCanvasBackgroundEvidence,
  expectToolcraftInfinityCanvasImageExportEvidence,
  expectToolcraftInfinityCanvasVideoExportEvidence,
  observeInfinityCanvasBackground,
} from "./browser-infinity-canvas-evidence";
import {
  expectToolcraftImageExportArtifact,
  expectToolcraftVideoExportArtifact,
} from "./browser-media-export-evidence";
import { createToolcraftBrowserProofSession } from "./browser-proof-session";
import { inspectToolcraftImageDownload } from "./image-artifact-inspection";
import { expectToolcraftProductObservableToChange } from "./product-observable-helpers";
import {
  controlTarget,
  openWithFixturePhoto,
  pausePlayback,
  selectOption,
  setSliderToHome,
  showExtendedTimeline,
  waitForGlassFrame,
} from "./product-glass-support";
import { inspectToolcraftVideoDownload } from "./video-artifact-inspection";
import {
  getToolcraftApplicabilityRequirementId,
  getToolcraftControlApplicabilityCases,
} from "../src/app/app-acceptance";
import { appControlSectionInventory } from "../src/app/app-acceptance-data";
import { appSchema } from "../src/app/app-schema";
import { expectToolcraftControlApplicabilityState } from "./browser-control-applicability-evidence";
import { expect, test } from "./toolcraft-product-test";

const BLACK: readonly [number, number, number, number] = [0, 0, 0, 255];

/** Runtime video export cadence: fixed 30 FPS frames across the timeline duration. */
function createToolcraftVideoFrameSchedule(durationSeconds: number) {
  const frameCount = Math.round(durationSeconds * 30);
  return Array.from({ length: frameCount }, (_, index) => ({
    durationSeconds: Math.min(durationSeconds, (index + 1) / 30) - index / 30,
    index,
    timeSeconds: index / 30,
  }));
}

/** Flat quadrant centres of the fixture photo stay exact with Contrast 0. */
const quadrantPixels = [
  { rgba: [255, 0, 0, 255], xRatio: 0.25, yRatio: 0.15 },
  { rgba: [0, 255, 0, 255], xRatio: 0.75, yRatio: 0.15 },
  { rgba: [0, 0, 255, 255], xRatio: 0.25, yRatio: 0.85 },
  { rgba: [255, 255, 0, 255], xRatio: 0.75, yRatio: 0.85 },
] as const;

const fullFrameBounds = { height: 1, width: 1, x: 0, y: 0 };

async function setTimelineDuration(page: Page, seconds: number): Promise<void> {
  await showExtendedTimeline(page);
  await page.getByRole("button", { name: "Edit timeline duration" }).click();
  const editor = page.getByRole("textbox", { name: "timeline duration" });
  await editor.fill(`${seconds}s`);
  await editor.press("Enter");
  await expect(page.getByRole("slider", { name: "Playback position" })).toHaveAttribute(
    "aria-valuemax",
    String(seconds),
  );
}

// The 800x600 fixture photo auto-fits the saved 1920x1080 artboard to 4:3
// (1920x1440), so exports are 4:3: 4K PNG 4096x3072, current video 1920x1440,
// 4K video 2880x2160 (fits inside 3840x2160).
async function prepareExactOutput(page: Page): Promise<void> {
  await pausePlayback(page);
  await setSliderToHome(controlTarget(page, "pattern.contrast"));
  await waitForGlassFrame(page);
}

async function clickExport(page: Page, label: string): Promise<Download> {
  const download = page.waitForEvent("download", { timeout: 110_000 });
  await page.getByRole("button", { name: label }).click();
  return download;
}

test("browser: image export writes PNG and JPG reeded glass artifacts", async ({ page }) => {
  await openWithFixturePhoto(page);
  const session = await createToolcraftBrowserProofSession(page);
  await waitForGlassFrame(page);
  await prepareExactOutput(page);
  await expectToolcraftImageExportArtifact(
    session.targetAction("actions.output", (currentPage) => clickExport(currentPage, "Export PNG")),
    {
      backgroundRgba: BLACK,
      expectedBounds: fullFrameBounds,
      expectedHeight: 3072,
      expectedMediaType: "image/png",
      expectedPixels: quadrantPixels,
      expectedWidth: 4096,
      page,
      requirementId: "export.image",
    },
  );
  await selectOption(page, "export.image.format", "JPG");
  await selectOption(page, "export.image.resolution", "2K");
  const jpg = await inspectToolcraftImageDownload({
    backgroundRgba: BLACK,
    download: await clickExport(page, "Export JPG"),
    page,
  });
  expect(jpg.inspection.mediaType).toBe("image/jpeg");
  expect([jpg.inspection.width, jpg.inspection.height]).toEqual([2048, 1536]);
});

test("browser: video export writes MP4 and WebM reeded glass loops", async ({ page }) => {
  await openWithFixturePhoto(page);
  const session = await createToolcraftBrowserProofSession(page);
  await waitForGlassFrame(page);
  await prepareExactOutput(page);
  await setTimelineDuration(page, 1);
  const schedule = createToolcraftVideoFrameSchedule(1);
  const middle = schedule[Math.floor(schedule.length / 2)]!.timeSeconds;
  const last = schedule[schedule.length - 1]!.timeSeconds;
  await expectToolcraftVideoExportArtifact(
    session.targetAction("actions.output", (currentPage) => clickExport(currentPage, "Export MP4")),
    {
      animated: true,
      backgroundRgba: BLACK,
      expectedDurationSeconds: 1,
      expectedHeight: 1440,
      expectedMediaType: "video/mp4",
      expectedSamples: [0, middle, last].map((timeSeconds) => ({
        pixels: quadrantPixels,
        timeSeconds,
      })),
      expectedWidth: 1920,
      page,
      requirementId: "export.video",
      schedule,
    },
  );
  await selectOption(page, "export.video.format", "WebM");
  await selectOption(page, "export.video.resolution", "4K");
  const webm = await inspectToolcraftVideoDownload({
    backgroundRgba: BLACK,
    download: await clickExport(page, "Export WebM"),
    page,
    schedule,
  });
  expect(webm.inspection.mediaType).toBe("video/webm");
  expect([webm.inspection.width, webm.inspection.height]).toEqual([2880, 2160]);
  expect(new Set(webm.inspection.samplePixelHashes).size).toBeGreaterThan(1);
});

test("browser: background switch and color drive preview and exports", async ({ page }) => {
  await openWithFixturePhoto(page, { transparentMargin: 60 });
  const session = await createToolcraftBrowserProofSession(page);
  await waitForGlassFrame(page);
  await pausePlayback(page);
  await setTimelineDuration(page, 1);
  const backgroundSwitch = () => controlTarget(page, "export.includeBackground").getByRole("switch");

  const observePreview = session.observe((root) => {
    const visible = root.querySelector("[data-toolcraft-finite-background-layer]") !== null;
    return { backgroundVisible: visible, outputSignature: visible ? "background:on" : "background:off" };
  });
  await expectToolcraftBackgroundOutputSemantics(
    observePreview,
    session.controlAction("export.includeBackground", (field) => field.getByRole("switch").click()),
    { backgroundVisible: false, outputSignature: "background:off" },
    session.targetAction("actions.output", (currentPage) => clickExport(currentPage, "Export PNG")),
    async (download: Download) => {
      const inspected = await inspectToolcraftImageDownload({ backgroundRgba: [0, 0, 0, 0], download, page });
      return {
        ...inspected.inspection,
        backgroundAlpha: inspected.observation.normalizedPixels[3] ?? 255,
      };
    },
    {
      requirementId: "export.includeBackground",
      video: {
        exportArtifact: session.targetAction("actions.output", (currentPage) =>
          clickExport(currentPage, "Export MP4"),
        ),
        inspectArtifact: async (download: Download) => {
          const inspected = await inspectToolcraftVideoDownload({
            backgroundRgba: BLACK,
            download,
            page,
            schedule: createToolcraftVideoFrameSchedule(1),
          });
          const corner = Array.from(inspected.observations[0]!.normalizedPixels.slice(0, 4));
          return {
            ...inspected.inspection,
            backgroundIncluded: corner[3] === 255 && corner[0]! < 24 && corner[1]! < 24 && corner[2]! < 24,
          };
        },
      },
    },
  );

  // Finite stacking: Background → processed product (source image is not a visible media layer).
  const observeStacking = session.observe((root): ToolcraftFiniteBackgroundStackingObservation => {
    const background = root.querySelector<HTMLElement>("[data-toolcraft-finite-background-layer]");
    const product = root.querySelector<HTMLElement>("[data-reeded-glass-output]");
    const surface = root.querySelector<HTMLElement>("[data-toolcraft-canvas-mode]");
    const order: string[] = [];
    if (background) order.push("background");
    if (product) {
      if (background && background.compareDocumentPosition(product) & Node.DOCUMENT_POSITION_PRECEDING) {
        order.unshift("product");
      } else order.push("product");
    }
    const color = background ? getComputedStyle(background).backgroundColor : "none";
    return {
      backgroundColor: color,
      backgroundVisible: background !== null,
      canvasMode: surface?.dataset.toolcraftCanvasMode === "infinite" ? "infinite" : "finite",
      layerOrder: order,
      mediaVisible: false,
      outputSignature: `${background !== null}:${color}`,
      productForegroundTransparent: product
        ? ["rgba(0, 0, 0, 0)", "transparent"].includes(getComputedStyle(product).backgroundColor)
        : false,
    };
  });
  await expectToolcraftFiniteBackgroundMediaStacking(
    observeStacking,
    session.controlAction("export.includeBackground", (field) => field.getByRole("switch").click()),
    {
      backgroundColor: "rgb(0, 0, 0)",
      backgroundVisible: true,
      canvasMode: "finite",
      layerOrder: ["background", "product"],
      mediaVisible: false,
      outputSignature: "true:rgb(0, 0, 0)",
      productForegroundTransparent: true,
    },
    { requirementId: "export.includeBackground" },
  );

  // Infinity viewport fill follows Background independently of Infinity.
  await controlTarget(page, "canvas.infinity").getByRole("switch").click();
  const infinite = await observeInfinityCanvasBackground(page);
  await backgroundSwitch().click();
  const backgroundExcluded = await observeInfinityCanvasBackground(page);
  await backgroundSwitch().click();
  const backgroundRestored = await observeInfinityCanvasBackground(page);
  await expectToolcraftInfinityCanvasBackgroundEvidence(
    { backgroundExcluded, backgroundRestored, infinite },
    {
      expectedBackgroundColor: "#000000",
      requirementId: "export.includeBackground",
      target: "export.includeBackground",
    },
  );
});

test("browser: background color changes the runtime fill", async ({ page }) => {
  await openWithFixturePhoto(page, { transparentMargin: 60 });
  const session = await createToolcraftBrowserProofSession(page);
  await waitForGlassFrame(page);
  await pausePlayback(page);
  const cases = getToolcraftControlApplicabilityCases({
    schema: appSchema,
    sectionInventory: appControlSectionInventory,
    target: "appearance.background",
  });
  // Excluded first (switch from the default on), then included again.
  const ordered = [...cases].sort((left, right) =>
    Number(left.selectorValue) - Number(right.selectorValue),
  );
  for (const applicabilityCase of ordered) {
    const included = applicabilityCase.selectorValue === true;
    await expectToolcraftControlApplicabilityState(
      session,
      session.controlAction("export.includeBackground", async (field) => {
        const toggle = field.getByRole("switch");
        const checked = (await toggle.getAttribute("aria-checked")) === "true";
        if (checked !== included) await toggle.click();
      }),
      applicabilityCase,
      { baseRequirementId: "export.background-color" },
    );
    const color = included ? "#203040" : "#405060";
    await expectToolcraftProductObservableToChange(
      session,
      session.controlAction("appearance.background", async (field) => {
        const input = field.getByRole("textbox");
        await input.fill(color);
        await input.press("Enter");
      }),
      {
        requirementId: getToolcraftApplicabilityRequirementId(
          "export.background-color",
          applicabilityCase,
        ),
        selector: included
          ? "[data-toolcraft-finite-background-layer]"
          : '[data-panel-type="controls"]',
      },
    );
  }
});

for (const [testName, target, options, selector] of [
  ["browser: image format options select PNG and JPG", "export.image.format", ["JPG", "PNG"], "footer"],
  ["browser: image resolution options select 2K 4K and 8K", "export.image.resolution", ["2K", "8K", "4K"], "control"],
  ["browser: video format options select MP4 and WebM", "export.video.format", ["WebM", "MP4"], "footer"],
  ["browser: video resolution options select Current and 4K", "export.video.resolution", ["4K", "Current"], "control"],
] as const) {
  test(testName, async ({ page }) => {
    await openWithFixturePhoto(page);
    const session = await createToolcraftBrowserProofSession(page);
    await waitForGlassFrame(page);
    await pausePlayback(page);
    const observedSelector =
      selector === "footer"
        ? '[data-panel-type="controls"]'
        : `[data-toolcraft-control-target="${target}"] [role="combobox"]`;
    const [first, ...rest] = options;
    await expectToolcraftProductObservableToChange(
      session,
      session.controlAction(target, (_field, currentPage) => selectOption(currentPage, target, first)),
      { requirementId: target, selector: observedSelector },
    );
    for (const option of rest) await selectOption(page, target, option);
  });
}

test("browser: infinity image export contains the full glass frame", async ({ page }) => {
  await openWithFixturePhoto(page);
  await createToolcraftBrowserProofSession(page);
  await waitForGlassFrame(page);
  await pausePlayback(page);
  const finite = await inspectToolcraftImageDownload({
    backgroundRgba: BLACK,
    download: await clickExport(page, "Export PNG"),
    page,
  });
  await controlTarget(page, "canvas.infinity").getByRole("switch").click();
  await waitForGlassFrame(page);
  const infinite = await inspectToolcraftImageDownload({
    backgroundRgba: BLACK,
    download: await clickExport(page, "Export PNG"),
    page,
  });
  await expectToolcraftInfinityCanvasImageExportEvidence(
    { finite: finite.inspection, infinite: infinite.inspection },
    {
      expectedSize: { height: 3072, width: 4096 },
      requirementId: "export.infinity-image",
      target: "canvas.infinity",
    },
  );
});

test("browser: infinity video export keeps the saved artboard", async ({ page }) => {
  await openWithFixturePhoto(page);
  await createToolcraftBrowserProofSession(page);
  await waitForGlassFrame(page);
  await pausePlayback(page);
  await setTimelineDuration(page, 1);
  const schedule = createToolcraftVideoFrameSchedule(1);
  const finite = await inspectToolcraftVideoDownload({
    backgroundRgba: BLACK,
    download: await clickExport(page, "Export MP4"),
    page,
    schedule,
  });
  await controlTarget(page, "canvas.infinity").getByRole("switch").click();
  await waitForGlassFrame(page);
  const infinite = await inspectToolcraftVideoDownload({
    backgroundRgba: BLACK,
    download: await clickExport(page, "Export MP4"),
    page,
    schedule,
  });
  await expectToolcraftInfinityCanvasVideoExportEvidence(
    { finite: finite.inspection, infinite: infinite.inspection },
    {
      expectedSize: { height: 1440, width: 1920 },
      requirementId: "export.infinity-video",
      target: "canvas.infinity",
    },
  );
});
