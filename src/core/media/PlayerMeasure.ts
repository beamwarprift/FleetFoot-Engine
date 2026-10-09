// Measures a media element, or a frame, at the moment a decision is needed. Measuring on demand gives the exact
// geometry with no observer to keep in sync and nothing running while the page is idle.

export interface Viewport {
  readonly width: number;
  readonly height: number;
}

export interface Measure {
  readonly width: number;
  readonly height: number;
  /** CSS px² of the box inside the viewport; 0 when the element is not rendered visibly. */
  readonly visibleArea: number;
}

function renderedVisibly(media: Element): boolean {
  // checkVisibility also sees an ancestor with opacity 0 or content-visibility: hidden.
  if (typeof media.checkVisibility === 'function') {
    return media.checkVisibility({ opacityProperty: true, visibilityProperty: true });
  }
  const style = getComputedStyle(media);
  return style.visibility === 'visible' && style.opacity !== '0';
}

export function measurePlayer(media: Element, viewport: Viewport): Measure {
  const rect = media.getBoundingClientRect();
  const width = Math.max(0, rect.width);
  const height = Math.max(0, rect.height);
  if (width === 0 || height === 0 || !renderedVisibly(media))
    return { width, height, visibleArea: 0 };
  const visibleWidth = Math.max(0, Math.min(rect.right, viewport.width) - Math.max(rect.left, 0));
  const visibleHeight = Math.max(0, Math.min(rect.bottom, viewport.height) - Math.max(rect.top, 0));
  return { width, height, visibleArea: visibleWidth * visibleHeight };
}
