// Interface test doubles: the English catalogue as the browser would read it, settings in memory,
// and a client that talks to an engine running in the test page.

import english from '../../public/_locales/en/messages.json';
import type { MediaEngine } from '../../src/core/MediaEngine.ts';
import { ALL_SITES, accessFromOrigins } from '../../src/core/settings/Access.ts';
import type { Backup } from '../../src/core/settings/Backup.ts';
import { applyPatch } from '../../src/core/settings/ProfilePatch.ts';
import {
  isEmptyProfile,
  parseRememberedRate,
  parseSiteProfile,
  REMEMBERED_RATE_KEY,
  siteOfStorageKey,
  siteStorageKey,
} from '../../src/core/settings/Profiles.ts';
import {
  parseSettings,
  type SettingKey,
  type Settings,
  validSetting,
} from '../../src/core/settings/Settings.ts';
import { sitePatterns } from '../../src/core/settings/Sites.ts';
import type { EngineClient } from '../../src/ui/EngineClient.ts';
import { isolate, type Localization, type MessageKey } from '../../src/ui/i18n.ts';
import type { LocalDataPort } from '../../src/ui/LocalDataPort.ts';
import type { ProfilesPort } from '../../src/ui/ProfilesPort.ts';
import type { SettingsPort } from '../../src/ui/SettingsPort.ts';
import type { SiteAccessPort } from '../../src/ui/SiteAccessPort.ts';
import type { StatsPort } from '../../src/ui/StatsPort.ts';

export interface Entry {
  readonly message: string;
  readonly placeholders?: Readonly<Record<string, { readonly content: string }>>;
}

export type Catalogue = Readonly<Record<string, Entry>>;

/** `getMessage` semantics on a catalogue: named placeholders filled from `$1`, `$2`… in order. */
export function catalogueText(catalogue: Catalogue): Localization['t'] {
  return (key: MessageKey, ...substitutions: string[]): string => {
    const entry = catalogue[key];
    if (entry === undefined) throw new Error(`missing text ${key}`);
    return entry.message.replace(/\$([A-Za-z_]+)\$/g, (_, name: string) => {
      const content = entry.placeholders?.[name.toLowerCase()]?.content ?? '';
      const index = Number(content.slice(1)) - 1;
      const value = substitutions[index];
      return value === undefined ? '' : isolate(value);
    });
  };
}

export const englishText = catalogueText(english as Catalogue);

export const ENGLISH: Localization = { t: englishText, locale: 'en', dir: 'ltr' };

export interface MemorySettings extends SettingsPort {
  readonly stored: Record<string, unknown>;
}

/** storage.local in memory: same validation, same per-key writes, change events after the write. */
export function memorySettings(initial: Record<string, unknown> = {}): MemorySettings {
  const stored: Record<string, unknown> = { ...initial };
  const watchers = new Set<(settings: Settings) => void>();
  const notify = () => {
    const settings = parseSettings(stored);
    queueMicrotask(() => {
      for (const watcher of watchers) watcher(settings);
    });
  };
  return {
    stored,
    load: async () => parseSettings(stored),
    async save<K extends SettingKey>(key: K, value: Settings[K]) {
      const valid = validSetting(key, value);
      if (valid === undefined) return false;
      stored[key] = valid;
      notify();
      return true;
    },
    watch(onChange) {
      watchers.add(onChange);
      return () => watchers.delete(onChange);
    },
    async reset() {
      for (const key of Object.keys(stored)) delete stored[key];
      notify();
    },
  };
}

export interface MemoryProfiles extends ProfilesPort {
  readonly stored: Record<string, unknown>;
}

/** The remembered speed and site profiles in memory, with the same reading and change events. */
export function memoryProfiles(initial: Record<string, unknown> = {}): MemoryProfiles {
  const stored: Record<string, unknown> = { ...initial };
  const watchers = new Set<() => void>();
  const notify = () =>
    queueMicrotask(() => {
      for (const watcher of watchers) watcher();
    });
  return {
    stored,
    rememberedRate: async () => parseRememberedRate(stored[REMEMBERED_RATE_KEY]),
    async saveRememberedRate(rate) {
      stored[REMEMBERED_RATE_KEY] = rate;
      notify();
    },
    profile: async (site) => parseSiteProfile(stored[siteStorageKey(site)]),
    async update(site, patch) {
      const next = applyPatch(parseSiteProfile(stored[siteStorageKey(site)]), patch);
      if (isEmptyProfile(next)) delete stored[siteStorageKey(site)];
      else stored[siteStorageKey(site)] = next;
      notify();
    },
    async list() {
      return Object.keys(stored)
        .map((key) => siteOfStorageKey(key))
        .filter((site): site is string => site !== null)
        .sort()
        .map((site) => ({ site, profile: parseSiteProfile(stored[siteStorageKey(site)]) }));
    },
    watch(onChange) {
      watchers.add(onChange);
      return () => watchers.delete(onChange);
    },
  };
}

export interface MemoryAccess extends SiteAccessPort {
  readonly origins: Set<string>;
  /** What the browser's prompt answers. */
  grants: boolean;
}

/** The browser's permissions in memory: a prompt that answers `grants`, change events after. */
export function memoryAccess(initial: readonly string[] = []): MemoryAccess {
  const origins = new Set(initial);
  const watchers = new Set<() => void>();
  const notify = () =>
    queueMicrotask(() => {
      for (const watcher of watchers) watcher();
    });
  const grant = (requested: readonly string[]): boolean => {
    if (!port.grants) return false;
    for (const origin of requested) origins.add(origin);
    notify();
    return true;
  };
  const removeAllBut = (keep: readonly string[]) => {
    for (const origin of [...origins]) if (!keep.includes(origin)) origins.delete(origin);
    notify();
  };
  const port: MemoryAccess = {
    origins,
    grants: true,
    read: async () => accessFromOrigins([...origins]),
    async setMode(mode) {
      if (mode === 'all') return grant(ALL_SITES);
      if (mode === 'on-click') removeAllBut([]);
      else removeAllBut(accessFromOrigins([...origins]).sites.flatMap(sitePatterns));
      return true;
    },
    addSite: async (site) => grant(sitePatterns(site)),
    async removeSite(site) {
      for (const origin of sitePatterns(site)) origins.delete(origin);
      notify();
    },
    watch(onChange) {
      watchers.add(onChange);
      return () => watchers.delete(onChange);
    },
  };
  return port;
}

/** The engine of the test page, reached the way the popup reaches a tab. */
export function localClient(engine: MediaEngine): EngineClient {
  return {
    send: async (command) => ({ ok: true, response: await engine.handleMessage(command) }),
    watch: (onState) => engine.subscribe(onState, { time: true }),
  };
}

/** Lets queued microtasks and promise continuations run. */
export function settled(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** axe-core rule tags for WCAG 2.2 level AA (and the A and AA levels it includes). */
export const WCAG_22_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

export interface MemoryStats extends StatsPort {
  set(seconds: number): void;
}

/** The time-saved total in memory, with change events like storage.onChanged. */
export function memoryStats(initial = 0): MemoryStats {
  let total = initial;
  const watchers = new Set<(seconds: number) => void>();
  const set = (seconds: number) => {
    total = seconds;
    queueMicrotask(() => {
      for (const watcher of watchers) watcher(total);
    });
  };
  return {
    set,
    load: async () => total,
    watch(onChange) {
      watchers.add(onChange);
      return () => watchers.delete(onChange);
    },
    reset: async () => set(0),
  };
}

/** The version a test build says it carries. */
export const TEST_VERSION = '0.1.0';

export interface MemoryLocalData extends LocalDataPort {
  /** Every copy restored, in order. */
  readonly restored: Backup[];
  /** Fails the next restore or clear, as a full storage would. */
  failNext: boolean;
}

/** Restores and deletes through the given memory ports, with their checks and change events. */
export function memoryLocalData(
  ports: { settings?: SettingsPort; profiles?: MemoryProfiles; stats?: StatsPort } = {},
): MemoryLocalData {
  const local: MemoryLocalData = {
    restored: [],
    failNext: false,
    async restore(backup) {
      if (local.failNext) {
        local.failNext = false;
        throw new Error('storage full');
      }
      local.restored.push(backup);
      const { settings, profiles } = ports;
      for (const [key, value] of Object.entries(backup.settings)) {
        await settings?.save(key as SettingKey, value as never);
      }
      if (backup.rememberedRate !== null) await profiles?.saveRememberedRate(backup.rememberedRate);
      for (const { site, profile } of backup.sites) {
        // A restore replaces each profile whole, as one storage write does.
        await profiles?.update(site, null);
        await profiles?.update(site, profile);
      }
    },
    async clear() {
      if (local.failNext) {
        local.failNext = false;
        throw new Error('storage unavailable');
      }
      const { settings, profiles, stats } = ports;
      await settings?.reset();
      if (profiles !== undefined) {
        for (const key of Object.keys(profiles.stored)) delete profiles.stored[key];
        // Saving an empty profile removes nothing more and sends the change event.
        await profiles.update('cleared.invalid', null);
      }
      await stats?.reset();
    },
  };
  return local;
}

/** A store page for the heart, as the popup gets it from a store install. */
export const STORE_REVIEW_URL = `https://chromewebstore.google.com/detail/${'a'.repeat(32)}`;
