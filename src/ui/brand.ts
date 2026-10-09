// The FleetFoot Engine wordmark as the popup and the options page show it: the same two words in
// the logo's own colours, never translated.

import { h } from './dom.ts';

export function brandMark<K extends 'h1' | 'span'>(
  document: Document,
  tag: K,
): HTMLElementTagNameMap[K] {
  return h(document, tag, { className: 'brand' }, [
    h(document, 'span', { className: 'brand-name', text: 'FLEETFOOT' }),
    // Two words for screen readers, and a place to wrap where the line is too short for both.
    ' ',
    h(document, 'span', { className: 'brand-engine', text: 'ENGINE' }),
  ]);
}
