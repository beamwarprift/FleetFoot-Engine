// A page whose player is in a frame from another site: the engine names that site, and only the
// frames that can hold a player, on screen, from another site; the popup's client keeps the sites
// it does not reach yet.

import { afterEach, describe, expect, it } from 'vitest';
import { createMediaEngine, type MediaEngine } from '../../src/core/MediaEngine.ts';
import { type EngineState, MAX_FRAMED_SITES } from '../../src/core/messages/Protocol.ts';
import type { EngineClient } from '../../src/ui/EngineClient.ts';
import { multiFrameClient } from '../../src/ui/MultiFrameClient.ts';
import { engineState } from '../unit/state.ts';
import { loaded, mountMedia, resetPage } from './media.ts';

const engines: MediaEngine[] = [];

afterEach(() => {
  for (const engine of engines.splice(0)) engine.stop();
  resetPage();
});

interface FrameOptions {
  readonly src?: string;
  readonly width?: number;
  readonly height?: number;
  readonly allow?: string | null;
  readonly fullscreen?: boolean;
  readonly style?: string;
  readonly parent?: ParentNode;
}

/** An iframe as an embedding page writes it; its address never loads (`.invalid`). */
function frame(options: FrameOptions = {}): HTMLIFrameElement {
  const element = document.createElement('iframe');
  if (options.src !== undefined) element.setAttribute('src', options.src);
  element.style.cssText = `width:${options.width ?? 640}px;height:${options.height ?? 360}px;border:0;display:block;${options.style ?? ''}`;
  if (options.fullscreen ?? true) element.setAttribute('allowfullscreen', '');
  if (options.allow !== undefined && options.allow !== null)
    element.setAttribute('allow', options.allow);
  (options.parent ?? document.body).append(element);
  return element;
}

async function framed(): Promise<readonly string[]> {
  const engine = createMediaEngine(window);
  engines.push(engine);
  const { state } = await engine.handleMessage({ v: 1, type: 'get-state' });
  return state.framedSites;
}

describe('frames from another site', () => {
  it('name the site of a player frame when no player is here', async () => {
    frame({ src: 'https://player.vixcloud.invalid/embed/1' });
    expect(await framed()).toEqual(['player.vixcloud.invalid']);
  });

  it('come largest first, one entry per site, at most a few', async () => {
    frame({ src: 'https://small.invalid/a', width: 200, height: 120 });
    frame({ src: 'https://big.invalid/a', width: 800, height: 450 });
    frame({ src: 'https://big.invalid/b', width: 100, height: 60 });
    frame({ src: 'https://middle.invalid/a', width: 400, height: 225 });
    frame({ src: 'https://fourth.invalid/a', width: 150, height: 90 });
    const sites = await framed();
    expect(sites).toEqual(['big.invalid', 'middle.invalid', 'small.invalid']);
    expect(sites).toHaveLength(MAX_FRAMED_SITES);
  });

  it('leave out what cannot hold the player: hidden, empty, the same site, no web address', async () => {
    frame({ src: 'https://hidden.invalid/a', style: 'visibility:hidden' });
    frame({ src: 'https://zero.invalid/a', width: 0, height: 0 });
    frame({ src: `${location.origin}/same-site-frame` });
    frame({});
    frame({ src: 'javascript:void 0' });
    frame({ src: 'data:text/html,<p>x' });
    frame({ src: '   ' });
    expect(await framed()).toEqual([]);
  });

  it('leave out frames the page does not let act as a player, as advertisements', async () => {
    frame({
      src: 'https://ads.invalid/slot',
      fullscreen: false,
      width: 200,
      height: 100,
      allow: 'attribution-reporting',
    });
    frame({ src: 'https://widget.invalid/x', fullscreen: false });
    frame({
      src: 'https://allowed.invalid/x',
      fullscreen: false,
      width: 200,
      height: 100,
      allow: 'autoplay; encrypted-media',
    });
    frame({
      src: 'https://pip.invalid/x',
      fullscreen: false,
      width: 200,
      height: 100,
      allow: "picture-in-picture 'self'",
    });
    expect(await framed()).toEqual(['allowed.invalid', 'pip.invalid']);
  });

  it('are found in open shadow roots too', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = host.attachShadow({ mode: 'open' });
    frame({ src: 'https://shadowed.invalid/embed', parent: root });
    expect(await framed()).toEqual(['shadowed.invalid']);
  });

  it('are not named while a player is here', async () => {
    const video = mountMedia();
    await loaded(video);
    frame({ src: 'https://player.invalid/embed' });
    expect(await framed()).toEqual([]);
  });
});

/** A frame's engine answering with a fixed state. */
function fixed(state: EngineState): EngineClient {
  return {
    send: async () => ({ ok: true, response: { ok: true, state } }),
    watch(onState) {
      queueMicrotask(() => onState(state));
      return () => {};
    },
  };
}

describe("the popup's view of the frames", () => {
  it('keeps the framed sites no reached frame comes from, the top frame’s first', async () => {
    const top = engineState({
      players: [],
      activePlayerId: null,
      site: 'streaming.invalid',
      framedSites: ['embed.invalid', 'ads.invalid'],
    });
    const inner = engineState({
      players: [],
      activePlayerId: null,
      site: 'ads.invalid',
      framedSites: ['deeper.invalid'],
    });
    const client = multiFrameClient(
      new Map([
        [0, fixed(top)],
        [4, fixed(inner)],
      ]),
    );
    const seen: EngineState[] = [];
    client.watch(
      (state) => seen.push(state),
      () => {},
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(seen.at(-1)?.framedSites).toEqual(['embed.invalid', 'deeper.invalid']);
  });
});
