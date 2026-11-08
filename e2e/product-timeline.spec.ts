import { expectToolcraftStandardTimelinePlayback } from "./browser-standard-timeline-evidence";
import { createToolcraftBrowserProofSession } from "./browser-proof-session";
import { GLASS_OUTPUT_SELECTOR, openWithFixturePhoto, waitForGlassFrame } from "./product-glass-support";
import { expect, test } from "./toolcraft-product-test";

test("browser: playback timeline loops the reeded glass seamlessly", async ({ page }) => {
  await openWithFixturePhoto(page);
  const session = await createToolcraftBrowserProofSession(page);
  await waitForGlassFrame(page);
  // Playback runs by default: the loop advances without user action.
  const output = page.locator(GLASS_OUTPUT_SELECTOR);
  const initial = await output.getAttribute("data-timeline-progress");
  await expect.poll(() => output.getAttribute("data-timeline-progress")).not.toBe(initial);
  await expectToolcraftStandardTimelinePlayback(session, {
    markerSelector: GLASS_OUTPUT_SELECTOR,
    requirementId: "timeline.playback",
  });
});
