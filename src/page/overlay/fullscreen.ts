// Where the overlay's host lives: in fullscreen only the fullscreen element is drawn, so the host
// moves inside it when it holds the player; otherwise at the end of the document.

/** Whether `node` is inside `container`, across shadow boundaries. */
function composedContains(container: Node, node: Node): boolean {
  let current: Node | null = node;
  while (current !== null) {
    if (current === container) return true;
    const root = current.getRootNode();
    current =
      current.parentNode ?? (root !== current && 'host' in root ? (root as ShadowRoot).host : null);
  }
  return false;
}

/**
 * The element the host belongs in, and whether the player itself is fullscreen: then the browser
 * draws only the media, and the overlay has no place.
 */
export function hostPlace(
  document: Document,
  media: HTMLMediaElement | null,
): { readonly parent: Element; readonly mediaIsFullscreen: boolean } {
  const fullscreen = document.fullscreenElement;
  const holdsPlayer =
    fullscreen !== null &&
    media !== null &&
    fullscreen !== media &&
    composedContains(fullscreen, media);
  return {
    parent: holdsPlayer ? fullscreen : document.documentElement,
    mediaIsFullscreen: media !== null && fullscreen === media,
  };
}
