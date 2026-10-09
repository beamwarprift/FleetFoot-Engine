// The optional overlay on the active player: very small, shown while the pointer is on
// the player, at a touch on it and shortly after a change, draggable, isolated from the page in a closed shadow
// root. It never takes space in the page's layout and its events never reach the page. What it
// shows is `overlayBar.ts`, how the user moves it `overlayDrag.ts`, where its host lives in
// fullscreen `fullscreen.ts`; this module decides where and when it is drawn.

import type { MediaEngine } from '../../core/MediaEngine.ts';
import { type EngineState, makeCommand } from '../../core/messages/Protocol.ts';
import type { OverlayPosition, Settings } from '../../core/settings/Settings.ts';
import type { Localization } from '../../ui/i18n.ts';
import { hostPlace } from './fullscreen.ts';
import { overlayBar } from './overlayBar.ts';
import { overlayDrag } from './overlayDrag.ts';
import { type Box, contains, DEFAULT_POSITION, fits, placeOverlay, toBox } from './placement.ts';
import { applyStyle, FORCED_COLORS, HOST, type Palette, themePalette } from './styles.ts';

/** How long the overlay stays after the pointer leaves the player or a change. Chosen value. */
export const HIDE_AFTER_MS = 2000;

/** Events that stop at the overlay, so the page's player never reacts to a click on it. */
const CONTAINED_EVENTS = [
  'pointerdown',
  'pointerup',
  'mousedown',
  'mouseup',
  'click',
  'dblclick',
  'contextmenu',
  'keydown',
  'keyup',
  'wheel',
] as const;

export interface OverlayDeps {
  readonly window: Window;
  readonly engine: MediaEngine;
  readonly l10n: Localization;
  readonly settings: () => Settings;
  readonly savePosition: (position: OverlayPosition) => void;
}

export class Overlay {
  readonly #deps: OverlayDeps;
  readonly #document: Document;
  readonly #host: HTMLElement;
  readonly #bar: ReturnType<typeof overlayBar>;
  readonly #drag: ReturnType<typeof overlayDrag>;
  readonly #forced: MediaQueryList;
  /** A finger rather than a mouse: no hover, bigger controls (phones, tablets). */
  readonly #coarse: MediaQueryList;
  #abort: AbortController | null = null;
  #media: HTMLMediaElement | null = null;
  #mediaBox: Box | null = null;
  #resize: ResizeObserver | null = null;
  #unsubscribe: (() => void) | null = null;
  #hideTimer: ReturnType<typeof setTimeout> | null = null;
  #hovering = false;
  #sessionHidden = false;
  #lastRate: number | null = null;

  constructor(deps: OverlayDeps) {
    this.#deps = deps;
    const document = deps.window.document;
    this.#document = document;
    this.#forced = deps.window.matchMedia('(forced-colors: active)');
    this.#coarse = deps.window.matchMedia('(pointer: coarse)');

    this.#host = document.createElement('fleetfoot-engine-overlay');
    applyStyle(this.#host, HOST);
    const shadow = this.#host.attachShadow({ mode: 'closed' });
    for (const type of CONTAINED_EVENTS) {
      shadow.addEventListener(type, (event) => event.stopPropagation());
    }

    this.#bar = overlayBar(document, deps.l10n, {
      step: (direction) => {
        const delta = direction * deps.settings().rateStep;
        void deps.engine.handleMessage(makeCommand('adjust-rate', { delta }));
      },
      seek: (direction) => {
        const seconds = direction * deps.settings().seekStep;
        void deps.engine.handleMessage(makeCommand('seek', { seconds }));
      },
      send: (command) => void deps.engine.handleMessage(command),
      startDrag: (event, handle) => this.#drag.start(event, handle),
      keyMove: (event) => this.#drag.keyMove(event),
      resized: () => this.#place(),
    });
    this.#drag = overlayDrag({
      bar: this.#bar.element,
      box: () => this.#box(),
      moveTo: (x, y) => this.#moveTo(x, y),
      position: () => deps.settings().overlayPosition,
      save: deps.savePosition,
    });
    shadow.append(this.#bar.element);
    this.#repaint();
    this.#setDrawn(false);
  }

  start(): void {
    if (this.#abort !== null) return;
    this.#abort = new AbortController();
    const { signal } = this.#abort;
    const { window } = this.#deps;
    const passive = { capture: true, passive: true, signal };
    window.addEventListener('pointermove', (event) => this.#onPointerMove(event), passive);
    // A touch on the player shows it too: a finger never hovers.
    window.addEventListener('pointerdown', (event) => this.#onPointerDown(event), passive);
    window.addEventListener('scroll', () => this.#layoutChanged(), passive);
    window.addEventListener('resize', () => this.#layoutChanged(), { passive: true, signal });
    this.#document.addEventListener('fullscreenchange', () => this.#reparent(), { signal });
    this.#forced.addEventListener('change', () => this.#repaint(), { signal });
    this.#coarse.addEventListener('change', () => this.#repaint(), { signal });
    // Forced colours may have changed while stopped.
    this.#repaint();
    const bar = this.#bar.element;
    bar.addEventListener('focusin', () => this.#show(), { signal });
    // At focusout the focus has not moved yet: the timer checks it when it fires.
    bar.addEventListener('focusout', () => this.#scheduleHide(true), { signal });
    this.#document.addEventListener(
      'pointerout',
      (event) => {
        if ((event as PointerEvent).relatedTarget !== null) return;
        // The pointer left the window.
        this.#hovering = false;
        this.#scheduleHide();
      },
      { passive: true, signal },
    );
    this.#unsubscribe = this.#deps.engine.subscribe((state) => this.#onState(state), {
      time: false,
    });
  }

  stop(): void {
    this.#abort?.abort();
    this.#abort = null;
    this.#unsubscribe?.();
    this.#unsubscribe = null;
    this.#bindMedia(null);
    this.#clearHideTimer();
    this.#host.remove();
  }

  /** The overlay toggle shortcut: hides or shows it for this page until reload. */
  toggle(): void {
    this.#sessionHidden = !this.#sessionHidden;
    if (this.#sessionHidden) this.#hide();
    else this.#show();
  }

  /** Settings changed: the position may have moved. */
  refresh(): void {
    this.#repaint();
    if (!this.#host.hidden && !this.#place()) this.#hide();
  }

  #onState(state: EngineState): void {
    const media = this.#deps.engine.activeMedia();
    if (media !== this.#media) this.#bindMedia(media);
    this.#bar.render(state, this.#deps.settings());
    if (state.rate !== this.#lastRate) {
      // A change made elsewhere (shortcut, popup) shows briefly where the user is looking.
      if (this.#lastRate !== null && state.rate !== null) this.#show();
      this.#lastRate = state.rate;
    }
    if (media === null) this.#hide();
  }

  #bindMedia(media: HTMLMediaElement | null): void {
    this.#resize?.disconnect();
    this.#resize = null;
    this.#media = media;
    this.#mediaBox = null;
    if (media === null) return;
    this.#resize = new ResizeObserver(() => this.#layoutChanged());
    this.#resize.observe(media);
    this.#reparent();
  }

  #box(): Box | null {
    if (this.#media === null) return null;
    this.#mediaBox ??= toBox(this.#media.getBoundingClientRect());
    return this.#mediaBox;
  }

  #layoutChanged(): void {
    this.#mediaBox = null;
    if (!this.#host.hidden && !this.#place()) this.#hide();
  }

  #onPointerMove(event: PointerEvent): void {
    // Only a mouse or a pen hovers; a moving finger is a scroll or a drag.
    if (this.#drag.isDragging() || event.pointerType === 'touch') return;
    const box = this.#box();
    const over = box !== null && contains(box, event.clientX, event.clientY);
    const wasHovering = this.#hovering;
    this.#hovering = over;
    if (over) this.#show();
    else if (wasHovering) this.#scheduleHide();
  }

  #onPointerDown(event: PointerEvent): void {
    if (event.pointerType !== 'touch' || this.#drag.isDragging()) return;
    const box = this.#box();
    if (box !== null && contains(box, event.clientX, event.clientY)) this.#show();
  }

  #visibleAllowed(): boolean {
    return this.#media !== null && !this.#sessionHidden && this.#deps.settings().overlayEnabled;
  }

  #show(): void {
    if (!this.#visibleAllowed()) return;
    if (!this.#host.isConnected) this.#reparent();
    if (this.#host.hidden) {
      // Measured once when it appears; while visible, only layout changes move it.
      this.#setDrawn(true);
      if (!this.#place()) {
        this.#hide();
        return;
      }
    }
    this.#scheduleHide();
  }

  #hide(): void {
    this.#clearHideTimer();
    this.#setDrawn(false);
  }

  /**
   * The host's own styles reset everything with priority (so the page cannot restyle it), which
   * also beats the browser's `[hidden]` rule: being drawn is set on the style as well.
   */
  #setDrawn(drawn: boolean): void {
    this.#host.hidden = !drawn;
    applyStyle(this.#host, { display: drawn ? 'block' : 'none' });
  }

  /** One timer, armed when the pointer or the focus leaves; nothing runs while the user is there. */
  #scheduleHide(focusMoving = false): void {
    this.#clearHideTimer();
    const bar = this.#bar.element;
    if (this.#hovering || this.#drag.isDragging()) return;
    if (!focusMoving && bar.matches(':focus-within')) return;
    this.#hideTimer = setTimeout(() => {
      this.#hideTimer = null;
      if (!this.#hovering && !this.#drag.isDragging() && !bar.matches(':focus-within')) {
        this.#hide();
      }
    }, HIDE_AFTER_MS);
  }

  #clearHideTimer(): void {
    if (this.#hideTimer !== null) clearTimeout(this.#hideTimer);
    this.#hideTimer = null;
  }

  /** In fullscreen only the fullscreen element is drawn: the overlay moves inside it. */
  #reparent(): void {
    const { parent, mediaIsFullscreen } = hostPlace(this.#document, this.#media);
    if (this.#host.parentNode !== parent) parent.append(this.#host);
    if (mediaIsFullscreen) this.#hide();
    this.#layoutChanged();
  }

  /** Puts the overlay on its player; false when the player cannot hold it. */
  #place(): boolean {
    const player = this.#box();
    if (player === null) return false;
    const overlay = toBox(this.#bar.element.getBoundingClientRect());
    const { innerWidth, innerHeight } = this.#deps.window;
    if (!fits(player, overlay, { width: innerWidth, height: innerHeight })) return false;
    const position = this.#deps.settings().overlayPosition ?? DEFAULT_POSITION;
    const { x, y } = placeOverlay(player, overlay, position);
    this.#moveTo(x, y);
    return true;
  }

  #moveTo(x: number, y: number): void {
    applyStyle(this.#host, { transform: `translate(${Math.round(x)}px, ${Math.round(y)}px)` });
  }

  /** Forced colours win over the theme: the system's palette is the user's choice. */
  #currentPalette(): Palette {
    return this.#forced.matches ? FORCED_COLORS : themePalette(this.#deps.settings().theme);
  }

  #repaint(): void {
    this.#bar.paint(this.#currentPalette(), this.#coarse.matches);
  }
}
