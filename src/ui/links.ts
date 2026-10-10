// Pages the user can open from the interface; each is a plain link, opened only on the user's
// click and listed in config/network-allowlist.json. Every address is written
// whole, so the bundle scan compares it with that list as it is.

import { h } from './dom.ts';
import type { MessageKey } from './i18n.ts';

/** The developer's Ko-fi page. No tracking or referral parameter. */
export const SUPPORT_URL = 'https://ko-fi.com/lionrick333';

/**
 * The public repository, named after the app: the source of each release
 * (what the source says can be checked), its issues and its discussions.
 */
export const REPOSITORY_URL = 'https://github.com/buildwiserevenue/fleetfoot-engine';
export const ISSUES_URL = 'https://github.com/buildwiserevenue/fleetfoot-engine/issues';
export const DISCUSSIONS_URL = 'https://github.com/buildwiserevenue/fleetfoot-engine/discussions';
/** A release's files: each release is tagged `v` and its version in the public repository. */
const TREE_URL = 'https://github.com/buildwiserevenue/fleetfoot-engine/tree/';
const BLOB_URL = 'https://github.com/buildwiserevenue/fleetfoot-engine/blob/';

/** The source exactly as this version was built. */
export function versionSourceUrl(version: string): string {
  return new URL(`v${encodeURIComponent(version)}`, TREE_URL).href;
}

/** The licence this version ships under. */
export function versionLicenseUrl(version: string): string {
  return new URL(`v${encodeURIComponent(version)}/LICENSE`, BLOB_URL).href;
}

export interface DeveloperLink {
  readonly label: MessageKey;
  readonly url: string;
}

/**
 * «More from the developer»: the website and the Steam app, each only once it
 * exists. Empty, the interface shows no such part.
 */
export const DEVELOPER_LINKS: readonly DeveloperLink[] = [];

/** A link to one of these pages: a new tab that gets neither a handle back to us nor a referrer. */
export function externalLink(
  document: Document,
  text: string,
  href: string,
  className?: string,
): HTMLAnchorElement {
  return h(document, 'a', {
    ...(className === undefined ? {} : { className }),
    text,
    attrs: { href, target: '_blank', rel: 'noopener noreferrer' },
  });
}
