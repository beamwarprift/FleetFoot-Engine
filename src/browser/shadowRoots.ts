// The extension's own access to the shadow roots pages close (Compatibility Mode): read
// from the extension's isolated world, nothing runs in the page's. Chosen by what the browser
// offers, never by its name: `dom.openOrClosedShadowRoot` (MDN: Chrome and Edge 88+), else the
// element's `openOrClosedShadowRoot` (MDN: Firefox 63+, in content scripts), else open roots only.

import { openShadowRoot, type ShadowReader } from '../core/media/dom.ts';

interface DomAccess {
  openOrClosedShadowRoot?: (element: HTMLElement) => ShadowRoot | null;
}

interface WithClosedRoot {
  readonly openOrClosedShadowRoot?: ShadowRoot | null;
}

export function extensionShadowRoot(): ShadowReader {
  const dom = (globalThis as { chrome?: { dom?: DomAccess } }).chrome?.dom;
  const read = dom?.openOrClosedShadowRoot;
  if (typeof read === 'function') {
    return (element) => {
      try {
        return read.call(dom, element as HTMLElement) ?? null;
      } catch {
        // An element that cannot host a shadow root.
        return openShadowRoot(element);
      }
    };
  }
  return (element) => {
    const root = (element as WithClosedRoot).openOrClosedShadowRoot;
    return root === undefined ? openShadowRoot(element) : root;
  };
}
