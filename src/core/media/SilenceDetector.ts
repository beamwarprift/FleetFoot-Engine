// Finds silences in a stream of audio blocks (level threshold, hysteresis, minimum
// speech and silence durations). Pure: it is fed each block's level and length and answers with
// the change that block causes. A silence starts only after a quiet stretch long enough for the
// mode; it ends at the first block loud enough, so speech gets its speed back at once. A sound
// shorter than the minimum speech (a click, a cough) is noise inside the silence: once it is
// over, the silence goes on without waiting its minimum again.

import type { SilenceMode } from '../messages/Protocol.ts';

export interface SilenceThresholds {
  /** Below this level (dBFS) a block is quiet. */
  readonly quietDb: number;
  /** At or above this level a silence ends; above `quietDb`, so a level hovering at the edge never flaps. */
  readonly soundDb: number;
  /** Quiet this long, in seconds, before it counts as a silence. */
  readonly minSilenceSeconds: number;
  /** A sound inside a silence shorter than this, in seconds, is noise, not speech. */
  readonly minSpeechSeconds: number;
}

/**
 * Chosen values, to be tuned on real recordings: speech peaks far above -40 dBFS and room noise
 * in recordings sits around -60 to -50 dBFS. A readier mode counts louder and shorter quiet
 * stretches as silence, and longer sounds inside one as noise; the longest stays well under a
 * spoken syllable.
 */
export const SILENCE_THRESHOLDS: Readonly<Record<SilenceMode, SilenceThresholds>> = {
  conservative: { quietDb: -50, soundDb: -45, minSilenceSeconds: 0.8, minSpeechSeconds: 0.05 },
  normal: { quietDb: -45, soundDb: -40, minSilenceSeconds: 0.45, minSpeechSeconds: 0.08 },
  aggressive: { quietDb: -40, soundDb: -36, minSilenceSeconds: 0.25, minSpeechSeconds: 0.12 },
};

export type SilenceChange = 'silence' | 'sound';

/**
 * Block lengths added up drift by rounding (nine blocks of 0.05 s make 0.4499… s): a stretch
 * this close to the minimum counts as reaching it. A nanosecond is far below one sample (about
 * 21 µs at 48 kHz), so no real quiet stretch is ever counted longer than it was.
 */
const DURATION_TOLERANCE_SECONDS = 1e-9;

function reached(seconds: number, minimum: number): boolean {
  return seconds + DURATION_TOLERANCE_SECONDS >= minimum;
}

/** The level of a block in dBFS; digital silence is minus infinity. */
export function levelDb(samples: ArrayLike<number>): number {
  let sum = 0;
  for (let index = 0; index < samples.length; index++) {
    const sample = samples[index] ?? 0;
    sum += sample * sample;
  }
  if (samples.length === 0 || sum === 0) return Number.NEGATIVE_INFINITY;
  return 10 * Math.log10(sum / samples.length);
}

export class SilenceDetector {
  readonly #thresholds: SilenceThresholds;
  #silent = false;
  #quietFor = 0;
  #heard = false;
  // Seconds of the sound that ended the last silence, while it may still turn out to be noise.
  #soundFor: number | null = null;

  constructor(thresholds: SilenceThresholds) {
    this.#thresholds = thresholds;
  }

  /** In a silence now. */
  get silent(): boolean {
    return this.#silent;
  }

  /**
   * A block loud enough to be sound has arrived at least once. Until then nothing counts as a
   * silence: a stream the browser keeps empty (another site's media) must never be sped up.
   */
  get heard(): boolean {
    return this.#heard;
  }

  /** One block: its level in dBFS and its length in seconds. */
  push(db: number, seconds: number): SilenceChange | null {
    // A block without a level or a length tells nothing: it never counts towards a silence.
    if (Number.isNaN(db) || !(Number.isFinite(seconds) && seconds > 0)) return null;
    const { quietDb, soundDb, minSilenceSeconds } = this.#thresholds;
    if (db >= soundDb) this.#heard = true;
    if (this.#silent) {
      if (db < soundDb) return null;
      this.#silent = false;
      this.#quietFor = 0;
      this.#soundFor = this.#mayBeNoise(seconds) ? seconds : null;
      return 'sound';
    }
    if (db >= quietDb) {
      this.#quietFor = 0;
      if (this.#soundFor !== null) {
        const soundFor = this.#soundFor + seconds;
        this.#soundFor = this.#mayBeNoise(soundFor) ? soundFor : null;
      }
      return null;
    }
    if (this.#soundFor !== null) {
      // The sound was too short for speech: the silence it broke goes on.
      this.#soundFor = null;
      this.#silent = true;
      return 'silence';
    }
    this.#quietFor += seconds;
    if (!this.#heard || !reached(this.#quietFor, minSilenceSeconds)) return null;
    this.#silent = true;
    return 'silence';
  }

  /** A sound this long, inside a silence, is still too short to be speech. */
  #mayBeNoise(seconds: number): boolean {
    return !reached(seconds, this.#thresholds.minSpeechSeconds);
  }

  /** Starts over, keeping what was heard: after a deliberate change, the next silence counts anew. */
  restart(): void {
    this.#silent = false;
    this.#quietFor = 0;
    this.#soundFor = null;
  }
}
