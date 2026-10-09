import { describe, expect, it } from 'vitest';
import { MAX_MEDIA_SRC_LENGTH } from '../../../src/core/messages/Protocol.ts';
import {
  MENU_FAVORITE,
  menuCommand,
  menuRate,
  menuRateId,
} from '../../../src/core/settings/ContextMenu.ts';
import { DEFAULT_SETTINGS } from '../../../src/core/settings/Settings.ts';

describe('the right-click menu', () => {
  it('stands for its speeds and the favorite one, and nothing else', () => {
    expect(menuRate(menuRateId(1.5), DEFAULT_SETTINGS)).toBe(1.5);
    expect(menuRate(MENU_FAVORITE, { ...DEFAULT_SETTINGS, favoriteRate: 2.25 as never })).toBe(
      2.25,
    );
    for (const id of ['speed-3', 'speed-', 'other', 7])
      expect(menuRate(id, DEFAULT_SETTINGS)).toBeNull();
  });

  it('acts on the media the user clicked when the browser names it', () => {
    expect(menuCommand(2, 'blob:https://example.com/1')).toEqual({
      v: 1,
      type: 'set-media-rate',
      src: 'blob:https://example.com/1',
      rate: 2,
    });
  });

  it('falls back to the active player without an address the protocol can carry', () => {
    for (const src of [
      undefined,
      '',
      `data:video/mp4;base64,${'A'.repeat(MAX_MEDIA_SRC_LENGTH)}`,
    ]) {
      expect(menuCommand(2, src)).toEqual({ v: 1, type: 'set-rate', rate: 2 });
    }
  });
});
