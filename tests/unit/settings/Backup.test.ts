import { describe, expect, it } from 'vitest';
import type { Rate } from '../../../src/core/media/PlaybackRate.ts';
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  backupSize,
  backupWrites,
  MAX_BACKUP_BYTES,
  readBackup,
  writeBackup,
} from '../../../src/core/settings/Backup.ts';
import { REMEMBERED_RATE_KEY } from '../../../src/core/settings/Profiles.ts';
import {
  DEFAULT_SETTINGS,
  SETTINGS_VERSION,
  VERSION_KEY,
} from '../../../src/core/settings/Settings.ts';

const rate = (value: number) => value as Rate;

/** A file as another program, an older copy or someone tampering could write it. */
const file = (fields: Record<string, unknown>) =>
  JSON.stringify({ format: BACKUP_FORMAT, version: BACKUP_VERSION, ...fields });

function read(text: string) {
  const result = readBackup(text);
  if (!result.ok) throw new Error(`refused: ${result.error}`);
  return result;
}

describe('a copy of the settings', () => {
  it('brings back exactly what it took: settings, remembered speed and sites', () => {
    const settings = { ...DEFAULT_SETTINGS, rateStep: 0.5, theme: 'sage' as const };
    const sites = [
      { site: 'b.example', profile: { playbackRate: rate(2) } },
      { site: 'a.example', profile: { preservesPitch: false, seekStep: 30 } },
    ];
    const result = read(writeBackup(settings, rate(1.75), sites));
    expect(result.ignored).toBe(0);
    expect(result.backup.settings).toEqual(settings);
    expect(result.backup.rememberedRate).toBe(1.75);
    expect(result.backup.sites).toEqual([sites[1], sites[0]]);
    expect(backupSize(result.backup)).toEqual({
      settings: Object.keys(DEFAULT_SETTINGS).length,
      sites: 2,
    });
  });

  it('leaves out the sites without a setting, and never holds the time saved', () => {
    const text = writeBackup(DEFAULT_SETTINGS, null, [{ site: 'empty.example', profile: {} }]);
    const parsed = JSON.parse(text) as Record<string, unknown>;
    expect(parsed['sites']).toEqual({});
    expect(Object.keys(parsed).sort()).toEqual(
      ['format', 'rememberedRate', 'settings', 'sites', 'version'].sort(),
    );
  });

  it.each([
    ['', 'not-json'],
    ['{', 'not-json'],
    ['null', 'not-backup'],
    ['[]', 'not-backup'],
    ['{"settings":{}}', 'not-backup'],
    [JSON.stringify({ format: 'something-else', version: 1 }), 'not-backup'],
    [JSON.stringify({ format: BACKUP_FORMAT }), 'not-backup'],
    [JSON.stringify({ format: BACKUP_FORMAT, version: '1' }), 'not-backup'],
    [JSON.stringify({ format: BACKUP_FORMAT, version: 0 }), 'not-backup'],
    [JSON.stringify({ format: BACKUP_FORMAT, version: 1.5 }), 'not-backup'],
    [JSON.stringify({ format: BACKUP_FORMAT, version: BACKUP_VERSION + 1 }), 'newer-version'],
  ])('refuses %j as %s', (text, error) => {
    expect(readBackup(text)).toEqual({ ok: false, error });
  });

  it('refuses a file larger than storage could ever hold, before reading it', () => {
    expect(readBackup(' '.repeat(MAX_BACKUP_BYTES + 1))).toEqual({
      ok: false,
      error: 'too-large',
    });
    expect(readBackup(`${file({})}${' '.repeat(MAX_BACKUP_BYTES - file({}).length)}`).ok).toBe(
      true,
    );
  });

  it('takes each setting only if storage would, and counts what it leaves out', () => {
    const result = read(
      file({
        settings: {
          rateStep: 0.5,
          seekStep: 0,
          theme: 'no-such-theme',
          presets: [],
          contextMenu: false,
          injected: 'value',
        },
      }),
    );
    expect(result.backup.settings).toEqual({ rateStep: 0.5, contextMenu: false });
    expect(result.ignored).toBe(4);
  });

  it('takes a site only under a valid site name, each profile field checked', () => {
    const result = read(
      file({
        sites: {
          'good.example': { playbackRate: 2, seekStep: 99999, extra: true },
          'https://with.scheme.example/page': { playbackRate: 2 },
          'UPPER.example': { playbackRate: 2 },
          'empty.example': {},
          'not-a-profile.example': 'fast',
        },
      }),
    );
    expect(result.backup.sites).toEqual([{ site: 'good.example', profile: { playbackRate: 2 } }]);
    // seekStep and extra on good.example, two invalid names, one profile that is not one.
    expect(result.ignored).toBe(5);
  });

  it('cannot reach the prototype of anything through its keys', () => {
    const result = read(
      `{"format":"${BACKUP_FORMAT}","version":1,"settings":{"__proto__":{"polluted":true}},` +
        `"sites":{"__proto__":{"playbackRate":2},"constructor":{"playbackRate":2}}}`,
    );
    expect(result.backup.settings).toEqual({});
    // «constructor» is a host name like «localhost»: kept, under its own prefixed storage key.
    expect(result.backup.sites).toEqual([{ site: 'constructor', profile: { playbackRate: 2 } }]);
    expect(backupWrites(result.backup)).toEqual({ 'site:constructor': { playbackRate: 2 } });
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
    expect(result.ignored).toBe(2);
  });

  it('takes a remembered speed as storage does, and a missing one as none', () => {
    expect(read(file({ rememberedRate: 1.5 })).backup.rememberedRate).toBe(1.5);
    // Out of range, a speed is brought to the nearest end, as when it is stored.
    expect(read(file({ rememberedRate: 99 })).backup.rememberedRate).toBe(16);
    expect(read(file({ rememberedRate: null })).ignored).toBe(0);
    expect(read(file({})).backup.rememberedRate).toBeNull();
    const bad = read(file({ rememberedRate: 'fast' }));
    expect(bad.backup.rememberedRate).toBeNull();
    expect(bad.ignored).toBe(1);
  });

  it('counts a settings or sites part that is not an object as one value left out', () => {
    expect(read(file({ settings: 'all', sites: [] })).ignored).toBe(2);
  });
});

describe('restoring a copy', () => {
  it('writes its settings with the layout version, its speed and its sites, nothing else', () => {
    expect(
      backupWrites({
        settings: { rateStep: 0.5 },
        rememberedRate: rate(1.5),
        sites: [{ site: 'a.example', profile: { playbackRate: rate(2) } }],
      }),
    ).toEqual({
      rateStep: 0.5,
      [VERSION_KEY]: SETTINGS_VERSION,
      [REMEMBERED_RATE_KEY]: 1.5,
      'site:a.example': { playbackRate: 2 },
    });
  });

  it('writes no layout version and no speed when the copy has neither', () => {
    expect(backupWrites({ settings: {}, rememberedRate: null, sites: [] })).toEqual({});
  });
});
