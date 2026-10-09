import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseJson } from '../../../scripts/audit/json.ts';
import {
  auditManifest,
  auditPermissionDocs,
  expectedFirefoxSettings,
  parseManifestPolicy,
} from '../../../scripts/audit/manifest.ts';

const ROOT = join(import.meta.dirname, '../../..');
const policy = parseManifestPolicy(
  parseJson(readFileSync(join(ROOT, 'config/manifest-policy.json'), 'utf8'), 'policy'),
  'policy',
);
const VERSION = '1.2.3';

function chromeManifest(): Record<string, unknown> {
  return {
    manifest_version: 3,
    name: 'FleetFoot Engine',
    description: 'test',
    version: VERSION,
    permissions: ['storage', 'activeTab', 'scripting', 'contextMenus'],
    optional_host_permissions: ['http://*/*', 'https://*/*'],
    content_security_policy: { extension_pages: policy.extensionPagesCsp },
    background: { service_worker: 'background.js' },
  };
}

function firefoxManifest(): Record<string, unknown> {
  return {
    ...chromeManifest(),
    background: { scripts: ['background.js'] },
    browser_specific_settings: expectedFirefoxSettings(policy),
  };
}

function geckoWith(overrides: Record<string, unknown>): Record<string, unknown> {
  const settings = expectedFirefoxSettings(policy);
  const gecko = settings['gecko'];
  return { ...settings, gecko: { ...(typeof gecko === 'object' ? gecko : {}), ...overrides } };
}

describe('auditManifest', () => {
  it('accepts the expected manifests', () => {
    expect(auditManifest(chromeManifest(), policy, 'chrome', VERSION)).toEqual([]);
    expect(auditManifest(firefoxManifest(), policy, 'firefox', VERSION)).toEqual([]);
  });

  it('rejects an extra permission', () => {
    const manifest = {
      ...chromeManifest(),
      permissions: ['storage', 'activeTab', 'scripting', 'contextMenus', 'alarms'],
    };
    expect(auditManifest(manifest, policy, 'chrome', VERSION)).not.toEqual([]);
  });

  it('rejects a missing permission', () => {
    const manifest = {
      ...chromeManifest(),
      permissions: ['activeTab', 'scripting', 'contextMenus'],
    };
    expect(auditManifest(manifest, policy, 'chrome', VERSION)).not.toEqual([]);
  });

  it('rejects duplicated permissions', () => {
    const manifest = {
      ...chromeManifest(),
      permissions: ['storage', 'storage', 'activeTab', 'scripting', 'contextMenus'],
    };
    expect(auditManifest(manifest, policy, 'chrome', VERSION)).not.toEqual([]);
  });

  it('rejects a forbidden permission even when the expected set allows it (second key)', () => {
    const lax = { ...policy, permissions: [...policy.permissions, 'history'] };
    const manifest = { ...chromeManifest(), permissions: [...policy.permissions, 'history'] };
    const errors = auditManifest(manifest, lax, 'chrome', VERSION);
    expect(errors).toContain('forbidden permission "history" in "permissions"');
  });

  it('rejects mandatory host permissions and <all_urls>', () => {
    const hosts = { ...chromeManifest(), host_permissions: ['https://*/*'] };
    expect(auditManifest(hosts, policy, 'chrome', VERSION)).not.toEqual([]);
    const allUrls = { ...chromeManifest(), optional_host_permissions: ['<all_urls>'] };
    expect(auditManifest(allUrls, policy, 'chrome', VERSION)).toContain(
      '"<all_urls>" must not appear',
    );
  });

  it('rejects forbidden and unknown top-level keys', () => {
    const connectable = {
      ...chromeManifest(),
      externally_connectable: { matches: ['https://example.com/*'] },
    };
    expect(auditManifest(connectable, policy, 'chrome', VERSION)).toContain(
      'forbidden key "externally_connectable"',
    );
    const scripts = {
      ...chromeManifest(),
      content_scripts: [{ matches: ['https://*/*'], js: ['c.js'] }],
    };
    expect(auditManifest(scripts, policy, 'chrome', VERSION)).toContain(
      'forbidden key "content_scripts"',
    );
    const unknown = { ...chromeManifest(), update_url: 'https://example.com/update' };
    expect(auditManifest(unknown, policy, 'chrome', VERSION)).toContain(
      'unexpected top-level key "update_url"',
    );
  });

  it('rejects a weakened CSP', () => {
    const csp = {
      ...chromeManifest(),
      content_security_policy: { extension_pages: "script-src 'self'; object-src 'self'" },
    };
    expect(auditManifest(csp, policy, 'chrome', VERSION)).not.toEqual([]);
    const sandbox = {
      ...chromeManifest(),
      content_security_policy: {
        extension_pages: policy.extensionPagesCsp,
        sandbox: "script-src 'unsafe-eval'",
      },
    };
    expect(auditManifest(sandbox, policy, 'chrome', VERSION)).not.toEqual([]);
  });

  it('rejects a Firefox manifest that declares data collection or changes the add-on ID', () => {
    const collecting = {
      ...firefoxManifest(),
      browser_specific_settings: geckoWith({
        data_collection_permissions: { required: ['browsingActivity'] },
      }),
    };
    expect(auditManifest(collecting, policy, 'firefox', VERSION)).not.toEqual([]);
    const renamed = {
      ...firefoxManifest(),
      browser_specific_settings: geckoWith({ id: 'other@ffe' }),
    };
    expect(auditManifest(renamed, policy, 'firefox', VERSION)).not.toEqual([]);
    const older = {
      ...firefoxManifest(),
      browser_specific_settings: geckoWith({ strict_min_version: '115.0' }),
    };
    expect(auditManifest(older, policy, 'firefox', VERSION)).not.toEqual([]);
    expect(auditManifest(chromeManifest(), policy, 'firefox', VERSION)).not.toEqual([]);
  });

  it('rejects Firefox settings in the Chromium manifest', () => {
    expect(auditManifest(firefoxManifest(), policy, 'chrome', VERSION)).not.toEqual([]);
  });

  it('rejects a version that differs from package.json and a wrong manifest_version', () => {
    expect(auditManifest(chromeManifest(), policy, 'chrome', '9.9.9')).not.toEqual([]);
    expect(
      auditManifest({ ...chromeManifest(), manifest_version: 2 }, policy, 'chrome', VERSION),
    ).not.toEqual([]);
  });

  it('accepts browser shortcuts without a suggested key and rejects a suggested one', () => {
    const commands = { slower: { description: 'Slower' } };
    expect(auditManifest({ ...chromeManifest(), commands }, policy, 'chrome', VERSION)).toEqual([]);
    const suggested = { slower: { description: 'Slower', suggested_key: { default: 'Alt+S' } } };
    expect(
      auditManifest({ ...chromeManifest(), commands: suggested }, policy, 'chrome', VERSION),
    ).toEqual(['command "slower" must not suggest a key']);
    expect(auditManifest({ ...chromeManifest(), commands: [] }, policy, 'chrome', VERSION)).toEqual(
      ['"commands" must be an object'],
    );
  });

  it('rejects malformed manifests', () => {
    expect(auditManifest([], policy, 'chrome', VERSION)).toEqual(['manifest is not a JSON object']);
    expect(
      auditManifest({ ...chromeManifest(), permissions: 'storage' }, policy, 'chrome', VERSION),
    ).not.toEqual([]);
  });
});

describe('auditPermissionDocs', () => {
  it('requires every expected permission to be documented', () => {
    const docs = policy.permissions.map((p) => `\`${p}\``).join(' ');
    const errors = auditPermissionDocs(policy, docs);
    expect(errors).toEqual(
      policy.optionalHostPermissions.map((p) => `docs/PERMISSIONS.md does not document \`${p}\``),
    );
  });

  it('passes on the real docs/PERMISSIONS.md', () => {
    const docs = readFileSync(join(ROOT, 'docs/PERMISSIONS.md'), 'utf8');
    expect(auditPermissionDocs(policy, docs)).toEqual([]);
  });
});
