// Node recognition without `instanceof`: a constructor belongs to one realm, while an engine may
// serve an iframe's document or see the page through an isolated world's wrappers. Node type,
// local name and capabilities are the same in every realm.

const ELEMENT_NODE = 1;
const DOCUMENT_NODE = 9;
const DOCUMENT_FRAGMENT_NODE = 11;
const MEDIA_SELECTOR = 'video, audio';

function hasNodeType(value: unknown): value is Node {
  return typeof value === 'object' && value !== null && 'nodeType' in value;
}

export function isElement(value: unknown): value is Element {
  return hasNodeType(value) && value.nodeType === ELEMENT_NODE;
}

export function isMediaElement(value: unknown): value is HTMLMediaElement {
  return (
    isElement(value) &&
    (value.localName === 'video' || value.localName === 'audio') &&
    'playbackRate' in value
  );
}

export function isVideoElement(media: HTMLMediaElement): media is HTMLVideoElement {
  return media.localName === 'video';
}

type Container = Element | Document | DocumentFragment;

function isContainer(node: Node): node is Container {
  return (
    node.nodeType === ELEMENT_NODE ||
    node.nodeType === DOCUMENT_NODE ||
    node.nodeType === DOCUMENT_FRAGMENT_NODE
  );
}

/**
 * The shadow root an element hosts, as far as this script may see: open ones by default; where
 * the browser gives an extension its own access, closed ones too (`browser/shadowRoots.ts`).
 */
export type ShadowReader = (element: Element) => ShadowRoot | null;

export const openShadowRoot: ShadowReader = (element) => element.shadowRoot;

export interface Scan {
  readonly media: HTMLMediaElement[];
  /** The shadow roots inside the scanned tree that `shadowRoot` sees, nested ones included. */
  readonly shadowRoots: ShadowRoot[];
}

/** Every media element under `node`, through the shadow roots it can see, and those roots. */
export function scanTree(node: Node, shadowRoot: ShadowReader = openShadowRoot): Scan {
  const media: HTMLMediaElement[] = [];
  const shadowRoots: ShadowRoot[] = [];
  const visit = (current: Node): void => {
    if (isMediaElement(current)) media.push(current);
    if (!isContainer(current)) return;
    const own = isElement(current) ? shadowRoot(current) : null;
    if (own !== null) {
      shadowRoots.push(own);
      visit(own);
    }
    for (const found of current.querySelectorAll(MEDIA_SELECTOR)) {
      if (isMediaElement(found)) media.push(found);
    }
    for (const element of current.querySelectorAll('*')) {
      const inner = shadowRoot(element);
      if (inner !== null) {
        shadowRoots.push(inner);
        visit(inner);
      }
    }
  };
  visit(node);
  return { media, shadowRoots };
}
