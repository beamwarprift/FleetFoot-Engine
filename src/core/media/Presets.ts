// Default values the interface offers before the user configures their own.

import type { LockFight, RatePolicyName, SilenceMode } from '../messages/Protocol.ts';

/** Reset target. */
export const DEFAULT_RATE = 1;

/** Initial presets. Values beyond 4× stay reachable as custom rates. */
export const DEFAULT_RATE_PRESETS: readonly number[] = [
  0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4,
];

/** Step of the slower / faster controls. */
export const DEFAULT_RATE_STEP = 0.25;

/** The favorite rate before the user picks one. Chosen value. */
export const DEFAULT_FAVORITE_RATE = 1.5;

/** Rate applied while the hold key is down. */
export const DEFAULT_HOLD_RATE = 3;

/** Speech at 2× keeps its natural pitch. */
export const DEFAULT_PRESERVES_PITCH = true;

/** SMART is the recommended default. */
export const DEFAULT_RATE_POLICY: RatePolicyName = 'smart';

/** LOCK gives way to a page that fights it, and says so. */
export const DEFAULT_LOCK_FIGHT: LockFight = 'yield';

/** Skip Silence starts off: the user turns it on. */
export const DEFAULT_SKIP_SILENCE = false;

/** How readily silences count once Skip Silence is on: the middle of the three modes. */
export const DEFAULT_SILENCE_MODE: SilenceMode = 'normal';

/** The speed a silence plays at. */
export const DEFAULT_SILENCE_RATE = 5;

/** Seconds per seek step, backward and forward. */
export const DEFAULT_SEEK_STEP_SECONDS = 5;

/** Seek steps offered as presets. */
export const SEEK_STEP_PRESETS_SECONDS: readonly number[] = [5, 10, 15, 30, 60];

/** Right-click menu on video and audio: Speed → 1× / 1.5× / 2× / Favorite. */
export const MENU_RATES: readonly number[] = [1, 1.5, 2];
