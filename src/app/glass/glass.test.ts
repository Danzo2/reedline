import { describe, expect, it } from "vitest";
import { pairGlassSourceUrls } from "./glass-source";

import type { ToolcraftFileAsset, ToolcraftImageAsset } from "@/toolcraft/runtime";

import { appAcceptance } from "../app-acceptance-data";
import { appComposition } from "../app-composition";
import { appSchema, REEDED_GLASS_LOOP_SECONDS } from "../app-schema";
import { reededGlassExportRenderer } from "./glass-export";
import { getGlassSourceMapping } from "./glass-gl";
import { fitGlassBacking, fitGlassSourceSize, GLASS_MAX_EDGE_PX } from "./glass-limits";
import { glassRendererPipelineRegistration, glassShaderSliderTargets } from "./glass-pipeline";
import { createGlassFrameInput, getGlassLoopProgress } from "./glass-render-input";
import { getReededGlassSceneRect, reededGlassSceneBounds } from "./glass-scene";
import { glassFragmentShaderSource } from "./glass-shader";
import {
  getGlassActiveSource,
  getGlassVideoTime,
  glassDefaults,
  glassPatternTypeIndex,
  glassPatternTypes,
  GLASS_VIDEO_TARGET,
  readGlassParameters,
} from "./glass-values";

const photo: ToolcraftImageAsset = {
  assetKind: "image",
  fileName: "photo.png",
  id: "photo",
  layerId: "layer-photo",
  lifecycle: "ready",
  mimeType: "image/png",
  position: { x: 0, y: 0 },
  resourceRef: "resource:photo",
  size: { height: 600, unit: "px", width: 800 },
  sourceSize: { height: 600, unit: "px", width: 800 },
  sourceTarget: "source.image",
};

function allControls() {
  return (appSchema.panels.controls?.sections ?? []).flatMap((section) =>
    Object.values(section.controls),
  );
}

function controlFor(target: string) {
  const control = allControls().find((candidate) => candidate.target === target);
  if (!control) throw new Error(`Missing control ${target}`);
  return control;
}

const parameterKeyByTarget: Record<string, keyof ReturnType<typeof readGlassParameters>> = {
  "glass.amount": "amount",
  "glass.dispersion": "dispersion",
  "glass.frost": "frost",
  "glass.reflection": "reflection",
  "glass.reflectionScale": "reflectionScale",
  "motion.shiftSpeed": "shiftSpeed",
  "noise.amount": "noiseAmount",
  "noise.size": "noiseSize",
  "pattern.angle": "angleDeg",
  "pattern.contrast": "contrast",
  "pattern.imperfectionScale": "imperfectionScale",
  "pattern.imperfections": "imperfections",
  "pattern.repeats": "repeats",
};

const uniformByTarget: Record<string, string> = {
  "glass.amount": "uAmount",
  "glass.dispersion": "uDispersion",
  "glass.frost": "uFrost",
  "glass.reflection": "uReflection",
  "glass.reflectionScale": "uReflectionScale",
  "motion.shiftSpeed": "uShift",
  "noise.amount": "uNoiseAmount",
  "noise.size": "uNoiseSize",
  "pattern.angle": "uAngle",
  "pattern.contrast": "uContrast",
  "pattern.imperfectionScale": "uImperfectionScale",
  "pattern.imperfections": "uImperfections",
  "pattern.repeats": "uRepeats",
};

describe("reeded glass controls", () => {
  for (const [target, key] of Object.entries(parameterKeyByTarget)) {
    it(`glass control ${target} maps to a shader parameter`, () => {
      const control = controlFor(target);
      expect(control.type).toBe("slider");
      const defaults = readGlassParameters({});
      const max = (control as { max: number }).max;
      const changed = readGlassParameters({ [target]: max });
      expect(changed[key]).not.toEqual(defaults[key]);
      expect(glassFragmentShaderSource).toContain(`uniform float ${uniformByTarget[target]}`);
      expect(glassShaderSliderTargets).toContain(target);
    });
  }

  it("glass control pattern.type maps every pattern to a distinct shader profile", () => {
    const control = controlFor("pattern.type") as { options: readonly { value: string }[] };
    expect(control.options.map((option) => option.value)).toEqual([...glassPatternTypes]);
    const indices = glassPatternTypes.map((type) => glassPatternTypeIndex[type]);
    expect(new Set(indices).size).toBe(glassPatternTypes.length);
    expect(readGlassParameters({ "pattern.type": "hexagons" }).patternType).toBe("hexagons");
    expect(readGlassParameters({ "pattern.type": "bogus" }).patternType).toBe("rounded");
  });
});

describe("reeded glass source and scene", () => {
  it("glass source mapping cover-crops the photo into the artboard", () => {
    const portrait = getGlassSourceMapping(photo, 1080, 1440);
    // 800×600 photo covering 1080×1440: height-limited, scale 2.4.
    expect(portrait.assetHeight).toBeCloseTo(1440);
    expect(portrait.assetWidth).toBeCloseTo(1920);
    const rotated = getGlassSourceMapping(
      { ...photo, transform: { rotationDeg: 90 } },
      1080,
      1440,
    );
    expect(rotated.rotationRad).toBeCloseTo(Math.PI / 2);
    expect(Math.min(rotated.assetHeight, rotated.assetWidth)).toBeCloseTo(1080);
    const flipped = getGlassSourceMapping(
      { ...photo, transform: { flipHorizontal: true, flipVertical: true } },
      1080,
      1440,
    );
    expect([flipped.flipX, flipped.flipY]).toEqual([-1, -1]);
    expect(fitGlassSourceSize(16384, 4096)).toEqual({ height: 2048, resized: true, width: 8192 });
  });

  it("glass video clip time follows the timeline loop", () => {
    // Loop matched to the clip: clip time equals loop time.
    expect(getGlassVideoTime(1.25, 4, 4)).toBeCloseTo(1.25);
    // Wraps with the timeline loop and stays inside the clip's last frame.
    expect(getGlassVideoTime(5.5, 4, 4)).toBeCloseTo(1.5);
    expect(getGlassVideoTime(3.9999, 4, 4)).toBeLessThan(4);
    // A clip shorter than the loop repeats within it.
    expect(getGlassVideoTime(3.5, 5, 2)).toBeCloseTo(1.5);
    expect(getGlassVideoTime(Number.NaN, 5, 2)).toBe(0);
    expect(getGlassVideoTime(1, 5, 0)).toBe(0);
  });

  it("an attached video clip takes priority over the photo", () => {
    const clip: ToolcraftFileAsset = {
      assetKind: "file",
      fileName: "clip.mp4",
      id: "clip",
      layerId: "layer-clip",
      lifecycle: "ready",
      mimeType: "video/mp4",
      position: { x: 0, y: 0 },
      resourceRef: "file:clip",
      sourceTarget: GLASS_VIDEO_TARGET,
    };
    expect(getGlassActiveSource([photo])).toEqual({ asset: photo, kind: "image" });
    expect(getGlassActiveSource([photo, clip])).toEqual({ asset: clip, kind: "video" });
    expect(
      getGlassActiveSource([
        photo,
        { ...clip, error: { code: "missing", message: "gone" }, lifecycle: "unavailable" },
      ]),
    ).toEqual({ asset: photo, kind: "image" });
    expect(getGlassActiveSource([])).toBeNull();
    // Scene bounds exist for a clip-only source too.
    const state = {
      canvas: { size: { height: 1080, unit: "px", width: 1920 } },
      mediaAssets: [clip],
    } as unknown as Parameters<typeof reededGlassSceneBounds>[0]["state"];
    expect(reededGlassSceneBounds({ state } as Parameters<typeof reededGlassSceneBounds>[0])).toHaveLength(1);
  });

  it("glass scene bounds follow the artboard in both canvas modes", () => {
    const size = { height: 1440, unit: "px", width: 1080 } as const;
    expect(getReededGlassSceneRect({ canvas: { size } })).toEqual({
      height: 1440,
      width: 1080,
      x: -540,
      y: -720,
    });
    const empty = reededGlassSceneBounds({
      state: { canvas: { size }, mediaAssets: [] },
    } as never);
    expect(empty).toEqual([]);
    const ready = reededGlassSceneBounds({
      state: { canvas: { mode: "infinite", size }, mediaAssets: [photo] },
    } as never);
    expect(ready).toEqual([{ height: 1440, width: 1080, x: -540, y: -720 }]);
  });
});

describe("reeded glass output", () => {
  it("glass background stays runtime owned", () => {
    expect(glassFragmentShaderSource).not.toContain("uBackground");
    expect(controlFor("export.includeBackground").defaultValue).toBe(true);
  });

  it("glass background color is a runtime fill", () => {
    expect(controlFor("appearance.background").type).toBe("color");
    expect(controlFor("appearance.background").defaultValue).toBe(glassDefaults.background);
  });

  it("glass image export renders the shader frame", () => {
    expect(appComposition).toBeDefined();
    expect(reededGlassExportRenderer.baseFileName).toBe("reeded-glass");
    expect(glassRendererPipelineRegistration.getPass("glass-export")).toBeDefined();
    expect(typeof reededGlassExportRenderer.renderFrame).toBe("function");
  });

  it("glass video export renders seamless loop frames", () => {
    const parameters = readGlassParameters({});
    const frame = (timeSeconds: number) =>
      createGlassFrameInput({
        asset: photo,
        backingHeight: 100,
        backingWidth: 100,
        durationSeconds: REEDED_GLASS_LOOP_SECONDS,
        parameters,
        sceneHeight: 100,
        sceneWidth: 100,
        timeSeconds,
      });
    expect(frame(0).shift).toBe(0);
    expect(frame(REEDED_GLASS_LOOP_SECONDS / 2).shift).toBeCloseTo(0.5);
    expect(frame(1 / 30).shift).not.toBe(frame(2 / 30).shift);
  });

  for (const [name, target, values] of [
    ["glass image export format options", "export.image.format", ["png", "jpg"]],
    ["glass image export resolution options", "export.image.resolution", ["2k", "4k", "8k"]],
    ["glass video export format options", "export.video.format", ["mp4", "webm"]],
    ["glass video export resolution options", "export.video.resolution", ["current", "4k"]],
  ] as const) {
    it(name, () => {
      const row = appAcceptance.find((entry) => entry.target === target);
      expect(row?.optionCoverage).toEqual(values);
    });
  }

  it("glass infinity image export keeps scene bounds", () => {
    const backing = fitGlassBacking(8192 * 2, 4608 * 2, 16384);
    expect(Math.max(backing.width, backing.height)).toBe(GLASS_MAX_EDGE_PX);
  });

  it("glass infinity video export keeps the saved artboard", () => {
    const size = { height: 1080, unit: "px", width: 1920 } as const;
    expect(getReededGlassSceneRect({ canvas: { size } }).width).toBe(1920);
  });
});

describe("reeded glass loop and preview", () => {
  it("glass loop shift is seamless and forward", () => {
    const parameters = readGlassParameters({ "motion.shiftSpeed": 2 });
    const shiftAt = (time: number) =>
      createGlassFrameInput({
        asset: photo,
        backingHeight: 1,
        backingWidth: 1,
        durationSeconds: 5,
        parameters,
        sceneHeight: 1,
        sceneWidth: 1,
        timeSeconds: time,
      }).shift;
    expect(shiftAt(0)).toBe(0);
    expect(shiftAt(5)).toBe(0);
    expect(shiftAt(4.999)).toBeCloseTo(2, 2);
    expect(shiftAt(2.5)).toBeGreaterThan(shiftAt(1));
    expect(getGlassLoopProgress(7.5, 5)).toBeCloseTo(0.5);
  });

  it("glass preview backing follows render scale", () => {
    expect(appSchema.canvas.renderScale?.enabled).toBe(true);
    expect(fitGlassBacking(3840, 2160, 16384)).toEqual({ height: 2160, width: 3840 });
  });

  it("declares production reload coverage for the reeded glass schema", () => {
    const row = appAcceptance.find((entry) => entry.id === "persistence.reload");
    expect(row?.persistenceCoverage).toBe("reload");
    expect(appSchema.persistence.storage).toBe("localStorage");
    expect(row?.persistenceSlices).toEqual(
      appSchema.persistence.storage === "localStorage" ? appSchema.persistence.include : [],
    );
  });
});

describe("glass source URL pairing", () => {
  it("never pairs a replacement image with the previous image's stale URL", () => {
    const owners = new Map<string, string>();
    const original = [{ assetKind: "image", id: "media-1", resourceRef: "ref-a" }];
    expect(pairGlassSourceUrls(original, new Map([["media-1", "blob:a"]]), owners)).toEqual([
      ["ref-a", "blob:a"],
    ]);
    // Replacement keeps the media id; the id-keyed URL is still the old one.
    const replaced = [{ assetKind: "image", id: "media-1", resourceRef: "ref-b" }];
    expect(pairGlassSourceUrls(replaced, new Map([["media-1", "blob:a"]]), owners)).toEqual([]);
    // The replacement's own URL arrives and is paired.
    expect(pairGlassSourceUrls(replaced, new Map([["media-1", "blob:b"]]), owners)).toEqual([
      ["ref-b", "blob:b"],
    ]);
    expect(owners.has("blob:a")).toBe(false);
  });
});
