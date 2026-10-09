import { describe, expect, it } from 'vitest';
import {
  NEAR_ZERO_AREA_PX2,
  type PlayerSnapshot,
  penalties,
  rankPlayers,
  SHORT_PREVIEW_SECONDS,
  selectActive,
} from '../../../src/core/media/MediaSelector.ts';

// A typical main player: a 1280×720 video, fully visible, paused, with sound, 42 minutes long.
function video(id: number, overrides: Partial<PlayerSnapshot> = {}): PlayerSnapshot {
  return {
    id,
    kind: 'video',
    connected: true,
    playing: false,
    ended: false,
    visibleArea: 1280 * 720,
    width: 1280,
    height: 720,
    audible: true,
    duration: 2520,
    lastInteractionAt: null,
    discoveryOrder: id,
    ...overrides,
  };
}

function audio(id: number, overrides: Partial<PlayerSnapshot> = {}): PlayerSnapshot {
  return video(id, { kind: 'audio', visibleArea: 0, width: 0, height: 0, ...overrides });
}

function ids(players: readonly PlayerSnapshot[]): number[] {
  return rankPlayers(players).map((player) => player.id);
}

describe('rankPlayers', () => {
  it('puts a playing media before a larger paused one', () => {
    expect(ids([video(1), video(2, { playing: true, visibleArea: 320 * 180 })])).toEqual([2, 1]);
  });

  it('keeps a playing media ahead of a paused one touched more recently', () => {
    const playing = video(1, { playing: true, lastInteractionAt: 200 });
    const touched = video(2, { lastInteractionAt: 5000 });
    expect(ids([playing, touched])).toEqual([1, 2]);
  });

  it('puts the last touched player before others when none is playing', () => {
    const touchedSmall = video(2, { visibleArea: 640 * 360, lastInteractionAt: 1500 });
    const touchedEarlier = video(3, { lastInteractionAt: 900 });
    expect(ids([video(1), touchedSmall, touchedEarlier])).toEqual([2, 3, 1]);
  });

  it('puts the larger visible area first among equals', () => {
    expect(
      ids([video(1, { visibleArea: 640 * 360 }), video(2, { visibleArea: 854 * 480 })]),
    ).toEqual([2, 1]);
  });

  it('puts an audible media before a muted one of the same size', () => {
    expect(ids([video(1, { audible: false }), video(2)])).toEqual([2, 1]);
  });

  it('breaks full ties with the most recently discovered media', () => {
    expect(ids([video(4), video(9), video(6)])).toEqual([9, 6, 4]);
  });

  it('never prefers a playing short preview over a paused main video', () => {
    const preview = video(2, {
      playing: true,
      audible: false,
      duration: 6.5,
      visibleArea: 320 * 180,
    });
    expect(ids([video(1), preview])).toEqual([1, 2]);
  });

  it('never prefers an ended or invisible video', () => {
    const ended = video(2, { ended: true });
    const hidden = video(3, { playing: true, visibleArea: 0 });
    const tracking = video(4, { playing: true, visibleArea: 1 });
    expect(ids([ended, hidden, tracking, video(1, { visibleArea: 400 * 225 })])[0]).toBe(1);
  });

  it('does not penalise an <audio> for having no box', () => {
    const podcast = audio(2, { playing: true });
    expect(ids([video(1), podcast])).toEqual([2, 1]);
    expect(penalties(podcast)).toEqual([]);
  });

  it('ranks disconnected media last', () => {
    expect(
      ids([video(1, { connected: false, playing: true }), video(2, { visibleArea: 200 * 200 })]),
    ).toEqual([2, 1]);
  });
});

describe('penalties', () => {
  it('names each penalty at its threshold', () => {
    expect(penalties(video(1, { visibleArea: NEAR_ZERO_AREA_PX2 - 1 }))).toEqual(['invisible']);
    expect(penalties(video(1, { visibleArea: NEAR_ZERO_AREA_PX2 }))).toEqual([]);
    expect(penalties(video(1, { duration: SHORT_PREVIEW_SECONDS - 0.1 }))).toEqual([
      'short-preview',
    ]);
    expect(penalties(video(1, { duration: SHORT_PREVIEW_SECONDS }))).toEqual([]);
    expect(penalties(video(1, { ended: true }))).toEqual(['ended']);
  });

  it('does not treat unknown or live durations as short', () => {
    expect(penalties(video(1, { duration: Number.NaN }))).toEqual([]);
    expect(penalties(video(1, { duration: Number.POSITIVE_INFINITY }))).toEqual([]);
    expect(penalties(video(1, { duration: 0 }))).toEqual([]);
  });
});

describe('selectActive', () => {
  it('returns the best ranked player when nothing is pinned', () => {
    const ranked = rankPlayers([video(1), video(2, { playing: true })]);
    expect(selectActive(ranked, null)).toEqual({ player: ranked[0], pinned: false });
  });

  it('keeps an explicit choice even when another player ranks higher', () => {
    const ranked = rankPlayers([video(1, { playing: true }), video(2, { visibleArea: 200 * 120 })]);
    const { player, pinned } = selectActive(ranked, 2);
    expect(player?.id).toBe(2);
    expect(pinned).toBe(true);
  });

  it('falls back to automatic selection when the pinned player is gone', () => {
    const ranked = rankPlayers([video(1), video(2, { connected: false })]);
    expect(selectActive(ranked, 2)).toEqual({ player: ranked[0], pinned: false });
    expect(selectActive(ranked, 77)).toEqual({ player: ranked[0], pinned: false });
  });

  it('selects nothing on a page without connected media', () => {
    expect(selectActive([], null)).toEqual({ player: null, pinned: false });
    expect(selectActive(rankPlayers([video(1, { connected: false })]), null)).toEqual({
      player: null,
      pinned: false,
    });
  });
});
