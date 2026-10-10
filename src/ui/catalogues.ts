// The catalogues the extension carries: one more folder in `public/_locales` is one more language.
// Each is read whole only when its language is chosen, as a JSON module from the packaged
// `_locales` file the browser reads too (`virtual:catalogue-loaders`), so no text is packed twice.

import LOADERS from 'virtual:catalogue-loaders';
import type { Catalogue } from './catalogue.ts';

/** The catalogues' names (`it`, `pt_BR`…), in the order of their names. */
export const CATALOGUE_NAMES: readonly string[] = Object.keys(LOADERS).sort();

/** The catalogue named `name`; null for any other name, or where the browser cannot read it. */
export async function loadCatalogue(name: string): Promise<Catalogue | null> {
  const load = Object.hasOwn(LOADERS, name) ? LOADERS[name] : undefined;
  if (load === undefined) return null;
  try {
    return (await load()).default as Catalogue;
  } catch {
    return null;
  }
}
