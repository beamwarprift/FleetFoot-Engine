// Records a release once `pnpm verify` has built and checked it: in releases/<version>/,
// the SHA-256 of the Chrome package (the one Edge takes too), the Firefox package and the source
// archive, each target's manifest and permissions, and what changed in them since the release
// before, and the commit they were built from. The packages themselves stay in .output/, to be uploaded by hand. A recorded release never
// changes: run again on the same version, the packages must hash the same.
// Usage: pnpm release

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parseJson, readObject, readString } from './audit/json.ts';
import {
  changelogSection,
  manifestChanges,
  parseVersion,
  permissionsOf,
  previousVersion,
  sha256Sums,
} from './release/record.ts';

const ROOT = join(import.meta.dirname, '..');
const OUTPUT = join(ROOT, '.output');
const RELEASES = join(ROOT, 'releases');
const TARGETS = ['chrome', 'firefox'] as const;

function fail(message: string): never {
  console.error(`release FAILED: ${message}`);
  process.exit(1);
}

function readJsonObject(path: string) {
  return readObject(
    parseJson(readFileSync(path, 'utf8'), relative(ROOT, path)),
    relative(ROOT, path),
  );
}

const pkg = readJsonObject(join(ROOT, 'package.json'));
const name = readString(pkg, 'name', 'package.json');
const version = readString(pkg, 'version', 'package.json');
if (parseVersion(version) === undefined) fail(`version ${version} is not MAJOR.MINOR.PATCH`);
if (changelogSection(readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8'), version) === undefined) {
  fail(`CHANGELOG.md has no "## ${version}" section with text under it`);
}

// The source archive is made from the files on disk: only a tree with nothing left uncommitted
// gives packages that the commit recorded below rebuilds.
const git = (...args: string[]) =>
  execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
const uncommitted = git('status', '--porcelain', '--', '.', ':!releases');
if (uncommitted !== '') fail(`commit everything first:\n${uncommitted}`);
const commit = git('rev-parse', 'HEAD');

// WXT names the packages `<name>-<version>-<chrome|firefox|sources>.zip`.
const packages = [...TARGETS, 'sources'].map((kind) => `${name}-${version}-${kind}.zip`);
const checksums = packages.map((file) => {
  const path = join(OUTPUT, file);
  if (!existsSync(path)) fail(`${relative(ROOT, path)} is missing: run pnpm verify first`);
  return { file, sha256: createHash('sha256').update(readFileSync(path)).digest('hex') };
});
const manifests = Object.fromEntries(
  TARGETS.map((target) => {
    const manifest = readJsonObject(join(OUTPUT, `${target}-mv3`, 'manifest.json'));
    if (manifest['version'] !== version) fail(`the ${target} build is not version ${version}`);
    return [target, manifest];
  }),
);
const sums = sha256Sums(checksums);

const dir = join(RELEASES, version);
if (existsSync(dir)) {
  const recorded = readFileSync(join(dir, 'SHA256SUMS'), 'utf8');
  if (recorded !== sums)
    fail(`${version} is recorded with other packages; a release never changes`);
  console.log(`release ${version}: already recorded, the packages are the same`);
  process.exit(0);
}

const recorded = existsSync(RELEASES) ? readdirSync(RELEASES) : [];
const previous = previousVersion(recorded, version);
const changes =
  previous === undefined
    ? []
    : TARGETS.flatMap((target) =>
        manifestChanges(
          target,
          readJsonObject(join(RELEASES, previous, `manifest.${target}.json`)),
          manifests[target] ?? {},
        ),
      );

mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'SHA256SUMS'), sums);
for (const target of TARGETS) {
  writeFileSync(
    join(dir, `manifest.${target}.json`),
    `${JSON.stringify(manifests[target], null, 2)}\n`,
  );
}
const permissions = Object.fromEntries(
  TARGETS.map((target) => [target, permissionsOf(manifests[target] ?? {})]),
);
writeFileSync(join(dir, 'permissions.json'), `${JSON.stringify(permissions, null, 2)}\n`);
const summary =
  previous === undefined
    ? 'First recorded release: nothing to compare with.'
    : changes.length === 0
      ? `Manifest and permissions unchanged since ${previous}.`
      : [`Changes since ${previous}:`, ...changes.map((change) => `- ${change}`)].join('\n');
writeFileSync(
  join(dir, 'CHANGES.txt'),
  `# ${version}\n\nBuilt from commit ${commit}.\n\n${summary}\n`,
);
console.log(`release ${version} recorded in ${relative(ROOT, dir)}\n${sums}${summary}`);
