// Appearance: the interface language, the colour theme, each choice with a swatch of its
// background and accent, and the size of the text, which this page takes on as soon as it is
// chosen.

import { validSetting } from '../../core/settings/Settings.ts';
import { THEME_NAMES, type ThemeName } from '../../core/settings/Themes.ts';
import { h } from '../dom.ts';
import { formatPercent } from '../format.ts';
import type { MessageKey } from '../i18n.ts';
import { TEXT_SIZES } from '../textSize.ts';
import { PALETTES } from '../themes.ts';
import { languageField } from './languageField.ts';
import { type Control, type OptionsSection, type SectionDeps, settingsSection } from './section.ts';

const THEME_LABELS: Readonly<Record<ThemeName, MessageKey>> = {
  yellow: 'themeYellow',
  cyan: 'themeCyan',
  magenta: 'themeMagenta',
  green: 'themeGreen',
  violet: 'themeViolet',
  coral: 'themeCoral',
  slate: 'themeSlate',
  sepia: 'themeSepia',
  sage: 'themeSage',
  light: 'themeLight',
};

function textSizeField(deps: SectionDeps): Control {
  const { document, fields, settings, save } = deps;
  const { locale } = deps.l10n;
  const select = h(
    document,
    'select',
    { className: 'number' },
    TEXT_SIZES.map((size) =>
      h(document, 'option', { text: formatPercent(size, locale), attrs: { value: String(size) } }),
    ),
  );
  select.addEventListener('change', () => {
    const size = validSetting('textSize', Number(select.value));
    if (size !== undefined) void save('textSize', size);
  });
  return {
    element: fields.field('textSizeField', select, 'textSizeHelp'),
    refresh() {
      select.value = String(settings().textSize);
    },
  };
}

export function appearanceSection(
  deps: SectionDeps & { readonly browserLanguage: string },
): OptionsSection {
  const { document, fields, settings, save } = deps;
  const { t } = deps.l10n;
  const name = fields.nextId('radio');
  const inputs = THEME_NAMES.map((theme) => {
    const id = fields.nextId('option');
    const input = h(document, 'input', { attrs: { type: 'radio', name, value: theme, id } });
    input.addEventListener('change', () => {
      if (input.checked) void save('theme', theme);
    });
    const swatch = h(document, 'span', { className: 'swatch', attrs: { 'aria-hidden': 'true' } });
    swatch.style.setProperty('--swatch-bg', PALETTES[theme].bg);
    swatch.style.setProperty('--swatch-accent', PALETTES[theme].accent);
    return {
      input,
      element: h(document, 'div', { className: 'theme' }, [
        input,
        h(document, 'label', { attrs: { for: id } }, [swatch, t(THEME_LABELS[theme])]),
      ]),
    };
  });
  const themes = h(document, 'fieldset', { className: 'themes' }, [
    h(document, 'legend', { text: t('themeField') }),
    ...inputs.map(({ element }) => element),
  ]);
  const language = languageField(deps);
  const textSize = textSizeField(deps);
  return settingsSection(
    fields.section('sectionAppearance', [language.element, themes, textSize.element]),
    [
      language,
      {
        element: themes,
        refresh() {
          for (const { input } of inputs) input.checked = input.value === settings().theme;
        },
      },
      textSize,
    ],
  );
}
