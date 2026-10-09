// Wire contract between the extension (background, popup) and the controller running in a page.
// One shared type for both ends: the sender builds `Command`, the page parses it with `Validation`.

import type { Rate } from '../media/PlaybackRate.ts';
import type { Remaining } from '../media/RemainingTime.ts';

export const PROTOCOL_VERSION = 1;

export type Command =
  | { readonly v: typeof PROTOCOL_VERSION; readonly type: 'get-state' }
  | { readonly v: typeof PROTOCOL_VERSION; readonly type: 'set-rate'; readonly rate: number }
  | {
      readonly v: typeof PROTOCOL_VERSION;
      readonly type: 'set-preserves-pitch';
      readonly enabled: boolean;
    }
  /** `playerId: null` returns to automatic selection. */
  | {
      readonly v: typeof PROTOCOL_VERSION;
      readonly type: 'select-player';
      readonly playerId: number | null;
    }
  /** Relative change from the element's current rate, e.g. ±0.25. */
  | { readonly v: typeof PROTOCOL_VERSION; readonly type: 'adjust-rate'; readonly delta: number }
  | { readonly v: typeof PROTOCOL_VERSION; readonly type: 'reset-rate' }
  /** Back to the rate before the last change; repeated, it toggles between the two. */
  | { readonly v: typeof PROTOCOL_VERSION; readonly type: 'previous-rate' }
  /** Temporary rate while a key is held; never remembered as the previous rate. */
  | { readonly v: typeof PROTOCOL_VERSION; readonly type: 'hold-start'; readonly rate: number }
  | { readonly v: typeof PROTOCOL_VERSION; readonly type: 'hold-end' }
  /** Relative seek in seconds: negative goes back. */
  | { readonly v: typeof PROTOCOL_VERSION; readonly type: 'seek'; readonly seconds: number }
  /** Rate and pitch commands reach the active player, or every player on the page. */
  | { readonly v: typeof PROTOCOL_VERSION; readonly type: 'set-target'; readonly target: Target }
  | {
      readonly v: typeof PROTOCOL_VERSION;
      readonly type: 'set-rate-policy';
      readonly policy: RatePolicyName;
    }
  /** What LOCK does when a page answers every restore at once. */
  | {
      readonly v: typeof PROTOCOL_VERSION;
      readonly type: 'set-lock-fight';
      readonly fight: LockFight;
    }
  /** Skip Silence: on or off, how readily silences are found, and the speed they play at. */
  | {
      readonly v: typeof PROTOCOL_VERSION;
      readonly type: 'set-skip-silence';
      readonly enabled: boolean;
      readonly mode: SilenceMode;
      readonly silenceRate: number;
    }
  /** Loop markers at the current position of the active player. */
  | { readonly v: typeof PROTOCOL_VERSION; readonly type: 'loop-set-a' }
  | { readonly v: typeof PROTOCOL_VERSION; readonly type: 'loop-set-b' }
  | { readonly v: typeof PROTOCOL_VERSION; readonly type: 'loop-enable'; readonly enabled: boolean }
  | { readonly v: typeof PROTOCOL_VERSION; readonly type: 'loop-clear' }
  /** Enters Picture-in-Picture with the active video, or leaves it. */
  | { readonly v: typeof PROTOCOL_VERSION; readonly type: 'pip-toggle' }
  // The speed remembered for this site: given to the target now, or to the first media that
  // becomes it. Never overrides a choice already made on the page.
  | {
      readonly v: typeof PROTOCOL_VERSION;
      readonly type: 'set-default-rate';
      readonly rate: number;
    }
  // A speed for the media the user pointed at (the right-click menu), found by its address; the
  // active player when none has it. The address is only carried, never kept or reported.
  | {
      readonly v: typeof PROTOCOL_VERSION;
      readonly type: 'set-media-rate';
      readonly src: string;
      readonly rate: number;
    };

/** Longest media address a command carries: RFC 9110 §4.1 asks for at least 8000 octets. */
export const MAX_MEDIA_SRC_LENGTH = 8000;

export type CommandType = Command['type'];

type CommandFields<T extends CommandType> = Omit<Extract<Command, { type: T }>, 'v' | 'type'>;

/** Builds a command of the current protocol version. */
export function makeCommand<T extends CommandType>(type: T, fields: CommandFields<T>): Command {
  return { v: PROTOCOL_VERSION, type, ...fields } as Command;
}

/** A command that passed validation: numbers are bounded, the rate is on the product grid. */
export type ValidCommand =
  | { readonly type: 'get-state' }
  | { readonly type: 'set-rate'; readonly rate: Rate }
  | { readonly type: 'set-preserves-pitch'; readonly enabled: boolean }
  | { readonly type: 'select-player'; readonly playerId: number | null }
  | { readonly type: 'adjust-rate'; readonly delta: number }
  | { readonly type: 'reset-rate' }
  | { readonly type: 'previous-rate' }
  | { readonly type: 'hold-start'; readonly rate: Rate }
  | { readonly type: 'hold-end' }
  | { readonly type: 'seek'; readonly seconds: number }
  | { readonly type: 'set-target'; readonly target: Target }
  | { readonly type: 'set-rate-policy'; readonly policy: RatePolicyName }
  | { readonly type: 'set-lock-fight'; readonly fight: LockFight }
  | {
      readonly type: 'set-skip-silence';
      readonly enabled: boolean;
      readonly mode: SilenceMode;
      readonly silenceRate: Rate;
    }
  | { readonly type: 'loop-set-a' }
  | { readonly type: 'loop-set-b' }
  | { readonly type: 'loop-enable'; readonly enabled: boolean }
  | { readonly type: 'loop-clear' }
  | { readonly type: 'pip-toggle' }
  | { readonly type: 'set-default-rate'; readonly rate: Rate }
  | { readonly type: 'set-media-rate'; readonly src: string; readonly rate: Rate };

export const TARGETS = ['active', 'all'] as const;
export type Target = (typeof TARGETS)[number];

/** FOLLOW: applied once. SMART: re-applied on recreation, replacement, new source. LOCK: also against the site. */
export const RATE_POLICIES = ['follow', 'smart', 'lock'] as const;
export type RatePolicyName = (typeof RATE_POLICIES)[number];

/**
 * When a page answers every LOCK restore at once. YIELD: LOCK gives way on that element and says
 * so. BRAKED: LOCK hides its own change from the page and keeps restoring, at a bounded rate.
 * UNBRAKED: the same, with no bound.
 */
export const LOCK_FIGHTS = ['yield', 'braked', 'unbraked'] as const;
export type LockFight = (typeof LOCK_FIGHTS)[number];

/**
 * How readily Skip Silence (off, conservative, normal, aggressive) counts a quiet
 * stretch as silence; on or off is a setting of its own. During a silence the active player plays
 * at the silence speed, then back at the user's.
 */
export const SILENCE_MODES = ['conservative', 'normal', 'aggressive'] as const;
export type SilenceMode = (typeof SILENCE_MODES)[number];

/**
 * OFF: not asked for. WAITING: the browser starts audio only after a click on the page.
 * LISTENING: hearing the active player. SKIPPING: in a silence, at the silence speed.
 * UNAVAILABLE: the browser does not let the extension hear this media (another site's media, or
 * protected media).
 */
export const SKIP_SILENCE_STATUSES = [
  'off',
  'waiting',
  'listening',
  'skipping',
  'unavailable',
] as const;
export type SkipSilenceStatus = (typeof SKIP_SILENCE_STATUSES)[number];

export interface SkipSilenceState {
  readonly status: SkipSilenceStatus;
}

export interface LoopState {
  readonly a: number | null;
  readonly b: number | null;
  readonly enabled: boolean;
}

export type PipError = Extract<ErrorCode, 'pip-unavailable' | 'pip-rejected'>;

export interface PipState {
  readonly available: boolean;
  readonly active: boolean;
}

export type MediaKind = 'video' | 'audio';

export interface PlayerInfo {
  readonly id: number;
  readonly kind: MediaKind;
  readonly playing: boolean;
  /** Rendered size in CSS pixels; 0 × 0 for an `<audio>` without visible controls. */
  readonly width: number;
  readonly height: number;
  /** Null in the tab's top frame; in an embedded frame, that frame's site (null without one). */
  readonly frame: PlayerFrame | null;
}

export interface PlayerFrame {
  readonly site: string | null;
}

export interface EngineState {
  readonly v: typeof PROTOCOL_VERSION;
  /** Ranked: the first entry is the one automatic selection would pick. */
  readonly players: readonly PlayerInfo[];
  readonly activePlayerId: number | null;
  /** True when the active player was chosen explicitly with `select-player`. */
  readonly pinned: boolean;
  /**
   * The active player's current rate, rounded to hundredths; a site may set values off the grid.
   * During a skipped silence, the rate it plays at outside the silence.
   */
  readonly rate: number | null;
  /** The pitch setting applied with every rate change. */
  readonly preservesPitch: boolean;
  /** The rate `previous-rate` would return to, for the active player. */
  readonly previousRate: number | null;
  /** A hold is in progress. */
  readonly holding: boolean;
  /** False for live streams and media without a seekable range: seek controls are disabled. */
  readonly seekable: boolean;
  /** Seconds; null without an active player. */
  readonly currentTime: number | null;
  /** Seconds when finite and known; null for live or unknown durations. */
  readonly duration: number | null;
  /** Null when no honest estimate exists (live, infinite or unknown duration). */
  readonly remaining: Remaining | null;
  readonly target: Target;
  readonly ratePolicy: RatePolicyName;
  /** The rate the user chose last; the policy keeps managed players at it. */
  readonly desiredRate: number | null;
  /** The active player's A–B loop, null when it has no markers. */
  readonly loop: LoopState | null;
  /** LOCK yielded on the active player: another source answers every restore. */
  readonly rateContested: boolean;
  /** Picture-in-Picture for the active player; unavailable for audio and where the API is absent. */
  readonly pip: PipState;
  /** The site of the frame this engine runs in, or null where it has none (file:). */
  readonly site: string | null;
  readonly skipSilence: SkipSilenceState;
  /**
   * With no player here: the sites of the frames on screen that come from another site, the
   * largest first, at most `MAX_FRAMED_SITES`. A player may be there, out of this engine's reach
   * until that site is allowed.
   */
  readonly framedSites: readonly string[];
}

/** How many framed sites a state names: the few that can be offered to the user. */
export const MAX_FRAMED_SITES = 3;

export const ERROR_CODES = [
  'invalid-command',
  'no-player',
  'rate-rejected',
  'pitch-unsupported',
  'no-previous-rate',
  'not-seekable',
  'not-loopable',
  'loop-invalid',
  'pip-unavailable',
  'pip-rejected',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export type Response =
  | { readonly ok: true; readonly state: EngineState }
  | { readonly ok: false; readonly error: ErrorCode; readonly state: EngineState };
