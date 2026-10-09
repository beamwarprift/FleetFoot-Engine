// Reads what a page sends back. The page script is ours, but it runs in the page's process: the
// extension's pages accept only data shaped exactly like the contract.

import { siteOf } from '../settings/Sites.ts';
import {
  type EngineState,
  ERROR_CODES,
  type LoopState,
  MAX_FRAMED_SITES,
  type PipState,
  type PlayerInfo,
  PROTOCOL_VERSION,
  RATE_POLICIES,
  type Response,
  SKIP_SILENCE_STATUSES,
  type SkipSilenceState,
  TARGETS,
} from './Protocol.ts';

type Fields = Readonly<Record<string, unknown>>;

function isFields(value: unknown): value is Fields {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNumberOrNull(value: unknown): value is number | null {
  return value === null || isFiniteNumber(value);
}

function isOneOf<T extends string>(options: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (options as readonly string[]).includes(value);
}

function isPlayer(value: unknown): value is PlayerInfo {
  if (!isFields(value)) return false;
  const { id, kind, playing, width, height, frame } = value;
  return (
    isFiniteNumber(id) &&
    (kind === 'video' || kind === 'audio') &&
    typeof playing === 'boolean' &&
    isFiniteNumber(width) &&
    isFiniteNumber(height) &&
    (frame === null || (isFields(frame) && isSite(frame['site'])))
  );
}

function isLoop(value: unknown): value is LoopState | null {
  if (value === null) return true;
  if (!isFields(value)) return false;
  return (
    isNumberOrNull(value['a']) &&
    isNumberOrNull(value['b']) &&
    typeof value['enabled'] === 'boolean'
  );
}

function isRemaining(value: unknown): boolean {
  if (value === null) return true;
  return isFields(value) && isFiniteNumber(value['original']) && isNumberOrNull(value['atRate']);
}

function isPip(value: unknown): value is PipState {
  return (
    isFields(value) &&
    typeof value['available'] === 'boolean' &&
    typeof value['active'] === 'boolean'
  );
}

function isSkipSilence(value: unknown): value is SkipSilenceState {
  return isFields(value) && isOneOf(SKIP_SILENCE_STATUSES, value['status']);
}

/** A site as the engine reports it, never any other text. */
function isSite(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && siteOf(value) === value);
}

function isFramedSites(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) &&
    value.length <= MAX_FRAMED_SITES &&
    value.every((site) => site !== null && isSite(site))
  );
}

export function parseEngineState(value: unknown): EngineState | null {
  if (!isFields(value) || value['v'] !== PROTOCOL_VERSION) return null;
  const players = value['players'];
  const valid =
    Array.isArray(players) &&
    players.every(isPlayer) &&
    isNumberOrNull(value['activePlayerId']) &&
    typeof value['pinned'] === 'boolean' &&
    isNumberOrNull(value['rate']) &&
    typeof value['preservesPitch'] === 'boolean' &&
    isNumberOrNull(value['previousRate']) &&
    typeof value['holding'] === 'boolean' &&
    typeof value['seekable'] === 'boolean' &&
    isNumberOrNull(value['currentTime']) &&
    isNumberOrNull(value['duration']) &&
    isRemaining(value['remaining']) &&
    isOneOf(TARGETS, value['target']) &&
    isOneOf(RATE_POLICIES, value['ratePolicy']) &&
    isNumberOrNull(value['desiredRate']) &&
    isLoop(value['loop']) &&
    typeof value['rateContested'] === 'boolean' &&
    isPip(value['pip']) &&
    isSite(value['site']) &&
    isSkipSilence(value['skipSilence']) &&
    isFramedSites(value['framedSites']);
  return valid ? (value as unknown as EngineState) : null;
}

export function parseResponse(value: unknown): Response | null {
  if (!isFields(value)) return null;
  const state = parseEngineState(value['state']);
  if (state === null) return null;
  if (value['ok'] === true) return { ok: true, state };
  const error = value['error'];
  return value['ok'] === false && isOneOf(ERROR_CODES, error) ? { ok: false, error, state } : null;
}
