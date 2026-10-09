// The speed itself: slower and faster around a field the user can type in, and the chips for 1×,
// the previous speed and the favorite one.

import type { EngineState } from '../../core/messages/Protocol.ts';
import type { Settings } from '../../core/settings/Settings.ts';
import { h, setDisabled } from '../dom.ts';
import { formatRate } from '../format.ts';
import type { Localization } from '../i18n.ts';
import { button, setLabel } from './buttons.ts';
import type { PopupActions } from './popupActions.ts';

/** The longest valid entry is «16,00×»: nothing longer is accepted in the field. */
const RATE_INPUT_MAX_LENGTH = 8;

export function speedCard(document: Document, l10n: Localization, actions: PopupActions) {
  const { t, locale } = l10n;
  const rateInput = h(document, 'input', {
    className: 'rate',
    attrs: {
      type: 'text',
      inputmode: 'decimal',
      autocomplete: 'off',
      spellcheck: 'false',
      'aria-label': t('rateInputLabel'),
      maxlength: String(RATE_INPUT_MAX_LENGTH),
    },
    on: {
      change: () => actions.typedRate(rateInput.value),
      keydown: (event) => {
        const key = (event as KeyboardEvent).key;
        if (key === 'Enter') actions.typedRate(rateInput.value);
        else if (key === 'ArrowUp' || key === 'ArrowDown') {
          event.preventDefault();
          if (key === 'ArrowUp') actions.faster();
          else actions.slower();
        }
      },
    },
  });
  const reset = button(document, {
    icon: 'reset',
    className: 'chip',
    onClick: () => actions.reset(),
  });
  const previous = button(document, {
    icon: 'previous',
    className: 'chip',
    onClick: () => actions.previous(),
  });
  const favorite = button(document, {
    icon: 'favorite',
    className: 'chip',
    onClick: () => actions.favorite(),
  });
  const element = h(document, 'section', { className: 'card speed' }, [
    h(document, 'div', { className: 'stepper' }, [
      button(document, {
        icon: 'minus',
        className: 'round',
        label: t('slower'),
        onClick: () => actions.slower(),
      }),
      rateInput,
      button(document, {
        icon: 'plus',
        className: 'round',
        label: t('faster'),
        onClick: () => actions.faster(),
      }),
    ]),
    h(document, 'div', { className: 'chips' }, [reset, previous, favorite]),
  ]);
  const rate = (value: number) => formatRate(value, locale);
  return {
    element,
    render(state: EngineState, settings: Settings): void {
      // Never under the user's typing.
      if (state.rate !== null && document.activeElement !== rateInput) {
        rateInput.value = rate(state.rate);
      }
      setLabel(reset, rate(1), t('resetTo', rate(1)));
      const last = state.previousRate === null ? '—' : rate(state.previousRate);
      setLabel(previous, last, t('previousRate'));
      setDisabled(previous, state.previousRate === null);
      setLabel(
        favorite,
        rate(settings.favoriteRate),
        t('favoriteRate', rate(settings.favoriteRate)),
      );
    },
  };
}
