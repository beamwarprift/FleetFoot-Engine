// The only bridge between WebExtension messaging and the engine in the page.

import { type Browser, browser } from 'wxt/browser';
import type { StateListener, SubscribeOptions } from '../core/media/StateFeed.ts';
import type { EngineState, Response } from '../core/messages/Protocol.ts';

/** Port name the extension's pages open to receive the state as it changes. */
export const STATE_PORT = 'fleetfoot-engine.state';

/** Only this extension can reach a content script, and it is checked anyway. */
function fromThisExtension(sender: { readonly id?: string } | undefined): boolean {
  return sender?.id === browser.runtime.id;
}

export function listenForCommands(handle: (message: unknown) => Promise<Response>): () => void {
  const listener = (
    message: unknown,
    sender: { readonly id?: string },
    sendResponse: (response: Response) => void,
  ): boolean => {
    if (!fromThisExtension(sender)) return false;
    // `true` keeps the channel open for the asynchronous answer.
    void handle(message).then(sendResponse);
    return true;
  };
  browser.runtime.onMessage.addListener(listener);
  return () => browser.runtime.onMessage.removeListener(listener);
}

/** Pushes the state on every port the extension opens to this page, for as long as it is open. */
export function serveState(
  subscribe: (listener: StateListener, options: SubscribeOptions) => () => void,
): () => void {
  const listener = (port: Browser.runtime.Port): void => {
    if (port.name !== STATE_PORT || !fromThisExtension(port.sender)) return;
    // The extension's pages show the playback position and the remaining time.
    const unsubscribe = subscribe((state: EngineState) => port.postMessage(state), { time: true });
    port.onDisconnect.addListener(unsubscribe);
  };
  browser.runtime.onConnect.addListener(listener);
  return () => browser.runtime.onConnect.removeListener(listener);
}
