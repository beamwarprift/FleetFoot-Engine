// Hears a media element without touching what the user hears: it reads a copy of the
// element's audio (`captureStream`), never routes the element through Web Audio, whose output a
// cross-origin source would silence. Blocks come from whatever the browser offers, chosen by
// capability: the track's own frames, or a script processor. Everything is event-driven and
// released at once by the function `listenTo` returns.

import { levelDb } from './SilenceDetector.ts';

export type ListenStatus = 'waiting' | 'listening' | 'unavailable';

/** Starts hearing a player; the function it returns stops and releases everything. */
export type SilenceListen = (media: HTMLMediaElement, events: ListenEvents) => () => void;

export interface ListenEvents {
  /** One block of audio: its level in dBFS and its length in seconds. */
  readonly block: (db: number, seconds: number) => void;
  readonly status: (status: ListenStatus) => void;
}

/** `captureStream` on media elements: standard, prefixed in older Firefox. */
interface Capturable {
  captureStream?: () => MediaStream;
  mozCaptureStream?: () => MediaStream;
}

interface TrackProcessor {
  readonly readable: ReadableStream<AudioData>;
}

type TrackProcessorConstructor = new (init: { track: MediaStreamTrack }) => TrackProcessor;

/** Frames per script processor block: about 43 ms at 48 kHz, a power of two as the API asks. */
const SCRIPT_BLOCK_FRAMES = 2048;

/**
 * A source the page may play but not read: another origin's media fetched without CORS. Its
 * capture is refused or silent, so it is never heard (the detector then never speeds it up).
 */
export function isUnreadable(media: HTMLMediaElement): boolean {
  if (media.srcObject !== null || media.currentSrc === '') return false;
  let url: URL;
  try {
    url = new URL(media.currentSrc, media.ownerDocument.baseURI);
  } catch {
    return true;
  }
  // A data: address has no origin of its own and is read as the page's.
  if (url.protocol === 'data:') return false;
  const own = media.ownerDocument.defaultView?.location.origin;
  return url.origin !== own && media.crossOrigin === null;
}

function capture(media: HTMLMediaElement): MediaStream | null {
  const element = media as HTMLMediaElement & Capturable;
  const start = element.captureStream ?? element.mozCaptureStream;
  if (start === undefined) return null;
  try {
    return start.call(element);
  } catch {
    // SecurityError: the element holds media from another origin.
    return null;
  }
}

function trackProcessor(): TrackProcessorConstructor | undefined {
  const candidate = (globalThis as { MediaStreamTrackProcessor?: unknown })
    .MediaStreamTrackProcessor;
  return typeof candidate === 'function' ? (candidate as TrackProcessorConstructor) : undefined;
}

/** A way of reading blocks: what it can say of itself now, and how it is released. */
interface Reading {
  readonly status: () => ListenStatus;
  readonly release: () => void;
}

/** Reads the track's frames as they arrive. */
function readFrames(
  Processor: TrackProcessorConstructor,
  track: MediaStreamTrack,
  events: ListenEvents,
): Reading {
  const reader = new Processor({ track }).readable.getReader();
  let samples = new Float32Array(0);
  void (async () => {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return;
      try {
        const frames = value.numberOfFrames;
        if (samples.length !== frames) samples = new Float32Array(frames);
        value.copyTo(samples, { planeIndex: 0, format: 'f32-planar' });
        events.block(levelDb(samples), frames / value.sampleRate);
      } finally {
        value.close();
      }
    }
  })().catch(() => events.status('unavailable'));
  return { status: () => 'listening', release: () => void reader.cancel().catch(() => {}) };
}

/**
 * Hears the stream through a script processor. Browsers start an audio context only after a
 * click or key on the page: until then the status is `waiting`, and the next one resumes it.
 */
function processBlocks(
  media: HTMLMediaElement,
  stream: MediaStream,
  events: ListenEvents,
  signal: AbortSignal,
): Reading {
  const context = new AudioContext();
  const source = context.createMediaStreamSource(stream);
  const processor = context.createScriptProcessor(SCRIPT_BLOCK_FRAMES, 1, 1);
  // The processor runs only when connected to an output: a silent one, nothing is heard.
  const mute = context.createGain();
  mute.gain.value = 0;
  processor.addEventListener('audioprocess', (event) => {
    const input = event.inputBuffer;
    events.block(levelDb(input.getChannelData(0)), input.duration);
  });
  source.connect(processor);
  processor.connect(mute);
  mute.connect(context.destination);
  // Listens for the gesture only while the context waits for one.
  const gesture = new AbortController();
  signal.addEventListener('abort', () => gesture.abort(), { once: true });
  const report = () => {
    const running = context.state === 'running';
    if (running) gesture.abort();
    events.status(running ? 'listening' : 'waiting');
  };
  context.addEventListener('statechange', report, { signal });
  report();
  if (context.state !== 'running') {
    const resume = () => void context.resume().catch(() => {});
    const view = media.ownerDocument.defaultView;
    for (const type of ['pointerdown', 'keydown'] as const) {
      view?.addEventListener(type, resume, { capture: true, signal: gesture.signal });
    }
    resume();
  }
  return {
    status: () => (context.state === 'running' ? 'listening' : 'waiting'),
    release: () => {
      source.disconnect();
      processor.disconnect();
      void context.close().catch(() => {});
    },
  };
}

/** Starts hearing `media`; the function it returns stops and releases everything. */
export const listenTo: SilenceListen = (media, events) => {
  const abort = new AbortController();
  let reading: Reading | null = null;
  const stream = isUnreadable(media) ? null : capture(media);
  const stop = () => {
    abort.abort();
    reading?.release();
    reading = null;
    for (const track of stream?.getTracks() ?? []) track.stop();
  };
  if (stream === null) {
    events.status('unavailable');
    return stop;
  }
  const start = (track: MediaStreamTrack) => {
    if (reading !== null) return;
    // A muted capture track carries nothing readable for now (a stall, or a source that became
    // another origin's); it may come back.
    track.addEventListener('mute', () => events.status('unavailable'), { signal: abort.signal });
    track.addEventListener('unmute', () => events.status(reading?.status() ?? 'listening'), {
      signal: abort.signal,
    });
    const Processor = trackProcessor();
    reading =
      Processor === undefined
        ? processBlocks(media, stream, events, abort.signal)
        : readFrames(Processor, track, events);
    events.status(reading.status());
  };
  const track = stream.getAudioTracks()[0];
  if (track !== undefined) start(track);
  else {
    // The audio track appears once the element has audio to play.
    events.status('listening');
    stream.addEventListener(
      'addtrack',
      (event) => {
        if (event.track.kind === 'audio') start(event.track);
      },
      { signal: abort.signal },
    );
  }
  return stop;
};
