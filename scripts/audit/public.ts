// What this folder may hold, since it is published as it is: no secret, no key file, no path of
// the machine it was written on, no mail address of a person, and no pointer to a document that is
// not in the folder itself (the reader could never follow it).

/** Files that hold secrets by their kind, whatever they contain. */
const SECRET_FILES: readonly RegExp[] = [
  /(?:^|\/)\.env(?:\.(?!example$)[^/]*)?$/,
  /\.(?:pem|key|p12|pfx|keystore|jks)$/i,
  /(?:^|\/)id_(?:rsa|dsa|ecdsa|ed25519)(?:\.pub)?$/,
  /(?:^|\/)\.npmrc$/,
];

/** Binary files: nothing to read as text. */
const BINARY = /\.(?:png|jpe?g|gif|webp|ico|zip|wav|mp3|mp4|webm|woff2?)$/i;

interface Rule {
  readonly name: string;
  readonly pattern: RegExp;
}

/** The shapes of keys and tokens the common providers issue. */
const SECRETS: readonly Rule[] = [
  { name: 'private key', pattern: /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----/ },
  {
    name: 'GitHub token',
    pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,})/,
  },
  { name: 'npm token', pattern: /\bnpm_[A-Za-z0-9]{36}\b/ },
  { name: 'AWS access key', pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { name: 'Google API key', pattern: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: 'Slack token', pattern: /\bxox[abposr]-[A-Za-z0-9-]{10,}/ },
  { name: 'secret key', pattern: /\bsk-[A-Za-z0-9_-]{20,}/ },
];

/** A path on someone's machine: the reader has no such machine. */
const MACHINE_PATH =
  /(?:^|[\s"'`(=])(?:\/home\/[a-z_][\w.-]*|\/Users\/[\w.-]+|\/root\/|[A-Z]:\\Users\\)/;

/** A specification the folder does not hold, cited by section or by line. */
const SPECIFICATION = /\bSPEC\b\s*(?:§\s*\d|L\d)/;

/** A mail address ends in a name of letters (`pkg@1.2.3`, a version, is none). */
const EMAIL = /[\w.%+-]+@((?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,})\b/g;
/** The names set aside for examples (RFC 2606, RFC 6761): no one receives mail there. */
const EXAMPLE_DOMAIN = /(?:^|\.)(?:example\.(?:com|org|net)|example|test|invalid|localhost)$/i;

/** A path written whole, `"../x"`, or built from `'..'` steps in a call: either can leave the folder. */
const UP_PATH = /["'`]((?:\.\.\/)+[^"'`\s]*)["'`]/g;
const UP_STEPS = /(?:["']\.\.["']\s*,\s*)+["']\.\.["']|["']\.\.["']/g;
/** A file named by a path from one of the folder's own directories, as `docs/PERMISSIONS.md`. */
const FOLDER_PATH = /(?<![\w/.:@~$-])((?:\.?[\w-]+)(?:\/[\w.-]+)+\.[a-z]{1,5})\b/g;

/** A Markdown file named anywhere, by its name or by a path to it, as `docs/PERMISSIONS.md`. */
const MARKDOWN_NAME = /(?<![\w/.-])((?:\.{1,2}\/)*[\w-]+(?:\/[\w.-]+)*\.md)\b/g;

export interface PublicFile {
  /** Relative to the folder, with `/`. */
  readonly path: string;
  /** Its text; null for a binary file. */
  readonly text: string | null;
}

export function isBinary(path: string): boolean {
  return BINARY.test(path);
}

function lineOf(text: string, index: number): number {
  return text.slice(0, index).split('\n').length;
}

/** `name` read from the file at `from` or from the folder's root, normalized; null outside it. */
function resolveFrom(from: string, name: string): readonly string[] {
  const resolve = (base: string[]) => {
    const parts = [...base];
    for (const part of name.split('/')) {
      if (part === '..') {
        if (parts.length === 0) return null;
        parts.pop();
      } else if (part !== '.') parts.push(part);
    }
    return parts.join('/');
  };
  const dir = from.split('/').slice(0, -1);
  return [resolve(dir), resolve([])].filter((path): path is string => path !== null);
}

/** Whether `path`, read from the file at `from`, goes above the folder's root. */
function climbs(from: string, path: string): boolean {
  let depth = depthOf(from);
  for (const part of path.split('/')) {
    if (part === '..') depth -= 1;
    else if (part !== '.' && part !== '') depth += 1;
    if (depth < 0) return true;
  }
  return false;
}

/** How many directories a file sits below the folder's root. */
function depthOf(path: string): number {
  return path.split('/').length - 1;
}

/** Every reason `files` cannot be published, one per finding. */
export function auditPublic(files: readonly PublicFile[]): string[] {
  const errors: string[] = [];
  const paths = new Set(files.map((file) => file.path));
  const directories = new Set(
    files.map((file) => file.path.split('/')[0] ?? '').filter((_, index, all) => all.length > 0),
  );
  for (const file of files) if (!file.path.includes('/')) directories.delete(file.path);
  for (const file of files) {
    if (SECRET_FILES.some((pattern) => pattern.test(file.path))) {
      errors.push(`${file.path}: a file of secrets by its kind`);
    }
    const text = file.text;
    if (text === null) continue;
    for (const { name, pattern } of SECRETS) {
      const match = pattern.exec(text);
      if (match !== null) errors.push(`${file.path}:${lineOf(text, match.index)}: ${name}`);
    }
    const machine = MACHINE_PATH.exec(text);
    if (machine !== null) {
      errors.push(`${file.path}:${lineOf(text, machine.index)}: a path on a machine`);
    }
    const specification = SPECIFICATION.exec(text);
    if (specification !== null) {
      errors.push(
        `${file.path}:${lineOf(text, specification.index)}: cites a specification not in the folder`,
      );
    }
    for (const match of text.matchAll(EMAIL)) {
      if (!EXAMPLE_DOMAIN.test(match[1] ?? '')) {
        errors.push(`${file.path}:${lineOf(text, match.index)}: a mail address (${match[0]})`);
      }
    }
    for (const match of text.matchAll(UP_PATH)) {
      const path = match[1] ?? '';
      if (climbs(file.path, path)) {
        errors.push(`${file.path}:${lineOf(text, match.index)}: ${path} leaves the folder`);
      }
    }
    for (const match of text.matchAll(UP_STEPS)) {
      const steps = (match[0].match(/\.\./g) ?? []).length;
      if (steps > depthOf(file.path)) {
        errors.push(
          `${file.path}:${lineOf(text, match.index)}: ${steps} steps up leave the folder`,
        );
      }
    }
    // Tests name made-up files on purpose; everywhere else a path names a real one.
    if (!file.path.startsWith('tests/')) {
      for (const match of text.matchAll(FOLDER_PATH)) {
        const path = match[1] ?? '';
        if (!directories.has(path.split('/')[0] ?? '') || paths.has(path)) continue;
        if (!resolveFrom(file.path, path).some((candidate) => paths.has(candidate))) {
          errors.push(
            `${file.path}:${lineOf(text, match.index)}: names ${path}, not in the folder`,
          );
        }
      }
    }
    for (const match of text.matchAll(MARKDOWN_NAME)) {
      const name = match[1] ?? '';
      if (!resolveFrom(file.path, name).some((path) => paths.has(path))) {
        errors.push(`${file.path}:${lineOf(text, match.index)}: names ${name}, not in the folder`);
      }
    }
  }
  return errors;
}
