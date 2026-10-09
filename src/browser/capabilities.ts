// What this browser offers among the extension APIs some browsers lack (Firefox for Android has
// neither the browser's shortcuts nor the right-click menu): read from the API objects themselves,
// never from the browser's name.

import { browser } from 'wxt/browser';

export interface Capabilities {
  /** `commands`: shortcuts the user assigns in the browser. */
  readonly browserShortcuts: boolean;
  /** `contextMenus`: items in the right-click menu on video and audio. */
  readonly contextMenu: boolean;
}

export function browserCapabilities(): Capabilities {
  // The typings promise both namespaces; a browser without them leaves them undefined.
  const api = browser as Partial<typeof browser>;
  return {
    browserShortcuts: api.commands !== undefined,
    contextMenu: api.contextMenus !== undefined,
  };
}
