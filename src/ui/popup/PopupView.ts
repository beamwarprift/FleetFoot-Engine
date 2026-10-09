// The popup, its parts from the most used to the least: which player is controlled, its
// speed, the presets, time and seeking, then loop and pitch. Each part lives in its own module;
// this one puts them together. Built once: `show` updates values in place, so focus and the user's
// typing are never lost to a refresh.

import type { EngineState } from '../../core/messages/Protocol.ts';
import type { Settings } from '../../core/settings/Settings.ts';
import { h, setHidden } from '../dom.ts';
import type { Localization, MessageKey } from '../i18n.ts';
import { bottomBar } from './bottomBar.ts';
import { messagePanel } from './messagePanel.ts';
import { moreCard } from './moreCard.ts';
import { playerPicker } from './playerPicker.ts';
import type { PopupActions } from './popupActions.ts';
import { presetsCard } from './presetsCard.ts';
import { speedCard } from './speedCard.ts';
import { timeCard } from './timeCard.ts';
import { topBar } from './topBar.ts';

export class PopupView {
  readonly root: HTMLElement;
  readonly #top: ReturnType<typeof topBar>;
  readonly #message: ReturnType<typeof messagePanel>;
  readonly #controls: HTMLElement;
  readonly #player: ReturnType<typeof playerPicker>;
  readonly #speed: ReturnType<typeof speedCard>;
  readonly #presets: ReturnType<typeof presetsCard>;
  readonly #time: ReturnType<typeof timeCard>;
  readonly #more: ReturnType<typeof moreCard>;
  readonly #bottom: ReturnType<typeof bottomBar>;
  #transient: string | null = null;
  #state: EngineState | null = null;

  constructor(
    document: Document,
    l10n: Localization,
    actions: PopupActions,
    reviewUrl?: string | undefined,
  ) {
    this.#top = topBar(document, l10n, () => actions.openOptions(), reviewUrl);
    this.#message = messagePanel(document, l10n, actions);
    this.#player = playerPicker(document, l10n, (choice) => actions.choosePlayer(choice));
    this.#speed = speedCard(document, l10n, actions);
    this.#presets = presetsCard(document, l10n, (rate) => actions.preset(rate));
    this.#time = timeCard(document, l10n, actions);
    this.#more = moreCard(document, l10n, actions);
    this.#bottom = bottomBar(document, l10n);
    this.#controls = h(document, 'div', { className: 'controls' }, [
      this.#player.element,
      this.#speed.element,
      this.#presets.element,
      this.#time.element,
      this.#more.element,
    ]);
    this.root = h(document, 'main', { className: 'popup' }, [
      this.#top.element,
      this.#message.element,
      this.#controls,
      this.#bottom.element,
    ]);
    this.showMessage('connectingTitle', null, false);
  }

  /** A full-popup message in place of the controls. */
  showMessage(title: MessageKey, hint: MessageKey | null, canRetry: boolean): void {
    this.#message.show(title, hint, canRetry);
    setHidden(this.#controls, true);
  }

  /** The browser did not give the access the user asked for. */
  declined(): void {
    this.#message.declined();
  }

  /** The time saved, under the brand and in the support line. */
  showSaved(seconds: number): void {
    this.#top.showSaved(seconds);
    this.#bottom.showSaved(seconds);
  }

  /** A short message about the last action; cleared by the next one. */
  say(text: string | null): void {
    this.#transient = text;
    if (this.#state !== null) this.#bottom.renderNotices(this.#state, this.#transient);
  }

  show(state: EngineState, settings: Settings): void {
    this.#state = state;
    if (state.activePlayerId === null) {
      const site = state.framedSites[0];
      if (site === undefined) this.showMessage('noMediaTitle', 'noMediaHint', false);
      else {
        this.#message.showFramed(site);
        setHidden(this.#controls, true);
      }
      return;
    }
    this.#message.hide();
    setHidden(this.#controls, false);
    this.#speed.render(state, settings);
    this.#presets.render(settings.presets, state.rate);
    this.#time.render(state, settings);
    this.#more.render(state);
    this.#player.render(state);
    this.#bottom.renderNotices(state, this.#transient);
  }
}
