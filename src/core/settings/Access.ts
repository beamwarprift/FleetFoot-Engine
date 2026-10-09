// Which sites FleetFoot Engine may run on by itself. The browser's granted permissions
// are the only record: the mode is read from them, so a permission revoked in the browser's own
// settings changes the mode with nothing left behind.

import { siteOfPattern, WEB_SCHEMES } from './Sites.ts';

/**
 * Every web page, one pattern per web scheme: the manifest's optional host permissions, asked only
 * when the user turns on All Sites.
 */
export const ALL_SITES: readonly string[] = WEB_SCHEMES.map((scheme) => `${scheme}://*/*`);

export const ACCESS_MODES = ['on-click', 'selected', 'all'] as const;
export type AccessMode = (typeof ACCESS_MODES)[number];

export interface SiteAccess {
  readonly mode: AccessMode;
  /** With Selected Sites: the sites granted, alphabetical. */
  readonly sites: readonly string[];
}

export function accessFromOrigins(origins: readonly string[]): SiteAccess {
  if (ALL_SITES.every((origin) => origins.includes(origin))) return { mode: 'all', sites: [] };
  const sites = [...new Set(origins.map(siteOfPattern).filter((site) => site !== null))].sort();
  return sites.length > 0 ? { mode: 'selected', sites } : { mode: 'on-click', sites: [] };
}
