// The interface language: the browser's own, or one the user chose, named as its catalogue is
// (`public/_locales/<name>`). Any well-formed name is kept; a name with no catalogue reads as the
// browser's language where the texts are looked up.

/** The interface follows the browser's language. */
export const BROWSER_LANGUAGE = 'browser';

export type LanguageChoice = string;

/** A catalogue's name: a language code, with a region where the language has more than one form. */
const CATALOGUE_NAME = /^[a-z]{2,3}(?:_[A-Z]{2})?$/;

export function asLanguage(value: unknown): LanguageChoice | undefined {
  return typeof value === 'string' && (value === BROWSER_LANGUAGE || CATALOGUE_NAME.test(value))
    ? value
    : undefined;
}

/** The BCP 47 tag of a catalogue's language: `pt_BR` is `pt-BR`. */
export function languageTag(catalogue: string): string {
  return catalogue.replace('_', '-');
}
