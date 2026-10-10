// The interface language: the browser's own i18n, English as its fallback, unless the user chose
// a language the extension carries a catalogue for.

import { browser } from 'wxt/browser';
import { BROWSER_LANGUAGE, type LanguageChoice } from '../core/settings/Languages.ts';
import { type Catalogue, catalogueLocalization } from '../ui/catalogue.ts';
import { isolate, type Localization, type MessageKey } from '../ui/i18n.ts';

export function browserLocalization(): Localization {
  return {
    t: (key: MessageKey, ...substitutions: string[]) =>
      browser.i18n.getMessage(key, substitutions.map(isolate)) || key,
    locale: browser.i18n.getUILanguage(),
    // The browser's own direction for the interface language.
    dir: browser.i18n.getMessage('@@bidi_dir') === 'rtl' ? 'rtl' : 'ltr',
  };
}

/** The chosen language's texts from `catalogue`; the browser's when none was chosen or found. */
export function chosenLocalization<K extends MessageKey>(
  language: LanguageChoice,
  catalogue: Catalogue<K | 'textDirection'> | null,
): Localization<K> {
  return language === BROWSER_LANGUAGE || catalogue === null
    ? browserLocalization()
    : catalogueLocalization(language, catalogue);
}
