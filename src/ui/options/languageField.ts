// The interface language: the browser's first, then every language the extension carries, each
// named in itself (Deutsch, 日本語), as a reader looks for their own. Chosen, the page reloads in it.

import { BROWSER_LANGUAGE, languageTag } from '../../core/settings/Languages.ts';
import { validSetting } from '../../core/settings/Settings.ts';
import { CATALOGUE_NAMES } from '../catalogues.ts';
import { h } from '../dom.ts';
import type { Control, SectionDeps } from './section.ts';

/** A language's name in that language, as a list entry starts: «Italiano», «Español». */
export function ownName(tag: string): string {
  let name: string | undefined;
  try {
    name = new Intl.DisplayNames([tag], { type: 'language' }).of(tag);
  } catch {
    name = undefined;
  }
  if (name === undefined || name === '') return tag;
  return name.charAt(0).toLocaleUpperCase(tag) + name.slice(1);
}

export function languageField(deps: SectionDeps & { readonly browserLanguage: string }): Control {
  const { document, fields, settings, save } = deps;
  const { t } = deps.l10n;
  const choices = CATALOGUE_NAMES.map((name) => ({
    value: name,
    text: ownName(languageTag(name)),
  })).sort((a, b) => a.text.localeCompare(b.text, deps.l10n.locale));
  const select = h(document, 'select', { className: 'short' }, [
    h(document, 'option', {
      text: t('languageBrowser', ownName(deps.browserLanguage)),
      attrs: { value: BROWSER_LANGUAGE },
    }),
    ...choices.map(({ value, text }) =>
      h(document, 'option', { text, attrs: { value, lang: languageTag(value) } }),
    ),
  ]);
  select.addEventListener('change', () => {
    const language = validSetting('language', select.value);
    if (language !== undefined) void save('language', language);
  });
  return {
    element: fields.field('languageField', select, 'languageHelp'),
    refresh() {
      const language = settings().language;
      select.value = CATALOGUE_NAMES.includes(language) ? language : BROWSER_LANGUAGE;
    },
  };
}
