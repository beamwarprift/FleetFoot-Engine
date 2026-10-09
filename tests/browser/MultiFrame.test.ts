// The engines of several frames seen as one, with real engines and media in same-origin frames:
// every player listed, the frame that matters shown, each command where it belongs.

import { afterEach, describe, expect, it } from 'vitest';
import { createMediaEngine, type MediaEngine } from '../../src/core/MediaEngine.ts';
import type { EngineState } from '../../src/core/messages/Protocol.ts';
import { siteOf } from '../../src/core/settings/Sites.ts';
import type { EngineClient } from '../../src/ui/EngineClient.ts';
import { multiFrameClient } from '../../src/ui/MultiFrameClient.ts';
import { loaded, mountMedia, playMuted, resetPage, toneUrl, track } from './media.ts';
import { localClient, settled } from './ui.ts';

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  resetPage();
});

function engineFor(window: Window): MediaEngine {
  const engine = createMediaEngine(window);
  cleanups.push(() => engine.stop());
  return engine;
}

/** A same-origin frame with one video of its own and its own engine. */
async function frameWithVideo() {
  const frame = document.createElement('iframe');
  frame.style.cssText = 'width:700px;height:420px';
  document.body.append(frame);
  cleanups.push(() => frame.remove());
  const frameWindow = frame.contentWindow;
  const frameDocument = frame.contentDocument;
  if (frameWindow === null || frameDocument === null) throw new Error('no iframe document');
  const video = track(frameDocument.createElement('video'));
  video.src = toneUrl(120);
  video.style.cssText = 'display:block;width:640px;height:360px';
  frameDocument.body.append(video);
  await loaded(video);
  return { video, engine: engineFor(frameWindow) };
}

async function threeFrames() {
  const top = mountMedia({ width: 480, height: 270 });
  await loaded(top);
  const topEngine = engineFor(window);
  const first = await frameWithVideo();
  const second = await frameWithVideo();
  const client = multiFrameClient(
    new Map<number, EngineClient>([
      [0, localClient(topEngine)],
      [7, localClient(first.engine)],
      [9, localClient(second.engine)],
    ]),
  );
  return { top, first, second, client };
}

/** The latest merged state, as the popup would see it. */
function watched(client: EngineClient) {
  const seen: { state: EngineState | null; lost: boolean } = { state: null, lost: false };
  const stop = client.watch(
    (state) => {
      seen.state = state;
    },
    () => {
      seen.lost = true;
    },
  );
  cleanups.push(stop);
  return seen;
}

describe('several frames seen as one engine', () => {
  it('is the frame itself when there is only one', () => {
    const only = localClient(engineFor(window));
    expect(multiFrameClient(new Map([[0, only]]))).toBe(only);
  });

  it('lists every frame’s players under distinct ids and shows the top frame first', async () => {
    const { client } = await threeFrames();
    const seen = watched(client);
    await settled();
    const ids = seen.state?.players.map((player) => player.id) ?? [];
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
    expect(seen.state?.activePlayerId).toBe(seen.state?.players[0]?.id);
  });

  it('shows the frame whose player is playing, and sends commands there', async () => {
    const { top, first, second, client } = await threeFrames();
    const seen = watched(client);
    await playMuted(second.video);
    await settled();
    await client.send({ v: 1, type: 'set-rate', rate: 1.5 });
    expect(second.video.playbackRate).toBe(1.5);
    expect([top.playbackRate, first.video.playbackRate]).toEqual([1, 1]);
    expect(seen.state?.rate).toBe(1.5);
  });

  it('keeps a player chosen in another frame, until automatic again', async () => {
    const { top, first, client } = await threeFrames();
    const seen = watched(client);
    await settled();
    const inFirst = seen.state?.players[1]?.id ?? 0;
    await client.send({ v: 1, type: 'select-player', playerId: inFirst });
    await client.send({ v: 1, type: 'set-rate', rate: 2 });
    expect(first.video.playbackRate).toBe(2);
    expect(top.playbackRate).toBe(1);
    await client.send({ v: 1, type: 'select-player', playerId: null });
    await client.send({ v: 1, type: 'set-rate', rate: 1.25 });
    expect(top.playbackRate).toBe(1.25);
    expect(first.video.playbackRate).toBe(2);
  });

  it('refuses an id it never gave out', async () => {
    const { client } = await threeFrames();
    expect((await client.send({ v: 1, type: 'select-player', playerId: 999 })).ok).toBe(false);
  });

  it('applies «all players» to the players of every frame', async () => {
    const { top, first, second, client } = await threeFrames();
    watched(client);
    await settled();
    await client.send({ v: 1, type: 'set-target', target: 'all' });
    await client.send({ v: 1, type: 'set-rate', rate: 1.75 });
    expect([top.playbackRate, first.video.playbackRate, second.video.playbackRate]).toEqual([
      1.75, 1.75, 1.75,
    ]);
  });

  it('keeps «all players» when another frame becomes the one shown', async () => {
    const { second, client } = await threeFrames();
    const seen = watched(client);
    await settled();
    await client.send({ v: 1, type: 'set-target', target: 'all' });
    const before = seen.state?.activePlayerId;
    await playMuted(second.video);
    await settled();
    // The frame shown is now the one playing, and it says «all players» too.
    expect(seen.state?.activePlayerId).not.toBe(before);
    expect(seen.state?.target).toBe('all');
  });

  it('says which players are embedded, and from which site', async () => {
    // The test page itself runs inside a frame: a window that is its own top stands for the tab.
    const asTop = new Proxy(window, {
      get(real, key) {
        if (key === 'top' || key === 'self') return asTop;
        const value: unknown = Reflect.get(real, key, real);
        return typeof value === 'function' ? value.bind(real) : value;
      },
    });
    const top = mountMedia({ width: 480, height: 270 });
    await loaded(top);
    const topEngine = createMediaEngine(asTop);
    cleanups.push(() => topEngine.stop());
    const inside = await frameWithVideo();
    const client = multiFrameClient(
      new Map<number, EngineClient>([
        [0, localClient(topEngine)],
        [5, localClient(inside.engine)],
      ]),
    );
    const seen = watched(client);
    await settled();
    expect(seen.state?.players.map((player) => player.frame)).toEqual([
      null,
      { site: siteOf(window.location.hostname) },
    ]);
  });

  it('is lost with the top frame, not with a frame inside it', async () => {
    const watchers = new Map<number, () => void>();
    const fake = (frameId: number): EngineClient => ({
      send: async () => ({ ok: false, failure: 'no-answer' }),
      watch(_onState, onLost) {
        watchers.set(frameId, onLost);
        return () => {};
      },
    });
    const client = multiFrameClient(
      new Map([
        [0, fake(0)],
        [3, fake(3)],
      ]),
    );
    const seen = watched(client);
    watchers.get(3)?.();
    expect(seen.lost).toBe(false);
    watchers.get(0)?.();
    expect(seen.lost).toBe(true);
  });
});
