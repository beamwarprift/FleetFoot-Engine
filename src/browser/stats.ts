// The time-saved total in storage.local. Pages report, the background adds up: one writer, one
// queue, so reports from several tabs at once are never lost.

import { browser } from 'wxt/browser';
import { parseTotal, TIME_SAVED_KEY, timeSavedReport } from '../core/stats/TimeSaved.ts';
import type { StatsPort } from '../ui/StatsPort.ts';

/** From the page: what it saved since its last report. A closed background simply drops it. */
export function reportTimeSaved(seconds: number): void {
  void browser.runtime.sendMessage(timeSavedReport(seconds)).catch(() => {});
}

let additions: Promise<void> = Promise.resolve();

/** In the background: adds a validated report to the total, one after another. */
export function addTimeSaved(seconds: number): Promise<void> {
  additions = additions
    .then(async () => {
      const stored = await browser.storage.local.get(TIME_SAVED_KEY);
      const total = parseTotal(stored[TIME_SAVED_KEY]) + seconds;
      await browser.storage.local.set({ [TIME_SAVED_KEY]: total });
    })
    .catch(() => {});
  return additions;
}

export const storageStats: StatsPort = {
  async load() {
    const stored = await browser.storage.local.get(TIME_SAVED_KEY);
    return parseTotal(stored[TIME_SAVED_KEY]);
  },
  watch(onChange) {
    const listener = (changes: Record<string, { newValue?: unknown }>, area: string): void => {
      const change = changes[TIME_SAVED_KEY];
      if (area === 'local' && change !== undefined) onChange(parseTotal(change.newValue));
    };
    browser.storage.onChanged.addListener(listener);
    return () => browser.storage.onChanged.removeListener(listener);
  },
  reset: () => browser.storage.local.remove(TIME_SAVED_KEY),
};
