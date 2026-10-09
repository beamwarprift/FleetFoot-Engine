// Puts the interface language on an extension page: its tag for speech and hyphenation, and its
// writing direction, so the layout mirrors for right-to-left languages.

import type { Localization } from './i18n.ts';

export function applyLanguage(root: HTMLElement, l10n: Localization): void {
  root.lang = l10n.locale;
  root.dir = l10n.dir;
}
