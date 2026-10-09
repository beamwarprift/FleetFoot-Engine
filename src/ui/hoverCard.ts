// A card that explains a control and leads to its settings, opened without activating it: the
// mouse resting on the control, the keyboard reaching it, a long press on a touch screen. Unlike
// a tooltip it holds a link, so it stays open while the pointer or the focus is on it and closes
// with Escape (WCAG 2.2, 1.4.13 content on hover or focus). A native popover in the top layer:
// the layout never grows.

import { h } from './dom.ts';
import type { TipParagraph } from './infoTip.ts';

/** The mouse rests this long before the card opens: passing over the control opens nothing. */
export const SHOW_DELAY_MS = 400;
/** Time to move from the control to the card, or back, before it closes. */
export const HIDE_DELAY_MS = 300;

export interface CardLink {
  readonly text: string;
  readonly href: string;
}

/**
 * Attaches the card to `trigger`, which it describes for assistive technology, and returns it;
 * the caller places it right after the trigger, so Tab goes from the control into the card.
 */
export function hoverCard(
  document: Document,
  trigger: HTMLElement,
  id: string,
  paragraphs: readonly TipParagraph[],
  link: CardLink,
): HTMLElement {
  const text = h(
    document,
    'div',
    { attrs: { id: `${id}-text` } },
    paragraphs.map((paragraph) =>
      typeof paragraph === 'string'
        ? h(document, 'p', { text: paragraph })
        : h(document, 'p', {}, [h(document, 'strong', { text: paragraph.term }), paragraph.text]),
    ),
  );
  const anchor = h(document, 'a', {
    text: link.text,
    attrs: { href: link.href, target: '_blank' },
  });
  const card = h(
    document,
    'div',
    { className: 'tip hover-card', attrs: { id, popover: 'manual' } },
    [text, h(document, 'p', {}, [anchor])],
  );
  trigger.setAttribute('aria-describedby', text.id);
  // The card says more than a native tooltip would, and two would overlap.
  trigger.removeAttribute('title');

  let timer: ReturnType<typeof setTimeout> | null = null;
  let touched = false;
  // The focus Escape gives back to the control opens nothing.
  let returning = false;
  const wait = (ms: number, then: () => void) => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      then();
    }, ms);
  };
  const isOpen = () => card.matches(':popover-open');
  const open = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    if (!isOpen() && card.isConnected) card.showPopover();
  };
  const close = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    if (isOpen()) card.hidePopover();
  };
  const within = (node: EventTarget | null) =>
    node instanceof Node && (trigger.contains(node) || card.contains(node));

  trigger.addEventListener('pointerenter', (event) => {
    if (event.pointerType === 'mouse') wait(SHOW_DELAY_MS, open);
  });
  for (const element of [trigger, card]) {
    element.addEventListener('pointerleave', (event) => {
      if (event.pointerType === 'mouse' && !within(event.relatedTarget)) wait(HIDE_DELAY_MS, close);
    });
    element.addEventListener('focusout', (event) => {
      if (!within(event.relatedTarget)) close();
    });
  }
  card.addEventListener('pointerenter', () => {
    if (isOpen()) open();
  });
  // Only the keyboard: a click focuses the control too, and its card would cover the popup.
  trigger.addEventListener('focus', () => {
    if (!returning && trigger.matches(':focus-visible')) open();
  });
  // A long press on a touch screen, where nothing hovers.
  trigger.addEventListener('pointerdown', (event) => {
    touched = event.pointerType !== 'mouse';
  });
  trigger.addEventListener('contextmenu', (event) => {
    if (!touched) return;
    event.preventDefault();
    open();
  });
  // A touch elsewhere closes it, as nothing leaves it by hovering.
  document.addEventListener('pointerdown', (event) => {
    if (isOpen() && !within(event.target)) close();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isOpen()) {
      const inside = card.contains(document.activeElement);
      close();
      returning = true;
      if (inside) trigger.focus();
      returning = false;
    }
  });
  return card;
}
