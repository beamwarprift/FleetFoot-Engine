import { describe, expect, it } from 'vitest';
import type { Rate } from '../../../src/core/media/PlaybackRate.ts';
import {
  applyPatch,
  PROFILE_PATCH_MESSAGE,
  parseProfilePatch,
  profilePatchMessage,
} from '../../../src/core/settings/ProfilePatch.ts';

const rate = (value: number) => value as Rate;
const message = (fields: Record<string, unknown>) => ({
  type: PROFILE_PATCH_MESSAGE,
  site: 'a.example',
  patch: { seekStep: 10 },
  ...fields,
});

describe('a patch to a site profile', () => {
  it('sets the fields it names, clears the ones set to null, and keeps the others', () => {
    const current = { playbackRate: rate(2), seekStep: 10, preservesPitch: false };
    expect(applyPatch(current, { seekStep: 30, preservesPitch: null })).toEqual({
      playbackRate: 2,
      seekStep: 30,
    });
    expect(applyPatch(current, null)).toEqual({});
    expect(current).toEqual({ playbackRate: 2, seekStep: 10, preservesPitch: false });
  });

  it('arrives as sent when it is valid, a forgotten profile included', () => {
    const sent = profilePatchMessage('a.example', { lockFight: 'unbraked', holdRate: null });
    expect(parseProfilePatch(JSON.parse(JSON.stringify(sent)))).toEqual(sent);
    expect(parseProfilePatch(message({ patch: null }))?.patch).toBeNull();
    // A speed outside the range is brought to its nearest end, as when it is stored.
    expect(parseProfilePatch(message({ patch: { playbackRate: 99 } }))?.patch).toEqual({
      playbackRate: 16,
    });
  });

  it.each([
    ['nothing', null],
    ['an array', []],
    ['another message', message({ type: 'fleetfoot-engine.time-saved' })],
    ['an extra field', message({ from: 'page' })],
    ['no patch', { type: PROFILE_PATCH_MESSAGE, site: 'a.example', other: 1 }],
    ['a site with a scheme', message({ site: 'https://a.example' })],
    ['a site in capitals', message({ site: 'A.example' })],
    ['a site that is not a string', message({ site: 42 })],
    ['an empty patch', message({ patch: {} })],
    ['a patch as an array', message({ patch: [] })],
    ['an unknown field', message({ patch: { title: 'what was watched' } })],
    ['an invalid value', message({ patch: { seekStep: 0 } })],
    ['one invalid value among valid ones', message({ patch: { seekStep: 10, lockFight: 'x' } })],
    [
      'a prototype key',
      JSON.parse(
        `{"type":"${PROFILE_PATCH_MESSAGE}","site":"a.example","patch":{"__proto__":{"seekStep":10}}}`,
      ),
    ],
  ])('refuses %s whole', (_, value) => {
    expect(parseProfilePatch(value)).toBeNull();
  });
});
