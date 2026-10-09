// The first-run page: very short, three things. No data leaves the browser; how much
// site access to give, asked inside the click as on the options page; the favorite speed. No
// request for support, nothing pre-chosen beyond the defaults.

import { brandMark } from '../brand.ts';
import { h } from '../dom.ts';
import type { Localization } from '../i18n.ts';
import { accessSection } from '../options/accessSection.ts';
import { privacyPromise } from '../options/privacySection.ts';
import { settingsSection } from '../options/section.ts';
import { settingControls } from '../options/settingControls.ts';
import { startSettingsPage } from '../options/settingsPage.ts';
import type { SettingsPort } from '../SettingsPort.ts';
import type { SiteAccessPort } from '../SiteAccessPort.ts';

export interface WelcomeDeps {
  readonly document: Document;
  readonly l10n: Localization;
  readonly settings: SettingsPort;
  readonly access: SiteAccessPort;
  readonly mount: (root: HTMLElement) => void;
  /** Closes this page. */
  readonly close: () => void;
}

export function startWelcome(deps: WelcomeDeps): Promise<() => void> {
  return startSettingsPage(deps, async (shared, status) => {
    const { document } = deps;
    const { t } = deps.l10n;
    const { fields } = shared;
    const favorite = settingControls(shared).rateField(
      'favoriteRate',
      'favoriteField',
      'welcomeSpeedHelp',
    );
    const sections = [
      settingsSection(fields.section('welcomePrivacy', privacyPromise(document, t)), []),
      accessSection({ ...shared, access: deps.access }),
      settingsSection(fields.section('welcomeSpeed', [favorite.element]), [favorite]),
    ];
    const root = h(document, 'main', { className: 'options welcome' }, [
      h(document, 'h1', {}, [
        brandMark(document, 'span'),
        h(document, 'span', { className: 'title', text: t('welcomeTitle') }),
      ]),
      ...sections.map((section) => section.element),
      h(document, 'footer', {}, [
        h(document, 'button', {
          className: 'primary',
          text: t('welcomeDone'),
          attrs: { type: 'button' },
          on: { click: () => deps.close() },
        }),
        h(document, 'a', { text: t('welcomeAllSettings'), attrs: { href: '/options.html' } }),
        status,
      ]),
    ]);
    return { sections, root };
  });
}
