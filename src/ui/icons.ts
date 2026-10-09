// Interface icons: simple strokes on a 24-unit grid, drawn for this extension. Built through
// createElementNS (never parsed from markup) and hidden from assistive technology: the control
// that holds an icon carries the name.

const SVG = 'http://www.w3.org/2000/svg';

type Shape =
  | { readonly path: string }
  | { readonly rect: readonly [number, number, number, number, number]; readonly fill?: true }
  | { readonly circle: readonly [number, number, number] };

const ICONS = {
  minus: [{ path: 'M5 12h14' }],
  plus: [{ path: 'M12 5v14M5 12h14' }],
  back: [{ path: 'M4 12a8 8 0 1 0 2.6-5.9' }, { path: 'M4 4v4h4' }],
  forward: [{ path: 'M20 12a8 8 0 1 1-2.6-5.9' }, { path: 'M20 4v4h-4' }],
  copy: [
    { rect: [9, 9, 11, 11, 2] },
    { path: 'M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3' },
  ],
  settings: [
    { path: 'M4 7h9M17 7h3M4 17h3M11 17h9' },
    { circle: [15, 7, 2] },
    { circle: [9, 17, 2] },
  ],
  pip: [{ rect: [3, 5, 18, 14, 2] }, { rect: [12, 12, 6, 4, 1], fill: true }],
  // Sound, then the pause after it played faster.
  skipSilence: [{ path: 'M3 10v4M6 7v10M9 10v4M13 8l4 4-4 4M17 8l4 4-4 4' }],
  loop: [{ path: 'M4 11V9a3 3 0 0 1 3-3h12M16 3l3 3-3 3M20 13v2a3 3 0 0 1-3 3H5M8 21l-3-3 3-3' }],
  reset: [{ path: 'M4 12a8 8 0 1 0 2.6-5.9M4 4v4h4M12 8v4l3 2' }],
  previous: [{ path: 'M7 7h12M7 7l3-3M7 7l3 3M17 17H5M17 17l-3-3M17 17l-3 3' }],
  favorite: [{ path: 'M12 4l2.4 5 5.4.7-4 3.7 1 5.4L12 16.2 7.2 18.8l1-5.4-4-3.7 5.4-.7z' }],
  close: [{ path: 'M7 7l10 10M17 7L7 17' }],
  info: [{ circle: [12, 12, 9] }, { path: 'M12 11v5M12 8h.01' }],
  heart: [{ path: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6 4 4 0 0 1 7 2.6c0 5.6-7 10-7 10z' }],
} as const satisfies Record<string, readonly Shape[]>;

export type IconName = keyof typeof ICONS;

export function icon(document: Document, name: IconName): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', 'icon');
  for (const shape of ICONS[name] as readonly Shape[]) {
    let element: SVGElement;
    if ('path' in shape) {
      element = document.createElementNS(SVG, 'path');
      element.setAttribute('d', shape.path);
    } else if ('rect' in shape) {
      const [x, y, width, height, radius] = shape.rect;
      element = document.createElementNS(SVG, 'rect');
      for (const [key, value] of Object.entries({ x, y, width, height, rx: radius })) {
        element.setAttribute(key, String(value));
      }
      if (shape.fill === true) element.setAttribute('class', 'filled');
    } else {
      const [cx, cy, r] = shape.circle;
      element = document.createElementNS(SVG, 'circle');
      element.setAttribute('cx', String(cx));
      element.setAttribute('cy', String(cy));
      element.setAttribute('r', String(r));
    }
    svg.append(element);
  }
  return svg;
}
