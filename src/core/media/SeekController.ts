// Relative seeking that stays inside what the media can actually seek to.

/** Live streams and media without a seekable range cannot be sought: the interface disables it. */
export function isSeekable(media: HTMLMediaElement): boolean {
  return Number.isFinite(media.duration) && media.seekable.length > 0;
}

/** The seekable range holding the current position, else the nearest one. */
function rangeAround(ranges: TimeRanges, time: number): { start: number; end: number } | null {
  let best: { start: number; end: number; distance: number } | null = null;
  for (let index = 0; index < ranges.length; index++) {
    const start = ranges.start(index);
    const end = ranges.end(index);
    const distance = time < start ? start - time : time > end ? time - end : 0;
    if (best === null || distance < best.distance) best = { start, end, distance };
  }
  return best === null ? null : { start: best.start, end: best.end };
}

/** Returns the new position, or null when the media cannot be sought. */
export function seekBy(media: HTMLMediaElement, seconds: number): number | null {
  if (!isSeekable(media)) return null;
  const range = rangeAround(media.seekable, media.currentTime);
  if (range === null) return null;
  const target = Math.min(range.end, Math.max(range.start, media.currentTime + seconds));
  media.currentTime = target;
  return target;
}
