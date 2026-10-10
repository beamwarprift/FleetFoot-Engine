// Texts read from a catalogue the extension carries, for a language the user chose: the same
// format the browser reads (`messages.json`), filled in the same way, so a text reads the same
// whichever of the two looks it up.

import { languageTag } from '../core/settings/Languages.ts';
import { isolate, type Localization, type MessageKey } from './i18n.ts';

/** One text of a catalogue, as `messages.json` holds it. */
export interface CatalogueEntry {
  readonly message: string;
  readonly placeholders?: Readonly<Record<string, { readonly content: string }>>;
}

export type Catalogue<K extends string = MessageKey> = Readonly<Partial<Record<K, CatalogueEntry>>>;

/**
 * `$name$` is the content of its placeholder, `$1`…`$9` the substitution in that position and
 * `$$` a dollar sign, as the browser fills a message (developer.chrome.com, i18n «Placeholders»).
 */
export function fillMessage(entry: CatalogueEntry, substitutions: readonly string[]): string {
  const named = new Map(
    Object.entries(entry.placeholders ?? {}).map(([name, { content }]) => [
      name.toLowerCase(),
      content,
    ]),
  );
  const positional = (text: string): string =>
    text.replace(/\$(\$|[1-9])/g, (_, which: string) =>
      which === '$' ? '$' : (substitutions[Number(which) - 1] ?? ''),
    );
  return positional(
    entry.message.replace(/\$([A-Za-z0-9_@]+)\$/g, (whole, name: string) => {
      const content = named.get(name.toLowerCase());
      return content === undefined ? whole : content;
    }),
  );
}

/**
 * The localization of the catalogue named `name`. Its `textDirection` text says how the language
 * is written; a key the catalogue lacks reads as the key, as the browser's lookup does.
 */
export function catalogueLocalization<K extends string>(
  name: string,
  catalogue: Catalogue<K | 'textDirection'>,
): Localization<K> {
  const direction = catalogue.textDirection?.message;
  return {
    t: (key: K, ...substitutions: string[]) => {
      const entry = catalogue[key];
      return entry === undefined ? key : fillMessage(entry, substitutions.map(isolate));
    },
    locale: languageTag(name),
    dir: direction === 'rtl' ? 'rtl' : 'ltr',
  };
}

/**
 * Texts looked up one by one, each in every catalogue that has it (`virtual:catalogue-text/*`); a
 * text without placeholders comes as a plain string.
 */
export type TextsByCatalogue<K extends string> = Readonly<
  Record<K, Readonly<Record<string, string | CatalogueEntry>>>
>;

/** Of texts looked up one by one, those of the catalogue named `name`; null when there is none. */
export function textsOf<K extends string>(
  texts: TextsByCatalogue<K>,
  name: string,
): Catalogue<K> | null {
  const entries: Array<readonly [string, CatalogueEntry]> = [];
  for (const [key, byCatalogue] of Object.entries<
    Readonly<Record<string, string | CatalogueEntry>>
  >(texts)) {
    const text = Object.hasOwn(byCatalogue, name) ? byCatalogue[name] : undefined;
    if (text !== undefined)
      entries.push([key, typeof text === 'string' ? { message: text } : text]);
  }
  return entries.length === 0 ? null : (Object.fromEntries(entries) as Catalogue<K>);
}
