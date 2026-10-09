import { describe, expect, it } from 'vitest';
import { parseEngineState, parseResponse } from '../../../src/core/messages/StateValidation.ts';
import { engineState } from '../state.ts';

describe('parseEngineState', () => {
  it('accepts a state shaped like the contract', () => {
    const state = engineState({ loop: { a: null, b: 4, enabled: false }, remaining: null });
    expect(parseEngineState(state)).toEqual(state);
  });

  it('accepts the site of the frame, or none', () => {
    expect(parseEngineState(engineState({ site: 'youtube.com' }))?.site).toBe('youtube.com');
    expect(parseEngineState(engineState({ site: null }))?.site).toBeNull();
  });

  it('accepts a player in the top frame or in an embedded one', () => {
    const player = engineState().players[0];
    if (player === undefined) throw new Error('no player');
    for (const frame of [null, { site: 'youtube.com' }, { site: null }]) {
      const state = engineState({ players: [{ ...player, frame }] });
      expect(parseEngineState(state)?.players[0]?.frame).toEqual(frame);
    }
    for (const frame of [undefined, 'top', { site: 'https://youtube.com/embed/x' }, { site: 1 }]) {
      const state = { ...engineState(), players: [{ ...player, frame }] };
      expect(parseEngineState(state), String(frame)).toBeNull();
    }
  });

  it.each([
    ['another version', { v: 2 }],
    ['players that are not players', { players: [{ id: 'x' }] }],
    ['an unknown target', { target: 'some' }],
    ['an unknown policy', { ratePolicy: 'hard' }],
    ['a rate that is not a number', { rate: '2' }],
    ['an infinite position', { currentTime: Number.POSITIVE_INFINITY }],
    ['a malformed loop', { loop: { a: 1 } }],
    ['a malformed remaining time', { remaining: { original: 'x', atRate: null } }],
    ['a missing PiP state', { pip: null }],
    ['a contested flag that is not a boolean', { rateContested: 1 }],
    ['a site that is not a site', { site: 'https://example.com/watch?v=1' }],
    ['a site that is not text', { site: 42 }],
    ['a missing Skip Silence state', { skipSilence: undefined }],
    ['an unknown Skip Silence status', { skipSilence: { status: 'paused' } }],
    ['a Skip Silence status that is not text', { skipSilence: { status: 1 } }],
    ['framed sites missing', { framedSites: undefined }],
    ['framed sites that are not sites', { framedSites: ['https://a.example/x'] }],
    ['a framed site that is null', { framedSites: [null] }],
    [
      'too many framed sites',
      { framedSites: ['a.example', 'b.example', 'c.example', 'd.example'] },
    ],
  ])('refuses %s', (_, overrides) => {
    expect(parseEngineState({ ...engineState(), ...overrides })).toBeNull();
  });

  it('accepts the sites of frames that may hold the player', () => {
    const state = engineState({ framedSites: ['vixcloud.co', 'player.example'] });
    expect(parseEngineState(state)?.framedSites).toEqual(['vixcloud.co', 'player.example']);
  });

  it('accepts every Skip Silence status', () => {
    for (const status of ['off', 'waiting', 'listening', 'skipping', 'unavailable'] as const) {
      const state = engineState({ skipSilence: { status } });
      expect(parseEngineState(state)?.skipSilence, status).toEqual({ status });
    }
  });

  it('refuses anything that is not an object', () => {
    for (const value of [null, undefined, 1, 'state', []])
      expect(parseEngineState(value)).toBeNull();
  });
});

describe('parseResponse', () => {
  it('accepts success and known errors only', () => {
    const state = engineState();
    expect(parseResponse({ ok: true, state })).toEqual({ ok: true, state });
    expect(parseResponse({ ok: false, error: 'no-player', state })).toEqual({
      ok: false,
      error: 'no-player',
      state,
    });
    expect(parseResponse({ ok: false, error: 'boom', state })).toBeNull();
    expect(parseResponse({ ok: 'yes', state })).toBeNull();
    expect(parseResponse({ ok: true, state: {} })).toBeNull();
  });
});
