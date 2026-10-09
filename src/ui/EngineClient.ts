// What an interface needs from the engine of a page, whatever carries the messages: the extension
// talks to a tab through WebExtension messaging, tests talk to an engine in the same page.

import type { Command, EngineState, Response } from '../core/messages/Protocol.ts';

/** The page refuses extensions (browser pages, stores, PDF viewers…) or the tab is gone. */
export type ClientFailure = 'page-unavailable' | 'no-answer';

export type SendResult =
  | { readonly ok: true; readonly response: Response }
  | { readonly ok: false; readonly failure: ClientFailure };

export interface EngineClient {
  send(command: Command): Promise<SendResult>;
  /** The state now and at every visible change; `onLost` when the page goes away. */
  watch(onState: (state: EngineState) => void, onLost: () => void): () => void;
}
