// "Is the user typing?": shortcuts never fire while a key goes into a field, an editor
// or anything that takes text, including fields inside open shadow roots.

import { isElement, openShadowRoot, type ShadowReader } from '../core/media/dom.ts';

/** Input types that do not take text: a key pressed on them is not typing. */
const NON_TEXT_INPUTS: ReadonlySet<string> = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'hidden',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
]);

/** ARIA roles of widgets that take typed text, whatever element implements them. */
const TEXT_ROLES: ReadonlySet<string> = new Set(['textbox', 'searchbox', 'combobox', 'spinbutton']);

function takesText(element: Element): boolean {
  switch (element.localName) {
    case 'textarea':
    case 'select':
      return true;
    case 'input':
      return !NON_TEXT_INPUTS.has((element.getAttribute('type') ?? 'text').toLowerCase());
  }
  if ((element as HTMLElement).isContentEditable === true) return true;
  const role = element.getAttribute('role');
  return role !== null && TEXT_ROLES.has(role.trim().toLowerCase());
}

/** The focused element, looking inside the shadow roots `shadowRoot` sees. */
function deepActiveElement(document: Document, shadowRoot: ShadowReader): Element | null {
  let active: Element | null = document.activeElement;
  for (;;) {
    const inner = active === null ? null : shadowRoot(active)?.activeElement;
    if (inner == null || inner === active) return active;
    active = inner;
  }
}

export function isTyping(
  event: Event,
  document: Document,
  shadowRoot: ShadowReader = openShadowRoot,
): boolean {
  const [target] = event.composedPath();
  if (isElement(target) && takesText(target)) return true;
  const active = deepActiveElement(document, shadowRoot);
  return active !== null && takesText(active);
}
