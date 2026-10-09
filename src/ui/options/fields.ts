// The building blocks of the options page, shared by all its sections: a labelled field with its
// help and its error, a text input with a length limit, a group of choices, a two-step button.
// One page, one id counter, so every label points to its own control.

import { h, setAttr, setText } from '../dom.ts';
import { formatRate } from '../format.ts';
import type { Localization, MessageKey } from '../i18n.ts';
import type { InfoTip } from '../infoTip.ts';

export interface Choice<T extends string> {
  readonly value: T;
  readonly label: MessageKey;
  readonly help?: MessageKey;
}

/** What a group of choices may carry besides them: a place to be led to, a short explanation. */
export interface ChoiceExtras {
  readonly id?: string;
  readonly tip?: InfoTip;
}

export interface ChoiceGroup<T extends string> {
  readonly element: HTMLElement;
  /** Shows a value as chosen without saving anything. */
  show(value: T): void;
}

export type Fields = ReturnType<typeof createFields>;

export function createFields(document: Document, l10n: Localization) {
  const { t, locale } = l10n;
  let counter = 0;
  const nextId = (prefix: string) => `${prefix}-${++counter}`;

  /** A labelled control with an optional help text and a place for its error. */
  const field = (label: MessageKey, control: HTMLElement, help: MessageKey | null = null) => {
    const id = nextId('field');
    control.id = id;
    const helpElement =
      help === null
        ? null
        : h(document, 'p', { className: 'help', text: t(help), attrs: { id: `${id}-help` } });
    const error = h(document, 'p', { className: 'error', attrs: { id: `${id}-error` } });
    error.hidden = true;
    setAttr(control, 'aria-describedby', [helpElement?.id, error.id].filter(Boolean).join(' '));
    return h(document, 'div', { className: 'field' }, [
      h(document, 'label', { text: t(label), attrs: { for: id } }),
      control,
      helpElement,
      error,
    ]);
  };

  const showError = (control: HTMLElement, message: string | null): void => {
    const error = document.getElementById(`${control.id}-error`);
    if (error === null) return;
    error.textContent = message ?? '';
    error.hidden = message === null;
    setAttr(control, 'aria-invalid', String(message !== null));
  };

  const textInput = (inputmode: string, maxLength: number) =>
    h(document, 'input', {
      attrs: {
        type: 'text',
        inputmode,
        autocomplete: 'off',
        spellcheck: 'false',
        maxlength: String(maxLength),
      },
    });

  /** A rate or step as the user reads it: two decimals, the separator of their language. */
  const number = (value: number) => formatRate(value, locale).replace('×', '');

  /** Radio buttons in a fieldset; `onChoose` runs when the user picks one. */
  const choices = <T extends string>(
    legend: MessageKey,
    options: readonly Choice<T>[],
    onChoose: (value: T) => void,
    extras: ChoiceExtras = {},
  ): ChoiceGroup<T> => {
    const name = nextId('radio');
    const inputs = options.map((option) => {
      const id = nextId('option');
      const input = h(document, 'input', {
        attrs: { type: 'radio', name, value: option.value, id },
      });
      input.addEventListener('change', () => {
        if (input.checked) onChoose(option.value);
      });
      return {
        input,
        element: h(document, 'div', { className: 'choice' }, [
          input,
          h(document, 'label', { text: t(option.label), attrs: { for: id } }),
          option.help === undefined
            ? null
            : h(document, 'p', { className: 'help', text: t(option.help) }),
        ]),
      };
    });
    return {
      element: h(
        document,
        'fieldset',
        extras.id === undefined ? {} : { attrs: { id: extras.id } },
        [
          h(document, 'legend', {}, [
            h(document, 'span', { text: t(legend) }),
            extras.tip?.button ?? null,
          ]),
          ...inputs.map(({ element }) => element),
          extras.tip?.tip ?? null,
        ],
      ),
      show(value) {
        for (const { input } of inputs) input.checked = input.value === value;
      },
    };
  };

  /** A two-step button: the first click arms it, the second acts; leaving it disarms it. */
  const confirmButton = (label: MessageKey, confirm: MessageKey, act: () => void) => {
    const button = h(document, 'button', { text: t(label), attrs: { type: 'button' } });
    let armed = false;
    const disarm = () => {
      armed = false;
      setText(button, t(label));
    };
    button.addEventListener('click', () => {
      if (!armed) {
        armed = true;
        setText(button, t(confirm));
        return;
      }
      disarm();
      act();
    });
    button.addEventListener('blur', disarm);
    return button;
  };

  /** A section of the page; `id` lets a link elsewhere on the page lead to it. */
  const section = (title: MessageKey, children: readonly (HTMLElement | null)[], id?: string) =>
    h(document, 'section', id === undefined ? {} : { attrs: { id } }, [
      h(document, 'h2', { text: t(title) }),
      ...children,
    ]);

  return { nextId, field, showError, textInput, number, choices, confirmButton, section };
}
