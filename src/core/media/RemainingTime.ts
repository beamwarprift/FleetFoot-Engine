// Remaining time at the current rate, and the clock format shared by remaining time and timestamps.

export interface Remaining {
  /** Seconds left at 1×. */
  readonly original: number;
  /** Seconds left at the current rate; null when the media is not advancing (rate 0). */
  readonly atRate: number | null;
}

/** Live streams, infinite or unknown durations have no honest estimate: null, never a guess. */
export function remainingTime(
  duration: number,
  currentTime: number,
  rate: number,
): Remaining | null {
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(currentTime)) return null;
  const original = Math.max(0, duration - currentTime);
  const atRate = Number.isFinite(rate) && rate > 0 ? original / rate : null;
  return { original, atRate };
}

const SECONDS_PER_HOUR = 3600;

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** `MM:SS`, or `HH:MM:SS` when `long` (content of an hour or more). Seconds are truncated. */
export function formatClock(seconds: number, long: boolean): string | null {
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  const whole = Math.floor(seconds);
  const hours = Math.floor(whole / SECONDS_PER_HOUR);
  const minutes = Math.floor((whole % SECONDS_PER_HOUR) / 60);
  const secs = whole % 60;
  if (long) return `${pad(hours)}:${pad(minutes)}:${pad(secs)}`;
  return `${pad(hours * 60 + minutes)}:${pad(secs)}`;
}

/** The format follows the content's length: its duration when known, else the position reached. */
export function formatTimestamp(currentTime: number, duration: number): string | null {
  const length = Number.isFinite(duration) && duration > 0 ? duration : currentTime;
  return formatClock(currentTime, length >= SECONDS_PER_HOUR);
}
