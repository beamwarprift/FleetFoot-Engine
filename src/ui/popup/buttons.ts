// The popup's buttons: an optional icon, a text span updated in place, and one accessible name
// that is also the tooltip.

import { type Child, h, setAttr, setText } from '../dom.ts';
import { type IconName, icon } from '../icons.ts';

export interface ButtonOptions {
  readonly icon?: IconName;
  readonly text?: string;
  readonly label?: string;
  readonly className?: string;
  readonly attrs?: Record<string, string>;
  /** None when the platform acts on its own, as with a popover target. */
  readonly onClick?: () => void;
}

export function button(document: Document, options: ButtonOptions): HTMLButtonElement {
  const children: Child[] = [];
  if (options.icon !== undefined) children.push(icon(document, options.icon));
  children.push(h(document, 'span', { className: 'text', text: options.text ?? '' }));
  const attrs: Record<string, string> = { type: 'button', ...options.attrs };
  if (options.label !== undefined) {
    attrs['aria-label'] = options.label;
    attrs['title'] = options.label;
  }
  return h(
    document,
    'button',
    {
      className: options.className ?? '',
      attrs,
      on: options.onClick === undefined ? {} : { click: options.onClick },
    },
    children,
  );
}

/** Visible text and accessible name of a button built by `button`. */
export function setLabel(target: HTMLButtonElement, text: string, name: string): void {
  const span = target.querySelector('.text');
  if (span !== null) setText(span, text);
  setAttr(target, 'aria-label', name);
  setAttr(target, 'title', name);
}
