// Pitch correction while the rate changes.

export function supportsPreservesPitch(media: HTMLMediaElement): boolean {
  return 'preservesPitch' in media;
}

/** Returns false when the element does not support the setting or ignores the write. */
export function applyPreservesPitch(media: HTMLMediaElement, enabled: boolean): boolean {
  if (!supportsPreservesPitch(media)) return false;
  media.preservesPitch = enabled;
  return media.preservesPitch === enabled;
}
