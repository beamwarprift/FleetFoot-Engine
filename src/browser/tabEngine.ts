// Reaches the engine of a tab: injects it on the user's action (activeTab) and carries commands
// and state. A page that refuses extensions is recognised by the refusal itself, never by a list
// of addresses.

import { browser } from 'wxt/browser';
import type { Command } from '../core/messages/Protocol.ts';
import { parseEngineState, parseResponse } from '../core/messages/StateValidation.ts';
import type { ClientFailure, EngineClient, SendResult } from '../ui/EngineClient.ts';
import { multiFrameClient } from '../ui/MultiFrameClient.ts';
import { STATE_PORT } from './messaging.ts';

/** The page script's path in the build (an unlisted script). */
const ENGINE_SCRIPT = '/media-controller.js';

/**
 * A page that does not answer in this time is reported as not answering. Chosen bound: a running
 * engine answers within one message round trip.
 */
const ANSWER_DEADLINE_MS = 2000;

export interface TabTarget {
  readonly tabId: number;
  readonly frameId: number;
}

/** The tab the user is looking at in the current window. */
export async function activeTab(): Promise<TabTarget | null> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab?.id === undefined ? null : { tabId: tab.id, frameId: 0 };
}

/** Injects the engine; the script itself keeps a single engine per page. */
export async function injectEngine(target: TabTarget): Promise<boolean> {
  try {
    await browser.scripting.executeScript({
      target: { tabId: target.tabId, frameIds: [target.frameId] },
      files: [ENGINE_SCRIPT],
    });
    return true;
  } catch {
    return false;
  }
}

export async function sendCommand(target: TabTarget, command: Command): Promise<SendResult> {
  const answer = browser.tabs
    .sendMessage(target.tabId, command, { frameId: target.frameId })
    .then((value: unknown): SendResult | ClientFailure => {
      const response = parseResponse(value);
      return response === null ? 'no-answer' : { ok: true, response };
    })
    .catch((): ClientFailure => 'no-answer');
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<ClientFailure>((resolve) => {
    timer = setTimeout(() => resolve('no-answer'), ANSWER_DEADLINE_MS);
  });
  const result = await Promise.race([answer, late]);
  clearTimeout(timer);
  return typeof result === 'string' ? { ok: false, failure: result } : result;
}

/** A client for a tab whose engine was injected. */
export function tabClient(target: TabTarget): EngineClient {
  return {
    send: (command) => sendCommand(target, command),
    watch(onState, onLost) {
      const port = browser.tabs.connect(target.tabId, {
        name: STATE_PORT,
        frameId: target.frameId,
      });
      port.onMessage.addListener((message: unknown) => {
        const state = parseEngineState(message);
        if (state !== null) onState(state);
      });
      port.onDisconnect.addListener(() => onLost());
      return () => port.disconnect();
    },
  };
}

/**
 * Injects the engine in every frame of the tab it may reach; the answer names those frames, so no
 * extra permission is needed to know them. Null when not even the top frame can be reached.
 */
export async function injectEverywhere(tabId: number): Promise<number[] | null> {
  try {
    const results = await browser.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: [ENGINE_SCRIPT],
    });
    const frames = [...new Set(results.map((result) => result.frameId))];
    if (frames.length > 0) return frames;
  } catch {
    // Some browsers refuse the whole call when one frame is out of reach: the top frame alone.
  }
  return (await injectEngine({ tabId, frameId: 0 })) ? [0] : null;
}

/** The engines of a tab's frames, seen as one. */
export async function connectTab(tabId: number): Promise<EngineClient | ClientFailure> {
  const frames = await injectEverywhere(tabId);
  if (frames === null) return 'page-unavailable';
  return multiFrameClient(
    new Map(frames.map((frameId) => [frameId, tabClient({ tabId, frameId })] as const)),
  );
}

/** Injects the engine in the active tab and returns its client, or why it cannot be reached. */
export async function connectActiveTab(): Promise<EngineClient | ClientFailure> {
  const target = await activeTab();
  return target === null ? 'page-unavailable' : connectTab(target.tabId);
}
