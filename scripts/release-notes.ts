// Writes to stdout the notes of the GitHub release of the version in package.json: its section of
// CHANGELOG.md, then how a download can be checked. Fails when the changelog has no text for it,
// so no release goes out without saying what changed.
// Usage: node scripts/release-notes.ts <owner>/<repository>

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseJson, readObject, readString } from './audit/json.ts';
import { changelogSection, releaseNotes } from './release/record.ts';

const ROOT = join(import.meta.dirname, '..');

function fail(message: string): never {
  console.error(`release notes FAILED: ${message}`);
  process.exit(1);
}

const repository = process.argv[2] ?? '';
if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(repository)) {
  fail(`"${repository}" is not <owner>/<repository>`);
}
const pkg = readObject(
  parseJson(readFileSync(join(ROOT, 'package.json'), 'utf8'), 'package.json'),
  'package.json',
);
const version = readString(pkg, 'version', 'package.json');
const section = changelogSection(readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8'), version);
if (section === undefined) fail(`CHANGELOG.md has no "## ${version}" section with text under it`);
process.stdout.write(releaseNotes(section, repository));
