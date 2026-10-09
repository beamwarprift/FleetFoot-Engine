// Privacy network guard, bundle layer. Scans the production output, not the
// source, so bundled dependencies are covered too. A denylist cannot be complete against deliberate
// obfuscation: it complements zero runtime dependencies and the extension-pages CSP.

import { readObject, readStringArray } from './json.ts';

export interface NetworkAllowlist {
  readonly linkUrls: readonly string[];
  readonly namespaceUris: readonly string[];
}

export interface Finding {
  readonly file: string;
  readonly rule: string;
  readonly match: string;
}

export function parseNetworkAllowlist(value: unknown, source: string): NetworkAllowlist {
  const obj = readObject(value, source);
  return {
    linkUrls: readStringArray(obj, 'linkUrls', source),
    namespaceUris: readStringArray(obj, 'namespaceUris', source),
  };
}

const TOKEN_RULES: ReadonlyArray<{ readonly rule: string; readonly pattern: RegExp }> = [
  { rule: 'network-api:fetch', pattern: /\bfetch\b/g },
  { rule: 'network-api:XMLHttpRequest', pattern: /\bXMLHttpRequest\b/g },
  { rule: 'network-api:WebSocket', pattern: /\bWebSocket\b/g },
  { rule: 'network-api:EventSource', pattern: /\bEventSource\b/g },
  { rule: 'network-api:sendBeacon', pattern: /\bsendBeacon\b/g },
  { rule: 'network-api:WebTransport', pattern: /\bWebTransport\b/g },
  { rule: 'network-api:RTCPeerConnection', pattern: /\bRTCPeerConnection\b/g },
  { rule: 'network-api:importScripts', pattern: /\bimportScripts\b/g },
  { rule: 'native-messaging', pattern: /\b(?:connectNative|sendNativeMessage)\b/g },
  // A script in the page must not announce itself: that would let any site detect the extension.
  // `postMessage` is checked structurally below (window messaging has a target origin argument).
  { rule: 'page-signal:wxt-started', pattern: /content-script-started/g },
  // Interface text goes through textContent; HTML is never built from strings.
  {
    rule: 'html-from-string',
    pattern:
      /\b(?:innerHTML|outerHTML|insertAdjacentHTML|createContextualFragment|DOMParser|srcdoc)\b|\bdocument\.write(?:ln)?\b/g,
  },
  { rule: 'dynamic-code:eval', pattern: /\beval\s*\(/g },
  { rule: 'dynamic-code:Function', pattern: /\bnew\s+Function\b|\bFunction\s*\(/g },
  { rule: 'wasm', pattern: /\bWebAssembly\b/g },
];

/**
 * `postMessage(` calls whose argument list has a top-level comma: window and worker messaging
 * (message, target origin), which a page can listen to. Extension ports take one argument and
 * stay private. A reference that is not a call cannot be judged and is reported too.
 */
export function windowMessagingCalls(content: string): string[] {
  const found: string[] = [];
  for (const match of content.matchAll(/\bpostMessage\b/g)) {
    let index = match.index + match[0].length;
    while (content[index] === ' ') index++;
    if (content[index] !== '(') {
      found.push(content.slice(match.index, match.index + 40));
      continue;
    }
    let depth = 0;
    let quote: string | null = null;
    let topLevelComma = false;
    for (index++; index < content.length; index++) {
      const char = content[index];
      if (quote !== null) {
        if (char === '\\') index++;
        else if (char === quote) quote = null;
        continue;
      }
      if (char === '"' || char === "'" || char === '`') quote = char;
      else if (char === '(' || char === '[' || char === '{') depth++;
      else if (char === ')' || char === ']' || char === '}') {
        if (depth === 0) break;
        depth--;
      } else if (char === ',' && depth === 0) topLevelComma = true;
    }
    if (topLevelComma)
      found.push(content.slice(match.index, Math.min(index + 1, match.index + 80)));
  }
  return found;
}

const REMOTE_URL = /\b(?:https?|wss?|ftp):\/\/[^\s"'`)<>\\]+/gi;
const PROTOCOL_RELATIVE_URL = /["'`(]\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)+/gi;

// Text files are scanned. Binary assets are allowed by type. Anything else fails (e.g. .wasm, .map).
export const SCANNED_EXTENSIONS = ['.js', '.mjs', '.cjs', '.html', '.css', '.svg'] as const;
export const BINARY_EXTENSIONS = ['.png', '.ico', '.webp', '.woff2'] as const;
export const OTHER_ALLOWED_FILES = ['manifest.json'] as const;
/** Interface text catalogues: scanned like code. */
const LOCALE_CATALOGUE = /^_locales\/[A-Za-z]{2,3}(?:_[A-Za-z0-9]{2,8})?\/messages\.json$/;

function extensionOf(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot).toLowerCase();
}

export type FileKind = 'scan' | 'binary' | 'manifest' | 'forbidden';

export function classifyFile(path: string): FileKind {
  const name = path.slice(path.lastIndexOf('/') + 1);
  if ((OTHER_ALLOWED_FILES as readonly string[]).includes(name) && !path.includes('/')) {
    return 'manifest';
  }
  if (LOCALE_CATALOGUE.test(path)) return 'scan';
  const ext = extensionOf(path);
  if ((SCANNED_EXTENSIONS as readonly string[]).includes(ext)) return 'scan';
  if ((BINARY_EXTENSIONS as readonly string[]).includes(ext)) return 'binary';
  return 'forbidden';
}

export function scanText(file: string, content: string, allowlist: NetworkAllowlist): Finding[] {
  const findings: Finding[] = [];
  for (const { rule, pattern } of TOKEN_RULES) {
    for (const match of content.matchAll(pattern)) findings.push({ file, rule, match: match[0] });
  }
  for (const match of windowMessagingCalls(content)) {
    findings.push({ file, rule: 'page-signal:postMessage', match });
  }
  const allowedUrls = new Set([...allowlist.linkUrls, ...allowlist.namespaceUris]);
  for (const match of content.matchAll(REMOTE_URL)) {
    if (!allowedUrls.has(match[0])) findings.push({ file, rule: 'remote-url', match: match[0] });
  }
  for (const match of content.matchAll(PROTOCOL_RELATIVE_URL)) {
    findings.push({ file, rule: 'protocol-relative-url', match: match[0] });
  }
  return findings;
}

// Runtime dependencies must stay at zero.
export function auditRuntimeDependencies(pkg: unknown): string[] {
  const obj = readObject(pkg, 'package.json');
  const errors: string[] = [];
  for (const key of [
    'dependencies',
    'optionalDependencies',
    'peerDependencies',
    'bundleDependencies',
  ]) {
    const value = obj[key];
    if (value === undefined) continue;
    const count = Array.isArray(value) ? value.length : Object.keys(readObject(value, key)).length;
    if (count > 0) errors.push(`package.json "${key}" must be empty (runtime dependencies: 0)`);
  }
  return errors;
}
