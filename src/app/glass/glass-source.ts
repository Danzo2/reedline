/**
 * Product-owned decoded source registry.
 *
 * Runtime media presentation URLs are published by the mounted preview (through
 * `useToolcraftMediaPresentationUrls`). Decoding is a retained source-scoped
 * pipeline resource keyed by the immutable `resourceRef`, so preview and export
 * share one decoded bitmap per uploaded image.
 */

import { fitGlassSourceSize } from "./glass-limits";
import { GlassVideoClip } from "./glass-video-decoder";

const presentationUrls = new Map<string, string>();
const urlListeners = new Set<() => void>();

export function publishGlassSourceUrls(
  entries: ReadonlyArray<readonly [resourceRef: string, url: string]>,
): void {
  let changed = false;
  const next = new Map(entries);
  for (const key of presentationUrls.keys()) {
    if (!next.has(key)) {
      presentationUrls.delete(key);
      changed = true;
    }
  }
  for (const [key, url] of next) {
    if (presentationUrls.get(key) !== url) {
      presentationUrls.set(key, url);
      changed = true;
    }
  }
  if (changed) for (const listener of urlListeners) listener();
}

type GlassUrlSourceAsset = Readonly<{ assetKind: string; id: string; resourceRef?: string }>;

/**
 * Pairs runtime presentation URLs (keyed by media id) with immutable resource
 * refs. Replacing an image keeps its media id, and for one render the id-keyed
 * URL can still be the previous, already revoked image's URL. A URL first
 * observed for another resource is never paired with a new resource, so
 * decoding waits for the replacement's own URL. `owners` persists URL → ref
 * observations between calls and is pruned to live URLs.
 */
export function pairGlassSourceUrls(
  assets: readonly GlassUrlSourceAsset[],
  urlsByMediaId: ReadonlyMap<string, string>,
  owners: Map<string, string>,
): Array<readonly [resourceRef: string, url: string]> {
  const entries: Array<readonly [string, string]> = [];
  const liveUrls = new Set<string>();
  for (const asset of assets) {
    // Photos and video clips (file assets) both decode from presentation URLs.
    if ((asset.assetKind !== "image" && asset.assetKind !== "file") || !asset.resourceRef) continue;
    const url = urlsByMediaId.get(asset.id);
    if (!url) continue;
    liveUrls.add(url);
    const owner = owners.get(url);
    if (owner === undefined) owners.set(url, asset.resourceRef);
    else if (owner !== asset.resourceRef) continue;
    entries.push([asset.resourceRef, url] as const);
  }
  for (const url of [...owners.keys()]) if (!liveUrls.has(url)) owners.delete(url);
  return entries;
}

function waitForSourceUrl(resourceRef: string, signal?: AbortSignal): Promise<string> {
  const existing = presentationUrls.get(resourceRef);
  if (existing) return Promise.resolve(existing);
  return new Promise<string>((resolve, reject) => {
    const startedAt = Date.now();
    const listener = () => {
      const url = presentationUrls.get(resourceRef);
      if (url) {
        urlListeners.delete(listener);
        clearInterval(poll);
        resolve(url);
      }
    };
    // Cooperative cancellation/timeout without attaching host event listeners.
    const poll = setInterval(() => {
      if (signal?.aborted) {
        urlListeners.delete(listener);
        clearInterval(poll);
        reject(signal.reason);
      } else if (Date.now() - startedAt > 15_000) {
        urlListeners.delete(listener);
        clearInterval(poll);
        reject(new Error("Reeded glass source image is not available for rendering."));
      }
    }, 50);
    urlListeners.add(listener);
  });
}

export type GlassDecodedImage = Readonly<{
  bitmap: ImageBitmap;
  height: number;
  kind: "image";
  resourceRef: string;
  width: number;
}>;

/** A demuxed clip with its own decoder session (preview and export differ). */
export type GlassDecodedVideo = Readonly<{
  clip: GlassVideoClip;
  durationSeconds: number;
  /** Coded (unrotated) frame height. */
  height: number;
  kind: "video";
  resourceRef: string;
  rotationDeg: 0 | 90 | 180 | 270;
  /** Coded (unrotated) frame width. */
  width: number;
}>;

export type GlassDecodedSource = GlassDecodedImage | GlassDecodedVideo;

export async function decodeGlassSource(
  resourceRef: string,
  signal?: AbortSignal,
): Promise<GlassDecodedSource> {
  const url = await waitForSourceUrl(resourceRef, signal);
  const response = await fetch(url, signal ? { signal } : undefined);
  const blob = await response.blob();
  const probe = await createImageBitmap(blob);
  const fitted = fitGlassSourceSize(probe.width, probe.height);
  let bitmap = probe;
  if (fitted.resized) {
    probe.close();
    bitmap = await createImageBitmap(blob, {
      resizeHeight: fitted.height,
      resizeQuality: "high",
      resizeWidth: fitted.width,
    });
  }
  return Object.freeze({
    bitmap,
    height: bitmap.height,
    kind: "image" as const,
    resourceRef,
    width: bitmap.width,
  });
}

/** Reads the clip bytes and opens a decoder session over its video track. */
export async function decodeGlassVideo(
  resourceRef: string,
  signal?: AbortSignal,
): Promise<GlassDecodedVideo> {
  const url = await waitForSourceUrl(resourceRef, signal);
  const response = await fetch(url, signal ? { signal } : undefined);
  const clip = await GlassVideoClip.open(await response.arrayBuffer());
  signal?.throwIfAborted();
  const { durationSeconds, height, rotationDeg, width } = clip.info;
  return Object.freeze({
    clip,
    durationSeconds,
    height,
    kind: "video" as const,
    resourceRef,
    rotationDeg,
    width,
  });
}

export function releaseGlassSource(source: GlassDecodedSource): void {
  if (source.kind === "image") source.bitmap.close();
  else source.clip.close();
}
