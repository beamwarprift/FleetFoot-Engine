// The Firefox the end-to-end suite drives: one pinned release from Mozilla's archive, its archive
// checked against the SHA-256 written here (from Mozilla's SHA256SUMS for that release) before it
// is unpacked, and kept in .cache/ per version. FFE_FIREFOX_PATH names a Firefox already at hand.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

/** Moving it means a new SHA-256 from that release's SHA256SUMS. */
export const FIREFOX_VERSION = '157.0';
const ARCHIVE = `linux-x86_64/en-US/firefox-${FIREFOX_VERSION}.tar.xz`;
/** https://archive.mozilla.org/pub/firefox/releases/157.0/SHA256SUMS, line for ARCHIVE. */
const ARCHIVE_SHA256 = '42f2c62a562316982ef5a796738c57602bf84a984f5c616e80bcff4627f78fff';
const RELEASES = 'https://archive.mozilla.org/pub/firefox/releases';

const CACHE = join(import.meta.dirname, '..', '.cache', 'firefox', FIREFOX_VERSION);

/** The Firefox binary, downloaded and checked the first time. */
export async function firefoxBinary(): Promise<string> {
  const given = process.env['FFE_FIREFOX_PATH'];
  if (given !== undefined && given !== '') return given;
  const binary = join(CACHE, 'firefox', 'firefox');
  if (existsSync(binary)) return binary;
  if (process.platform !== 'linux' || process.arch !== 'x64') {
    throw new Error('Only the Linux x64 release is pinned: set FFE_FIREFOX_PATH to a Firefox.');
  }
  rmSync(CACHE, { recursive: true, force: true });
  mkdirSync(CACHE, { recursive: true });
  const file = join(CACHE, 'firefox.tar.xz');
  // curl follows the environment's proxy settings; HTTPS only, failing on any HTTP error.
  execFileSync('curl', [
    '-fsSL',
    '--proto',
    '=https',
    '-o',
    file,
    `${RELEASES}/${FIREFOX_VERSION}/${ARCHIVE}`,
  ]);
  const digest = createHash('sha256').update(readFileSync(file)).digest('hex');
  if (digest !== ARCHIVE_SHA256) {
    rmSync(CACHE, { recursive: true, force: true });
    throw new Error(`Firefox archive refused: SHA-256 ${digest}`);
  }
  execFileSync('tar', ['-xJf', file, '-C', CACHE]);
  rmSync(file);
  return binary;
}

if (import.meta.main) console.log(await firefoxBinary());
