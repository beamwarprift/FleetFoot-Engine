// Site access: where FleetFoot Engine starts by itself, read from the permissions the
// browser granted. A permission is asked inside the user's click, and a refusal leaves everything
// as it was.

import type { AccessMode, SiteAccess } from '../../core/settings/Access.ts';
import { MAX_EXCLUDED_SITES } from '../../core/settings/Settings.ts';
import { parseSiteInput, SITE_INPUT_MAX_LENGTH } from '../../core/settings/Sites.ts';
import { h } from '../dom.ts';
import type { Localization, MessageKey } from '../i18n.ts';
import type { SiteAccessPort } from '../SiteAccessPort.ts';
import type { Choice } from './fields.ts';
import type { OptionsSection, SectionDeps } from './section.ts';

/** Where the privacy section's link to site access leads. */
export const ACCESS_SECTION_ID = 'site-access';

export interface AccessDeps extends SectionDeps {
  readonly access: SiteAccessPort;
}

const ACCESS_CHOICES: readonly Choice<AccessMode>[] = [
  { value: 'on-click', label: 'accessOnClick', help: 'accessOnClickHelp' },
  { value: 'selected', label: 'accessSelected', help: 'accessSelectedHelp' },
  { value: 'all', label: 'accessAll', help: 'accessAllHelp' },
];

/** A list of sites, each with its remove button; empty, a sentence says so. */
function siteList(
  document: Document,
  l10n: Localization,
  sites: readonly string[],
  remove: (site: string) => void,
): HTMLElement {
  const { t } = l10n;
  if (sites.length === 0) return h(document, 'p', { className: 'help', text: t('sitesNone') });
  return h(
    document,
    'ul',
    { className: 'sites' },
    sites.map((site) =>
      h(document, 'li', {}, [
        h(document, 'span', { className: 'site', text: site }),
        h(document, 'button', {
          text: t('siteRemoveShort'),
          attrs: { type: 'button', 'aria-label': t('siteRemove', site) },
          on: { click: () => remove(site) },
        }),
      ]),
    ),
  );
}

/** A site field with its add button; `add` runs inside the click, with a valid site only. */
function siteAdder(
  deps: AccessDeps,
  label: MessageKey,
  add: (site: string, input: HTMLInputElement) => void,
): HTMLElement {
  const { document, fields } = deps;
  const { t } = deps.l10n;
  const input = fields.textInput('url', SITE_INPUT_MAX_LENGTH);
  const submit = (): void => {
    const site = parseSiteInput(input.value);
    if (site === null) {
      fields.showError(input, t('siteInvalid'));
      return;
    }
    fields.showError(input, null);
    add(site, input);
  };
  input.addEventListener('keydown', (event) => {
    if ((event as KeyboardEvent).key === 'Enter') submit();
  });
  const button = h(document, 'button', {
    text: t('siteAdd'),
    attrs: { type: 'button' },
    on: { click: submit },
  });
  return h(document, 'div', { className: 'site-adder' }, [
    fields.field(label, input, 'siteHelp'),
    button,
  ]);
}

export function accessSection(deps: AccessDeps): OptionsSection {
  const { document, fields, access } = deps;
  const { t } = deps.l10n;
  // Selected Sites with no site yet: chosen in the page, not yet a permission.
  let choosingSites = false;
  let current: SiteAccess = { mode: 'on-click', sites: [] };

  const group = fields.choices('accessField', ACCESS_CHOICES, (mode) => {
    // The browser's prompt must open inside this click: nothing is awaited before asking.
    void access.setMode(mode).then((granted) => {
      if (!granted) deps.say(t('accessDeclined'));
      choosingSites = granted && mode === 'selected';
      return show();
    });
  });

  const chosen = h(document, 'div');
  const chosenBlock = h(document, 'div', { className: 'group' }, [
    h(document, 'h3', { text: t('sitesChosen') }),
    chosen,
    siteAdder(deps, 'siteField', (site, input) => {
      void access.addSite(site).then((granted) => {
        if (!granted) {
          deps.say(t('accessDeclined'));
          return;
        }
        input.value = '';
        deps.say(t('saved'));
      });
    }),
  ]);
  const excluded = h(document, 'div');
  const excludedBlock = h(document, 'div', { className: 'group' }, [
    h(document, 'h3', { text: t('sitesExcluded') }),
    h(document, 'p', { className: 'help', text: t('sitesExcludedHelp') }),
    excluded,
    siteAdder(deps, 'siteField', (site, input) => {
      const sites = deps.settings().excludedSites;
      if (sites.includes(site)) return;
      if (sites.length >= MAX_EXCLUDED_SITES) {
        fields.showError(input, t('excludedFull', String(MAX_EXCLUDED_SITES)));
        return;
      }
      input.value = '';
      void deps.save('excludedSites', [...sites, site]);
    }),
  ]);

  const renderExcluded = (): void => {
    const sites = deps.settings().excludedSites;
    excluded.replaceChildren(
      siteList(document, deps.l10n, sites, (site) => {
        void deps.save(
          'excludedSites',
          sites.filter((other) => other !== site),
        );
      }),
    );
  };

  const show = async (): Promise<void> => {
    current = await access.read();
    if (current.mode !== 'on-click') choosingSites = false;
    const mode: AccessMode = choosingSites ? 'selected' : current.mode;
    group.show(mode);
    chosenBlock.hidden = mode !== 'selected';
    excludedBlock.hidden = mode !== 'all';
    chosen.replaceChildren(
      siteList(document, deps.l10n, current.sites, (site) => {
        void access.removeSite(site);
      }),
    );
    renderExcluded();
  };
  // A permission granted or revoked anywhere, the browser's own settings included.
  const stopAccess = access.watch(() => void show());
  void show();

  return {
    element: fields.section(
      'sectionAccess',
      [
        group.element,
        chosenBlock,
        excludedBlock,
        h(document, 'p', { className: 'help', text: t('accessFiles') }),
      ],
      ACCESS_SECTION_ID,
    ),
    refresh: renderExcluded,
    stop: stopAccess,
  };
}
