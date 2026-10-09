// Parses an untrusted message into a ValidCommand. Fail-closed: unknown versions, types or fields
// are rejected; a finite rate outside the offered range is clamped, never rejected.

import { MAX_RATE, toRate } from '../media/PlaybackRate.ts';
import {
  type CommandType,
  LOCK_FIGHTS,
  MAX_MEDIA_SRC_LENGTH,
  PROTOCOL_VERSION,
  RATE_POLICIES,
  SILENCE_MODES,
  TARGETS,
  type ValidCommand,
} from './Protocol.ts';

const FIELDS: Readonly<Record<CommandType, readonly string[]>> = {
  'get-state': ['v', 'type'],
  'set-rate': ['v', 'type', 'rate'],
  'set-preserves-pitch': ['v', 'type', 'enabled'],
  'select-player': ['v', 'type', 'playerId'],
  'adjust-rate': ['v', 'type', 'delta'],
  'reset-rate': ['v', 'type'],
  'previous-rate': ['v', 'type'],
  'hold-start': ['v', 'type', 'rate'],
  'hold-end': ['v', 'type'],
  seek: ['v', 'type', 'seconds'],
  'set-target': ['v', 'type', 'target'],
  'set-rate-policy': ['v', 'type', 'policy'],
  'set-lock-fight': ['v', 'type', 'fight'],
  'set-skip-silence': ['v', 'type', 'enabled', 'mode', 'silenceRate'],
  'loop-set-a': ['v', 'type'],
  'loop-set-b': ['v', 'type'],
  'loop-enable': ['v', 'type', 'enabled'],
  'loop-clear': ['v', 'type'],
  'pip-toggle': ['v', 'type'],
  'set-default-rate': ['v', 'type', 'rate'],
  'set-media-rate': ['v', 'type', 'src', 'rate'],
};

function isOneOf<T extends string>(options: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (options as readonly string[]).includes(value);
}

/** A step can cross the whole offered range, never more. */
export const MAX_RATE_DELTA = MAX_RATE;
/** One hour either way: covers the seek presets (5-60 s) and generous custom steps. */
export const MAX_SEEK_SECONDS = 3600;

/** Finite, non-zero and within ±limit. */
function isBoundedStep(value: unknown, limit: number): value is number {
  return (
    typeof value === 'number' && Number.isFinite(value) && value !== 0 && Math.abs(value) <= limit
  );
}

function isCommandType(value: unknown): value is CommandType {
  return typeof value === 'string' && Object.hasOwn(FIELDS, value);
}

function isPlainObject(value: unknown): value is Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function isPlayerId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

export function parseCommand(input: unknown): ValidCommand | null {
  if (!isPlainObject(input)) return null;
  if (input['v'] !== PROTOCOL_VERSION) return null;
  const type = input['type'];
  if (!isCommandType(type)) return null;
  const allowed = FIELDS[type];
  const keys = Object.keys(input);
  if (keys.length !== allowed.length || !keys.every((key) => allowed.includes(key))) return null;

  switch (type) {
    case 'get-state':
      return { type };
    case 'set-rate': {
      const value = input['rate'];
      if (typeof value !== 'number') return null;
      const rate = toRate(value);
      return rate === null ? null : { type, rate };
    }
    case 'set-preserves-pitch': {
      const enabled = input['enabled'];
      return typeof enabled === 'boolean' ? { type, enabled } : null;
    }
    case 'select-player': {
      const playerId = input['playerId'];
      if (playerId === null) return { type, playerId: null };
      return isPlayerId(playerId) ? { type, playerId } : null;
    }
    case 'adjust-rate': {
      const delta = input['delta'];
      return isBoundedStep(delta, MAX_RATE_DELTA) ? { type, delta } : null;
    }
    case 'hold-start':
    case 'set-default-rate': {
      const value = input['rate'];
      if (typeof value !== 'number') return null;
      const rate = toRate(value);
      return rate === null ? null : { type, rate };
    }
    case 'set-media-rate': {
      const { src, rate: value } = input;
      if (typeof src !== 'string' || src === '' || src.length > MAX_MEDIA_SRC_LENGTH) return null;
      if (typeof value !== 'number') return null;
      const rate = toRate(value);
      return rate === null ? null : { type, src, rate };
    }
    case 'seek': {
      const seconds = input['seconds'];
      return isBoundedStep(seconds, MAX_SEEK_SECONDS) ? { type, seconds } : null;
    }
    case 'set-target': {
      const target = input['target'];
      return isOneOf(TARGETS, target) ? { type, target } : null;
    }
    case 'set-rate-policy': {
      const policy = input['policy'];
      return isOneOf(RATE_POLICIES, policy) ? { type, policy } : null;
    }
    case 'set-lock-fight': {
      const fight = input['fight'];
      return isOneOf(LOCK_FIGHTS, fight) ? { type, fight } : null;
    }
    case 'set-skip-silence': {
      const { enabled, mode } = input;
      const raw = input['silenceRate'];
      const silenceRate = typeof raw === 'number' ? toRate(raw) : null;
      return typeof enabled === 'boolean' && isOneOf(SILENCE_MODES, mode) && silenceRate !== null
        ? { type, enabled, mode, silenceRate }
        : null;
    }
    case 'loop-enable': {
      const enabled = input['enabled'];
      return typeof enabled === 'boolean' ? { type, enabled } : null;
    }
    case 'reset-rate':
    case 'previous-rate':
    case 'hold-end':
    case 'loop-set-a':
    case 'loop-set-b':
    case 'loop-clear':
    case 'pip-toggle':
      return { type };
  }
}
