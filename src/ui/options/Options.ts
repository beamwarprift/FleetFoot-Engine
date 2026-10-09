// The options page: speeds, playback, memory and site profiles, site access, keyboard,
// overlay, right-click menu, appearance, time saved, privacy and about, one module per section; this one
// puts them together on the page `settingsPage.ts` loads and follows the settings for. Every field
// saves on change after validation; an invalid value is explained next to its field and nothing
// is saved.

import type { Settings } from '../../core/settings/Settings.ts';
import { brandMark } from '../brand.ts';
import { h } from '../dom.ts';
import type { Localization } from '../i18n.ts';
import type { LocalDataPort } from '../LocalDataPort.ts';
import type { ProfilesPort } from '../ProfilesPort.ts';
import type { SettingsPort } from '../SettingsPort.ts';
import type { SiteAccessPort } from '../SiteAccessPort.ts';
import type { StatsPort } from '../StatsPort.ts';
import { applyTextSize } from '../textSize.ts';
import { aboutSection } from './aboutSection.ts';
import { accessSection } from './accessSection.ts';
import { appearanceSection } from './appearanceSection.ts';
import { type BrowserShortcuts, keyboardSection } from './keyboardSection.ts';
import type { LayoutMap } from './keyLabel.ts';
import { memorySection } from './memorySection.ts';
import { menuSection } from './menuSection.ts';
import { overlaySection } from './overlaySection.ts';
import { playbackSection } from './playbackSection.ts';
import { privacySection } from './privacySection.ts';
import { savedTimeSection } from './savedTimeSection.ts';
import { startSettingsPage } from './settingsPage.ts';
import { speedSection } from './speedSection.ts';

export interface OptionsDeps {
  readonly document: Document;
  readonly l10n: Localization;
  readonly settings: SettingsPort;
  /** The browser's own shortcuts, null where it has none (Firefox for Android). */
  readonly browserShortcuts: BrowserShortcuts | null;
  /** Whether the browser has a right-click menu for extensions (not Firefox for Android). */
  readonly contextMenu: boolean;
  readonly layout: LayoutMap | null;
  readonly mount: (root: HTMLElement) => void;
  readonly stats: StatsPort;
  readonly profiles: ProfilesPort;
  readonly access: SiteAccessPort;
  readonly localData: LocalDataPort;
  /** The version this build carries, from its manifest. */
  readonly version: string;
}

export function startOptions(deps: OptionsDeps): Promise<() => void> {
  return startSettingsPage(deps, async (shared, status) => {
    const { document, l10n } = deps;
    const { t } = l10n;
    const sections = [
      speedSection(shared),
      playbackSection(shared),
      memorySection({ ...shared, profiles: deps.profiles }),
      accessSection({ ...shared, access: deps.access }),
      keyboardSection({
        ...shared,
        layout: deps.layout,
        browserShortcuts: deps.browserShortcuts,
      }),
      overlaySection(shared),
      ...(deps.contextMenu ? [menuSection(shared)] : []),
      appearanceSection(shared),
      await savedTimeSection({ ...shared, stats: deps.stats }),
      privacySection({
        ...shared,
        profiles: deps.profiles,
        localData: deps.localData,
        access: deps.access,
      }),
      aboutSection({ ...shared, version: deps.version }),
    ];
    const restore = shared.fields.confirmButton('restoreDefaults', 'restoreConfirm', () => {
      void deps.settings.reset().then(() => shared.say(t('restored')));
    });
    const root = h(document, 'main', { className: 'options' }, [
      h(document, 'h1', {}, [
        brandMark(document, 'span'),
        h(document, 'span', { className: 'title', text: t('optionsTitle') }),
      ]),
      ...sections.map((section) => section.element),
      h(document, 'footer', {}, [restore, status]),
    ]);
    // The text size is this page's alone: the popup and the overlay keep theirs.
    const follow = (settings: Settings) =>
      applyTextSize(document.documentElement, settings.textSize);
    return { sections, root, follow };
  });
}
