// The preset speeds, one button each, the current one pressed. Their title opens and closes them,
// so the popup stays short for whoever does not use them; the popup remembers which.

import { h, setAttr, setHidden } from '../dom.ts';
import { formatRate } from '../format.ts';
import type { Localization } from '../i18n.ts';
import { icon } from '../icons.ts';

export function presetsCard(
  document: Document,
  l10n: Localization,
  choose: (rate: number) => void,
  setOpen: (open: boolean) => void,
) {
  const { t, locale } = l10n;
  const buttons = h(document, 'div', {
    className: 'presets',
    attrs: { id: 'presets-list', role: 'group', 'aria-labelledby': 'presets-caption' },
  });
  const disclosure = h(
    document,
    'button',
    {
      className: 'disclosure',
      attrs: {
        type: 'button',
        id: 'presets-caption',
        'aria-expanded': 'false',
        'aria-controls': 'presets-list',
      },
      on: { click: () => setOpen(disclosure.getAttribute('aria-expanded') !== 'true') },
    },
    [t('presets'), icon(document, 'chevron')],
  );
  const element = h(document, 'section', { className: 'section' }, [
    h(document, 'h2', { className: 'caption' }, [disclosure]),
    buttons,
  ]);
  // Rebuilt only when the presets change; otherwise only which one is pressed.
  let shown = '';
  return {
    element,
    render(presets: readonly number[], current: number | null, open: boolean): void {
      setAttr(disclosure, 'aria-expanded', String(open));
      setHidden(buttons, !open);
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
