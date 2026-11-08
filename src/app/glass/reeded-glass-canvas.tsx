import * as React from "react";

import {
  useToolcraftMediaPresentationUrls,
  useToolcraftPipeline,
  useToolcraftProductSceneFrame,
  useToolcraftSelector,
  useToolcraftViewportInteractionActive,
} from "@/toolcraft/runtime/react";

import {
  getGlassImageFitSource,
  getGlassOrientedSourceSize,
  useGlassCanvasAutoFit,
  type GlassFitSource,
} from "./glass-canvas-fit";
import { GlassGlRenderer } from "./glass-gl";
import { createGlassFrameScheduler, type GlassFrameScheduler } from "./glass-frame-scheduler";
import { fitGlassBacking } from "./glass-limits";
import {
  acquireGlassSource,
  createGlassFrameInput,
  getGlassLoopProgress,
  getGlassSourceGeometry,
  runGlassPreviewDraw,
} from "./glass-render-input";
import {
  pairGlassSourceUrls,
  publishGlassSourceUrls,
  type GlassDecodedSource,
} from "./glass-source";
import {
  getGlassActiveSource,
  getGlassVideoTime,
  readGlassParameters,
  type GlassActiveSource,
} from "./glass-values";
import styles from "./reeded-glass-canvas.module.css";

function readRenderScale(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 2;
}

/** Auto-fit input: photos from runtime state, clips once their track is read. */
function getFitSource(
  active: GlassActiveSource | null,
  decoded: GlassDecodedSource | null,
): GlassFitSource | null {
  if (!active) return null;
  if (active.kind === "image") return getGlassImageFitSource(active.asset);
  const loaded = decoded?.kind === "video" ? decoded : null;
  return {
    ...(loaded ? { clipSeconds: loaded.durationSeconds } : {}),
    key: `video:${active.asset.resourceRef}`,
    lifecycle: active.asset.lifecycle,
    size: loaded
      ? getGlassOrientedSourceSize({
          sourceSize: { height: loaded.height, width: loaded.width },
          transform: { rotationDeg: loaded.rotationDeg },
        })
      : null,
  };
}

type LatestJobRunner = Readonly<{ run: (job: () => Promise<void>) => void }>;

/**
 * Runs one async job at a time; while one runs, only the most recent request
 * is kept, so slow clip decoding never builds a backlog of stale frames.
 */
function createLatestJobRunner(): LatestJobRunner {
  let busy = false;
  let next: (() => Promise<void>) | null = null;
  const run = (job: () => Promise<void>): void => {
    if (busy) {
      next = job;
      return;
    }
    busy = true;
    void job().finally(() => {
      busy = false;
      const queued = next;
      next = null;
      if (queued) run(queued);
    });
  };
  return { run };
}

export function ReededGlassCanvas(): React.JSX.Element {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const rendererRef = React.useRef<GlassGlRenderer | null>(null);
  const [rendererError, setRendererError] = React.useState<string | null>(null);
  const [decodeError, setDecodeError] = React.useState<string | null>(null);
  const [decoded, setDecoded] = React.useState<GlassDecodedSource | null>(null);
  const [frameCount, setFrameCount] = React.useState(0);
  const [renderedTime, setRenderedTime] = React.useState(0);
  const [renderedVideoTime, setRenderedVideoTime] = React.useState<number | null>(null);
  const pipeline = useToolcraftPipeline();
  const sceneFrame = useToolcraftProductSceneFrame();
  const interactionActive = useToolcraftViewportInteractionActive();
  const mediaAssets = useToolcraftSelector((state) => state.mediaAssets);
  const values = useToolcraftSelector((state) => state.values);
  const zoom = useToolcraftSelector((state) => state.canvas.zoom);
  const timeSeconds = useToolcraftSelector((state) => state.timeline.currentTimeSeconds);
  const durationSeconds = useToolcraftSelector((state) => state.timeline.durationSeconds);
  const isPlaying = useToolcraftSelector((state) => state.timeline.isPlaying);
  const presentationUrls = useToolcraftMediaPresentationUrls(mediaAssets);
  const active = React.useMemo(() => getGlassActiveSource(mediaAssets), [mediaAssets]);
  const asset = active?.asset ?? null;
  const parameters = React.useMemo(() => readGlassParameters(values), [values]);
  const renderScale = readRenderScale(values["canvas.renderScale"]);

  // Publish presentation URLs keyed by immutable resource refs for decoding.
  const urlOwnersRef = React.useRef(new Map<string, string>());
  React.useEffect(() => {
    publishGlassSourceUrls(
      pairGlassSourceUrls(mediaAssets, presentationUrls, urlOwnersRef.current),
    );
  }, [mediaAssets, presentationUrls]);

  // Renderer lifecycle: created after mount, disposed on unmount.
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    try {
      rendererRef.current = new GlassGlRenderer(canvas);
      setRendererError(null);
    } catch (error) {
      setRendererError(error instanceof Error ? error.message : String(error));
    }
    return () => {
      rendererRef.current?.dispose();
      rendererRef.current = null;
    };
  }, []);

  // Source decoding through the retained source pass. Decoding depends only on
  // the immutable resource; transforms change the asset object, not the bytes.
  const resourceRef = asset?.lifecycle === "ready" ? asset.resourceRef : null;
  const sourceKind = active?.kind ?? null;
  const decodeSourceRef = React.useRef(active);
  decodeSourceRef.current = active;
  React.useEffect(() => {
    const currentSource = decodeSourceRef.current;
    setDecodeError(null);
    if (!pipeline || !currentSource || !resourceRef) {
      setDecoded(null);
      return undefined;
    }
    const controller = new AbortController();
    void acquireGlassSource(pipeline, currentSource, controller.signal).then(
      (source) => {
        if (!controller.signal.aborted) setDecoded(source);
      },
      (error: unknown) => {
        if (!controller.signal.aborted) {
          setDecodeError(error instanceof Error ? error.message : String(error));
        }
      },
    );
    return () => controller.abort();
  }, [pipeline, resourceRef, sourceKind]);

  // The decoded source that matches the active photo or clip (null while a
  // replacement is still decoding).
  const current =
    active &&
    decoded &&
    decoded.kind === active.kind &&
    decoded.resourceRef === active.asset.resourceRef
      ? decoded
      : null;
  useGlassCanvasAutoFit(getFitSource(active, current));

  // Animation work yields during viewport interaction: hold the last frame time.
  const heldTimeRef = React.useRef(timeSeconds);
  if (!(interactionActive && isPlaying)) heldTimeRef.current = timeSeconds;
  const effectiveTime = heldTimeRef.current;

  const sceneRect = sceneFrame.kind === "ready" ? sceneFrame.rect : null;
  const devicePixelRatio = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  // Runtime zoom is a percentage (100 = 1:1 world pixels).
  const backingScale = (Math.max(zoom, 1) / 100) * devicePixelRatio * renderScale;

  // Coalesced rendering: inputs are stored in a ref and one animation frame
  // draws the latest request, so rapid timeline updates never starve drawing.
  // Clip frames decode asynchronously; only the newest pending draw survives.
  const schedulerRef = React.useRef<GlassFrameScheduler | null>(null);
  const clipDrawsRef = React.useRef<LatestJobRunner>(createLatestJobRunner());
  const mountedRef = React.useRef(true);
  React.useEffect(() => {
    mountedRef.current = true;
    const scheduler = createGlassFrameScheduler();
    schedulerRef.current = scheduler;
    return () => {
      mountedRef.current = false;
      scheduler.cancel();
      schedulerRef.current = null;
    };
  }, []);

  React.useEffect(() => {
    const renderer = rendererRef.current;
    const scheduler = schedulerRef.current;
    if (!renderer || !scheduler || !sceneRect || !active || !current) {
      return;
    }
    const time = effectiveTime;
    const { height: backingHeight, width: backingWidth } = fitGlassBacking(
      Math.round(sceneRect.width * backingScale),
      Math.round(sceneRect.height * backingScale),
      renderer.maxBackingSize,
    );
    const frameInput = createGlassFrameInput({
      asset: getGlassSourceGeometry(active, current),
      backingHeight,
      backingWidth,
      durationSeconds,
      parameters,
      sceneHeight: sceneRect.height,
      sceneWidth: sceneRect.width,
      timeSeconds: time,
    });
    const onFailed = (error: unknown) => {
      if (mountedRef.current) {
        setRendererError(error instanceof Error ? error.message : String(error));
      }
    };
    const onDrawn = (videoTime: number | null) => {
      if (!mountedRef.current) return;
      setFrameCount((count) => count + 1);
      setRenderedTime(time);
      setRenderedVideoTime(videoTime);
    };

    if (current.kind === "image") {
      const bitmap = current.bitmap;
      const draw = () => {
        const target = rendererRef.current;
        if (!target) return;
        target.setSource(bitmap);
        target.render(frameInput);
      };
      scheduler.request(() => {
        runGlassPreviewDraw(pipeline, draw).then(() => onDrawn(null), onFailed);
      });
      return;
    }

    // Clip: decode the frame shown at this timeline time, then draw it.
    const clip = current.clip;
    const clipTime = getGlassVideoTime(time, durationSeconds, current.durationSeconds);
    scheduler.request(() => {
      clipDrawsRef.current.run(async () => {
        let videoFrame: VideoFrame | null = null;
        try {
          videoFrame = (await clip.frameAt(clipTime)).frame;
          const frame = videoFrame;
          await runGlassPreviewDraw(pipeline, () => {
            const target = rendererRef.current;
            if (!target) return;
            target.setSource(frame, { refresh: true });
            target.render(frameInput);
          });
          onDrawn(frame.timestamp / 1_000_000);
        } catch (error) {
          onFailed(error);
        } finally {
          videoFrame?.close();
        }
      });
    });
  }, [active, backingScale, current, durationSeconds, effectiveTime, parameters, pipeline, sceneRect]);

  const glassError = rendererError ?? decodeError;
  const visible = Boolean(sceneRect && current && !glassError);
  // File name of the photo or clip actually decoded and drawn (output identity).
  const renderedSourceName = visible && asset ? asset.fileName : undefined;
  const loopProgress = getGlassLoopProgress(effectiveTime, durationSeconds);

  return (
    <canvas
      aria-hidden="true"
      className={styles.canvas}
      data-glass-error={glassError ?? undefined}
      data-glass-source-kind={visible ? current?.kind : undefined}
      data-glass-source-name={renderedSourceName}
      data-glass-video-time={renderedVideoTime === null ? undefined : renderedVideoTime.toFixed(3)}
      data-glass-frame-count={frameCount}
      data-glass-rendered-time={renderedTime.toFixed(4)}
      data-reeded-glass-output=""
      data-timeline-progress={loopProgress.toFixed(4)}
      data-toolcraft-product-output=""
      data-visible={visible ? "true" : "false"}
      ref={canvasRef}
    />
  );
}
