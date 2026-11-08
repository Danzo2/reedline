import type { Page } from "@playwright/test";

import { createToolcraftBrowserProofSession } from "./browser-proof-session";
import { expectToolcraftMediaLifecycle } from "./browser-state-evidence-helpers";
import { expectToolcraftProductObservableToChange } from "./product-observable-helpers";
import {
  controlTarget,
  createFixturePhoto,
  GLASS_OUTPUT_SELECTOR,
  pausePlayback,
  scrubTimeline,
  showExtendedTimeline,
  uploadFixturePhoto,
  waitForGlassFrame,
} from "./product-glass-support";
import { expect, test } from "./toolcraft-product-test";

test("browser: photo upload, transform, remove and reset drive the glass output", async ({ page }) => {
  await page.goto("/");
  const session = await createToolcraftBrowserProofSession(page);
  const canvasSize = async () => [
    await controlTarget(page, "canvas.size.width").getByRole("textbox").inputValue(),
    await controlTarget(page, "canvas.size.height").getByRole("textbox").inputValue(),
  ];
  // The saved 16:9 artboard has a 1920px long edge that auto-fit preserves.
  expect(await canvasSize()).toEqual(["1920", "1080"]);

  const observeLifecycle = session.observe((root) => {
    const field = root.querySelector('[data-toolcraft-control-target="source.image"]');
    const itemIds = [...(field?.querySelectorAll("img[alt]") ?? [])]
      .map((image) => image.getAttribute("alt") ?? "")
      .filter((alt) => alt.length > 0);
    const output = root.querySelector<HTMLElement>('[data-reeded-glass-output=""]');
    const rendered = output?.dataset.visible === "true" && Number(output.dataset.glassFrameCount) > 0;
    const sourceName = output?.dataset.glassSourceName ?? "";
    return { itemIds, outputSignature: rendered ? `glass:rendered:${sourceName}` : "glass:empty" };
  });
  // WebP upload (replacing the saved default photo) must decode and render.
  const bytes = await createFixturePhoto(page, { height: 400, mimeType: "image/webp", width: 900 });

  // First open shows the saved default dandelion photo.
  await waitForGlassFrame(page);
  await expect(controlTarget(page, "source.image").locator("img[alt]")).toHaveCount(1);
  await expect(page.locator(GLASS_OUTPUT_SELECTOR)).toHaveAttribute(
    "data-glass-source-name",
    "Dandelion Seeds in Focus.png",
  );

  // Upload: a 9:4 WebP photo auto-fits the artboard to its aspect ratio (1920 long edge).
  await expectToolcraftMediaLifecycle(
    observeLifecycle,
    session.controlAction("source.image", async (field) => {
      await field.locator('input[type="file"]').setInputFiles({
        buffer: Buffer.from(bytes),
        mimeType: "image/webp",
        name: "fixture-photo.webp",
      });
    }),
    { itemIds: ["fixture-photo.webp"], outputSignature: "glass:rendered:fixture-photo.webp" },
    { requirementId: "source.image" },
  );
  await waitForGlassFrame(page);
  await pausePlayback(page);
  await expect.poll(canvasSize).toEqual(["1920", "854"]);

  // Rotate and flip change the refracted output.
  for (const label of ["90°", "Flip H", "Flip V"]) {
    await expectToolcraftProductObservableToChange(
      session,
      session.action((currentPage) =>
        controlTarget(currentPage, "source.image").getByRole("button", { name: label }).click(),
      ),
      { selector: GLASS_OUTPUT_SELECTOR },
    );
  }
  // The 90° rotation refits the artboard to the now-portrait photo; flips keep it.
  await expect.poll(canvasSize).toEqual(["854", "1920"]);

  // Remove clears the glass output.
  await controlTarget(page, "source.image").getByRole("button", { name: /remove|clear/iu }).first().click();
  await expect(page.locator(GLASS_OUTPUT_SELECTOR)).toHaveAttribute("data-visible", "false");

  // Upload again, then Reset the Source section restores the saved default photo.
  await uploadFixturePhoto(page);
  await waitForGlassFrame(page);
  await page.getByRole("button", { name: "Reset Source section" }).click();
  await expect(controlTarget(page, "source.image").locator("img[alt]")).toHaveCount(1);
  await expect(controlTarget(page, "source.image").locator('img[alt="fixture-photo.png"]')).toHaveCount(0);
  await expect(page.locator(GLASS_OUTPUT_SELECTOR)).toHaveAttribute(
    "data-glass-source-name",
    "Dandelion Seeds in Focus.png",
  );
});

const CLIP_PATH = "e2e/fixtures/glass-clip.mp4";
const CLIP_NAME = "glass-clip.mp4";

/** Mean RGB of the drawn glass output (WebGL backing copied through 2D). */
async function readGlassMeanColor(page: Page): Promise<readonly [number, number, number]> {
  return page.locator(GLASS_OUTPUT_SELECTOR).evaluate((element) => {
    if (!(element instanceof HTMLCanvasElement)) throw new Error("Glass output canvas missing.");
    const copy = new OffscreenCanvas(element.width, element.height);
    const context = copy.getContext("2d");
    if (!context) throw new Error("No 2D context for colour sampling.");
    context.drawImage(element, 0, 0);
    const pixels = context.getImageData(0, 0, element.width, element.height).data;
    let red = 0;
    let green = 0;
    let blue = 0;
    let count = 0;
    for (let index = 0; index < pixels.length; index += 4 * 97) {
      red += pixels[index];
      green += pixels[index + 1];
      blue += pixels[index + 2];
      count += 1;
    }
    return [red / count, green / count, blue / count] as const;
  });
}

test("browser: MP4 clip upload, playback, remove and reset drive the glass output", async ({ page }) => {
  await page.goto("/");
  const session = await createToolcraftBrowserProofSession(page);
  const output = page.locator(GLASS_OUTPUT_SELECTOR);
  const canvasSize = async () => [
    await controlTarget(page, "canvas.size.width").getByRole("textbox").inputValue(),
    await controlTarget(page, "canvas.size.height").getByRole("textbox").inputValue(),
  ];
  const observeLifecycle = session.observe((root) => {
    const field = root.querySelector('[data-toolcraft-control-target="source.video"]');
    const itemIds = field?.textContent?.includes("glass-clip.mp4") ? ["glass-clip.mp4"] : [];
    const glass = root.querySelector<HTMLElement>('[data-reeded-glass-output=""]');
    const rendered = glass?.dataset.visible === "true" && Number(glass.dataset.glassFrameCount) > 0;
    const signature = rendered
      ? `glass:${glass?.dataset.glassSourceKind ?? ""}:${glass?.dataset.glassSourceName ?? ""}`
      : "glass:empty";
    return { itemIds, outputSignature: signature };
  });
  const uploadClip = session.controlAction("source.video", async (field) => {
    await field.locator('input[type="file"]').setInputFiles(CLIP_PATH);
  });

  // First open renders the saved default photo at 16:9.
  await waitForGlassFrame(page);
  await expect(output).toHaveAttribute("data-glass-source-kind", "image");
  expect(await canvasSize()).toEqual(["1920", "1080"]);

  // Upload: the 4:3, 2 s clip replaces the photo, refits the artboard and sets the loop length.
  await expectToolcraftMediaLifecycle(
    observeLifecycle,
    uploadClip,
    { itemIds: [CLIP_NAME], outputSignature: `glass:video:${CLIP_NAME}` },
    { requirementId: "source.video" },
  );
  await expect.poll(canvasSize).toEqual(["1920", "1440"]);
  await pausePlayback(page);
  const scrubber = await showExtendedTimeline(page);
  await expect(scrubber).toHaveAttribute("aria-valuemax", "2");

  // Scrubbing shows the clip frame at that time: red for 0-1 s, blue for 1-2 s.
  await scrubber.press("Home");
  await scrubTimeline(page, "ArrowRight", 2);
  await expect.poll(async () => Number(await output.getAttribute("data-glass-video-time"))).toBeCloseTo(0.5, 1);
  const red = await readGlassMeanColor(page);
  expect(red[0]).toBeGreaterThan(red[2] + 80);
  await scrubTimeline(page, "ArrowRight", 4);
  await expect.poll(async () => Number(await output.getAttribute("data-glass-video-time"))).toBeCloseTo(1.5, 1);
  const blue = await readGlassMeanColor(page);
  expect(blue[2]).toBeGreaterThan(blue[0] + 80);

  // Remove: the photo becomes the source again.
  await expectToolcraftMediaLifecycle(
    observeLifecycle,
    session.controlAction("source.video", async (field) => {
      await field.getByRole("button", { name: /remove|clear/iu }).first().click();
    }),
    { itemIds: [], outputSignature: "glass:image:Dandelion Seeds in Focus.png" },
    { requirementId: "source.video" },
  );

  // Upload again, then Reset the Source section removes the clip.
  await expectToolcraftMediaLifecycle(
    observeLifecycle,
    uploadClip,
    { itemIds: [CLIP_NAME], outputSignature: `glass:video:${CLIP_NAME}` },
    { requirementId: "source.video" },
  );
  await expectToolcraftMediaLifecycle(
    observeLifecycle,
    session.action((currentPage) =>
      currentPage.getByRole("button", { name: "Reset Source section" }).click(),
    ),
    { itemIds: [], outputSignature: "glass:image:Dandelion Seeds in Focus.png" },
    { requirementId: "source.video" },
  );
});
