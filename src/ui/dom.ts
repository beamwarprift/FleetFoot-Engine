// Builds interface elements without parsing HTML: text goes through textContent, attributes
// through setAttribute. Shared by the popup, the options page and the overlay.

export type Child = Node | string | null | false;

export interface ElementProps {
  readonly className?: string;
  readonly text?: string;
  readonly attrs?: Readonly<Record<string, string>>;
  readonly on?: Readonly<Partial<Record<keyof HTMLElementEventMap, (event: Event) => void>>>;
}

export function h<K extends keyof HTMLElementTagNameMap>(
  document: Document,
  tag: K,
  props: ElementProps = {},
  children: readonly Child[] = [],
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (props.className !== undefined) element.className = props.className;
  if (props.text !== undefined) element.textContent = props.text;
  for (const [name, value] of Object.entries(props.attrs ?? {})) element.setAttribute(name, value);
  for (const [type, listener] of Object.entries(props.on ?? {})) {
    if (listener !== undefined) element.addEventListener(type, listener);
  }
  for (const child of children) {
    if (child === null || child === false) continue;
    element.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return element;
}

/** Sets text only when it changes, so assistive technology is not told about non-changes. */
export function setText(element: Element, text: string): void {
  if (element.textContent !== text) element.textContent = text;
}

export function setHidden(element: HTMLElement, hidden: boolean): void {
  if (element.hidden !== hidden) element.hidden = hidden;
}

export function setDisabled(
  element: HTMLButtonElement | HTMLInputElement | HTMLSelectElement,
  disabled: boolean,
): void {
  if (element.disabled !== disabled) element.disabled = disabled;
}

export function setAttr(element: Element, name: string, value: string): void {
  if (element.getAttribute(name) !== value) element.setAttribute(name, value);
}
