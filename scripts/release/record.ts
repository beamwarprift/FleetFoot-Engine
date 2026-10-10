// What a release leaves behind, beside its packages: the SHA-256 of each package, the
// manifest of each target, the permissions it asks for, and what changed in them since the release
// before. Pure functions over parsed data; the CLI (scripts/release.ts) reads and writes the files.

import { isObject, type JsonObject } from '../audit/json.ts';

/** MAJOR.MINOR.PATCH, numbers only. */
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function parseVersion(version: string): readonly [number, number, number] | undefined {
  const match = VERSION.exec(version);
  if (match === null) return undefined;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function compareVersions(a: string, b: string): number {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (left === undefined || right === undefined) throw new Error(`not a version: ${a} or ${b}`);
  for (let index = 0; index < 3; index++) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

/** The latest recorded release before `version`, if any; names that are not versions are ignored. */
export function previousVersion(recorded: readonly string[], version: string): string | undefined {
  return recorded
    .filter((name) => parseVersion(name) !== undefined && compareVersions(name, version) < 0)
    .sort(compareVersions)
    .at(-1);
}

/**
 * The text of this version's section of the changelog: what follows its heading `## <version>`,
 * up to the next `## ` heading; undefined when there is no such heading or nothing under it.
 */
export function changelogSection(changelog: string, version: string): string | undefined {
  const lines = changelog.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `## ${version}`);
  if (start === -1) return undefined;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith('## '));
  const text = (end === -1 ? rest : rest.slice(0, end)).join('\n').trim();
  return text === '' ? undefined : text;
}

/**
 * The notes of a GitHub release: what changed, from the changelog, then how a download can be
 * checked, for whoever wants to: its SHA-256 and the attestation of where it was built.
 */
export function releaseNotes(section: string, repository: string): string {
  return [
    section,
    '',
    '### Checking a download',
    '',
    'Optional, for anyone who wants proof that a package is intact and was built from this',
    'repository. `SHA256SUMS` holds the fingerprint of each package: in the folder of the',
    'downloads, `sha256sum -c SHA256SUMS` says whether they match. GitHub also keeps, for each',
    'package, a signed attestation of the workflow and the commit of this repository that built',
    `it, checked with \`gh attestation verify <package> --repo ${repository}\`.`,
    '',
  ].join('\n');
}

export interface Checksum {
  readonly file: string;
  readonly sha256: string;
}

/** The format `sha256sum -c` reads: one `<hash>  <file>` line per file, sorted by file. */
export function sha256Sums(checksums: readonly Checksum[]): string {
  return [...checksums]
    .sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0))
    .map(({ file, sha256 }) => `${sha256}  ${file}\n`)
    .join('');
}

const PERMISSION_KEYS = [
  'permissions',
  'optional_permissions',
  'host_permissions',
  'optional_host_permissions',
] as const;

export type Permissions = Readonly<Record<(typeof PERMISSION_KEYS)[number], readonly string[]>>;

export function permissionsOf(manifest: JsonObject): Permissions {
  const list = (key: (typeof PERMISSION_KEYS)[number]): readonly string[] => {
    const value = manifest[key];
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string').sort()
      : [];
  };
  return {
    permissions: list('permissions'),
    optional_permissions: list('optional_permissions'),
    host_permissions: list('host_permissions'),
    optional_host_permissions: list('optional_host_permissions'),
  };
}

/** Stable text for a JSON value: object keys sorted at every depth. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (isObject(value)) {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}

/** Each permission added or removed, then each other top-level manifest key that changed. */
export function manifestChanges(target: string, before: JsonObject, after: JsonObject): string[] {
  const changes: string[] = [];
  const old = permissionsOf(before);
  const now = permissionsOf(after);
  for (const key of PERMISSION_KEYS) {
    for (const item of now[key]) {
      if (!old[key].includes(item)) changes.push(`${target}: ${key} adds ${item}`);
    }
    for (const item of old[key]) {
      if (!now[key].includes(item)) changes.push(`${target}: ${key} removes ${item}`);
    }
  }
  const skip = new Set<string>([...PERMISSION_KEYS, 'version', 'version_name']);
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  for (const key of keys) {
    if (skip.has(key)) continue;
    if (!(key in before)) changes.push(`${target}: adds ${key}`);
    else if (!(key in after)) changes.push(`${target}: removes ${key}`);
    else if (canonical(before[key]) !== canonical(after[key]))
      changes.push(`${target}: changes ${key}`);
  }
  return changes;
}
