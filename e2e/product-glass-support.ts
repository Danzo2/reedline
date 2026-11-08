import { expect, type Locator, type Page } from "@playwright/test";

export const GLASS_OUTPUT_SELECTOR = '[data-reeded-glass-output=""]';

export function controlTarget(page: Page, target: string): Locator {
  return page.locator(`[data-toolcraft-control-target="${target}"]`);
}

export type FixturePhotoOptions = Readonly<{
  fileName?: string;
  /** Encoded image type; defaults to PNG. */
  mimeType?: "image/png" | "image/webp";
  height?: number;
  /** Transparent margin (px) around the coloured blocks. */
  transparentMargin?: number;
  width?: number;
}>;

/**
 * Creates a deterministic PNG in the page: four large flat colour quadrants
 * (red, green, blue, yellow) with vertical stripes in the top half, so the glass
 * refraction has hard edges to move while flat regions stay exactly predictable.
 */
export async function createFixturePhoto(
  page: Page,
  options: FixturePhotoOptions = {},
): Promise<Uint8Array> {
  const bytes = await page.evaluate(async (input) => {
    const width = input.width ?? 800;
    const height = input.height ?? 600;
    const margin = input.transparentMargin ?? 0;
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No 2D context for fixture photo.");
    context.clearRect(0, 0, width, height);
    const inner = { h: height - margin * 2, w: width - margin * 2, x: margin, y: margin };
    const halfW = inner.w / 2;
    const halfH = inner.h / 2;
    context.fillStyle = "#FF0000";
    context.fillRect(inner.x, inner.y, halfW, halfH);
    context.fillStyle = "#00FF00";
    context.fillRect(inner.x + halfW, inner.y, halfW, halfH);
    context.fillStyle = "#0000FF";
    context.fillRect(inner.x, inner.y + halfH, halfW, halfH);
    context.fillStyle = "#FFFF00";
    context.fillRect(inner.x + halfW, inner.y + halfH, halfW, halfH);
    // Thin dark stripes give the refraction visible edges to displace.
    context.fillStyle = "#101010";
    for (let x = inner.x + 20; x < inner.x + inner.w; x += 60) {
      context.fillRect(x, inner.y + inner.h * 0.38, 8, inner.h * 0.24);
    }
    const blob = await canvas.convertToBlob({ type: input.mimeType ?? "image/png" });
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  }, options);
  return Uint8Array.from(bytes);
}

export async function uploadFixturePhoto(
  page: Page,
  options: FixturePhotoOptions = {},
): Promise<void> {
  const bytes = await createFixturePhoto(page, options);
  const input = controlTarget(page, "source.image").locator('input[type="file"]');
  await input.setInputFiles({
    buffer: Buffer.from(bytes),
    mimeType: "image/png",
    name: options.fileName ?? "fixture-photo.png",
  });
}

export async function waitForGlassFrame(page: Page): Promise<void> {
  const output = page.locator(GLASS_OUTPUT_SELECTOR);
  await expect(output).toHaveAttribute("data-visible", "true", { timeout: 15_000 });
  await expect
    .poll(async () => Number(await output.getAttribute("data-glass-frame-count")), {
      timeout: 15_000,
    })
    .toBeGreaterThan(0);
  await expect(output).not.toHaveAttribute("data-glass-error", /.+/u);
}

export async function pausePlayback(page: Page): Promise<void> {
  const pause = page.getByRole("button", { name: "Pause playback" });
  if (await pause.isVisible()) await pause.click();
  await expect(page.getByRole("button", { name: "Play playback" })).toBeVisible();
}

export async function showExtendedTimeline(page: Page): Promise<Locator> {
  const scrubber = page.getByRole("slider", { name: "Playback position" });
  if (!(await scrubber.isVisible())) {
    await controlTarget(page, "panels.timeline.extended").getByRole("switch").click();
    await expect(scrubber).toBeVisible();
  }
  return scrubber;
}

/** Opens the app with a fixture photo uploaded and its first glass frame drawn. */
export async function openWithFixturePhoto(
  page: Page,
  options: FixturePhotoOptions = {},
): Promise<void> {
  await page.goto("/");
  await uploadFixturePhoto(page, options);
  await waitForGlassFrame(page);
}

/** Drags a slider thumb from its current position by `dx` CSS pixels in steps. */
export async function dragSliderThumb(field: Locator, page: Page, dx: number): Promise<void> {
  const thumb = field.locator('[data-slot="slider-thumb"]').first();
  await thumb.scrollIntoViewIfNeeded();
  const box = await thumb.boundingBox();
  if (!box) throw new Error("Slider thumb is not measurable.");
  const startX = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(startX, y);
  await page.mouse.down();
  for (let step = 1; step <= 6; step += 1) {
    await page.mouse.move(startX + (dx * step) / 6, y);
  }
  await page.mouse.up();
}

export async function setSliderToEnd(field: Locator): Promise<void> {
  const slider = field.locator('input[type="range"]').first();
  await slider.focus();
  await slider.press("End");
}

export async function setSliderToHome(field: Locator): Promise<void> {
  const slider = field.locator('input[type="range"]').first();
  await slider.focus();
  await slider.press("Home");
}

export async function selectOption(
  page: Page,
  target: string,
  optionName: string,
): Promise<void> {
  const trigger = controlTarget(page, target).getByRole("combobox");
  await trigger.scrollIntoViewIfNeeded();
  await trigger.click();
  await page.locator('[data-slot="select-item"]').filter({ hasText: optionName }).first().click();
  await expect(trigger).toContainText(optionName);
}

/**
 * Scrubs the paused playback timeline with keyboard keys and waits until the
 * glass preview reports a different rendered time.
 */
export async function scrubTimeline(page: Page, key: string, presses = 1): Promise<void> {
  const scrubber = await showExtendedTimeline(page);
  const output = page.locator(GLASS_OUTPUT_SELECTOR);
  const before = await output.getAttribute("data-glass-rendered-time");
  for (let press = 0; press < presses; press += 1) await scrubber.press(key);
  await expect(output).not.toHaveAttribute("data-glass-rendered-time", before ?? "", {
    timeout: 5_000,
  });
  await page.waitForTimeout(150);
}

export type RippleStripeProfile = Readonly<{
  /** Per-row horizontal stripe centroid (backing px) relative to its mean; null where the row was not tracked. */
  offsets: readonly (number | null)[];
  /** Reed width in backing px (scene long edge / current Repeats). */
  reedWidth: number;
}>;

/**
 * Tracks the dark fixture stripe nearest the canvas centre down the middle
 * rows of the preview and returns its per-row horizontal position.
 */
export async function readRippleStripeProfile(page: Page): Promise<RippleStripeProfile> {
  return page.evaluate((selector) => {
    const source = document.querySelector(selector);
    if (!(source instanceof HTMLCanvasElement)) throw new Error("Glass output canvas missing.");
    const width = source.width;
    const height = source.height;
    const copy = new OffscreenCanvas(width, height);
    const context = copy.getContext("2d");
    if (!context) throw new Error("No 2D context for stripe profile.");
    context.drawImage(source, 0, 0);
    const pixels = context.getImageData(0, 0, width, height).data;
    const darkRuns = (y: number): number[] => {
      const centres: number[] = [];
      let start = -1;
      for (let x = 0; x <= width; x += 1) {
        const index = (y * width + x) * 4;
        const dark =
          x < width &&
          pixels[index] * 0.299 + pixels[index + 1] * 0.587 + pixels[index + 2] * 0.114 < 80;
        if (dark && start < 0) start = x;
        if (!dark && start >= 0) {
          if (x - start >= 2) centres.push((start + x - 1) / 2);
          start = -1;
        }
      }
      return centres;
    };
    const firstRow = Math.round(height * 0.45);
    const lastRow = Math.round(height * 0.55);
    const repeatsInput = document.querySelector<HTMLInputElement>(
      '[data-toolcraft-control-target="pattern.repeats"] input[type="range"]',
    );
    const repeats = Math.max(1, Math.round(Number(repeatsInput?.value ?? 7)));
    const reedWidth = Math.max(width, height) / repeats;
    const maxStep = Math.max(width, height) / 7 * 0.05;
    const pick = (runs: readonly number[], near: number): number | undefined => {
      let nearest: number | undefined;
      for (const centre of runs) {
        if (nearest === undefined || Math.abs(centre - near) < Math.abs(nearest - near)) {
          nearest = centre;
        }
      }
      return nearest;
    };
    let previous = pick(darkRuns(firstRow), width * 0.3);
    if (previous === undefined) throw new Error("No fixture stripe in the measured rows.");
    const positions: (number | null)[] = [];
    let total = 0;
    let count = 0;
    for (let y = firstRow; y <= lastRow; y += 1) {
      const nearest = pick(darkRuns(y), previous);
      if (nearest === undefined || Math.abs(nearest - previous) > maxStep) {
        positions.push(null);
        continue;
      }
      positions.push(nearest);
      total += nearest;
      count += 1;
      previous = nearest;
    }
    const mean = total / Math.max(count, 1);
    return {
      offsets: positions.map((value) => (value === null ? null : value - mean)),
      reedWidth,
    };
  }, GLASS_OUTPUT_SELECTOR);
}

/** Reduces a stripe profile to the reference-observed Ripple traits. */
export function summarizeRippleProfile(profile: RippleStripeProfile): Readonly<{
  directionChanges: number;
  spread: number;
}> {
  const offsets = profile.offsets.filter((value): value is number => value !== null);
  const spread = offsets.length ? Math.max(...offsets) - Math.min(...offsets) : 0;
  let directionChanges = 0;
  let lastSign = 0;
  for (let index = 2; index < offsets.length; index += 1) {
    const delta = offsets[index] - offsets[index - 2];
    if (Math.abs(delta) < 0.5) continue;
    const sign = Math.sign(delta);
    if (lastSign !== 0 && sign !== lastSign) directionChanges += 1;
    lastSign = sign;
  }
  return { directionChanges, spread };
}

export function meanProfileDifference(a: RippleStripeProfile, b: RippleStripeProfile): number {
  // Compare row by row, only where both profiles tracked the stripe, after
  // removing each profile's mean over those shared rows.
  const rows: number[] = [];
  const length = Math.min(a.offsets.length, b.offsets.length);
  for (let index = 0; index < length; index += 1) {
    if (a.offsets[index] !== null && b.offsets[index] !== null) rows.push(index);
  }
  if (rows.length === 0) return Number.POSITIVE_INFINITY;
  let meanA = 0;
  let meanB = 0;
  for (const row of rows) {
    meanA += a.offsets[row] ?? 0;
    meanB += b.offsets[row] ?? 0;
  }
  meanA /= rows.length;
  meanB /= rows.length;
  let total = 0;
  for (const row of rows) total += Math.abs((a.offsets[row] ?? 0) - meanA - ((b.offsets[row] ?? 0) - meanB));
  return total / rows.length;
}

/**
 * Measures banding in the flat red fixture quadrant: the largest red-channel
 * range down any sampled column (horizontal rows) and the range across a row
 * (vertical reed strips).
 */
export async function readRippleBanding(page: Page): Promise<Readonly<{
  columnRange: number;
  rowRange: number;
}>> {
  return page.evaluate((selector) => {
    const source = document.querySelector(selector);
    if (!(source instanceof HTMLCanvasElement)) throw new Error("Glass output canvas missing.");
    const width = source.width;
    const height = source.height;
    const copy = new OffscreenCanvas(width, height);
    const context = copy.getContext("2d");
    if (!context) throw new Error("No 2D context for banding.");
    context.drawImage(source, 0, 0);
    const pixels = context.getImageData(0, 0, width, height).data;
    const red = (x: number, y: number): number => pixels[(y * width + x) * 4];
    let columnRange = 0;
    for (let column = 0; column < 12; column += 1) {
      const x = Math.round(width * (0.06 + column * 0.03));
      let low = 255;
      let high = 0;
      for (let y = Math.round(height * 0.04); y < Math.round(height * 0.28); y += 1) {
        const value = red(x, y);
        low = Math.min(low, value);
        high = Math.max(high, value);
      }
      columnRange = Math.max(columnRange, high - low);
    }
    const y = Math.round(height * 0.15);
    let rowLow = 255;
    let rowHigh = 0;
    for (let x = Math.round(width * 0.05); x < Math.round(width * 0.42); x += 1) {
      rowLow = Math.min(rowLow, red(x, y));
      rowHigh = Math.max(rowHigh, red(x, y));
    }
    return { columnRange, rowRange: rowHigh - rowLow };
  }, GLASS_OUTPUT_SELECTOR);
}

/** Sets a continuous/stepped slider to `value` with Home plus arrow-key steps. */
export async function setSliderValue(field: Locator, value: number): Promise<void> {
  const slider = field.locator('input[type="range"]').first();
  await slider.scrollIntoViewIfNeeded();
  const { min, step } = await slider.evaluate((element) => ({
    min: Number((element as HTMLInputElement).min),
    step: Number((element as HTMLInputElement).step) || 0.01,
  }));
  await slider.focus();
  await slider.press("Home");
  const epsilon = step / 2;
  // Coarse PageUp steps while they stay below the target, then fine arrows.
  for (let press = 0; press < 40; press += 1) {
    const before = Number(await slider.inputValue());
    await slider.press("PageUp");
    const after = Number(await slider.inputValue());
    if (after > value + epsilon || after === before) {
      if (after > value + epsilon) await slider.press("PageDown");
      break;
    }
  }
  for (let press = 0; press < 200; press += 1) {
    const current = Number(await slider.inputValue());
    if (current >= value - epsilon) break;
    await slider.press("ArrowRight");
  }
  void min;
  await expect.poll(async () => Number(await slider.inputValue())).toBeCloseTo(value, 3);
}

/** Clicks a continuous slider track at `fraction` of its width (0..1). */
export async function clickSliderTrack(field: Locator, page: Page, fraction: number): Promise<void> {
  const track = field.locator('[data-slot="slider"]').first();
  await track.scrollIntoViewIfNeeded();
  const box = await track.boundingBox();
  if (!box) throw new Error("Slider track is not measurable.");
  await page.mouse.click(box.x + box.width * fraction, box.y + box.height / 2);
}
