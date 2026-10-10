// The texts the page script shows (the overlay), in every catalogue: only these travel into the
// page, not the whole catalogues. The overlay is typed to these keys, so a text it uses and this
// list lacks does not build.

import faster from 'virtual:catalogue-text/faster';
import overlayLabel from 'virtual:catalogue-text/overlayLabel';
import overlayLess from 'virtual:catalogue-text/overlayLess';
import overlayMore from 'virtual:catalogue-text/overlayMore';
import overlayMove from 'virtual:catalogue-text/overlayMove';
import pipEnter from 'virtual:catalogue-text/pipEnter';
import pipExit from 'virtual:catalogue-text/pipExit';
import resetTo from 'virtual:catalogue-text/resetTo';
import seekBack from 'virtual:catalogue-text/seekBack';
import seekForward from 'virtual:catalogue-text/seekForward';
import slower from 'virtual:catalogue-text/slower';
import textDirection from 'virtual:catalogue-text/textDirection';
import { type Catalogue, textsOf } from '../ui/catalogue.ts';

const PAGE_TEXTS = {
  faster,
  overlayLabel,
  overlayLess,
  overlayMore,
  overlayMove,
  pipEnter,
  pipExit,
  resetTo,
  seekBack,
  seekForward,
  slower,
  textDirection,
};

export type PageKey = Exclude<keyof typeof PAGE_TEXTS, 'textDirection'>;

/** The page's texts in the catalogue named `name`; null when the extension carries none. */
export function pageCatalogue(name: string): Catalogue<PageKey | 'textDirection'> | null {
  return textsOf(PAGE_TEXTS, name);
}
