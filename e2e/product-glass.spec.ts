import { createToolcraftBrowserProofSession } from "./browser-proof-session";
import { expectToolcraftDiscreteSliderMarkers } from "./performance-control-layout-helpers";
import { expectToolcraftProductObservableToChange } from "./product-observable-helpers";
import {
  clickSliderTrack,
  controlTarget,
  dragSliderThumb,
  meanProfileDifference,
  openWithFixturePhoto,
  pausePlayback,
  readRippleBanding,
  readRippleStripeProfile,
  scrubTimeline,
  selectOption,
  setSliderToEnd,
  setSliderValue,
  showExtendedTimeline,
  summarizeRippleProfile,
  waitForGlassFrame,
} from "./product-glass-support";
import { expect, test } from "./toolcraft-product-test";

type SliderCase = Readonly<{
  dx: number;
  prepare?: (page: import("@playwright/test").Page) => Promise<void>;
  target: string;
}>;

async function scrubToMidLoop(page: import("@playwright/test").Page): Promise<void> {
  const scrubber = await showExtendedTimeline(page);
  await scrubber.press("Home");
  for (let step = 0; step < 12; step += 1) await scrubber.press("ArrowRight");
  await expect(scrubber).not.toHaveAttribute("aria-valuenow", "0");
}

const sliderCases: readonly SliderCase[] = [
  { dx: -70, target: "glass.amount" },
  { dx: 70, target: "glass.dispersion" },
  { dx: 90, target: "glass.frost" },
  { dx: 90, target: "glass.reflection" },
  {
    dx: 70,
    prepare: (page) => setSliderToEnd(controlTarget(page, "glass.reflection")),
    target: "glass.reflectionScale",
  },
  { dx: 60, target: "pattern.repeats" },
  { dx: 60, target: "pattern.angle" },
  { dx: 60, target: "pattern.contrast" },
  { dx: 80, target: "pattern.imperfections" },
  { dx: 60, target: "pattern.imperfectionScale" },
  { dx: 60, prepare: scrubToMidLoop, target: "motion.shiftSpeed" },
  { dx: 90, target: "noise.amount" },
  {
    dx: 80,
    prepare: (page) => setSliderToEnd(controlTarget(page, "noise.amount")),
    target: "noise.size",
  },
];

for (const sliderCase of sliderCases) {
  test(`browser: ${sliderCase.target} slider drag changes reeded glass pixels live`, async ({ page }) => {
    await openWithFixturePhoto(page);
    const session = await createToolcraftBrowserProofSession(page);
    await waitForGlassFrame(page);
    await pausePlayback(page);
    await sliderCase.prepare?.(page);
    await waitForGlassFrame(page);
    if (sliderCase.target === "motion.shiftSpeed") {
      await expectToolcraftDiscreteSliderMarkers(page, "motion.shiftSpeed", "glass.motion.shiftSpeed");
    }
    await expectToolcraftProductObservableToChange(
      session,
      session.controlAction(sliderCase.target, (field, currentPage) =>
        dragSliderThumb(field, currentPage, sliderCase.dx),
      ),
      {
        requirementId: sliderCase.target.startsWith("glass.")
          ? sliderCase.target
          : `glass.${sliderCase.target}`,
      },
    );
  });
}

test("browser: pattern type select renders each reed profile", async ({ page }) => {
  await openWithFixturePhoto(page);
  const session = await createToolcraftBrowserProofSession(page);
  await waitForGlassFrame(page);
  await pausePlayback(page);
  await expectToolcraftProductObservableToChange(
    session,
    session.controlAction("pattern.type", async (_field, currentPage) =>
      selectOption(currentPage, "pattern.type", "Blocks"),
    ),
    { requirementId: "glass.pattern.type" },
  );
  for (const option of ["Bubbles", "Hexagons", "Fluted", "Prism", "Rounded", "Ripple"]) {
    await selectOption(page, "pattern.type", option);
    await waitForGlassFrame(page);
  }

  // Ripple parity with the user's recordings: vertical reed strips of softly
  // rippling glass with no horizontal row bands (2026-11-05 correction), waves
  // that keep moving at a steady speed without stalling, and an exact return
  // at the loop end.
  // Measure near the reference-calibrated conditions (Amount ~1, Repeats 7,
  // Contrast ~4 so reed shading makes the vertical strips measurable).
  await clickSliderTrack(controlTarget(page, "glass.amount"), page, 0.5);
  await clickSliderTrack(controlTarget(page, "pattern.contrast"), page, 0.4);
  await setSliderValue(controlTarget(page, "pattern.repeats"), 7);
  await waitForGlassFrame(page);
  const banding = await readRippleBanding(page);
  await scrubTimeline(page, "Home");
  const start = await readRippleStripeProfile(page);
  const steps = [start];
  for (let step = 0; step < 6; step += 1) {
    await scrubTimeline(page, "ArrowRight");
    steps.push(await readRippleStripeProfile(page));
  }
  const stepMotion = steps.slice(1).map((profile, index) => meanProfileDifference(steps[index], profile));
  await scrubTimeline(page, "End");
  const end = await readRippleStripeProfile(page);
  const startShape = summarizeRippleProfile(start);
  expect({
    edgesMostlyStraight: startShape.spread < start.reedWidth * 0.15,
    linesRipple: startShape.spread > 1 && startShape.directionChanges >= 2,
    motionNeverStalls:
      Math.min(...stepMotion) > 0.15 && Math.min(...stepMotion) / Math.max(...stepMotion) > 0.2,
    noHorizontalRows: banding.columnRange <= 1,
    returnsAtLoopEnd: meanProfileDifference(start, end) < 0.75,
    verticalStrips: banding.rowRange >= 3,
  }).toEqual({
    edgesMostlyStraight: true,
    linesRipple: true,
    motionNeverStalls: true,
    noHorizontalRows: true,
    returnsAtLoopEnd: true,
    verticalStrips: true,
  });
});
