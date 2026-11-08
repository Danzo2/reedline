import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  demuxGlassClip,
  findGlassClipKeyIndex,
  findGlassClipSampleIndex,
  getGlassClipRotation,
} from "./glass-video-decoder";

function readFixtureClip(): ArrayBuffer {
  const bytes = readFileSync("e2e/fixtures/glass-clip.mp4");
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

describe("glass MP4 clip decoding", () => {
  it("demuxes the fixture clip's video track", () => {
    const info = demuxGlassClip(readFixtureClip());
    expect(info.codec).toMatch(/^avc1\./u);
    expect(info.description?.byteLength).toBeGreaterThan(0);
    expect([info.width, info.height]).toEqual([480, 360]);
    expect(info.durationSeconds).toBeCloseTo(2, 2);
    expect(info.samples).toHaveLength(60);
    expect(info.samples[0]).toMatchObject({ cts: 0, key: true });
    expect(info.rotationDeg).toBe(0);
  });

  it("rejects bytes that are not an MP4 video", () => {
    expect(() => demuxGlassClip(new Uint8Array([1, 2, 3, 4]).buffer)).toThrow();
  });

  it("reads display rotation from the track matrix", () => {
    const one = 0x10000;
    expect(getGlassClipRotation([one, 0, 0, 0, one, 0, 0, 0, 0x40000000])).toBe(0);
    expect(getGlassClipRotation([0, one, 0, -one, 0, 0, 0, 0, 0x40000000])).toBe(90);
    expect(getGlassClipRotation([-one, 0, 0, 0, -one, 0, 0, 0, 0x40000000])).toBe(180);
    expect(getGlassClipRotation([0, -one, 0, one, 0, 0, 0, 0, 0x40000000])).toBe(270);
    expect(getGlassClipRotation(undefined)).toBe(0);
  });

  it("finds the frame shown at a time and its keyframe, with reordered samples", () => {
    // Decode order I P B B: presentation order I B B P.
    const samples = [
      { cts: 0, key: true },
      { cts: 300, key: false },
      { cts: 100, key: false },
      { cts: 200, key: false },
      { cts: 400, key: true },
    ];
    expect(findGlassClipSampleIndex(samples, 0)).toBe(0);
    expect(findGlassClipSampleIndex(samples, 150)).toBe(2);
    expect(findGlassClipSampleIndex(samples, 299)).toBe(3);
    expect(findGlassClipSampleIndex(samples, 350)).toBe(1);
    expect(findGlassClipSampleIndex(samples, 10_000)).toBe(4);
    expect(findGlassClipSampleIndex(samples, -5)).toBe(0);
    expect(findGlassClipKeyIndex(samples, 3)).toBe(0);
    expect(findGlassClipKeyIndex(samples, 4)).toBe(4);
  });
});
