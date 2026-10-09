// What a layout must never do in any language: overflow its page sideways, push an element out of
// its box, or cut a text that does not fit. Measured on the real rendering.

/** One pixel of rounding between layout and painting. */
const TOLERANCE = 1;

function describe(element: Element): string {
  const name = element.getAttribute('aria-label') ?? element.textContent?.trim().slice(0, 30) ?? '';
  const classes =
    typeof element.className === 'string' && element.className !== ''
      ? `.${element.className.split(' ').join('.')}`
      : '';
  return `${element.localName}${classes} «${name}»`;
}

function visible(element: Element): boolean {
  return element.checkVisibility({ opacityProperty: false, visibilityProperty: true });
}

/** Faults found inside `root`, which must stay within `bounds` (its page or its viewport). */
export function layoutFaults(root: Element, bounds: DOMRect): string[] {
  const faults: string[] = [];
  for (const element of [root, ...root.querySelectorAll('*')]) {
    if (!visible(element) || element.closest('svg') !== null) continue;
    // Clipped on purpose: present for screen readers only.
    if (element.closest('.visually-hidden') !== null) continue;
    const box = element.getBoundingClientRect();
    if (box.width === 0 && box.height === 0) continue;
    if (box.left < bounds.left - TOLERANCE || box.right > bounds.right + TOLERANCE) {
      faults.push(`${describe(element)} leaves the page sideways`);
    }
    // A form control scrolls its own value; everything else must show all of its content.
    if (element.matches('input, select, textarea')) continue;
    // Shortened on purpose with «…», and only when its whole text is a control's description.
    if (
      getComputedStyle(element).textOverflow === 'ellipsis' &&
      element.id !== '' &&
      root.ownerDocument.querySelector(`[aria-describedby~="${element.id}"]`) !== null
    ) {
      continue;
    }
    const html = element as HTMLElement;
    if (html.scrollWidth > html.clientWidth + TOLERANCE && html.clientWidth > 0) {
      faults.push(`${describe(element)} cuts its content sideways`);
    }
    if (html.scrollHeight > html.clientHeight + TOLERANCE && html.clientHeight > 0) {
      faults.push(`${describe(element)} cuts its content vertically`);
    }
  }
  return faults;
}
