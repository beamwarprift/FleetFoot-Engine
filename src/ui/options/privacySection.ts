// Privacy & permissions: what never leaves the device, the access the browser has
// granted right now, the user's own copy of the settings, and the invitation to read the source.

import type { SiteAccess } from '../../core/settings/Access.ts';
import { h, setText } from '../dom.ts';
import { isolate, type MessageKey, type Translate } from '../i18n.ts';
import { externalLink, REPOSITORY_URL } from '../links.ts';
import type { SiteAccessPort } from '../SiteAccessPort.ts';
import { ACCESS_SECTION_ID } from './accessSection.ts';
import { type BackupDeps, backupControls } from './backupControls.ts';
import type { OptionsSection } from './section.ts';

export interface PrivacyDeps extends BackupDeps {
  readonly access: SiteAccessPort;
}

/** What FleetFoot Engine has none of, and where the settings stay. */
const FACTS: readonly (readonly [MessageKey, MessageKey])[] = [
  ['privacyTelemetry', 'privacyTelemetryNone'],
  ['privacyAnalytics', 'privacyAnalyticsNone'],
  ['privacyAccounts', 'privacyAccountsNone'],
  ['privacyServers', 'privacyServersNone'],
  ['privacyAds', 'privacyAdsNone'],
  ['privacyAffiliate', 'privacyAffiliateNone'],
  ['privacyStorage', 'privacyStorageLocal'],
];

/** One whole sentence per mode, so each language builds it its own way. */
const WHERE: Readonly<Record<SiteAccess['mode'], MessageKey>> = {
  'on-click': 'privacyWhereOnClick',
  selected: 'privacyWhereSelected',
  all: 'privacyWhereAll',
};

/** The promise, as the privacy section and the first-run page both state it. */
export function privacyPromise(document: Document, t: Translate): HTMLElement[] {
  return [
    h(document, 'p', { className: 'badge' }, [
      h(document, 'span', { className: 'badge-title', text: t('privacyBadge') }),
      h(document, 'span', { className: 'badge-sub', text: t('privacyBadgeSub') }),
    ]),
    h(document, 'p', { text: t('privacyStatement') }),
  ];
}

export function privacySection(deps: PrivacyDeps): OptionsSection {
  const { document, fields, access } = deps;
  const { t, locale } = deps.l10n;
  const sites = new Intl.ListFormat(locale, { type: 'conjunction' });

  const mode = h(document, 'p', {});
  const granted = h(document, 'p', { className: 'site-list' });
  const showAccess = (current: SiteAccess) => {
    setText(mode, t(WHERE[current.mode]));
    // Each site reads left to right inside a right-to-left list too.
    setText(granted, sites.format(current.sites.map(isolate)));
    granted.hidden = current.sites.length === 0;
  };
  const read = () => void access.read().then(showAccess);
  const stopAccess = access.watch(read);
  read();

  return {
    element: fields.section('sectionPrivacy', [
      ...privacyPromise(document, t),
      h(
        document,
        'dl',
        { className: 'facts' },
        FACTS.flatMap(([term, value]) => [
          h(document, 'dt', { text: t(term) }),
          h(document, 'dd', { text: t(value) }),
        ]),
      ),
      h(document, 'div', { className: 'group' }, [
        mode,
        granted,
        h(document, 'a', {
          text: t('privacyAccessChange'),
          attrs: { href: `#${ACCESS_SECTION_ID}` },
        }),
      ]),
      backupControls(deps),
      h(document, 'p', { className: 'verify', text: t('verifySource') }),
      externalLink(document, t('sourceLink'), REPOSITORY_URL),
    ]),
    refresh() {},
    stop: stopAccess,
  };
}
