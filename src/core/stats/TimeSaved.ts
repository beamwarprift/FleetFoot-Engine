// The time-saved counter: one total in storage.local, nothing
// per site or per video. A page reports what it saved; the background adds it up.

export const TIME_SAVED_KEY = 'timeSavedSeconds';
export const TIME_SAVED_MESSAGE = 'fleetfoot-engine.time-saved';

/** A page reports at least every few tens of seconds saved; anything above an hour is not one. */
export const MAX_REPORT_SECONDS = 3600;

export interface TimeSavedReport {
  readonly type: typeof TIME_SAVED_MESSAGE;
  readonly seconds: number;
}

export function timeSavedReport(seconds: number): TimeSavedReport {
  return { type: TIME_SAVED_MESSAGE, seconds };
}

/** The seconds of a valid report, or null. */
export function parseReport(value: unknown): number | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const { type, seconds } = value as Readonly<Record<string, unknown>>;
  if (type !== TIME_SAVED_MESSAGE || Object.keys(value).length !== 2) return null;
  return typeof seconds === 'number' &&
    Number.isFinite(seconds) &&
    seconds > 0 &&
    seconds <= MAX_REPORT_SECONDS
    ? seconds
    : null;
}

/** The stored total, 0 when missing or unusable. */
export function parseTotal(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}
