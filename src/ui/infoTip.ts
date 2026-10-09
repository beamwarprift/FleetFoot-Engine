// An (i) button and the short explanation it opens, for the popup and the options page alike: a
// native popover, opened by click or keyboard, closed by Escape or a click elsewhere, shown in the
// top layer so the layout never grows.

import { h } from './dom.ts';
import { icon } from './icons.ts';

/** One paragraph: plain, or led by the name of what it explains, shown apart in bold. */
export type TipParagraph = string | { readonly term: string; readonly text: string };

export interface InfoTip {
  readonly button: HTMLButtonElement;
  readonly tip: HTMLElement;
}

/** `label` names the button for assistive technology and as its tooltip. */
export function infoTip(
  document: Document,
  id: string,
  label: string,
  paragraphs: readonly TipParagraph[],
): InfoTip {
  const button = h(
    document,
    'button',
    {
      className: 'info',
      attrs: { type: 'button', 'aria-label': label, title: label, popovertarget: id },
    },
    [icon(document, 'info')],
  );
  const tip = h(
    document,
    'div',
    { className: 'tip', attrs: { id, popover: 'auto' } },
    paragraphs.map((paragraph) =>
      typeof paragraph === 'string'
        ? h(document, 'p', { text: paragraph })
        : h(document, 'p', {}, [h(document, 'strong', { text: paragraph.term }), paragraph.text]),
    ),
  );
  return { button, tip };
}
