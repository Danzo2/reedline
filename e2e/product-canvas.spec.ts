import type { Page } from "@playwright/test";

import {
  expectToolcraftInfinityCanvasModeEvidence,
  observeInfinityCanvas,
} from "./browser-infinity-canvas-evidence";
import { createToolcraftBrowserProofSession } from "./browser-proof-session";
import { expectToolcraftDiscreteSliderMarkers } from "./performance-control-layout-helpers";
import {
  controlTarget,
  dragSliderThumb,
  GLASS_OUTPUT_SELECTOR,
  openWithFixturePhoto,
  pausePlayback,
  waitForGlassFrame,
} from "./product-glass-support";
import { expect, expectToolcraftCanvasRenderScaleEvidence, test } from "./toolcraft-product-test";

async function settleFrames(page: Page): Promise<void> {
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await page.waitForTimeout(150);
}

test("browser: resolution scale sets exact glass backing pixels", async ({ page }) => {
  await openWithFixturePhoto(page);
  await createToolcraftBrowserProofSession(page);
  await waitForGlassFrame(page);
  await pausePlayback(page);
  await expectToolcraftDiscreteSliderMarkers(page, "canvas.renderScale");
  const renderScale = controlTarget(page, "canvas.renderScale").locator('input[type="range"]');
  await renderScale.focus();
  await renderScale.press("End");
  await settleFrames(page);
  await expectToolcraftCanvasRenderScaleEvidence(page, {
    canvasSelector: GLASS_OUTPUT_SELECTOR,
    requirementId: "canvas.renderScale",
    selectedScale: 2,
    stateTransitions: [
      { run: () => settleFrames(page), state: "steady" },
      {
        run: async () => {
          await dragSliderThumb(controlTarget(page, "glass.amount"), page, 40);
          await settleFrames(page);
        },
        state: "interaction",
      },
      {
        run: async () => {
          await page.getByRole("button", { name: "Play playback" }).click();
          await page.waitForTimeout(400);
          await settleFrames(page);
        },
        state: "playback",
      },
    ],
    target: "canvas.renderScale",
  });
});

test("browser: infinity canvas keeps the glass frame renderer and backing", async ({ page }) => {
  await openWithFixturePhoto(page);
  await createToolcraftBrowserProofSession(page);
  await waitForGlassFrame(page);
  await pausePlayback(page);
  await settleFrames(page);

  const captureIdentity = () =>
    page.evaluateHandle(() => ({
      host: document.querySelector("[data-toolcraft-product-scene]"),
      output: document.querySelector("[data-reeded-glass-output]"),
    }));
  const compare = (identity: Awaited<ReturnType<typeof captureIdentity>>) =>
    page.evaluate(
      (baseline) => ({
        productHostPreserved:
          baseline.host !== null &&
          baseline.host === document.querySelector("[data-toolcraft-product-scene]"),
        productOutputPreserved:
          baseline.output !== null &&
          baseline.output === document.querySelector("[data-reeded-glass-output]"),
      }),
      identity,
    );
  const infinitySwitch = () => controlTarget(page, "canvas.infinity").getByRole("switch");

  const before = await observeInfinityCanvas(page);
  const initialIdentity = await captureIdentity();
  await infinitySwitch().click();
  await settleFrames(page);
  const enabled = await observeInfinityCanvas(page);
  const beforeToEnabled = await compare(initialIdentity);

  const viewport = page.getByRole("application", { name: "Canvas viewport" });
  const box = await viewport.boundingBox();
  if (!box) throw new Error("Canvas viewport has no bounds.");
  await page.mouse.move(box.x + 120, box.y + 120);
  await viewport.focus();
  await page.keyboard.down("Space");
  await page.mouse.down();
  await page.mouse.move(box.x + 170, box.y + 150, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.up("Space");
  await settleFrames(page);
  const afterPan = await observeInfinityCanvas(page);

  await page.waitForTimeout(800);
  await page.reload();
  await waitForGlassFrame(page);
  await pausePlayback(page);
  await settleFrames(page);
  const afterReload = await observeInfinityCanvas(page);
  const restoredIdentity = await captureIdentity();

  await infinitySwitch().click();
  await settleFrames(page);
  const restored = await observeInfinityCanvas(page);
  const afterReloadToRestored = await compare(restoredIdentity);

  await page.getByRole("button", { name: /^Undo/u }).click();
  await settleFrames(page);
  const undone = await observeInfinityCanvas(page);
  const restoredToUndone = await compare(restoredIdentity);

  await page.getByRole("button", { name: /^Redo/u }).click();
  await settleFrames(page);
  const redone = await observeInfinityCanvas(page);
  const undoneToRedone = await compare(restoredIdentity);
  await initialIdentity.dispose();
  await restoredIdentity.dispose();
  expect(undone.productSceneStatus).toBe("ready");

  await expectToolcraftInfinityCanvasModeEvidence(
    { afterPan, afterReload, before, enabled, redone, restored, undone },
    { afterReloadToRestored, beforeToEnabled, restoredToUndone, undoneToRedone },
    {
      // The 800x600 fixture photo auto-fits the 1920x1080 artboard to 4:3.
      expectedFiniteSize: { height: 1440, width: 1920 },
      expectedSceneRect: { height: 1440, width: 1920, x: -960, y: -720 },
      requirementId: "canvas.infinity-mode",
      target: "canvas.infinity",
    },
  );
});
