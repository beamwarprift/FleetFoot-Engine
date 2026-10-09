// The extension for real in Firefox (WebDriver BiDi, `firefox.ts`): it installs, its options page
// saves to storage.local, its page script starts by itself on a granted site and controls the
// player, LOCK with a brake keeps the speed against a page that fights it, and Skip Silence hears
// a page's audio once the page was clicked, the gesture Firefox asks before any audio starts.

import { join } from 'node:path';
import { test as base, expect } from '@playwright/test';
import { firefoxBinary } from '../../scripts/firefox.ts';
import { type Firefox, launchFirefox } from './firefox.ts';
import { type LocalServer, PATTERN, startServer } from './server.ts';

/** The Firefox build plus host access to 127.0.0.1 only (`pnpm build:e2e`). */
const EXTENSION_DIR = join(import.meta.dirname, '../../.output-e2e/firefox-mv3');

const test = base.extend<object, { firefox: Firefox; local: LocalServer; options: string }>({
  local: [
    // biome-ignore lint/correctness/noEmptyPattern: Playwright requires a destructuring pattern here.
    async ({}, use) => {
      const { server, local } = await startServer();
      await use(local);
      server.close();
    },
    { scope: 'worker' },
  ],
  firefox: [
    // biome-ignore lint/correctness/noEmptyPattern: Playwright requires a destructuring pattern here.
    async ({}, use) => {
      const firefox = await launchFirefox(await firefoxBinary(), EXTENSION_DIR);
      await use(firefox);
      firefox.close();
    },
    { scope: 'worker' },
  ],
  // The options page, the extension's own context the tests act from.
  options: [
    async ({ firefox }, use) => {
      const options = await firefox.open(firefox.extensionUrl('/options.html'));
      // The registration rebuilt when the background started is over once this lock is free.
      await firefox.evaluate(
        options,
        "navigator.locks.request('fleetfoot-engine.site-access', () => {})",
      );
      await use(options);
    },
    { scope: 'worker' },
  ],
});

/** Sends a command to the engine of the tab at `url`, from the extension; its answer as JSON. */
async function command(firefox: Firefox, options: string, url: string, message: object) {
  const answer = await firefox.evaluate(
    options,
    `browser.tabs.query({}).then((tabs) => tabs.find((tab) => tab.url === ${JSON.stringify(url)}))
      .then((tab) => browser.tabs.sendMessage(tab.id, ${JSON.stringify(message)}))
      .then((answer) => JSON.stringify(answer))`,
  );
  return JSON.parse(String(answer)) as {
    ok: boolean;
    state: {
      rate: number | null;
      players: unknown[];
      rateContested: boolean;
      skipSilence: { status: string };
    };
  };
}

test.describe.configure({ mode: 'serial' });

test('installs, and its options page saves to storage.local', async ({ firefox, options }) => {
  expect(await firefox.evaluate(options, 'document.querySelector("h1").textContent')).toContain(
    'FLEETFOOT',
  );
  await firefox.evaluate(
    options,
    `(async () => {
      const box = [...document.querySelectorAll('label')]
        .find((label) => label.textContent === 'Show the overlay on players').control;
      box.click();
      await new Promise((resolve) => browser.storage.onChanged.addListener(resolve));
    })()`,
  );
  const stored = await firefox.evaluate(
    options,
    "browser.storage.local.get('overlayEnabled').then((items) => JSON.stringify(items))",
  );
  expect(JSON.parse(String(stored))).toEqual({ overlayEnabled: false });
});

test('starts by itself on a granted page and controls its player', async ({
  firefox,
  options,
  local,
}) => {
  // With a speed remembered for every site, the page script gives it by itself once it starts.
  await firefox.evaluate(options, 'browser.storage.local.set({ rememberedRate: 1.5 })');
  const url = `${local.origin}/fixtures/single-video.html`;
  const page = await firefox.open(url);
  const started = `new Promise((resolve) => {
    const video = document.querySelector('video');
    const check = () => video.playbackRate === 1.5 && resolve(true);
    video.addEventListener('ratechange', check);
    check();
  })`;
  expect(await firefox.evaluate(page, started)).toBe(true);
  const answer = await command(firefox, options, url, { v: 1, type: 'set-rate', rate: 2 });
  expect(answer.ok).toBe(true);
  expect(answer.state.players).toHaveLength(1);
  expect(await firefox.evaluate(page, 'document.querySelector("video").playbackRate')).toBe(2);
});

test('LOCK with a brake keeps the speed against a page that fights every change', async ({
  firefox,
  options,
  local,
}) => {
  await firefox.evaluate(
    options,
    "browser.storage.local.set({ ratePolicy: 'lock', lockFight: 'braked' })",
  );
  const url = `${local.origin}/fixtures/rate-fight.html`;
  const page = await firefox.open(url);
  // As the popup does: the page script once more, which keeps one engine per page.
  await firefox.evaluate(
    options,
    `browser.tabs.query({}).then((tabs) => tabs.find((tab) => tab.url === ${JSON.stringify(url)}))
      .then((tab) => browser.scripting.executeScript({ target: { tabId: tab.id }, files: ['/media-controller.js'] }))
      .then(() => true)`,
  );
  await command(firefox, options, url, { v: 1, type: 'set-rate', rate: 2 });
  // Over two seconds of media after the first one, measured by the page itself on timeupdate.
  const measure = `new Promise((resolve) => {
    const video = document.querySelector('video');
    let from = null;
    const progress = () => {
      if (from === null) {
        if (video.currentTime < 1) return;
        from = { media: video.currentTime, wall: performance.now(), resets: window.resets };
        return;
      }
      const media = video.currentTime - from.media;
      if (media < 2) return;
      video.removeEventListener('timeupdate', progress);
      resolve(JSON.stringify({
        speed: media / ((performance.now() - from.wall) / 1000),
        resets: window.resets - from.resets,
        rate: video.playbackRate,
      }));
    };
    video.addEventListener('timeupdate', progress);
    video.play();
  })`;
  const held = JSON.parse(String(await firefox.evaluate(page, measure))) as {
    speed: number;
    resets: number;
    rate: number;
  };
  expect(held.resets).toBe(0);
  expect(held.rate).toBe(2);
  expect(held.speed).toBeGreaterThan(1.8);
  const after = await command(firefox, options, url, { v: 1, type: 'get-state' });
  expect(after.state.rateContested).toBe(false);
});

test('finds and controls a video in a closed shadow root', async ({ firefox, options, local }) => {
  const url = `${local.origin}/fixtures/closed-shadow.html`;
  const page = await firefox.open(url);
  // As the popup does: the page script once more, which keeps one engine per page.
  await firefox.evaluate(
    options,
    `browser.tabs.query({}).then((tabs) => tabs.find((tab) => tab.url === ${JSON.stringify(url)}))
      .then((tab) => browser.scripting.executeScript({ target: { tabId: tab.id }, files: ['/media-controller.js'] }))
      .then(() => true)`,
  );
  const answer = await command(firefox, options, url, { v: 1, type: 'set-rate', rate: 2 });
  expect(answer.state.players).toHaveLength(1);
  expect(await firefox.evaluate(page, 'window.closedVideo.playbackRate')).toBe(2);
});

test('Skip Silence waits for a click, then speeds through each silence', async ({
  firefox,
  options,
  local,
}) => {
  await firefox.evaluate(
    options,
    'browser.storage.local.set({ skipSilence: true, silenceRate: 5, ratePolicy: "smart" })',
  );
  const url = `${local.origin}/fixtures/skip-silence.html`;
  const page = await firefox.open(url);
  // As the popup does: the page script once more, which keeps one engine per page.
  await firefox.evaluate(
    options,
    `browser.tabs.query({}).then((tabs) => tabs.find((tab) => tab.url === ${JSON.stringify(url)}))
      .then((tab) => browser.scripting.executeScript({ target: { tabId: tab.id }, files: ['/media-controller.js'] }))
      .then(() => true)`,
  );
  await command(firefox, options, url, { v: 1, type: 'set-rate', rate: 1.5 });
  const play = `new Promise((resolve, reject) => {
    const audio = document.querySelector('audio');
    window.heard = [];
    audio.addEventListener('ratechange', () => window.heard.push(audio.playbackRate));
    audio.play().then(() => resolve(true), reject);
  })`;
  expect(await firefox.evaluate(page, play)).toBe(true);
  const before = await command(firefox, options, url, { v: 1, type: 'get-state' });
  expect(before.state.skipSilence.status).toBe('waiting');
  await firefox.click(page);
  // Over one sound, the silence after it and the start of the next sound.
  const cycle = PATTERN.sound + PATTERN.silence + 0.3;
  const heard = `new Promise((resolve) => {
    const audio = document.querySelector('audio');
    const from = audio.currentTime;
    const progress = () => {
      if (audio.currentTime - from < ${cycle}) return;
      audio.removeEventListener('timeupdate', progress);
      resolve(JSON.stringify({ rates: window.heard, rate: audio.playbackRate }));
    };
    audio.addEventListener('timeupdate', progress);
  })`;
  const result = JSON.parse(String(await firefox.evaluate(page, heard))) as {
    rates: number[];
    rate: number;
  };
  expect(result.rates).toContain(5);
  expect(result.rates.slice(result.rates.indexOf(5) + 1)).toContain(1.5);
  const after = await command(firefox, options, url, { v: 1, type: 'get-state' });
  expect(after.state.rate).toBe(1.5);
  expect(['listening', 'skipping']).toContain(after.state.skipSilence.status);
});
