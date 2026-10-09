// Skip Silence for real in Chromium: the extension hears a page's own audio, also under the
// strictest page policy, speeds through each silence and gives the sound its speed back; a
// recording from another site, which the browser does not let it hear, is never sped up, and the
// state says why.

import type { Page } from '@playwright/test';
import { engine, open, registrationSettled, state } from './engine.ts';
import { E2E_EXTENSION_DIR, expect, test } from './fixtures.ts';
import { PATTERN } from './server.ts';

// Evaluated inside the extension service worker.
declare const chrome: {
  storage: { local: { set(items: Record<string, unknown>): Promise<void> } };
};

// Evaluated inside the page: only the slice used is declared.
interface PageAudio {
  src: string;
  readonly playbackRate: number;
  readonly currentTime: number;
  addEventListener(type: 'ratechange' | 'timeupdate', listener: () => void): void;
  removeEventListener(type: 'timeupdate', listener: () => void): void;
  play(): Promise<void>;
}
declare const document: { querySelector(selector: string): PageAudio | null };

const SILENCE_RATE = 5;

interface Heard {
  readonly rates: number[];
  readonly rate: number;
}

test.use({ extensionDir: E2E_EXTENSION_DIR });

test.beforeEach(async ({ background }) => {
  await registrationSettled(background);
  await background.evaluate(
    (silenceRate) => chrome.storage.local.set({ skipSilence: true, silenceRate }),
    SILENCE_RATE,
  );
});

/**
 * Plays the page's audio until `seconds` of it have played, from `src` when given, and returns
 * every speed it took meanwhile.
 */
function play(page: Page, seconds: number, src?: string): Promise<Heard> {
  return page.evaluate(
    ({ seconds, src }) =>
      new Promise<Heard>((resolve, reject) => {
        const audio = document.querySelector('audio') as PageAudio;
        if (src !== undefined) audio.src = src;
        const rates: number[] = [];
        audio.addEventListener('ratechange', () => rates.push(audio.playbackRate));
        const progress = () => {
          if (audio.currentTime < seconds) return;
          audio.removeEventListener('timeupdate', progress);
          resolve({ rates, rate: audio.playbackRate });
        };
        audio.addEventListener('timeupdate', progress);
        audio.play().catch(reject);
      }),
    { seconds, src },
  );
}

/** One sound and the silence after it, and the start of the next sound. */
const FIRST_CYCLE = PATTERN.sound + PATTERN.silence + 0.3;

for (const fixture of ['skip-silence', 'csp-skip-silence']) {
  test(`${fixture}: speeds through the silence and gives the sound its speed back`, async ({
    context,
    background,
    local,
  }) => {
    const page = await context.newPage();
    const url = await open(page, local.origin, fixture);
    const path = `/fixtures/${fixture}.html`;
    await engine(background, url, path, { v: 1, type: 'set-rate', rate: 1.5 });
    const heard = await play(page, FIRST_CYCLE);
    expect(heard.rates).toContain(SILENCE_RATE);
    // The rise into the silence, then the drop back.
    const top = heard.rates.indexOf(SILENCE_RATE);
    expect(top).toBeGreaterThan(1);
    expect(heard.rates.slice(top + 1)).toContain(1.5);
    expect(heard.rate).toBe(1.5);
    const after = await state(background, url, path);
    expect(after.rate).toBe(1.5);
    expect(after.skipSilence.status).toBe('listening');
  });
}

test("another site's recording: never sped up, and reported as not available", async ({
  context,
  background,
  local,
}) => {
  const page = await context.newPage();
  const url = await open(page, local.origin, 'skip-silence');
  const path = '/fixtures/skip-silence.html';
  // The same server under another origin, which sends no CORS header.
  const elsewhere = `${local.origin.replace('127.0.0.1', 'localhost')}/pattern.wav`;
  const heard = await play(page, FIRST_CYCLE, elsewhere);
  expect(heard.rates).toEqual([]);
  expect(heard.rate).toBe(1);
  const after = await state(background, url, path);
  expect(after.skipSilence.status).toBe('unavailable');
});
