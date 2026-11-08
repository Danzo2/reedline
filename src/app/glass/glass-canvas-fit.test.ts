import { describe, expect, it } from "vitest";

import {
  computeGlassCanvasFit,
  getGlassImageFitSource,
  getGlassOrientedSourceSize,
  roundGlassClipSeconds,
} from "./glass-canvas-fit";

describe("glass canvas auto-fit", () => {
  it("fits a portrait source keeping the canvas long edge", () => {
    expect(computeGlassCanvasFit({ height: 4000, width: 3000 }, { height: 1080, width: 1920 })).toEqual({
      height: 1920,
      width: 1440,
    });
  });

  it("fits a landscape source with even dimensions", () => {
    expect(computeGlassCanvasFit({ height: 1000, width: 2333 }, { height: 1080, width: 1920 })).toEqual({
      height: 822,
      width: 1920,
    });
  });

  it("returns null when the canvas already matches or the source is invalid", () => {
    expect(computeGlassCanvasFit({ height: 900, width: 1600 }, { height: 1080, width: 1920 })).toBeNull();
    expect(computeGlassCanvasFit({ height: 0, width: 1600 }, { height: 1080, width: 1920 })).toBeNull();
  });

  it("swaps orientation for quarter-turn rotations", () => {
    const sourceSize = { height: 3000, unit: "px" as const, width: 4000 };
    expect(getGlassOrientedSourceSize({ sourceSize, transform: { rotationDeg: 90 } })).toEqual({ height: 4000, width: 3000 });
    expect(getGlassOrientedSourceSize({ sourceSize, transform: { rotationDeg: 180 } })).toEqual({ height: 3000, width: 4000 });
  });

  it("keys a photo by resource and orientation", () => {
    const asset = {
      lifecycle: "ready",
      resourceRef: "image:a",
      sourceSize: { height: 3000, unit: "px", width: 4000 },
      transform: { rotationDeg: 90 },
    } as unknown as Parameters<typeof getGlassImageFitSource>[0];
    expect(getGlassImageFitSource(asset)).toEqual({
      key: "image:image:a:3000x4000",
      lifecycle: "ready",
      size: { height: 4000, width: 3000 },
    });
  });

  it("rounds clip durations to milliseconds", () => {
    expect(roundGlassClipSeconds(2.0333333)).toBe(2.033);
  });
});
