import { describe, expect, it } from 'vitest';
import {
  formatClock,
  formatTimestamp,
  remainingTime,
} from '../../../src/core/media/RemainingTime.ts';

describe('remainingTime', () => {
  it('divides what is left by the rate (42:00 at 2× is 21:00)', () => {
    expect(remainingTime(3000, 480, 2)).toEqual({ original: 2520, atRate: 1260 });
    expect(remainingTime(600, 150, 1.5)).toEqual({ original: 450, atRate: 300 });
    expect(remainingTime(600, 150, 0.5)).toEqual({ original: 450, atRate: 900 });
  });

  it('never goes negative past the end', () => {
    expect(remainingTime(600, 612.4, 1.75)).toEqual({ original: 0, atRate: 0 });
  });

  it('has no estimate for live, infinite or unknown durations', () => {
    expect(remainingTime(Number.POSITIVE_INFINITY, 30, 2)).toBeNull();
    expect(remainingTime(Number.NaN, 30, 2)).toBeNull();
    expect(remainingTime(0, 0, 2)).toBeNull();
    expect(remainingTime(600, Number.NaN, 2)).toBeNull();
  });

  it('keeps the 1× figure when the media is not advancing', () => {
    expect(remainingTime(600, 100, 0)).toEqual({ original: 500, atRate: null });
  });
});

describe('formatClock', () => {
  it('writes MM:SS for short content and HH:MM:SS for long content', () => {
    expect(formatClock(0, false)).toBe('00:00');
    expect(formatClock(65.9, false)).toBe('01:05');
    expect(formatClock(2520, false)).toBe('42:00');
    expect(formatClock(1260, false)).toBe('21:00');
    expect(formatClock(3725, true)).toBe('01:02:05');
    expect(formatClock(45296, true)).toBe('12:34:56');
    expect(formatClock(59, true)).toBe('00:00:59');
  });

  it('rejects values that are not a position', () => {
    expect(formatClock(-1, false)).toBeNull();
    expect(formatClock(Number.NaN, true)).toBeNull();
    expect(formatClock(Number.POSITIVE_INFINITY, true)).toBeNull();
  });
});

describe('formatTimestamp', () => {
  it('follows the length of the content', () => {
    expect(formatTimestamp(754, 2520)).toBe('12:34');
    expect(formatTimestamp(754, 3600)).toBe('00:12:34');
    expect(formatTimestamp(754, 5400)).toBe('00:12:34');
  });

  it('uses the position reached when the duration is unknown or live', () => {
    expect(formatTimestamp(754, Number.POSITIVE_INFINITY)).toBe('12:34');
    expect(formatTimestamp(3725, Number.NaN)).toBe('01:02:05');
  });
});
