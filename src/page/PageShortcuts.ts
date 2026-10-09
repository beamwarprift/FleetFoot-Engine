// Keyboard shortcuts inside the page. A key bound to an action is used only when the page has a
// player; then it does not reach the page. Every other key passes through untouched.

import type { MediaEngine } from '../core/MediaEngine.ts';
import { makeCommand } from '../core/messages/Protocol.ts';
import type { Settings } from '../core/settings/Settings.ts';
import {
  commandForAction,
  REPEATABLE_ACTIONS,
  type SettingChange,
  settingForAction,
} from '../core/settings/ShortcutCommands.ts';
import { actionFor } from '../core/settings/Shortcuts.ts';
import { isTyping } from './typing.ts';

export interface PageShortcutsDeps {
  readonly window: Window;
  readonly engine: MediaEngine;
  readonly settings: () => Settings;
  readonly toggleOverlay: () => void;
  /** Saves a setting; it reaches the engine through the settings, like any other change. */
  readonly saveSetting: (change: SettingChange) => void;
}

export class PageShortcuts {
  readonly #deps: PageShortcutsDeps;
  #abort: AbortController | null = null;
  // The physical key holding the hold rate, until it is released.
  #holdCode: string | null = null;

  constructor(deps: PageShortcutsDeps) {
    this.#deps = deps;
  }

  start(): void {
    if (this.#abort !== null) return;
    this.#abort = new AbortController();
    const { window } = this.#deps;
    // Capture on the window: seen before the page's own handlers, so a used key can stop there.
    const options = { capture: true, signal: this.#abort.signal };
    window.addEventListener('keydown', (event) => this.#onKeyDown(event), options);
    window.addEventListener('keyup', (event) => this.#onKeyUp(event), options);
    // A key released outside the page never sends keyup here: the hold ends with the focus.
    window.addEventListener('blur', () => this.#endHold(), { signal: this.#abort.signal });
    window.document.addEventListener(
      'visibilitychange',
      () => {
        if (window.document.visibilityState === 'hidden') this.#endHold();
      },
      { signal: this.#abort.signal },
    );
  }

  stop(): void {
    this.#endHold();
    this.#abort?.abort();
    this.#abort = null;
  }

  #onKeyDown(event: KeyboardEvent): void {
    const { engine, window } = this.#deps;
    const settings = this.#deps.settings();
    if (!settings.pageShortcuts || isTyping(event, window.document, engine.shadowRoot)) return;
    const action = actionFor(settings.bindings, event);
    if (action === null || engine.activeMedia() === null) return;
    event.preventDefault();
    event.stopPropagation();
    if (action === 'hold') {
      if (this.#holdCode !== null) return;
      this.#holdCode = event.code;
      void engine.handleMessage(makeCommand('hold-start', { rate: settings.holdRate }));
      return;
    }
    if (event.repeat && !REPEATABLE_ACTIONS.has(action)) return;
    if (action === 'toggle-overlay') {
      this.#deps.toggleOverlay();
      return;
    }
    const change = settingForAction(action, settings);
    if (change !== null) {
      this.#deps.saveSetting(change);
      return;
    }
    void engine.handleMessage(makeCommand('get-state', {})).then(({ state }) => {
      const command = commandForAction(action, settings, state);
      if (command !== null) return engine.handleMessage(command);
      return undefined;
    });
  }

  #onKeyUp(event: KeyboardEvent): void {
    if (this.#holdCode === null || event.code !== this.#holdCode) return;
    event.preventDefault();
    event.stopPropagation();
    this.#endHold();
  }

  #endHold(): void {
    if (this.#holdCode === null) return;
    this.#holdCode = null;
    void this.#deps.engine.handleMessage(makeCommand('hold-end', {}));
  }
}
