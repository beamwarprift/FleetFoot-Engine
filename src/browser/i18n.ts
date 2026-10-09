// The browser's own i18n: the interface language follows the browser, English as the fallback.

import { browser } from 'wxt/browser';
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
