// Manifest audit. Compares a generated manifest against config/manifest-policy.json.
// Two independent keys: exact equality with the expected permission sets, and a hard denylist that
// still fails if someone adds a forbidden permission to both the manifest and the expected set.

import {
  isObject,
  type JsonObject,
  readNumber,
  readObject,
  readString,
  readStringArray,
} from './json.ts';

export type Target = 'chrome' | 'firefox';

export interface ManifestPolicy {
  readonly manifestVersion: number;
  readonly allowedTopLevelKeys: readonly string[];
  readonly permissions: readonly string[];
  readonly optionalPermissions: readonly string[];
  readonly hostPermissions: readonly string[];
  readonly optionalHostPermissions: readonly string[];
  readonly forbiddenPermissions: readonly string[];
  readonly forbiddenKeys: readonly string[];
  readonly extensionPagesCsp: string;
  readonly gecko: {
    readonly id: string;
    readonly strictMinVersion: string;
    readonly androidStrictMinVersion: string;
    readonly dataCollectionRequired: readonly string[];
  };
}

export function parseManifestPolicy(value: unknown, source: string): ManifestPolicy {
  const obj = readObject(value, source);
  const gecko = readObject(obj['gecko'], `${source} gecko`);
  return {
    manifestVersion: readNumber(obj, 'manifestVersion', source),
    allowedTopLevelKeys: readStringArray(obj, 'allowedTopLevelKeys', source),
    permissions: readStringArray(obj, 'permissions', source),
    optionalPermissions: readStringArray(obj, 'optionalPermissions', source),
    hostPermissions: readStringArray(obj, 'hostPermissions', source),
    optionalHostPermissions: readStringArray(obj, 'optionalHostPermissions', source),
    forbiddenPermissions: readStringArray(obj, 'forbiddenPermissions', source),
    forbiddenKeys: readStringArray(obj, 'forbiddenKeys', source),
    extensionPagesCsp: readString(obj, 'extensionPagesCsp', source),
    gecko: {
      id: readString(gecko, 'id', `${source} gecko`),
      strictMinVersion: readString(gecko, 'strictMinVersion', `${source} gecko`),
      androidStrictMinVersion: readString(gecko, 'androidStrictMinVersion', `${source} gecko`),
      dataCollectionRequired: readStringArray(gecko, 'dataCollectionRequired', `${source} gecko`),
    },
  };
}

const PERMISSION_KEYS = [
  ['permissions', 'permissions'],
  ['optional_permissions', 'optionalPermissions'],
  ['host_permissions', 'hostPermissions'],
  ['optional_host_permissions', 'optionalHostPermissions'],
] as const;

function optionalStringArray(manifest: JsonObject, key: string): string[] | 'invalid' {
  const value = manifest[key];
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every((item): item is string => typeof item === 'string')) {
    return 'invalid';
  }
  return value;
}

function sameSet(actual: readonly string[], expected: readonly string[]): boolean {
  const a = new Set(actual);
  const e = new Set(expected);
  return a.size === actual.length && a.size === e.size && [...a].every((item) => e.has(item));
}

function sameJson(actual: unknown, expected: unknown): boolean {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

// Key order matters: the comparison is on serialized JSON, in the order WXT emits.
export function expectedFirefoxSettings(policy: ManifestPolicy): JsonObject {
  return {
    gecko: {
      id: policy.gecko.id,
      strict_min_version: policy.gecko.strictMinVersion,
      data_collection_permissions: { required: policy.gecko.dataCollectionRequired },
    },
    gecko_android: {
      strict_min_version: policy.gecko.androidStrictMinVersion,
    },
  };
}

export function auditManifest(
  manifest: unknown,
  policy: ManifestPolicy,
  target: Target,
  expectedVersion: string,
): string[] {
  const errors: string[] = [];
  if (!isObject(manifest)) return ['manifest is not a JSON object'];

  if (manifest['manifest_version'] !== policy.manifestVersion) {
    errors.push(`manifest_version must be ${policy.manifestVersion}`);
  }
  if (manifest['version'] !== expectedVersion) {
    errors.push(`version must equal package.json version "${expectedVersion}"`);
  }

  for (const key of Object.keys(manifest)) {
    if (!policy.allowedTopLevelKeys.includes(key)) errors.push(`unexpected top-level key "${key}"`);
    if (policy.forbiddenKeys.includes(key)) errors.push(`forbidden key "${key}"`);
  }

  for (const [manifestKey, policyKey] of PERMISSION_KEYS) {
    const actual = optionalStringArray(manifest, manifestKey);
    if (actual === 'invalid') {
      errors.push(`"${manifestKey}" must be an array of strings`);
      continue;
    }
    if (!sameSet(actual, policy[policyKey])) {
      errors.push(
        `"${manifestKey}" is [${actual.join(', ')}], expected exactly [${policy[policyKey].join(', ')}]`,
      );
    }
    for (const permission of actual) {
      if (policy.forbiddenPermissions.includes(permission)) {
        errors.push(`forbidden permission "${permission}" in "${manifestKey}"`);
      }
    }
  }

  if (JSON.stringify(manifest).includes('<all_urls>')) errors.push('"<all_urls>" must not appear');

  // Users assign the browser's shortcuts: a suggested key could collide with the page, the browser
  // or another extension without the user ever choosing it.
  const commands = manifest['commands'];
  if (isObject(commands)) {
    for (const [name, entry] of Object.entries(commands)) {
      if (isObject(entry) && 'suggested_key' in entry) {
        errors.push(`command "${name}" must not suggest a key`);
      }
    }
  } else if (commands !== undefined) {
    errors.push('"commands" must be an object');
  }

  const csp = manifest['content_security_policy'];
  if (!sameJson(csp, { extension_pages: policy.extensionPagesCsp })) {
    errors.push(
      `content_security_policy must be exactly { extension_pages: "${policy.extensionPagesCsp}" }`,
    );
  }

  const specific = manifest['browser_specific_settings'];
  if (target === 'firefox') {
    const expected = expectedFirefoxSettings(policy);
    if (!sameJson(specific, expected)) {
      errors.push(`browser_specific_settings must be exactly ${JSON.stringify(expected)}`);
    }
  } else if (specific !== undefined) {
    errors.push('browser_specific_settings must not appear in the Chromium manifest');
  }

  return errors;
}

// Every permission and host pattern in the policy must be documented.
export function auditPermissionDocs(policy: ManifestPolicy, docs: string): string[] {
  const documented = [
    ...policy.permissions,
    ...policy.optionalPermissions,
    ...policy.hostPermissions,
    ...policy.optionalHostPermissions,
  ];
  return documented
    .filter((entry) => !docs.includes(`\`${entry}\``))
    .map((entry) => `docs/PERMISSIONS.md does not document \`${entry}\``);
}
