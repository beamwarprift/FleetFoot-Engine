// What counts as a silence: quiet long enough for the mode, ended by the first loud block, and
// never before anything was heard (threshold, hysteresis, minimum silence duration).

import { describe, expect, it } from 'vitest';
import {
  levelDb,
  SILENCE_THRESHOLDS,
  type SilenceChange,
  SilenceDetector,
} from '../../../src/core/media/SilenceDetector.ts';

const NORMAL = SILENCE_THRESHOLDS.normal;
const BLOCK = 0.05;
const LOUD = -20;
const QUIET = -70;

/** Feeds `count` blocks at `db` and returns the changes they caused. */
function feed(detector: SilenceDetector, db: number, count: number): SilenceChange[] {
  const changes: SilenceChange[] = [];
  for (let index = 0; index < count; index++) {
    const change = detector.push(db, BLOCK);
    if (change !== null) changes.push(change);
  }
  return changes;
}

const blocks = (seconds: number) => Math.round(seconds / BLOCK);

describe('the level of a block', () => {
  it('is the RMS in dBFS: full scale is 0, digital silence minus infinity', () => {
    expect(levelDb([1, -1, 1, -1])).toBeCloseTo(0, 10);
    expect(levelDb([0.5, -0.5])).toBeCloseTo(20 * Math.log10(0.5), 10);
    expect(levelDb([0, 0, 0])).toBe(Number.NEGATIVE_INFINITY);
    expect(levelDb([])).toBe(Number.NEGATIVE_INFINITY);
  });
});

describe('a silence', () => {
  it('starts once the quiet has lasted the mode’s minimum, not one block before', () => {
    const detector = new SilenceDetector(NORMAL);
    feed(detector, LOUD, 4);
    const needed = Math.ceil(NORMAL.minSilenceSeconds / BLOCK - 1e-9);
    expect(feed(detector, QUIET, needed - 1)).toEqual([]);
    expect(feed(detector, QUIET, 1)).toEqual(['silence']);
    expect(detector.silent).toBe(true);
  });

  it('ends at the first loud block, at once', () => {
    const detector = new SilenceDetector(NORMAL);
    feed(detector, LOUD, 4);
    feed(detector, QUIET, blocks(1));
    expect(feed(detector, LOUD, 1)).toEqual(['sound']);
    expect(detector.silent).toBe(false);
  });

  it('never starts before a sound was heard: an empty stream is never sped up', () => {
    const detector = new SilenceDetector(NORMAL);
    expect(feed(detector, Number.NEGATIVE_INFINITY, blocks(30))).toEqual([]);
    expect(detector.heard).toBe(false);
  });

  it('does not flap on a level between the two thresholds', () => {
    const detector = new SilenceDetector(NORMAL);
    feed(detector, LOUD, 4);
    feed(detector, QUIET, blocks(1));
    const between = (NORMAL.quietDb + NORMAL.soundDb) / 2;
    expect(feed(detector, between, blocks(2))).toEqual([]);
    expect(detector.silent).toBe(true);
  });

  it('needs the quiet to be unbroken: a block above the quiet level starts the count over', () => {
    const detector = new SilenceDetector(NORMAL);
    feed(detector, LOUD, 4);
    const almost = blocks(NORMAL.minSilenceSeconds) - 1;
    const between = (NORMAL.quietDb + NORMAL.soundDb) / 2;
    expect(feed(detector, QUIET, almost)).toEqual([]);
    expect(feed(detector, between, 1)).toEqual([]);
    expect(feed(detector, QUIET, almost)).toEqual([]);
  });

  it('ignores a block without a level or a length', () => {
    const detector = new SilenceDetector(NORMAL);
    feed(detector, LOUD, 4);
    for (const [db, seconds] of [
      [Number.NaN, BLOCK],
      [QUIET, Number.NaN],
      [QUIET, 0],
      [QUIET, -1],
      [QUIET, Number.POSITIVE_INFINITY],
    ] as const) {
      expect(detector.push(db, seconds)).toBeNull();
    }
    expect(feed(detector, QUIET, blocks(NORMAL.minSilenceSeconds) - 1)).toEqual([]);
  });

  it('starts over after a restart, keeping what was heard', () => {
    const detector = new SilenceDetector(NORMAL);
    feed(detector, LOUD, 4);
    feed(detector, QUIET, blocks(1));
    detector.restart();
    expect(detector.silent).toBe(false);
    expect(detector.heard).toBe(true);
    expect(feed(detector, QUIET, blocks(1))).toEqual(['silence']);
  });

  it('treats a sound shorter than speech as noise: the silence goes on once it is over', () => {
    const detector = new SilenceDetector(NORMAL);
    feed(detector, LOUD, 4);
    feed(detector, QUIET, blocks(1));
    const short = Math.ceil(NORMAL.minSpeechSeconds / BLOCK - 1e-9) - 1;
    expect(short).toBeGreaterThan(0);
    expect(feed(detector, LOUD, short)).toEqual(['sound']);
    expect(detector.silent).toBe(false);
    expect(feed(detector, QUIET, 1)).toEqual(['silence']);
  });

  it('treats a sound as long as speech as speech: the next silence waits its minimum again', () => {
    const detector = new SilenceDetector(NORMAL);
    feed(detector, LOUD, 4);
    feed(detector, QUIET, blocks(1));
    const speech = Math.ceil(NORMAL.minSpeechSeconds / BLOCK - 1e-9);
    expect(feed(detector, LOUD, speech)).toEqual(['sound']);
    const needed = Math.ceil(NORMAL.minSilenceSeconds / BLOCK - 1e-9);
    expect(feed(detector, QUIET, needed - 1)).toEqual([]);
    expect(feed(detector, QUIET, 1)).toEqual(['silence']);
  });

  it('counts the level between the thresholds as part of the sound, not as quiet', () => {
    const detector = new SilenceDetector(NORMAL);
    feed(detector, LOUD, 4);
    feed(detector, QUIET, blocks(1));
    const between = (NORMAL.quietDb + NORMAL.soundDb) / 2;
    expect(feed(detector, LOUD, 1)).toEqual(['sound']);
    feed(detector, between, Math.ceil(NORMAL.minSpeechSeconds / BLOCK));
    expect(feed(detector, QUIET, 1)).toEqual([]);
  });

  it('takes one long block as speech at once', () => {
    const detector = new SilenceDetector(NORMAL);
    feed(detector, LOUD, 4);
    feed(detector, QUIET, blocks(1));
    expect(detector.push(LOUD, NORMAL.minSpeechSeconds)).toBe('sound');
    expect(feed(detector, QUIET, 1)).toEqual([]);
  });

  it('forgets a sound that may be noise on a restart', () => {
    const detector = new SilenceDetector(NORMAL);
    feed(detector, LOUD, 4);
    feed(detector, QUIET, blocks(1));
    feed(detector, LOUD, 1);
    detector.restart();
    expect(feed(detector, QUIET, 1)).toEqual([]);
  });

  it('comes readier from conservative to aggressive', () => {
    const { conservative, normal, aggressive } = SILENCE_THRESHOLDS;
    expect(conservative.minSilenceSeconds).toBeGreaterThan(normal.minSilenceSeconds);
    expect(normal.minSilenceSeconds).toBeGreaterThan(aggressive.minSilenceSeconds);
    expect(conservative.quietDb).toBeLessThan(normal.quietDb);
    expect(normal.quietDb).toBeLessThan(aggressive.quietDb);
    expect(conservative.minSpeechSeconds).toBeLessThan(normal.minSpeechSeconds);
    expect(normal.minSpeechSeconds).toBeLessThan(aggressive.minSpeechSeconds);
    for (const mode of [conservative, normal, aggressive]) {
      expect(mode.soundDb).toBeGreaterThan(mode.quietDb);
    }
  });
});
