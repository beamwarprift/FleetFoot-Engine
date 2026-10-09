// Everything the extension runs in a page once it is there: the engine configured from the
// settings that apply on this site, the remembered speed, the page's shortcuts and the overlay.
// Settings reach the engine only through here, and only the ones that changed, so a choice made in
// the popup for this page is not undone.

import type { MediaEngine } from '../core/MediaEngine.ts';
import { toRate } from '../core/media/PlaybackRate.ts';
import { makeCommand } from '../core/messages/Protocol.ts';
import { configCommands } from '../core/settings/EngineConfig.ts';
import { effectiveSettings, type SiteProfile, startingRate } from '../core/settings/Profiles.ts';
import type { Settings } from '../core/settings/Settings.ts';
import { siteOf } from '../core/settings/Sites.ts';
import type { Localization } from '../ui/i18n.ts';
import type { ProfilesPort } from '../ui/ProfilesPort.ts';
import { saveFromPage } from '../ui/pageWrites.ts';
import type { SettingsPort } from '../ui/SettingsPort.ts';
import { Overlay } from './overlay/Overlay.ts';
import { PageShortcuts } from './PageShortcuts.ts';

export interface PageSessionDeps {
  readonly window: Window;
  readonly engine: MediaEngine;
  readonly settings: SettingsPort;
  readonly profiles: ProfilesPort;
  readonly l10n: Localization;
}

export async function startPageSession(deps: PageSessionDeps): Promise<() => void> {
  const { engine, profiles } = deps;
  const site = siteOf(deps.window.location.hostname);
  let general = await deps.settings.load();
  // The site's profile counts only with memory per site, and only on a page that has a site.
  const loadProfile = async (): Promise<SiteProfile> =>
    general.memory === 'site' && site !== null ? profiles.profile(site) : {};
  let profile = await loadProfile();
  let settings: Settings = effectiveSettings(general, profile);

  const apply = async (before: Settings | null): Promise<void> => {
    for (const command of configCommands(before, settings)) await engine.handleMessage(command);
  };
  await apply(null);

  // The remembered speed, given once when the extension arrives on the page.
  const remembered = general.memory === 'global' ? await profiles.rememberedRate() : null;
  const start = startingRate(general.memory, remembered, profile);
  if (start !== null) await engine.handleMessage(makeCommand('set-default-rate', { rate: start }));

  const overlay = new Overlay({
    window: deps.window,
    engine,
    l10n: deps.l10n,
    settings: () => settings,
    savePosition: (position) => void deps.settings.save('overlayPosition', position),
  });
  const shortcuts = new PageShortcuts({
    window: deps.window,
    engine,
    settings: () => settings,
    toggleOverlay: () => overlay.toggle(),
    saveSetting: (change) => void saveFromPage(deps, general, site, change),
  });
  const syncOverlay = (): void => {
    if (settings.overlayEnabled) overlay.start();
    else overlay.stop();
  };
  shortcuts.start();
  syncOverlay();

  // A deliberate speed change is remembered as the memory says. A hold never reaches the desired
  // rate (the engine keeps it apart), so it is never remembered.
  let rememberedNow = start;
  const stopRemembering = engine.subscribe(
    (state) => {
      const rate = state.desiredRate === null ? null : toRate(state.desiredRate);
      if (rate === null || rate === rememberedNow) return;
      rememberedNow = rate;
      if (general.memory === 'global') void profiles.saveRememberedRate(rate);
      else if (general.memory === 'site' && site !== null) {
        void profiles.update(site, { playbackRate: rate }).catch(() => {});
      }
    },
    { time: false },
  );

  // The time saved is reported when the page leaves sight; no timer runs for it.
  const lifecycle = new AbortController();
  const flush = (): void => engine.flushTimeSaved();
  deps.window.addEventListener('pagehide', flush, { signal: lifecycle.signal });
  deps.window.document.addEventListener(
    'visibilitychange',
    () => {
      if (deps.window.document.visibilityState === 'hidden') flush();
    },
    { signal: lifecycle.signal },
  );

  // Changes are applied one after another, so a later one never lands before an earlier one.
  let updates = Promise.resolve();
  const refresh = (): void => {
    updates = updates
      .then(async () => {
        const before = settings;
        profile = await loadProfile();
        settings = effectiveSettings(general, profile);
        await apply(before);
        syncOverlay();
        overlay.refresh();
      })
      .catch(() => {});
  };
  const stopSettings = deps.settings.watch((next) => {
    general = next;
    refresh();
  });
  const stopProfiles = profiles.watch(refresh);

  return () => {
    lifecycle.abort();
    stopSettings();
    stopProfiles();
    stopRemembering();
    shortcuts.stop();
    overlay.stop();
  };
}
