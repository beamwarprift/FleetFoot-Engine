// What a release records: versions in order, the changelog section, checksums in the format
// sha256sum checks, and every change of permissions or manifest since the release before.

import { describe, expect, it } from 'vitest';
import {
  changelogSection,
  compareVersions,
  manifestChanges,
  parseVersion,
  permissionsOf,
  previousVersion,
  releaseNotes,
  sha256Sums,
} from '../../../scripts/release/record.ts';

describe('versions', () => {
  it.each(['1.0.0', '0.1.0', '10.20.30'])('%s is MAJOR.MINOR.PATCH', (version) => {
    expect(parseVersion(version)).toBeDefined();
  });

  it.each(['1.0', '1.0.0.0', '01.0.0', '1.0.0-rc.1', 'v1.0.0', '', '1.a.0'])(
    '%s is not',
    (version) => {
      expect(parseVersion(version)).toBeUndefined();
    },
  );

  it('compare by number, not by text', () => {
    expect(compareVersions('1.10.0', '1.9.0')).toBeGreaterThan(0);
    expect(compareVersions('2.0.0', '10.0.0')).toBeLessThan(0);
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0);
  });

  it('the previous release is the latest one before, ignoring other names', () => {
    expect(previousVersion(['1.0.0', '1.10.0', '1.9.0', 'notes', '2.0.0'], '1.11.0')).toBe(
      '1.10.0',
    );
    expect(previousVersion(['1.0.0'], '1.0.0')).toBeUndefined();
    expect(previousVersion([], '1.0.0')).toBeUndefined();
  });
});

describe('the changelog', () => {
  const text =
    '# Changelog\n\nIntro.\n\n## 1.1.0\n\n- second\n  wrapped\n### Fixed\n- a fix\n\n## 1.0.0\n\n- first\n';

  it('gives the section of a version, up to the next version', () => {
    expect(changelogSection(text, '1.1.0')).toBe('- second\n  wrapped\n### Fixed\n- a fix');
    expect(changelogSection(text, '1.0.0')).toBe('- first');
  });

  it('has a version only with its own heading and text under it', () => {
    expect(changelogSection(text, '1.0.1')).toBeUndefined();
    expect(changelogSection(text, '1.1')).toBeUndefined();
    expect(changelogSection('### 1.0.0\n- 1.0.0 mentioned', '1.0.0')).toBeUndefined();
    expect(changelogSection('## 1.0.0\n\n## 0.9.0\n- old', '1.0.0')).toBeUndefined();
    expect(changelogSection('## 1.0.0\n   \n', '1.0.0')).toBeUndefined();
  });

  it('reads a changelog written with Windows line ends', () => {
    expect(changelogSection('## 1.0.0\r\n- first\r\n## 0.9.0\r\n', '1.0.0')).toBe('- first');
  });

  it('the release notes open with the section and say how to check a download', () => {
    const notes = releaseNotes('- first', 'owner/repo');
    expect(notes.startsWith('- first\n\n### Checking a download\n')).toBe(true);
    expect(notes).toContain('sha256sum -c SHA256SUMS');
    expect(notes).toContain('gh attestation verify <package> --repo owner/repo');
  });
});

describe('checksums', () => {
  it('are one sorted "<hash>  <file>" line per package', () => {
    expect(
      sha256Sums([
        { file: 'b.zip', sha256: 'bb' },
        { file: 'a.zip', sha256: 'aa' },
      ]),
    ).toBe('aa  a.zip\nbb  b.zip\n');
  });
});

describe('manifest changes', () => {
  const before = {
    manifest_version: 3,
    version: '1.0.0',
    permissions: ['storage', 'activeTab'],
    optional_host_permissions: ['https://*/*'],
    action: { default_title: 'A', default_popup: 'popup.html' },
  };

  it('reads the permissions sorted, and none where a list is missing or malformed', () => {
    expect(permissionsOf({ permissions: ['tabs', 'storage', 3] })).toEqual({
      permissions: ['storage', 'tabs'],
      optional_permissions: [],
      host_permissions: [],
      optional_host_permissions: [],
    });
  });

  it('are none when only the version changes, or only the order', () => {
    const after = {
      ...before,
      version: '1.1.0',
      permissions: ['activeTab', 'storage'],
      action: { default_popup: 'popup.html', default_title: 'A' },
    };
    expect(manifestChanges('chrome', before, after)).toEqual([]);
  });

  it('name each permission added or removed, and each other key added, removed or changed', () => {
    const after = {
      manifest_version: 3,
      version: '1.1.0',
      permissions: ['storage', 'tabs'],
      optional_host_permissions: ['https://*/*'],
      host_permissions: ['https://example.com/*'],
      action: { default_title: 'B', default_popup: 'popup.html' },
      icons: { '16': 'icon/16.png' },
    };
    expect(manifestChanges('chrome', before, after)).toEqual([
      'chrome: permissions adds tabs',
      'chrome: permissions removes activeTab',
      'chrome: host_permissions adds https://example.com/*',
      'chrome: changes action',
      'chrome: adds icons',
    ]);
    expect(manifestChanges('firefox', after, before)).toContain('firefox: removes icons');
  });
});
