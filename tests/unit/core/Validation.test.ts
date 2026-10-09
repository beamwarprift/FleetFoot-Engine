import { describe, expect, it } from 'vitest';
import { MAX_MEDIA_SRC_LENGTH } from '../../../src/core/messages/Protocol.ts';
import { parseCommand } from '../../../src/core/messages/Validation.ts';

describe('parseCommand', () => {
  it('accepts every well-formed command', () => {
    expect(parseCommand({ v: 1, type: 'get-state' })).toEqual({ type: 'get-state' });
    expect(parseCommand({ v: 1, type: 'set-rate', rate: 1.75 })).toEqual({
      type: 'set-rate',
      rate: 1.75,
    });
    expect(parseCommand({ v: 1, type: 'set-preserves-pitch', enabled: false })).toEqual({
      type: 'set-preserves-pitch',
      enabled: false,
    });
    expect(parseCommand({ v: 1, type: 'select-player', playerId: 3 })).toEqual({
      type: 'select-player',
      playerId: 3,
    });
    expect(parseCommand({ v: 1, type: 'select-player', playerId: null })).toEqual({
      type: 'select-player',
      playerId: null,
    });
  });

  it('accepts the core control commands', () => {
    expect(parseCommand({ v: 1, type: 'adjust-rate', delta: 0.25 })).toEqual({
      type: 'adjust-rate',
      delta: 0.25,
    });
    expect(parseCommand({ v: 1, type: 'adjust-rate', delta: -0.1 })).toEqual({
      type: 'adjust-rate',
      delta: -0.1,
    });
    expect(parseCommand({ v: 1, type: 'reset-rate' })).toEqual({ type: 'reset-rate' });
    expect(parseCommand({ v: 1, type: 'previous-rate' })).toEqual({ type: 'previous-rate' });
    expect(parseCommand({ v: 1, type: 'hold-start', rate: 3 })).toEqual({
      type: 'hold-start',
      rate: 3,
    });
    expect(parseCommand({ v: 1, type: 'hold-start', rate: 40 })).toEqual({
      type: 'hold-start',
      rate: 16,
    });
    expect(parseCommand({ v: 1, type: 'hold-end' })).toEqual({ type: 'hold-end' });
    expect(parseCommand({ v: 1, type: 'set-default-rate', rate: 1.75 })).toEqual({
      type: 'set-default-rate',
      rate: 1.75,
    });
    expect(parseCommand({ v: 1, type: 'set-default-rate', rate: 0 })).toEqual({
      type: 'set-default-rate',
      rate: 0.1,
    });
    expect(parseCommand({ v: 1, type: 'set-media-rate', src: 'blob:x', rate: 2 })).toEqual({
      type: 'set-media-rate',
      src: 'blob:x',
      rate: 2,
    });
    expect(parseCommand({ v: 1, type: 'seek', seconds: -10 })).toEqual({
      type: 'seek',
      seconds: -10,
    });
    expect(parseCommand({ v: 1, type: 'seek', seconds: 3600 })).toEqual({
      type: 'seek',
      seconds: 3600,
    });
    expect(parseCommand({ v: 1, type: 'adjust-rate', delta: 16 })).toEqual({
      type: 'adjust-rate',
      delta: 16,
    });
  });

  it('accepts the advanced playback commands', () => {
    expect(parseCommand({ v: 1, type: 'set-target', target: 'all' })).toEqual({
      type: 'set-target',
      target: 'all',
    });
    expect(parseCommand({ v: 1, type: 'set-target', target: 'active' })).toEqual({
      type: 'set-target',
      target: 'active',
    });
    for (const policy of ['follow', 'smart', 'lock']) {
      expect(parseCommand({ v: 1, type: 'set-rate-policy', policy })).toEqual({
        type: 'set-rate-policy',
        policy,
      });
    }
    for (const fight of ['yield', 'braked', 'unbraked']) {
      expect(parseCommand({ v: 1, type: 'set-lock-fight', fight })).toEqual({
        type: 'set-lock-fight',
        fight,
      });
    }
    expect(parseCommand({ v: 1, type: 'loop-set-a' })).toEqual({ type: 'loop-set-a' });
    expect(parseCommand({ v: 1, type: 'loop-set-b' })).toEqual({ type: 'loop-set-b' });
    expect(parseCommand({ v: 1, type: 'loop-enable', enabled: true })).toEqual({
      type: 'loop-enable',
      enabled: true,
    });
    expect(parseCommand({ v: 1, type: 'loop-clear' })).toEqual({ type: 'loop-clear' });
  });

  it('clamps a finite rate into the range and puts it on the grid', () => {
    expect(parseCommand({ v: 1, type: 'set-rate', rate: 99 })).toEqual({
      type: 'set-rate',
      rate: 16,
    });
    expect(parseCommand({ v: 1, type: 'set-rate', rate: 0.01 })).toEqual({
      type: 'set-rate',
      rate: 0.1,
    });
    expect(parseCommand({ v: 1, type: 'set-rate', rate: 1.239 })).toEqual({
      type: 'set-rate',
      rate: 1.24,
    });
  });

  it.each([
    ['null', null],
    ['a string', 'set-rate'],
    ['an array', [1, 'set-rate']],
    ['no version', { type: 'get-state' }],
    ['another version', { v: 2, type: 'get-state' }],
    ['a string version', { v: '1', type: 'get-state' }],
    ['an unknown type', { v: 1, type: 'eval' }],
    ['a prototype key as type', { v: 1, type: '__proto__' }],
    ['an inherited key as type', { v: 1, type: 'toString' }],
    ['an extra field', { v: 1, type: 'get-state', extra: true }],
    ['a missing field', { v: 1, type: 'set-rate' }],
    ['a string rate', { v: 1, type: 'set-rate', rate: '2' }],
    ['a NaN rate', { v: 1, type: 'set-rate', rate: Number.NaN }],
    ['an infinite rate', { v: 1, type: 'set-rate', rate: Number.POSITIVE_INFINITY }],
    ['a numeric pitch flag', { v: 1, type: 'set-preserves-pitch', enabled: 1 }],
    ['a zero player id', { v: 1, type: 'select-player', playerId: 0 }],
    ['a negative player id', { v: 1, type: 'select-player', playerId: -2 }],
    ['a fractional player id', { v: 1, type: 'select-player', playerId: 1.5 }],
    ['an unsafe player id', { v: 1, type: 'select-player', playerId: 2 ** 60 }],
    ['a string player id', { v: 1, type: 'select-player', playerId: '3' }],
    ['a zero delta', { v: 1, type: 'adjust-rate', delta: 0 }],
    ['a delta beyond the range', { v: 1, type: 'adjust-rate', delta: 16.01 }],
    ['a NaN delta', { v: 1, type: 'adjust-rate', delta: Number.NaN }],
    ['a string delta', { v: 1, type: 'adjust-rate', delta: '+1' }],
    ['a hold without rate', { v: 1, type: 'hold-start' }],
    ['an infinite hold rate', { v: 1, type: 'hold-start', rate: Number.POSITIVE_INFINITY }],
    ['a hold end with a payload', { v: 1, type: 'hold-end', rate: 1 }],
    ['a default rate without rate', { v: 1, type: 'set-default-rate' }],
    ['a NaN default rate', { v: 1, type: 'set-default-rate', rate: Number.NaN }],
    ['a default rate as text', { v: 1, type: 'set-default-rate', rate: '2' }],
    ['a reset with a payload', { v: 1, type: 'reset-rate', rate: 1 }],
    ['a zero seek', { v: 1, type: 'seek', seconds: 0 }],
    ['a seek beyond one hour', { v: 1, type: 'seek', seconds: -3600.5 }],
    ['an infinite seek', { v: 1, type: 'seek', seconds: Number.NEGATIVE_INFINITY }],
    ['an unknown target', { v: 1, type: 'set-target', target: 'everything' }],
    ['a target in other case', { v: 1, type: 'set-target', target: 'ALL' }],
    ['an unknown policy', { v: 1, type: 'set-rate-policy', policy: 'force' }],
    ['a policy as array', { v: 1, type: 'set-rate-policy', policy: ['lock'] }],
    ['an unknown fight answer', { v: 1, type: 'set-lock-fight', fight: 'surrender' }],
    ['a fight answer in other case', { v: 1, type: 'set-lock-fight', fight: 'Braked' }],
    ['a fight answer with more fields', { v: 1, type: 'set-lock-fight', fight: 'yield', rate: 2 }],
    ['a fight command without its answer', { v: 1, type: 'set-lock-fight' }],
    ['a loop point with a time', { v: 1, type: 'loop-set-a', time: 4 }],
    ['a loop toggle without flag', { v: 1, type: 'loop-enable' }],
    ['a loop toggle with a string', { v: 1, type: 'loop-enable', enabled: 'true' }],
    [
      'a class instance',
      new (class Command {
        v = 1;
        type = 'get-state';
      })(),
    ],
  ])('rejects %s', (_label, input) => {
    expect(parseCommand(input)).toBeNull();
  });
});

describe('set-media-rate', () => {
  it('carries an address the protocol can hold, and a speed', () => {
    for (const src of ['', 'x'.repeat(MAX_MEDIA_SRC_LENGTH + 1), 42, null]) {
      expect(parseCommand({ v: 1, type: 'set-media-rate', src, rate: 2 }), String(src)).toBeNull();
    }
    expect(
      parseCommand({
        v: 1,
        type: 'set-media-rate',
        src: 'x'.repeat(MAX_MEDIA_SRC_LENGTH),
        rate: 2,
      }),
    ).not.toBeNull();
    expect(parseCommand({ v: 1, type: 'set-media-rate', src: 'blob:x' })).toBeNull();
    expect(parseCommand({ v: 1, type: 'set-media-rate', src: 'blob:x', rate: '2' })).toBeNull();
    expect(
      parseCommand({ v: 1, type: 'set-media-rate', src: 'blob:x', rate: 2, title: 'x' }),
    ).toBeNull();
  });
});

describe('set-skip-silence', () => {
  it('carries the switch, a known mode and a silence speed inside the offered range', () => {
    expect(
      parseCommand({
        v: 1,
        type: 'set-skip-silence',
        enabled: true,
        mode: 'aggressive',
        silenceRate: 4,
      }),
    ).toEqual({ type: 'set-skip-silence', enabled: true, mode: 'aggressive', silenceRate: 4 });
    expect(
      parseCommand({
        v: 1,
        type: 'set-skip-silence',
        enabled: false,
        mode: 'normal',
        silenceRate: 99,
      }),
    ).toEqual({ type: 'set-skip-silence', enabled: false, mode: 'normal', silenceRate: 16 });
  });

  it.each([
    ['without its switch', { mode: 'normal', silenceRate: 5 }],
    ['with a switch as text', { enabled: 'true', mode: 'normal', silenceRate: 5 }],
    ['with an unknown mode', { enabled: true, mode: 'extreme', silenceRate: 5 }],
    ['with a mode in other case', { enabled: true, mode: 'Normal', silenceRate: 5 }],
    ['without a silence speed', { enabled: true, mode: 'normal' }],
    ['with a silence speed as text', { enabled: true, mode: 'normal', silenceRate: '5' }],
    ['with a silence speed not a number', { enabled: true, mode: 'normal', silenceRate: NaN }],
    ['with more fields', { enabled: true, mode: 'normal', silenceRate: 5, rate: 2 }],
  ])('refuses one %s', (_label, fields) => {
    expect(parseCommand({ v: 1, type: 'set-skip-silence', ...fields })).toBeNull();
  });
});
