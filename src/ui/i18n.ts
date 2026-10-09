// Interface texts. The English catalogue is the reference: every key used in code must exist in
// it (checked by the type), and every catalogue must hold the same keys (checked by a test).

type Catalogue = typeof import('../../public/_locales/en/messages.json');

export type MessageKey = keyof Catalogue;

/** The text of `key` in the interface language, with `$1`, `$2`… filled in order. */
export type Translate = (key: MessageKey, ...substitutions: string[]) => string;

export interface Localization {
  readonly t: Translate;
  /** BCP 47 tag of the interface language, for number formatting. */
  readonly locale: string;
  /** Writing direction of the interface language. */
  readonly dir: TextDirection;
}

export type TextDirection = 'ltr' | 'rtl';

/**
 * A value inserted in a sentence, kept apart from the sentence's direction (Unicode FSI … PDI):
 * a time, a speed or a key name reads the same inside right-to-left text.
 */
export function isolate(value: string): string {
  return `\u2068${value}\u2069`;
}
