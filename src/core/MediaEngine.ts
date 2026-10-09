// The media engine of one page: discovery, interaction tracking, selection and commands.

import { openShadowRoot, type ShadowReader } from './media/dom.ts';
import { InteractionTracker } from './media/InteractionTracker.ts';
import { MediaController } from './media/MediaController.ts';
import { MediaRegistry } from './media/MediaRegistry.ts';
import type { SilenceListen } from './media/SilenceListener.ts';
import { StateFeed, type StateListener, type SubscribeOptions } from './media/StateFeed.ts';
import type { Response } from './messages/Protocol.ts';
import { parseCommand } from './messages/Validation.ts';
import { siteOf } from './settings/Sites.ts';

export interface MediaEngine {
  /** Parses and applies an untrusted message; always answers with the current state. */
  handleMessage(message: unknown): Promise<Response>;
  /** The state now and at every visible change, until the returned function is called. */
  subscribe(listener: StateListener, options: SubscribeOptions): () => void;
  /** The player commands act on: the page's own interface (overlay) positions itself on it. */
  activeMedia(): HTMLMediaElement | null;
  /** How this engine sees into shadow roots; the page's own interface looks the same way. */
  readonly shadowRoot: ShadowReader;
  /** Reports the time saved so far (the page is hidden or leaving). */
  flushTimeSaved(): void;
  stop(): void;
}

export interface MediaEngineOptions {
  /** Seconds saved on players this engine sped up, reported in batches. */
  readonly onTimeSaved?: (seconds: number) => void;
  /** Open shadow roots only, unless the extension's own access to closed ones is given. */
  readonly shadowRoot?: ShadowReader;
  /** How Skip Silence hears a player: the browser's audio by default (`SilenceListener.ts`). */
  readonly listen?: SilenceListen;
}

/**
 * The site of a frame without an address of its own (`about:blank`, `srcdoc`): the origin it
 * inherits from the page that made it; none for an opaque one.
 */
function inheritedSite(window: Window): string | null {
  try {
    return siteOf(new URL(window.origin).hostname);
  } catch {
    return null;
  }
}

/** Whether this window is a frame inside the tab, not the tab's top page. */
function isEmbedded(window: Window): boolean {
  try {
    return window.top !== window.self;
  } catch {
    // A browser that refuses to compare is a frame it keeps apart.
    return true;
  }
}

export function createMediaEngine(window: Window, options: MediaEngineOptions = {}): MediaEngine {
  const site = siteOf(window.location.hostname) ?? inheritedSite(window);
  const shadowRoot = options.shadowRoot ?? openShadowRoot;
  const registry = new MediaRegistry(
    window.document,
    {
      onAdded: (media) => {
        controller.mediaAdded(media);
        for (const element of media) feed.track(element);
        feed.changed();
      },
      onRemoved: (media) => {
        controller.mediaRemoved(media);
        for (const element of media) feed.untrack(element);
        feed.changed();
      },
    },
    shadowRoot,
  );
  const interactions = new InteractionTracker(
    window.document,
    undefined,
    () => feed.changed(),
    shadowRoot,
  );
  const controller = new MediaController({
    registry,
    interactions,
    viewport: () => ({ width: window.innerWidth, height: window.innerHeight }),
    site,
    frame: isEmbedded(window) ? { site } : null,
    onHiddenChange: () => feed.changed(),
    ...(options.onTimeSaved === undefined ? {} : { onTimeSaved: options.onTimeSaved }),
    ...(options.listen === undefined ? {} : { listen: options.listen }),
  });
  const feed = new StateFeed(
    () => controller.snapshot(),
    () => registry.list(),
  );
  registry.start();
  interactions.start();
  return {
    async handleMessage(message) {
      const command = parseCommand(message);
      if (command === null) {
        return { ok: false, error: 'invalid-command', state: controller.snapshot() };
      }
      const response = await controller.handle(command);
      feed.changed();
      return response;
    },
    subscribe: (listener, options) => feed.subscribe(listener, options),
    activeMedia: () => controller.activeMedia(),
    shadowRoot,
    flushTimeSaved: () => controller.flushTimeSaved(),
    stop() {
      feed.stop();
      controller.stop();
      registry.stop();
      interactions.stop();
    },
  };
}

// Registry key in the script's own global. In an extension's isolated world that global is not
// the page's, so the page cannot read it or tell that the engine is present.
const ENGINE_KEY: unique symbol = Symbol.for('fleetfoot-engine.media-engine');

type EngineHost = typeof globalThis & { [ENGINE_KEY]?: MediaEngine };

/** The same script can be injected again on every user action: one engine per page. */
export function ensureMediaEngine(
  host: typeof globalThis,
  window: Window,
  options: MediaEngineOptions = {},
): MediaEngine {
  const slot = host as EngineHost;
  const existing = slot[ENGINE_KEY];
  if (existing !== undefined) return existing;
  const engine = createMediaEngine(window, options);
  slot[ENGINE_KEY] = engine;
  return engine;
}
