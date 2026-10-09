// Site access through the browser's permissions, and the page script registered on the sites they
// cover. The registration is rebuilt from the permissions whenever they or the excluded sites
// change, so it can never disagree with what the user granted.

import { browser } from 'wxt/browser';
import { type AccessMode, ALL_SITES, accessFromOrigins } from '../core/settings/Access.ts';
import { siteOfPattern, sitePatterns } from '../core/settings/Sites.ts';
import type { SiteAccessPort } from '../ui/SiteAccessPort.ts';

/** The page script's path in the build, the same one injected on click. */
const ENGINE_SCRIPT = '/media-controller.js';
const REGISTRATION_ID = 'fleetfoot-engine';

async function grantedOrigins(): Promise<string[]> {
  const { origins } = await browser.permissions.getAll();
  return origins ?? [];
}

async function readAccess() {
  return accessFromOrigins(await grantedOrigins());
}

/** Drops every site permission except `keep`: what leaving a mode means. */
async function removeAllBut(keep: readonly string[]): Promise<void> {
  const origins = (await grantedOrigins()).filter((origin) => !keep.includes(origin));
  if (origins.length > 0) await browser.permissions.remove({ origins });
}

export const permissionsSiteAccess: SiteAccessPort = {
  read: readAccess,
  async setMode(mode: AccessMode) {
    switch (mode) {
      case 'all':
        // Asked first, inside the user's click: the browser shows its own prompt.
        return browser.permissions.request({ origins: [...ALL_SITES] });
      case 'selected': {
        const access = await readAccess();
        const keep = access.sites.flatMap(sitePatterns);
        await removeAllBut(keep);
        return true;
      }
      case 'on-click':
        await removeAllBut([]);
        return true;
    }
  },
  addSite: (site) => browser.permissions.request({ origins: sitePatterns(site) }),
  async removeSite(site) {
    await browser.permissions.remove({ origins: sitePatterns(site) });
  },
  watch(onChange) {
    const listener = (): void => onChange();
    browser.permissions.onAdded.addListener(listener);
    browser.permissions.onRemoved.addListener(listener);
    return () => {
      browser.permissions.onAdded.removeListener(listener);
      browser.permissions.onRemoved.removeListener(listener);
    };
  },
};

/**
 * Rebuilds of the registration hold this Web Lock, so two never interleave; anyone may wait for
 * the current one by asking for the same lock.
 */
export const SITE_ACCESS_LOCK = 'fleetfoot-engine.site-access';

interface Registration {
  readonly matches: readonly string[];
  readonly excludeMatches: readonly string[];
}

const same = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && [...a].sort().every((item, index) => item === [...b].sort()[index]);

/** The registration the granted permissions and the excluded sites call for. */
async function wanted(excludedSites: readonly string[]): Promise<Registration> {
  const origins = await grantedOrigins();
  const access = accessFromOrigins(origins);
  // Exactly what was granted: a pattern the browser did not grant fails the whole registration.
  const matches =
    access.mode === 'all'
      ? [...ALL_SITES]
      : origins.filter((origin) => siteOfPattern(origin) !== null);
  const excludeMatches = access.mode === 'all' ? excludedSites.flatMap(sitePatterns) : [];
  return { matches, excludeMatches };
}

async function rebuild(excludedSites: readonly string[]): Promise<void> {
  const target = await wanted(excludedSites);
  const [current] = await browser.scripting.getRegisteredContentScripts({ ids: [REGISTRATION_ID] });
  // Already right: nothing to touch, which is the usual case when the background wakes.
  if (
    current !== undefined &&
    same(current.matches ?? [], target.matches) &&
    same(current.excludeMatches ?? [], target.excludeMatches)
  ) {
    return;
  }
  if (current !== undefined) {
    await browser.scripting.unregisterContentScripts({ ids: [REGISTRATION_ID] });
  }
  if (target.matches.length === 0) return;
  await browser.scripting.registerContentScripts([
    {
      id: REGISTRATION_ID,
      js: [ENGINE_SCRIPT],
      matches: [...target.matches],
      ...(target.excludeMatches.length > 0 ? { excludeMatches: [...target.excludeMatches] } : {}),
      // Players inside frames of a granted site run too; the browser decides on other origins.
      allFrames: true,
      runAt: 'document_idle',
    },
  ]);
}

/**
 * Registers the page script on the granted sites, minus the excluded ones with All Sites. The lock
 * is asked for at once, so a call made while the background starts is already queued when any
 * other code runs.
 */
export function syncRegistration(excludedSites: () => Promise<readonly string[]>): Promise<void> {
  return navigator.locks
    .request(SITE_ACCESS_LOCK, async () => rebuild(await excludedSites()))
    .catch(() => {});
}
