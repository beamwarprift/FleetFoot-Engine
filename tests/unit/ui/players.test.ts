import { describe, expect, it } from 'vitest';
import type { PlayerInfo } from '../../../src/core/messages/Protocol.ts';
import { isolate } from '../../../src/ui/i18n.ts';
import { playerDetails, playerLabel, playerName } from '../../../src/ui/players.ts';

// The message keys and their arguments, so the test reads what a label is made of.
const t = ((key: string, ...subs: string[]) =>
  subs.length === 0 ? key : `${key}(${subs.join(',')})`) as never;
const video: PlayerInfo = {
  id: 1,
  kind: 'video',
  playing: false,
  width: 640,
  height: 360,
  frame: null,
};
const size = isolate('640×360');

describe('player names', () => {
  it('give a short name by kind and number', () => {
    expect(playerName(t, video, 2)).toBe('playerVideo(2)');
    expect(playerName(t, { ...video, kind: 'audio' }, 3)).toBe('playerAudio(3)');
  });

  it('give the details that tell a player from the others', () => {
    expect(playerDetails(t, video)).toBe(size);
    expect(playerDetails(t, { ...video, kind: 'audio', width: 0, height: 0 })).toBe('');
    expect(playerDetails(t, { ...video, playing: true, frame: { site: 'youtube.com' } })).toBe(
      `${size} · playerEmbedded(youtube.com) · playerPlaying`,
    );
    expect(playerDetails(t, { ...video, frame: { site: null } })).toBe(
      `${size} · playerEmbeddedUnknown`,
    );
  });

  it('put the name before its details in the full label', () => {
    expect(playerLabel(t, video, 2)).toBe(`playerVideo(2) · ${size}`);
    expect(playerLabel(t, { ...video, kind: 'audio', width: 0, height: 0 }, 1)).toBe(
      'playerAudio(1)',
    );
  });
});
