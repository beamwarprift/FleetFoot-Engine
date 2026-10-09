import { describe, expect, it } from 'vitest';
import { toRate } from '../../../src/core/media/PlaybackRate.ts';
import {
  DEFAULT_HOLD_RATE,
  DEFAULT_RATE,
  DEFAULT_RATE_PRESETS,
  DEFAULT_SEEK_STEP_SECONDS,
  SEEK_STEP_PRESETS_SECONDS,
} from '../../../src/core/media/Presets.ts';
import { parseCommand } from '../../../src/core/messages/Validation.ts';

describe('default presets', () => {
  it('match the specification', () => {
    expect(DEFAULT_RATE_PRESETS).toEqual([0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4]);
    expect(SEEK_STEP_PRESETS_SECONDS).toEqual([5, 10, 15, 30, 60]);
    expect(DEFAULT_SEEK_STEP_SECONDS).toBe(5);
    expect(DEFAULT_HOLD_RATE).toBe(3);
    expect(DEFAULT_RATE).toBe(1);
  });

  it('are all valid rates, unchanged by the range and the grid', () => {
    for (const rate of [...DEFAULT_RATE_PRESETS, DEFAULT_HOLD_RATE, DEFAULT_RATE]) {
      expect(toRate(rate)).toBe(rate);
    }
  });

  it('are all accepted as seek steps in both directions', () => {
    for (const seconds of SEEK_STEP_PRESETS_SECONDS) {
      expect(parseCommand({ v: 1, type: 'seek', seconds })).toEqual({ type: 'seek', seconds });
      expect(parseCommand({ v: 1, type: 'seek', seconds: -seconds })).toEqual({
        type: 'seek',
        seconds: -seconds,
      });
    }
  });
});
