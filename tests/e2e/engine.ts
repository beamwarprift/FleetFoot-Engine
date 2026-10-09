// Shared by the E2E specs that drive the engine on the local pages: the background asks the
// engine of a frame for its state or gives it a command, as the popup does; media events are
// awaited, never polled.

import type { Locator, Page, Worker } from '@playwright/test';

declare const navigator: { locks: { request(name: string, task: () => void): Promise<void> } };
declare const location: { pathname: string };
declare const chrome: {
  storage: { local: { set(items: Record<string, unknown>): Promise<void> } };
  scripting: {
    executeScript(options: {
      target: { tabId: number; allFrames: boolean };
      func: () => string;
    }): Promise<Array<{ frameId: number; result?: string }>>;
  };
  tabs: {
    query(info: { url: string }): Promise<Array<{ id?: number }>>;
    sendMessage(tabId: number, message: unknown, options: { frameId: number }): Promise<unknown>;
  };
};
export interface Media {
  readonly playbackRate: number;
  addEventListener(type: 'ratechange', listener: () => void): void;
}

export interface Player {
  readonly kind: 'video' | 'audio';
  readonly width: number;
  readonly frame: { readonly site: string | null } | null;
}
export interface State {
  readonly players: readonly Player[];
  readonly rate: number | null;
  readonly duration: number | null;
  readonly remaining: unknown;
  readonly site: string;
  readonly ratePolicy: string;
  readonly rateContested: boolean;
  readonly skipSilence: { readonly status: string };
  readonly framedSites: readonly string[];
}

/** Sends a message to the engine of the frame that shows `path` in the tab at `url`. */
export function engine(background: Worker, url: string, path: string, message: unknown) {
  return background.evaluate(
    async ({ url, path, message }) => {
      const [tab] = await chrome.tabs.query({ url: `${url}*` });
      if (tab?.id === undefined) throw new Error('no tab');
      const frames = await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        func: () => location.pathname,
      });
      const frame = frames.find((item) => item.result === path);
      if (frame === undefined) throw new Error(`no frame ${path}`);
      return chrome.tabs.sendMessage(tab.id, message, { frameId: frame.frameId });
    },
    { url, path, message },
  );
}

export async function state(background: Worker, url: string, path: string): Promise<State> {
  const answer = (await engine(background, url, path, { v: 1, type: 'get-state' })) as {
    state: State;
  };
  return answer.state;
}

interface Waiting {
  ffeRates?: Promise<number[]>;
}

/**
 * Starts listening to the rates a media element takes, and resolves once it listens, so a command
 * sent afterwards can never be missed. The returned promise gives the rates: until it reaches
 * `rate`, or, with `afterReset`, until the page has put 1x back and the speed came back after it.
 */
export async function rates(
  media: Locator,
  rate: number,
  afterReset = false,
): Promise<() => Promise<number[]>> {
  await media.evaluate(
    (element: Media & Waiting, { rate, afterReset }) => {
      element.ffeRates = new Promise<number[]>((resolve) => {
        const seen: number[] = [];
        element.addEventListener('ratechange', () => {
          seen.push(element.playbackRate);
          const from = afterReset ? seen.indexOf(1) : 0;
          if (from !== -1 && seen.slice(from).includes(rate)) resolve(seen);
        });
      });
    },
    { rate, afterReset },
  );
  return () => media.evaluate((element: Waiting) => element.ffeRates ?? Promise.resolve([]));
}

export async function open(page: Page, origin: string, name: string): Promise<string> {
  const url = `${origin}/fixtures/${name}.html`;
  await page.goto(url);
  return url;
}

/** The registration of the page script is rebuilt when the background starts; the same Web Lock
 * is granted only once that is over. */
export function registrationSettled(background: Worker): Promise<void> {
  return background.evaluate(() =>
    navigator.locks.request('fleetfoot-engine.site-access', () => {}),
  );
}
