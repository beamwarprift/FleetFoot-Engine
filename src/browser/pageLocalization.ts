// The interface language of an extension page (popup, options, welcome): the chosen language with
// its whole catalogue. Kept apart from `i18n.ts`, so the page script and the background, which
// carry only their few texts, never take the catalogues in.

import { BROWSER_LANGUAGE, type LanguageChoice } from '../core/settings/Languages.ts';
import { loadCatalogue } from '../ui/catalogues.ts';
import type { Localization, MessageKey } from '../ui/i18n.ts';
import { browserLocalization, chosenLocalization } from './i18n.ts';

export async function pageLocalization(language: LanguageChoice): Promise<Localization> {
  if (language === BROWSER_LANGUAGE) return browserLocalization();
  return chosenLocalization<MessageKey>(language, await loadCatalogue(language));
}
