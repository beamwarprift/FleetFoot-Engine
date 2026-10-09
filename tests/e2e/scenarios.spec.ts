// The extension for real on local pages of every kind it has to handle: the page script
// arrives by itself on the granted local server, and the engine of each frame is asked for its
// state and given commands from the background, as the popup does.

import type { Page } from '@playwright/test';
import { engine, open, rates, registrationSettled, state } from './engine.ts';
import { E2E_EXTENSION_DIR, expect, test } from './fixtures.ts';

// Evaluated inside the extension service worker.
declare const chrome: {
  storage: { local: { set(items: Record<string, unknown>): Promise<void> } };
};

// Evaluated inside the page: only the slice used is declared.
interface PageVideo {
  readonly playbackRate: number;
  readonly currentTime: number;
  changed?: Promise<void>;
  addEventListener(
    type: 'ratechange' | 'timeupdate',
    listener: () => void,
    options?: { once: boolean },
  ): void;
  removeEventListener(type: 'timeupdate', listener: () => void): void;
  play(): Promise<void>;
}
declare const window: unknown;
declare const document: { querySelector(selector: string): PageVideo | null };

test.use({ extensionDir: E2E_EXTENSION_DIR });

test.beforeEach(async ({ background }) => {
  await registrationSettled(background);
});

test('a single video: one player, and the speed it is given', async ({
  context,
  background,
  local,
}) => {
  const page = await context.newPage();
  const url = await open(page, local.origin, 'single-video');
  const path = '/fixtures/single-video.html';
  const before = await state(background, url, path);
  expect(before.players.map((player) => player.kind)).toEqual(['video']);
  const changed = await rates(page.locator('video'), 2);
  await engine(background, url, path, { v: 1, type: 'set-rate', rate: 2 });
  expect(await changed()).toContain(2);
});

test('a single audio: an audio player, sped up like a video', async ({
  context,
  background,
  local,
}) => {
  const page = await context.newPage();
  const url = await open(page, local.origin, 'single-audio');
  const path = '/fixtures/single-audio.html';
  expect((await state(background, url, path)).players.map((player) => player.kind)).toEqual([
    'audio',
  ]);
  const changed = await rates(page.locator('audio'), 1.5);
  await engine(background, url, path, { v: 1, type: 'set-rate', rate: 1.5 });
  expect(await changed()).toContain(1.5);
});

test('a video and an audio: both found', async ({ context, background, local }) => {
  const page = await context.newPage();
  const url = await open(page, local.origin, 'multiple-media');
  const kinds = (await state(background, url, '/fixtures/multiple-media.html')).players.map(
    (player) => player.kind,
  );
  expect([...kinds].sort()).toEqual(['audio', 'video']);
});

test('a player added later is found and controlled', async ({ context, background, local }) => {
  const page = await context.newPage();
  const url = await open(page, local.origin, 'dynamic-player');
  const path = '/fixtures/dynamic-player.html';
  expect((await state(background, url, path)).players).toEqual([]);
  await page.locator('#add').click();
  const changed = await rates(page.locator('video'), 2);
  await engine(background, url, path, { v: 1, type: 'set-rate', rate: 2 });
  expect(await changed()).toContain(2);
  expect((await state(background, url, path)).players).toHaveLength(1);
});

test('a player replaced by the page: the new one is controlled', async ({
  context,
  background,
  local,
}) => {
  const page = await context.newPage();
  const url = await open(page, local.origin, 'replace-player');
  const path = '/fixtures/replace-player.html';
  await page.locator('#replace').click();
  const changed = await rates(page.locator('#next'), 1.75);
  await engine(background, url, path, { v: 1, type: 'set-rate', rate: 1.75 });
  expect(await changed()).toContain(1.75);
  expect((await state(background, url, path)).players).toHaveLength(1);
});

test('a page that changes episode without reloading: the new player is controlled', async ({
  context,
  background,
  local,
}) => {
  const page = await context.newPage();
  const url = await open(page, local.origin, 'spa-navigation');
  await page.locator('#next').click();
  await expect(page).toHaveURL(/episode=2/);
  const changed = await rates(page.locator('#episode-2'), 2);
  await engine(background, url, '/fixtures/spa-navigation.html', {
    v: 1,
    type: 'set-rate',
    rate: 2,
  });
  expect(await changed()).toContain(2);
});

test('a frame of the same site: its player is controlled in the frame', async ({
  context,
  background,
  local,
}) => {
  const page = await context.newPage();
  const url = await open(page, local.origin, 'same-origin-iframe');
  const frame = page.frameLocator('iframe');
  await frame.locator('video').waitFor();
  const inFrame = await state(background, url, '/fixtures/single-video.html');
  expect(inFrame.players).toHaveLength(1);
  const changed = await rates(frame.locator('video'), 2);
  await engine(background, url, '/fixtures/single-video.html', { v: 1, type: 'set-rate', rate: 2 });
  expect(await changed()).toContain(2);
});

test('a frame of a site not given: never reached, the page player still is', async ({
  context,
  background,
  local,
}) => {
  const page = await context.newPage();
  const url = await open(page, local.origin, 'cross-origin-iframe');
  await page.frameLocator('iframe').locator('video').waitFor();
  const top = await state(background, url, '/fixtures/cross-origin-iframe.html');
  expect(top.players).toHaveLength(1);
  // The extension has no access to the other origin: it cannot even read the frame's address.
  await expect(
    engine(background, url, '/fixtures/single-video.html', { v: 1, type: 'get-state' }),
  ).rejects.toThrow(/no frame/);
});

test('a player only in a frame of a site not given: the page names that site', async ({
  context,
  background,
  local,
}) => {
  const page = await context.newPage();
  const url = await open(page, local.origin, 'cross-site-player');
  await page.frameLocator('iframe').locator('video').waitFor();
  const top = await state(background, url, '/fixtures/cross-site-player.html');
  expect(top.players).toHaveLength(0);
  expect(top.framedSites).toEqual(['localhost']);
});

test('a video in an open shadow root: found and controlled', async ({
  context,
  background,
  local,
}) => {
  const page = await context.newPage();
  const url = await open(page, local.origin, 'shadow-dom');
  const path = '/fixtures/shadow-dom.html';
  expect((await state(background, url, path)).players).toHaveLength(1);
  const changed = await rates(page.locator('video'), 2);
  await engine(background, url, path, { v: 1, type: 'set-rate', rate: 2 });
  expect(await changed()).toContain(2);
});

test('a video in a closed shadow root: found and controlled through the extension view', async ({
  context,
  background,
  local,
}) => {
  const page = await context.newPage();
  const url = await open(page, local.origin, 'closed-shadow');
  const path = '/fixtures/closed-shadow.html';
  expect((await state(background, url, path)).players).toHaveLength(1);
  await engine(background, url, path, { v: 1, type: 'set-rate', rate: 2 });
  expect(
    await page.evaluate(() => (window as unknown as ClosedPage).closedVideo.playbackRate),
  ).toBe(2);
});

interface ClosedPage {
  readonly closedVideo: { readonly playbackRate: number };
}

interface Resetting {
  resets: number;
  ffeSettled?: Promise<number>;
}

/** Arms a wait, in the page, for the first rate change that meets `until`; resolves once armed. */
async function armed(page: Page, until: 'held-twice' | 'gave-up'): Promise<() => Promise<number>> {
  await page.evaluate((until) => {
    const page = window as unknown as Resetting;
    const video = document.querySelector('video') as PageVideo;
    page.ffeSettled = new Promise((resolve) => {
      video.addEventListener('ratechange', () => {
        const held = until === 'held-twice' && page.resets >= 2 && video.playbackRate === 2;
        const gaveUp = until === 'gave-up' && video.playbackRate === 1;
        if (held || gaveUp) resolve(video.playbackRate);
      });
    });
  }, until);
  return () => page.evaluate(() => (window as unknown as Resetting).ffeSettled ?? 0);
}

test('a page that puts 1x back from time to time: LOCK always brings the speed back', async ({
  context,
  background,
  local,
}) => {
  await background.evaluate(() => chrome.storage.local.set({ ratePolicy: 'lock' }));
  const page = await context.newPage();
  const url = await open(page, local.origin, 'rate-reset');
  const path = '/fixtures/rate-reset.html';
  expect((await state(background, url, path)).ratePolicy).toBe('lock');
  const settled = await armed(page, 'held-twice');
  await engine(background, url, path, { v: 1, type: 'set-rate', rate: 2 });
  expect(await settled()).toBe(2);
  const after = await state(background, url, path);
  expect(after.rate).toBe(2);
  expect(after.rateContested).toBe(false);
});

test('a page that fights every change at once: LOCK gives way and says so', async ({
  context,
  background,
  local,
}) => {
  await background.evaluate(() => chrome.storage.local.set({ ratePolicy: 'lock' }));
  const page = await context.newPage();
  const url = await open(page, local.origin, 'rate-fight');
  const path = '/fixtures/rate-fight.html';
  const settled = await armed(page, 'gave-up');
  await engine(background, url, path, { v: 1, type: 'set-rate', rate: 2 });
  expect(await settled()).toBe(1);
  const after = await state(background, url, path);
  expect(after.rateContested).toBe(true);
  expect(await page.evaluate(() => (window as unknown as Resetting).resets)).toBeGreaterThan(1);
});

interface Played {
  /** Media seconds per real second over the window. */
  readonly speed: number;
  /** Times the page put 1× back during the window. */
  readonly resets: number;
  readonly rate: number;
}

/** Plays the page's video for `seconds` of media and measures what really happened meanwhile. */
function played(page: Page, seconds: number): Promise<Played> {
  return page.evaluate(
    (seconds) =>
      new Promise<Played>((resolve) => {
        const video = document.querySelector('video') as PageVideo;
        const fighting = window as unknown as Resetting;
        const from = { media: video.currentTime, wall: performance.now(), resets: fighting.resets };
        const progress = () => {
          const media = video.currentTime - from.media;
          if (media < seconds) return;
          video.removeEventListener('timeupdate', progress);
          resolve({
            speed: media / ((performance.now() - from.wall) / 1000),
            resets: fighting.resets - from.resets,
            rate: video.playbackRate,
          });
        };
        video.addEventListener('timeupdate', progress);
        void video.play();
      }),
    seconds,
  );
}

for (const lockFight of ['braked', 'unbraked'] as const) {
  test(`a page that fights every change at once: LOCK ${lockFight} keeps the speed`, async ({
    context,
    background,
    local,
  }) => {
    await background.evaluate(
      (lockFight) => chrome.storage.local.set({ ratePolicy: 'lock', lockFight }),
      lockFight,
    );
    const page = await context.newPage();
    const url = await open(page, local.origin, 'rate-fight');
    const path = '/fixtures/rate-fight.html';
    await engine(background, url, path, { v: 1, type: 'set-rate', rate: 2 });
    // The fight is over within the first second; over the next two, the page hears nothing more.
    await played(page, 1);
    const held = await played(page, 2);
    expect(held.resets).toBe(0);
    expect(held.rate).toBe(2);
    expect(held.speed).toBeGreaterThan(1.8);
    expect((await state(background, url, path)).rateContested).toBe(false);
  });
}

test('a live stream: a player with no duration and no time left to count', async ({
  context,
  background,
  local,
}) => {
  const page = await context.newPage();
  const url = await open(page, local.origin, 'no-duration');
  const live = await state(background, url, '/fixtures/no-duration.html');
  expect(live.players).toHaveLength(1);
  expect(live.duration).toBeNull();
  expect(live.remaining).toBeNull();
});

test('two players in view: the larger one comes first', async ({ context, background, local }) => {
  const page = await context.newPage();
  const url = await open(page, local.origin, 'multiple-visible-players');
  const players = (await state(background, url, '/fixtures/multiple-visible-players.html')).players;
  expect(players.map((player) => player.width)).toEqual([800, 320]);
});
