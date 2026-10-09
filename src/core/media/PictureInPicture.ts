// Picture-in-Picture for the active video: offered only where the browser provides the
// API, allows it for the element, and the element has data to show. No polyfill.

import type { PipError, PipState } from '../messages/Protocol.ts';
import { isVideoElement } from './dom.ts';

function isAvailable(media: HTMLMediaElement): media is HTMLVideoElement {
  if (!isVideoElement(media)) return false;
  const document = media.ownerDocument;
  return (
    typeof media.requestPictureInPicture === 'function' &&
    document.pictureInPictureEnabled === true &&
    media.disablePictureInPicture !== true &&
    media.readyState >= HTMLMediaElement.HAVE_METADATA
  );
}

function isActive(media: HTMLMediaElement): boolean {
  const document = media.ownerDocument;
  return 'pictureInPictureElement' in document && document.pictureInPictureElement === media;
}

export function pipState(media: HTMLMediaElement): PipState {
  return { available: isAvailable(media), active: isActive(media) };
}

/** Enters Picture-in-Picture with this element, or leaves it when the element is already in it. */
export async function togglePip(media: HTMLMediaElement): Promise<PipError | null> {
  try {
    if (isActive(media)) {
      await media.ownerDocument.exitPictureInPicture();
      return null;
    }
    if (!isAvailable(media)) return 'pip-unavailable';
    // The browser refuses without a recent user gesture in the page, among other reasons.
    await media.requestPictureInPicture();
    return null;
  } catch {
    return 'pip-rejected';
  }
}
