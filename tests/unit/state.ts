// A complete engine state for tests that need one; each test overrides what it is about.

import type { EngineState } from '../../src/core/messages/Protocol.ts';

export function engineState(overrides: Partial<EngineState> = {}): EngineState {
  return {
    v: 1,
    players: [{ id: 1, kind: 'video', playing: true, width: 1280, height: 720, frame: null }],
    activePlayerId: 1,
    pinned: false,
    rate: 1,
    preservesPitch: true,
    previousRate: null,
    holding: false,
    seekable: true,
    currentTime: 10,
    duration: 120,
    remaining: { original: 110, atRate: 110 },
    target: 'active',
    ratePolicy: 'smart',
    desiredRate: null,
    loop: null,
    rateContested: false,
    pip: { available: false, active: false },
    site: null,
    skipSilence: { status: 'off' },
    framedSites: [],
    ...overrides,
  };
}
