// The popup's behaviour: connects to the page, shows the state it pushes, turns the user's actions
// into commands or settings. Settings reach the engine through the page itself (PageSession),
// so the popup, the overlay and the shortcuts always agree.

import { MAX_RATE, MIN_RATE } from '../../core/media/PlaybackRate.ts';
import { type Command, type EngineState, makeCommand } from '../../core/messages/Protocol.ts';
import type { Settings } from '../../core/settings/Settings.ts';
import { applyLanguage } from '../applyLanguage.ts';
import { applyTheme } from '../applyTheme.ts';
import type { ClientFailure, EngineClient } from '../EngineClient.ts';
import { formatRate, formatTimestamp, parseRateIn } from '../format.ts';
import type { Localization } from '../i18n.ts';
import { ERROR_MESSAGES, FAILURE_MESSAGES } from '../notices.ts';
import type { ProfilesPort } from '../ProfilesPort.ts';
import { saveFromPage } from '../pageWrites.ts';
import type { SettingsPort } from '../SettingsPort.ts';
import type { SiteAccessPort } from '../SiteAccessPort.ts';
import type { StatsPort } from '../StatsPort.ts';
import { PopupView } from './PopupView.ts';
import type { PlayerChoice, PopupActions } from './popupActions.ts';

export interface PopupDeps {
  readonly document: Document;
  readonly l10n: Localization;
  readonly settings: SettingsPort;
  readonly profiles: ProfilesPort;
  readonly connect: () => Promise<EngineClient | ClientFailure>;
  readonly copy: (text: string) => Promise<boolean>;
  readonly openOptions: () => void;
  /** The store page for a review, when the extension came from a known store. */
  readonly reviewUrl?: string | undefined;
  readonly stats: StatsPort;
  /** Site access, asked for a player in a frame from another site. */
  readonly access?: SiteAccessPort;
  /** Puts the popup on screen before it connects, so «connecting» is visible at once. */
  readonly mount: (root: HTMLElement) => void;
}

export interface PopupHandle {
  readonly view: PopupView;
  close(): void;
}

export async function startPopup(deps: PopupDeps): Promise<PopupHandle> {
  const { t, locale } = deps.l10n;
  let settings: Settings = await deps.settings.load();
  applyLanguage(deps.document.documentElement, deps.l10n);
  applyTheme(deps.document.documentElement, settings.theme);
  let client: EngineClient | null = null;
  let state: EngineState | null = null;
  let stopWatching: (() => void) | null = null;

  const render = (): void => {
    if (state !== null) view.show(state, settings);
  };

  const fail = (failure: ClientFailure): void => {
    client = null;
    state = null;
    const { title, hint } = FAILURE_MESSAGES[failure];
    view.showMessage(title, hint, failure === 'no-answer');
  };

  const send = async (command: Command): Promise<void> => {
    if (client === null) return;
    const result = await client.send(command);
    if (!result.ok) {
      fail(result.failure);
      return;
    }
    const { response } = result;
    view.say(response.ok ? null : t(ERROR_MESSAGES[response.error]));
    state = response.state;
    render();
  };

  const connect = async (attempt: 'first' | 'again'): Promise<void> => {
    stopWatching?.();
    stopWatching = null;
    const connected = await deps.connect();
    if (typeof connected === 'string') {
      fail(connected);
      return;
    }
    client = connected;
    stopWatching = connected.watch(
      (next) => {
        state = next;
        render();
      },
      // The page navigated or closed: one new connection, then the failure is shown.
      () => (attempt === 'first' ? void connect('again') : fail('no-answer')),
    );
  };

  /** Asked in the user's click; once given, the page is reached again with it. */
  const allow = async (ask: (access: SiteAccessPort) => Promise<boolean>): Promise<void> => {
    if (deps.access === undefined) return;
    if (await ask(deps.access)) await connect('first');
    else view.declined();
  };

  const choosePlayer = async (choice: PlayerChoice): Promise<void> => {
    if (choice.kind === 'all') {
      await send(makeCommand('set-target', { target: 'all' }));
      return;
    }
    await send(makeCommand('set-target', { target: 'active' }));
    await send(
      makeCommand('select-player', { playerId: choice.kind === 'player' ? choice.id : null }),
    );
  };

  const actions: PopupActions = {
    slower: () => void send(makeCommand('adjust-rate', { delta: -settings.rateStep })),
    faster: () => void send(makeCommand('adjust-rate', { delta: settings.rateStep })),
    typedRate(text) {
      const rate = parseRateIn(text, MIN_RATE, MAX_RATE);
      // Outside the range the user is told, never silently given another speed.
      if (rate === null) {
        view.say(t('rateInvalid', formatRate(MIN_RATE, locale), formatRate(MAX_RATE, locale)));
        render();
        return;
      }
      void send(makeCommand('set-rate', { rate }));
    },
    reset: () => void send(makeCommand('reset-rate', {})),
    previous: () => void send(makeCommand('previous-rate', {})),
    favorite: () => void send(makeCommand('set-rate', { rate: settings.favoriteRate })),
    preset: (rate) => void send(makeCommand('set-rate', { rate })),
    // Saved where the page reads it: the site's profile with memory per site.
    pitch: (enabled) =>
      void saveFromPage(deps, settings, state?.site ?? null, {
        key: 'preservesPitch',
        value: enabled,
      }),
    skipSilence: (enabled) =>
      void saveFromPage(deps, settings, state?.site ?? null, {
        key: 'skipSilence',
        value: enabled,
      }),
    seek: (direction) => void send(makeCommand('seek', { seconds: direction * settings.seekStep })),
    loopA: () => void send(makeCommand('loop-set-a', {})),
    loopB: () => void send(makeCommand('loop-set-b', {})),
    loopToggle: (enabled) => void send(makeCommand('loop-enable', { enabled })),
    loopClear: () => void send(makeCommand('loop-clear', {})),
    pip: () => void send(makeCommand('pip-toggle', {})),
    copyTimestamp() {
      if (state?.currentTime == null) return;
      const text = formatTimestamp(state.currentTime, state.duration ?? Number.NaN);
      if (text === null) return;
      void deps.copy(text).then((copied) => {
        view.say(copied ? t('copied', text) : t('copyFailed'));
      });
    },
    choosePlayer: (choice) => void choosePlayer(choice),
    openOptions: () => deps.openOptions(),
    retry: () => void connect('first'),
    allowSite: (site) => void allow((access) => access.addSite(site)),
    allowAllSites: () => void allow((access) => access.setMode('all')),
  };

  const view = new PopupView(deps.document, deps.l10n, actions, deps.reviewUrl);
  deps.mount(view.root);
  view.showSaved(await deps.stats.load());
  const stopStats = deps.stats.watch((seconds) => view.showSaved(seconds));
  const stopSettings = deps.settings.watch((next) => {
    settings = next;
    applyTheme(deps.document.documentElement, settings.theme);
    render();
  });
  await connect('first');

  return {
    view,
    close() {
      stopWatching?.();
      stopSettings();
      stopStats();
    },
  };
}
