// Memory: what FleetFoot Engine remembers between visits, and with memory per site each
// remembered site's profile, every field optional, an empty one naming the general value.

import { MEMORY_MODES, type MemoryMode } from '../../core/settings/Memory.ts';
import { h } from '../dom.ts';
import type { MessageKey } from '../i18n.ts';
import type { ProfilesPort } from '../ProfilesPort.ts';
import { type ProfileCardDeps, profileCard } from './profileCard.ts';
import type { OptionsSection, SectionDeps } from './section.ts';

export interface MemoryDeps extends SectionDeps {
  readonly profiles: ProfilesPort;
}

const MEMORY_TEXT: Readonly<Record<MemoryMode, readonly [MessageKey, MessageKey]>> = {
  none: ['memoryNone', 'memoryNoneHelp'],
  global: ['memoryGlobal', 'memoryGlobalHelp'],
  site: ['memorySite', 'memorySiteHelp'],
};

export function memorySection(deps: MemoryDeps): OptionsSection {
  const { document, fields, profiles } = deps;
  const { t } = deps.l10n;
  const group = fields.choices(
    'memoryField',
    MEMORY_MODES.map((value) => {
      const [label, help] = MEMORY_TEXT[value];
      return { value, label, help };
    }),
    (value) => void deps.save('memory', value),
  );
  const list = h(document, 'div', { className: 'profiles' });
  const block = h(document, 'div', { className: 'group' }, [
    h(document, 'h3', { text: t('profilesTitle') }),
    list,
  ]);

  // Profile writes run one after another, so two edits never overwrite each other.
  let writes: Promise<void> = Promise.resolve();
  const enqueue = (write: () => Promise<void>): void => {
    writes = writes
      .then(write)
      .then(() => deps.say(t('saved')))
      .catch(() => {});
  };

  // An empty field shows the value the site takes from the general settings, kept up to date.
  let generalLabels: Array<() => void> = [];
  // The cards the user opened stay open across rebuilds; kept in the page only.
  const openSites = new Set<string>();
  const cardDeps: ProfileCardDeps = {
    ...deps,
    // One field per patch, applied to the profile as stored: edits in a row add up.
    update: (site, key, value) => enqueue(() => profiles.update(site, { [key]: value })),
    forget: (site) => enqueue(() => profiles.update(site, null)),
    isOpen: (site) => openSites.has(site),
    setOpen: (site, open) => {
      if (open) openSites.add(site);
      else openSites.delete(site);
    },
    general: (value, show) => {
      const update = () => show(t('profileGeneralValue', value()));
      generalLabels.push(update);
      update();
    },
  };

  // The list is rebuilt from storage; never while the user is editing one of its fields.
  let pending = false;
  const render = async (): Promise<void> => {
    if (list.contains(document.activeElement)) {
      pending = true;
      return;
    }
    pending = false;
    const entries = await profiles.list();
    generalLabels = [];
    list.replaceChildren(
      entries.length === 0
        ? h(document, 'p', { className: 'help', text: t('profilesEmpty') })
        : h(
            document,
            'div',
            { className: 'profile-list' },
            entries.map((entry) => profileCard(cardDeps, entry)),
          ),
    );
  };
  list.addEventListener('focusout', (event) => {
    if (pending && !list.contains((event as FocusEvent).relatedTarget as Node | null)) {
      void render();
    }
  });
  const stopProfiles = profiles.watch(() => void render());
  void render();

  const refresh = (): void => {
    const { memory } = deps.settings();
    group.show(memory);
    for (const update of generalLabels) update();
    // Profiles count only with memory per site: shown only then.
    block.hidden = memory !== 'site';
  };
  return {
    element: fields.section('sectionMemory', [group.element, block]),
    refresh,
    stop: stopProfiles,
  };
}
