// The preset speeds, one button each, the current one pressed.

import { h, setAttr } from '../dom.ts';
import { formatRate } from '../format.ts';
import type { Localization } from '../i18n.ts';

export function presetsCard(
  document: Document,
  l10n: Localization,
  choose: (rate: number) => void,
) {
  const { t, locale } = l10n;
  const buttons = h(document, 'div', {
    className: 'presets',
    attrs: { role: 'group', 'aria-labelledby': 'presets-caption' },
  });
  const element = h(document, 'section', { className: 'section' }, [
    h(document, 'h2', {
      className: 'caption',
      text: t('presets'),
      attrs: { id: 'presets-caption' },
    }),
    buttons,
  ]);
  // Rebuilt only when the presets change; otherwise only which one is pressed.
  let shown = '';
  return {
    element,
    render(presets: readonly number[], current: number | null): void {
      const values = presets.join(',');
      if (values !== shown) {
        shown = values;
        buttons.replaceChildren(
          ...presets.map((preset) =>
            h(document, 'button', {
              text: formatRate(preset, locale),
              attrs: { type: 'button', 'data-rate': String(preset), 'aria-pressed': 'false' },
              on: { click: () => choose(preset) },
            }),
          ),
        );
      }
      for (const preset of buttons.querySelectorAll('button')) {
        setAttr(preset, 'aria-pressed', String(Number(preset.dataset['rate']) === current));
      }
    },
  };
}
