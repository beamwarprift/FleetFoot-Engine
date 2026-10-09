// Local media for the browser tests: a real WAV tone built in memory, so playback, duration and
// pitch handling are the browser's own. No external file, no network.

const SAMPLE_RATE = 8000;

/** Sound then silence, repeated: `sound` seconds of tone, `silence` seconds of digital zero. */
export interface Pattern {
  readonly sound: number;
  readonly silence: number;
}

function wavBytes(seconds: number, pattern?: Pattern): Uint8Array<ArrayBuffer> {
  const samples = Math.round(SAMPLE_RATE * seconds);
  const buffer = new ArrayBuffer(44 + samples * 2);
  const view = new DataView(buffer);
  const ascii = (offset: number, text: string): void => {
    for (let index = 0; index < text.length; index++)
      view.setUint8(offset + index, text.charCodeAt(index));
  };
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + samples * 2, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, samples * 2, true);
  for (let index = 0; index < samples; index++) {
    const time = index / SAMPLE_RATE;
    const quiet =
      pattern !== undefined && time % (pattern.sound + pattern.silence) >= pattern.sound;
    // 440 Hz at a quarter of full scale.
    const value = quiet
      ? 0
      : Math.round(Math.sin((2 * Math.PI * 440 * index) / SAMPLE_RATE) * 8192);
    view.setInt16(44 + index * 2, value, true);
  }
  return new Uint8Array(buffer);
}

const urls: string[] = [];
// Every media element a test created, wherever it lives (shadow roots and iframes included).
const created: HTMLMediaElement[] = [];

/** Registers a media element built outside `mountMedia`, so that `resetPage` releases it. */
export function track<T extends HTMLMediaElement>(media: T): T {
  created.push(media);
  return media;
}

export function toneUrl(seconds: number, pattern?: Pattern): string {
  const url = URL.createObjectURL(new Blob([wavBytes(seconds, pattern)], { type: 'audio/wav' }));
  urls.push(url);
  return url;
}

export interface MountOptions {
  readonly kind?: 'video' | 'audio';
  readonly width?: number;
  readonly height?: number;
  readonly seconds?: number;
  /** Tone and silence in turn instead of a steady tone. */
  readonly pattern?: Pattern;
  readonly style?: string;
  readonly parent?: HTMLElement;
}

export function mountMedia(options: MountOptions = {}): HTMLMediaElement {
  const media = document.createElement(options.kind ?? 'video');
  media.src = toneUrl(options.seconds ?? 120, options.pattern);
  media.preload = 'auto';
  if (media instanceof HTMLVideoElement) {
    media.style.width = `${options.width ?? 640}px`;
    media.style.height = `${options.height ?? 360}px`;
    media.style.display = 'block';
  }
  if (options.style !== undefined) media.style.cssText += options.style;
  (options.parent ?? document.body).append(media);
  return track(media);
}

export async function loaded(media: HTMLMediaElement): Promise<void> {
  if (media.readyState >= HTMLMediaElement.HAVE_METADATA) return;
  await new Promise<void>((resolve, reject) => {
    media.addEventListener('loadedmetadata', () => resolve(), { once: true });
    media.addEventListener('error', () => reject(new Error('media failed to load')), {
      once: true,
    });
  });
}

function nextEvent(media: HTMLMediaElement, type: string): Promise<void> {
  return new Promise((resolve) => media.addEventListener(type, () => resolve(), { once: true }));
}

const PROGRESS_EVENTS = ['timeupdate', 'seeking', 'seeked', 'ratechange'] as const;

/**
 * Resolves when `check` holds, re-checked on the media's own progress events: no polling. One
 * deadline turns a condition that never comes into a failure.
 */
export function until(
  media: HTMLMediaElement,
  check: () => boolean,
  timeoutMs = 4000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = new AbortController();
    const deadline = setTimeout(() => {
      abort.abort();
      reject(new Error('condition not reached in time'));
    }, timeoutMs);
    const evaluate = (): void => {
      if (!check()) return;
      clearTimeout(deadline);
      abort.abort();
      resolve();
    };
    for (const type of PROGRESS_EVENTS) {
      media.addEventListener(type, evaluate, { signal: abort.signal });
    }
    evaluate();
  });
}

/** Enough data to play, as a page the user is already watching has. */
export async function ready(media: HTMLMediaElement): Promise<void> {
  if (media.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) await nextEvent(media, 'canplay');
}

/**
 * Moves the position the way a viewer does: one seek at a time, each completed. Several seeks
 * queued on a medium that only has its metadata can leave Chromium seeking forever.
 */
export async function seekTo(media: HTMLMediaElement, seconds: number): Promise<void> {
  const done = nextEvent(media, 'seeked');
  media.currentTime = seconds;
  await done;
}

/** Waits for a seek the engine started, if one is in progress. */
export async function seekSettled(media: HTMLMediaElement): Promise<void> {
  if (media.seeking) await nextEvent(media, 'seeked');
}

/** Muted playback is allowed without a user gesture in every browser under test. */
export async function playMuted(media: HTMLMediaElement): Promise<void> {
  media.muted = true;
  await media.play();
}

/**
 * Media events (`ratechange`, `loadstart`, …) are queued as tasks: lets the ones already queued
 * fire. A time margin, not a completion signal: the suites using it have been green with 80 ms
 * in CI on Chromium and Firefox.
 */
export function eventsDelivered(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 80));
}

/** MutationObserver callbacks run as microtasks after the DOM change. */
export function mutationsDelivered(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Releases every created media element. A removed element keeps its decoder until it is
 * collected, and a page holds a limited number of media players: without releasing them, a long
 * suite runs out and `play()` never settles.
 */
export function resetPage(): void {
  for (const media of created.splice(0)) {
    media.pause();
    media.removeAttribute('src');
    media.srcObject = null;
    media.load();
    media.remove();
  }
  document.body.replaceChildren();
  // A page's text size zooms the root: the next test starts at the normal size.
  document.documentElement.style.removeProperty('zoom');
  window.scrollTo(0, 0);
  for (const url of urls.splice(0)) URL.revokeObjectURL(url);
}
