/**
 * MP4 clip decoding for the reeded glass source.
 *
 * The clip's bytes are demuxed with mp4box and its video samples decoded on
 * demand with WebCodecs `VideoDecoder`, so a frame at any timeline time can be
 * produced deterministically (export) or cheaply in sequence (preview playback)
 * without DOM media elements. Only the first video track is used; audio is
 * ignored because exports are silent.
 */

import * as mp4boxModule from "mp4box";

/*
 * The few mp4box members this module uses, typed locally. mp4box's own
 * declarations form a very large recursive type graph; one cast here keeps
 * product code (and the product source boundary analysis) on small types.
 */
type Mp4Sample = Readonly<{
  cts: number;
  data?: Uint8Array;
  dts: number;
  duration: number;
  is_sync: boolean;
  timescale: number;
}>;
type Mp4Track = Readonly<{
  codec: string;
  id: number;
  matrix?: ArrayLike<number>;
  track_height: number;
  track_width: number;
  video?: Readonly<{ height: number; width: number }>;
}>;
type Mp4DataStream = { readonly buffer: ArrayBuffer };
type Mp4WritableBox = { write(stream: Mp4DataStream): void };
type Mp4SampleEntry = Partial<Record<"avcC" | "av1C" | "hvcC" | "vpcC", Mp4WritableBox>>;
type Mp4File = {
  appendBuffer(buffer: ArrayBuffer, last?: boolean): number;
  flush(): void;
  getTrackById(id: number): {
    mdia: { minf: { stbl: { stsd: { entries: readonly Mp4SampleEntry[] } } } };
  };
  onError?: (error: unknown) => void;
  onReady?: (info: Readonly<{ videoTracks: readonly Mp4Track[] }>) => void;
  onSamples?: (id: number, user: unknown, samples: readonly Mp4Sample[]) => void;
  setExtractionOptions(id: number, user?: unknown, options?: { nbSamples?: number }): void;
  start(): void;
};
type Mp4BoxApi = Readonly<{
  createFile(): Mp4File;
  DataStream: new (buffer: undefined, byteOffset: number, endianness: number) => Mp4DataStream;
  Endianness: Readonly<{ BIG_ENDIAN: number }>;
  MP4BoxBuffer: Readonly<{ fromArrayBuffer(buffer: ArrayBuffer, fileStart: number): ArrayBuffer }>;
}>;

const mp4box = mp4boxModule as unknown as Mp4BoxApi;

export type GlassClipSample = Readonly<{
  /** Presentation timestamp in microseconds (matches the decoded frame). */
  cts: number;
  data: Uint8Array;
  /** Decode timestamp in microseconds. */
  dts: number;
  duration: number;
  key: boolean;
}>;

export type GlassClipInfo = Readonly<{
  codec: string;
  description: Uint8Array | undefined;
  durationSeconds: number;
  height: number;
  /** Display rotation from the track matrix (phone portrait clips use 90). */
  rotationDeg: 0 | 90 | 180 | 270;
  /** Samples in decode order. */
  samples: readonly GlassClipSample[];
  width: number;
}>;

const MICROSECONDS = 1_000_000;

/** Display rotation in clockwise quarter turns from an MP4 16.16 track matrix. */
export function getGlassClipRotation(matrix: ArrayLike<number> | undefined): 0 | 90 | 180 | 270 {
  if (!matrix || matrix.length < 4) return 0;
  const a = matrix[0];
  const b = matrix[1];
  const degrees = (Math.round((Math.atan2(b, a) * 180) / Math.PI / 90) * 90 + 360) % 360;
  return degrees === 90 || degrees === 180 || degrees === 270 ? degrees : 0;
}

/**
 * Index (in decode order) of the sample shown at a time: the latest sample
 * whose presentation time is not after the requested time.
 */
export function findGlassClipSampleIndex(
  samples: readonly Pick<GlassClipSample, "cts">[],
  timeMicros: number,
): number {
  let best = -1;
  let bestCts = Number.NEGATIVE_INFINITY;
  let earliest = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const { cts } = samples[index];
    if (cts <= timeMicros && cts > bestCts) {
      best = index;
      bestCts = cts;
    }
    if (cts < samples[earliest].cts) earliest = index;
  }
  return best >= 0 ? best : earliest;
}

/** Latest keyframe at or before a decode-order index. */
export function findGlassClipKeyIndex(
  samples: readonly Pick<GlassClipSample, "key">[],
  index: number,
): number {
  for (let current = index; current >= 0; current -= 1) {
    if (samples[current].key) return current;
  }
  return 0;
}

function readCodecDescription(file: Mp4File, track: Mp4Track): Uint8Array | undefined {
  const trak = file.getTrackById(track.id);
  for (const entry of trak.mdia.minf.stbl.stsd.entries) {
    const box = entry.avcC ?? entry.hvcC ?? entry.vpcC ?? entry.av1C;
    if (box) {
      const stream = new mp4box.DataStream(undefined, 0, mp4box.Endianness.BIG_ENDIAN);
      box.write(stream);
      // Skip the 8-byte box header; WebCodecs wants the record payload only.
      return new Uint8Array(stream.buffer, 8);
    }
  }
  return undefined;
}

/** Demuxes the first video track of an MP4 file into decodable samples. */
export function demuxGlassClip(bytes: ArrayBuffer): GlassClipInfo {
  const file = mp4box.createFile();
  let track: Mp4Track | undefined;
  const collected: Mp4Sample[] = [];
  let failure: unknown;
  file.onError = (error: unknown) => {
    failure = error;
  };
  file.onReady = (info) => {
    track = info.videoTracks[0];
    if (!track) return;
    file.setExtractionOptions(track.id, undefined, { nbSamples: Number.POSITIVE_INFINITY });
    file.start();
  };
  file.onSamples = (_id, _user, samples) => {
    collected.push(...samples);
  };
  file.appendBuffer(mp4box.MP4BoxBuffer.fromArrayBuffer(bytes, 0), true);
  file.flush();
  if (failure !== undefined) {
    throw new Error("Reeded glass could not read the MP4 file.");
  }
  const videoTrack: Mp4Track | undefined = track;
  if (!videoTrack) throw new Error("The MP4 file has no video track.");
  const samples = collected
    .filter((sample) => sample.data && sample.data.byteLength > 0)
    .map(
      (sample): GlassClipSample => ({
        cts: Math.round((sample.cts * MICROSECONDS) / sample.timescale),
        data: sample.data as Uint8Array,
        dts: Math.round((sample.dts * MICROSECONDS) / sample.timescale),
        duration: Math.round((sample.duration * MICROSECONDS) / sample.timescale),
        key: sample.is_sync,
      }),
    );
  if (samples.length === 0) throw new Error("The MP4 file has no video frames.");
  const firstCts = Math.min(...samples.map((sample) => sample.cts));
  const lastEnd = Math.max(...samples.map((sample) => sample.cts + sample.duration));
  return Object.freeze({
    codec: videoTrack.codec,
    description: readCodecDescription(file, videoTrack),
    durationSeconds: Math.max(1 / 30, (lastEnd - firstCts) / MICROSECONDS),
    height: videoTrack.video?.height ?? videoTrack.track_height,
    rotationDeg: getGlassClipRotation(videoTrack.matrix),
    samples: Object.freeze(samples.map((sample) => ({ ...sample, cts: sample.cts - firstCts }))),
    width: videoTrack.video?.width ?? videoTrack.track_width,
  });
}

/** A decoded frame handed to the caller, who must close it after use. */
export type GlassClipFrame = Readonly<{ frame: VideoFrame }>;

/**
 * One decoder session over a demuxed clip. `frameAt` returns a clone of the
 * frame shown at a time (the caller closes it). Forward requests continue
 * decoding from where the last one stopped; backward or far jumps restart at
 * the nearest keyframe. Requests are serialized.
 */
export class GlassVideoClip {
  readonly info: GlassClipInfo;
  private readonly config: VideoDecoderConfig;
  private decoder: VideoDecoder | null = null;
  /** Next decode-order sample to feed; -1 means the decoder needs a keyframe. */
  private nextIndex = -1;
  /** Decoded frames not yet superseded, ordered by timestamp. */
  private frames: VideoFrame[] = [];
  private outputWaiters: Array<() => void> = [];
  private decodeError: Error | null = null;
  private queue: Promise<void> = Promise.resolve();
  private closed = false;

  private constructor(info: GlassClipInfo, config: VideoDecoderConfig) {
    this.info = info;
    this.config = config;
  }

  static async open(bytes: ArrayBuffer): Promise<GlassVideoClip> {
    if (typeof VideoDecoder === "undefined") {
      throw new Error("This browser cannot decode video (WebCodecs is unavailable).");
    }
    const info = demuxGlassClip(bytes);
    const config: VideoDecoderConfig = {
      codec: info.codec,
      codedHeight: info.height,
      codedWidth: info.width,
      ...(info.description ? { description: info.description } : {}),
    };
    const support = await VideoDecoder.isConfigSupported(config);
    if (!support.supported) {
      throw new Error(`This browser cannot decode the clip's video codec (${info.codec}).`);
    }
    return new GlassVideoClip(info, config);
  }

  frameAt(timeSeconds: number, signal?: AbortSignal): Promise<GlassClipFrame> {
    const run = this.queue.then(() => this.decodeFrameAt(timeSeconds, signal));
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  close(): void {
    this.closed = true;
    this.resetDecoder();
    this.decoder?.close();
    this.decoder = null;
  }

  private ensureDecoder(): VideoDecoder {
    if (this.decoder && this.decoder.state !== "closed") return this.decoder;
    this.decoder = new VideoDecoder({
      error: (error) => {
        this.decodeError = new Error(`Reeded glass video decoding failed: ${error.message}`);
        this.wakeWaiters();
      },
      output: (frame) => {
        if (this.closed) {
          frame.close();
          return;
        }
        this.frames.push(frame);
        this.frames.sort((left, right) => left.timestamp - right.timestamp);
        this.wakeWaiters();
      },
    });
    return this.decoder;
  }

  private wakeWaiters(): void {
    const waiters = this.outputWaiters;
    this.outputWaiters = [];
    for (const wake of waiters) wake();
  }

  private waitForOutput(timeoutMs: number): Promise<void> {
    return new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, timeoutMs);
      this.outputWaiters.push(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  private resetDecoder(): void {
    for (const frame of this.frames) frame.close();
    this.frames = [];
    if (this.decoder && this.decoder.state === "configured") this.decoder.reset();
    this.nextIndex = -1;
  }

  private dropFramesBefore(cts: number): void {
    while (this.frames.length > 0 && this.frames[0].timestamp < cts) {
      this.frames.shift()?.close();
    }
  }

  private async decodeFrameAt(timeSeconds: number, signal?: AbortSignal): Promise<GlassClipFrame> {
    if (this.closed) throw new Error("Reeded glass video clip was released.");
    const { samples } = this.info;
    const targetIndex = findGlassClipSampleIndex(samples, Math.round(timeSeconds * MICROSECONDS));
    const target = samples[targetIndex];
    const cached = this.frames.find((frame) => frame.timestamp === target.cts);
    if (cached) return { frame: cached.clone() };

    const keyIndex = findGlassClipKeyIndex(samples, targetIndex);
    const behind = this.frames.length > 0 && this.frames[this.frames.length - 1].timestamp > target.cts;
    // Restart at the keyframe for a fresh decoder, a backward seek, or a jump
    // past samples that were never fed.
    if (this.nextIndex < 0 || behind || keyIndex > this.nextIndex || this.decodeError) {
      this.resetDecoder();
      this.decodeError = null;
      this.nextIndex = keyIndex;
    }
    const decoder = this.ensureDecoder();
    if (decoder.state === "unconfigured") decoder.configure(this.config);

    for (;;) {
      signal?.throwIfAborted();
      if (this.decodeError) throw this.decodeError;
      this.dropFramesBefore(target.cts);
      const hit = this.frames.find((frame) => frame.timestamp === target.cts);
      if (hit) return { frame: hit.clone() };
      if (this.frames.length > 0 && this.frames[0].timestamp > target.cts) {
        // The exact frame was skipped (variable timing): use the next one.
        return { frame: this.frames[0].clone() };
      }
      if (this.nextIndex < samples.length) {
        const sample = samples[this.nextIndex];
        this.nextIndex += 1;
        decoder.decode(
          new EncodedVideoChunk({
            data: sample.data,
            duration: sample.duration,
            timestamp: sample.cts,
            type: sample.key ? "key" : "delta",
          }),
        );
        // Once the target's references are fed, wait briefly for its output
        // before feeding further (reordered streams release it later).
        if (this.nextIndex > targetIndex) await this.waitForOutput(40);
        continue;
      }
      // All samples fed: flush the decoder's reorder queue. Further decoding
      // must restart at a keyframe.
      await decoder.flush();
      this.nextIndex = -1;
      this.dropFramesBefore(target.cts);
      const last = this.frames.find((frame) => frame.timestamp >= target.cts) ?? this.frames.at(-1);
      if (last) return { frame: last.clone() };
      throw new Error("Reeded glass could not decode the requested video frame.");
    }
  }
}
