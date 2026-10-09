// The frames on a page that come from another site, are on screen and are allowed by the page to
// act as a player: when no player is found here, the one the user looks for may be inside one of
// them, where the page script reaches only once that site is allowed. Only what the page wrote on
// each frame is read: its address and what it allows.

import { MAX_FRAMED_SITES } from '../messages/Protocol.ts';
import { siteOf } from '../settings/Sites.ts';
import { measurePlayer, type Viewport } from './PlayerMeasure.ts';

/**
 * What a page lets a frame do only when the frame plays media (HTML `allow`, Permissions Policy
 * features): an embedded player asks for some of them, an advertisement or a widget does not.
 */
const PLAYER_FEATURES = ['fullscreen', 'autoplay', 'encrypted-media', 'picture-in-picture'];

function mayPlay(frame: Element): boolean {
  if (frame.hasAttribute('allowfullscreen')) return true;
  const allowed = (frame.getAttribute('allow') ?? '')
    .split(';')
    .map((entry) => entry.trim().split(/\s+/)[0]?.toLowerCase());
  return PLAYER_FEATURES.some((feature) => allowed.includes(feature));
}

/** The sites of the visible player frames from another site than `own`, the largest first. */
export function framedSites(
  trees: Iterable<ParentNode>,
  own: string | null,
  viewport: Viewport,
): string[] {
  const areas = new Map<string, number>();
  for (const tree of trees) {
    for (const frame of tree.querySelectorAll('iframe, frame')) {
      const site = siteOfFrame(frame);
      if (site === null || site === own || !mayPlay(frame)) continue;
      const area = measurePlayer(frame, viewport).visibleArea;
      if (area > (areas.get(site) ?? 0)) areas.set(site, area);
    }
  }
  return [...areas]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_FRAMED_SITES)
    .map(([site]) => site);
}

/** The site a frame loads, from its own address; none for a frame without a web address. */
function siteOfFrame(frame: Element): string | null {
  const src = frame.getAttribute('src');
  if (src === null || src.trim() === '') return null;
  let url: URL;
  try {
    url = new URL(src, frame.ownerDocument.baseURI);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  return siteOf(url.hostname);
}
