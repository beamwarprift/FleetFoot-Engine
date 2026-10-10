// User settings kept in storage.local, one storage key per setting so that two pages saving
// different settings never overwrite each other. Read fail-closed: an invalid or missing value
// falls back to its default, field by field.

import { type Rate, roundToHundredths, toRate } from '../media/PlaybackRate.ts';
import {
  DEFAULT_FAVORITE_RATE,
  DEFAULT_HOLD_RATE,
  DEFAULT_LOCK_FIGHT,
  DEFAULT_PRESERVES_PITCH,
  DEFAULT_RATE_POLICY,
  DEFAULT_RATE_PRESETS,
  DEFAULT_RATE_STEP,
  DEFAULT_SEEK_STEP_SECONDS,
  DEFAULT_SILENCE_MODE,
  DEFAULT_SILENCE_RATE,
  DEFAULT_SKIP_SILENCE,
} from '../media/Presets.ts';
import {
  LOCK_FIGHTS,
  type LockFight,
  RATE_POLICIES,
  type RatePolicyName,
  SILENCE_MODES,
  type SilenceMode,
  TARGETS,
  type Target,
} from '../messages/Protocol.ts';
import { MAX_SEEK_SECONDS } from '../messages/Validation.ts';
import { asLanguage, BROWSER_LANGUAGE, type LanguageChoice } from './Languages.ts';
import { DEFAULT_MEMORY, MEMORY_MODES, type MemoryMode } from './Memory.ts';
import { type Bindings, DEFAULT_BINDINGS, parseBindings } from './Shortcuts.ts';
import { siteOf } from './Sites.ts';
import { DEFAULT_THEME, THEME_NAMES, type ThemeName } from './Themes.ts';

/** The storage layout version; `migrateSettings` brings older layouts to it. */
export const SETTINGS_VERSION = 1;
export const VERSION_KEY = 'settingsVersion';

/** A preset grid of four columns and three rows in the popup. Chosen bound. */
export const MAX_PRESETS = 12;
/** The rate grid is 0.01; a step above 1× would skip most of the useful range. Chosen bound. */
export const MIN_RATE_STEP = 0.01;
export const MAX_RATE_STEP = 1;
/** Whole seconds, up to the largest seek the protocol accepts. */
export const MIN_SEEK_STEP = 1;
export const MAX_SEEK_STEP = MAX_SEEK_SECONDS;
/** Sites excluded from All Sites. Chosen bound: a list a person curates by hand. */
export const MAX_EXCLUDED_SITES = 200;
/** Size of the options page's text and controls, in percent: the range the user asked for. */
export const MIN_TEXT_SIZE = 100;
export const MAX_TEXT_SIZE = 200;
/** Chosen step: 11 sizes, each a tenth of the normal size larger than the one before. */
export const TEXT_SIZE_STEP = 10;

/** Overlay position as a fraction of the player's box, so it follows any player size. */
export interface OverlayPosition {
  readonly x: number;
  readonly y: number;
}

export interface Settings {
  readonly presets: readonly Rate[];
  readonly rateStep: number;
  readonly favoriteRate: Rate;
  readonly holdRate: Rate;
  readonly seekStep: number;
  readonly preservesPitch: boolean;
  readonly ratePolicy: RatePolicyName;
  /** What LOCK does when a page answers every restore at once. */
  readonly lockFight: LockFight;
  /** Skip Silence: silences play at the silence speed. */
  readonly skipSilence: boolean;
  /** How readily a quiet stretch counts as silence. */
  readonly silenceMode: SilenceMode;
  /** The speed a silence plays at with Skip Silence. */
  readonly silenceRate: Rate;
  readonly target: Target;
  readonly overlayEnabled: boolean;
  /** `null`: the default corner. */
  readonly overlayPosition: OverlayPosition | null;
  readonly contextMenu: boolean;
  /** Shortcuts inside the page; the browser's own shortcuts work regardless. */
  readonly pageShortcuts: boolean;
  readonly bindings: Bindings;
  readonly theme: ThemeName;
  /** Percent of the normal size of the options page. */
  readonly textSize: number;
  /** The interface language: the browser's, or a catalogue's name. */
  readonly language: LanguageChoice;
  /** Whether the popup shows its preset speeds. */
  readonly presetsOpen: boolean;
  readonly memory: MemoryMode;
  /** With All Sites: the sites where FleetFoot Engine never runs on its own. */
  readonly excludedSites: readonly string[];
}

export type SettingKey = keyof Settings;

function rate(value: number): Rate {
  const parsed = toRate(value);
  if (parsed === null) throw new Error(`invalid default rate ${value}`);
  return parsed;
}

export const DEFAULT_SETTINGS: Settings = {
  presets: DEFAULT_RATE_PRESETS.map(rate),
  rateStep: DEFAULT_RATE_STEP,
  favoriteRate: rate(DEFAULT_FAVORITE_RATE),
  holdRate: rate(DEFAULT_HOLD_RATE),
  seekStep: DEFAULT_SEEK_STEP_SECONDS,
  preservesPitch: DEFAULT_PRESERVES_PITCH,
  ratePolicy: DEFAULT_RATE_POLICY,
  lockFight: DEFAULT_LOCK_FIGHT,
  skipSilence: DEFAULT_SKIP_SILENCE,
  silenceMode: DEFAULT_SILENCE_MODE,
  silenceRate: rate(DEFAULT_SILENCE_RATE),
  target: 'active',
  overlayEnabled: true,
  overlayPosition: null,
  contextMenu: true,
  pageShortcuts: true,
  bindings: DEFAULT_BINDINGS,
  theme: DEFAULT_THEME,
  textSize: MIN_TEXT_SIZE,
  language: BROWSER_LANGUAGE,
  presetsOpen: false,
  memory: DEFAULT_MEMORY,
  excludedSites: [],
};

export const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS) as readonly SettingKey[];

type Parsers = { readonly [K in SettingKey]: (value: unknown) => Settings[K] | undefined };

function asRate(value: unknown): Rate | undefined {
  return typeof value === 'number' ? (toRate(value) ?? undefined) : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function asOneOf<T extends string>(options: readonly T[], value: unknown): T | undefined {
  return typeof value === 'string' && (options as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}

function isFraction(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

/** Unique, ascending, at most MAX_PRESETS; an empty or invalid list is not a preset list. */
function asPresets(value: unknown): readonly Rate[] | undefined {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_PRESETS) return undefined;
  const rates: Rate[] = [];
  for (const item of value) {
    const parsed = asRate(item);
    if (parsed === undefined) return undefined;
    if (!rates.includes(parsed)) rates.push(parsed);
  }
  return rates.sort((a, b) => a - b);
}

function asRateStep(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const step = roundToHundredths(value);
  return step >= MIN_RATE_STEP && step <= MAX_RATE_STEP ? step : undefined;
}

function asSeekStep(value: unknown): number | undefined {
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= MIN_SEEK_STEP &&
    value <= MAX_SEEK_STEP
    ? value
    : undefined;
}

function asTextSize(value: unknown): number | undefined {
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= MIN_TEXT_SIZE &&
    value <= MAX_TEXT_SIZE &&
    (value - MIN_TEXT_SIZE) % TEXT_SIZE_STEP === 0
    ? value
    : undefined;
}

/** Unique sites in the order the user added them; one invalid entry and the list is not a list. */
function asSites(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value) || value.length > MAX_EXCLUDED_SITES) return undefined;
  const sites: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string' || siteOf(item) !== item) return undefined;
    if (!sites.includes(item)) sites.push(item);
  }
  return sites;
}

function asOverlayPosition(value: unknown): OverlayPosition | null | undefined {
  if (value === null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) return undefined;
  const { x, y } = value as Readonly<Record<string, unknown>>;
  return isFraction(x) && isFraction(y) ? { x, y } : undefined;
}

const PARSERS: Parsers = {
  presets: asPresets,
  rateStep: asRateStep,
  favoriteRate: asRate,
  holdRate: asRate,
  seekStep: asSeekStep,
  preservesPitch: asBoolean,
  ratePolicy: (value) => asOneOf(RATE_POLICIES, value),
  lockFight: (value) => asOneOf(LOCK_FIGHTS, value),
  skipSilence: asBoolean,
  silenceMode: (value) => asOneOf(SILENCE_MODES, value),
  silenceRate: asRate,
  target: (value) => asOneOf(TARGETS, value),
  overlayEnabled: asBoolean,
  overlayPosition: asOverlayPosition,
  contextMenu: asBoolean,
  pageShortcuts: asBoolean,
  bindings: parseBindings,
  theme: (value) => asOneOf(THEME_NAMES, value),
  textSize: asTextSize,
  language: asLanguage,
  presetsOpen: asBoolean,
  memory: (value) => asOneOf(MEMORY_MODES, value),
  excludedSites: asSites,
};

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseOne<K extends SettingKey>(
  key: K,
  record: Readonly<Record<string, unknown>>,
): Settings[K] {
  if (!Object.hasOwn(record, key)) return DEFAULT_SETTINGS[key];
  return PARSERS[key](record[key]) ?? DEFAULT_SETTINGS[key];
}

/** Settings from what storage returned; anything unusable is replaced by its default. */
export function parseSettings(stored: unknown): Settings {
  const record = isRecord(stored) ? stored : {};
  const result = {} as Record<SettingKey, unknown>;
  for (const key of SETTING_KEYS) result[key] = parseOne(key, record);
  return result as unknown as Settings;
}

/** One setting checked before it is saved: `undefined` when the value is not acceptable. */
export function validSetting<K extends SettingKey>(
  key: K,
  value: unknown,
): Settings[K] | undefined {
  return PARSERS[key](value);
}

export interface Migration {
  /** Keys and values to write, the version included. Empty when nothing changes. */
  readonly writes: Readonly<Record<string, unknown>>;
}

/**
 * Brings stored settings to the current layout. Version 1 is the first layout: it only records
 * the version, and storage without one is in it. A layout newer than this build is left untouched
 * and read field by field.
 */
export function migrateSettings(stored: unknown): Migration {
  const record = isRecord(stored) ? stored : {};
  const version = record[VERSION_KEY];
  if (typeof version === 'number' && version >= SETTINGS_VERSION) return { writes: {} };
  return { writes: { [VERSION_KEY]: SETTINGS_VERSION } };
}
