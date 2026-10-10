// The texts of the menu on a video or audio, in every catalogue: only these travel into the
// background, not the whole catalogues.

import menuFavorite from 'virtual:catalogue-text/menuFavorite';
import menuSpeed from 'virtual:catalogue-text/menuSpeed';
import textDirection from 'virtual:catalogue-text/textDirection';
import { type Catalogue, textsOf } from './catalogue.ts';

const MENU_TEXTS = { menuFavorite, menuSpeed, textDirection };

export type MenuKey = Exclude<keyof typeof MENU_TEXTS, 'textDirection'>;

/** The menu's texts in the catalogue named `name`; null when the extension carries none. */
export function menuCatalogue(name: string): Catalogue<MenuKey | 'textDirection'> | null {
  return textsOf(MENU_TEXTS, name);
}
