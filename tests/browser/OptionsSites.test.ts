// The options page's site sections: what is remembered, each site's profile, and where the
// extension starts by itself, with permissions granted, refused and revoked from outside.

import { afterEach, describe, expect, it } from 'vitest';
import { ALL_SITES } from '../../src/core/settings/Access.ts';
import { sitePatterns } from '../../src/core/settings/Sites.ts';
import { startOptions } from '../../src/ui/options/Options.ts';
import { resetPage } from './media.ts';
import {
  ENGLISH,
  type MemoryAccess,
  type MemoryProfiles,
  memoryAccess,
  memoryLocalData,
  memoryProfiles,
  memorySettings,
  memoryStats,
  settled,
  TEST_VERSION,
  englishText as t,
} from './ui.ts';

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  resetPage();
});

async function options(
  stored: Record<string, unknown> = {},
  profiles: MemoryProfiles = memoryProfiles(),
  access: MemoryAccess = memoryAccess(),
) {
  const settings = memorySettings(stored);
  let root: HTMLElement | null = null;
  const stop = await startOptions({
    localData: memoryLocalData(),
    version: TEST_VERSION,
    document,
    l10n: ENGLISH,
    settings,
    profiles,
    access,
    layout: null,
    browserShortcuts: { open: null },
    contextMenu: true,
    stats: memoryStats(),
    mount: (element) => {
      root = element;
      document.body.append(element);
    },
  });
  cleanups.push(stop);
  const mounted = root as HTMLElement | null;
  if (mounted === null) throw new Error('options not mounted');
  await settled();
  return { root: mounted, settings, profiles, access };
}

function section(root: HTMLElement, title: string): HTMLElement {
  const heading = Array.from(root.querySelectorAll('h2')).find(
    (item) => item.textContent === title,
  );
  const found = heading?.closest('section');
  if (found === null || found === undefined) throw new Error(`no section ${title}`);
  return found;
}

function radio(scope: HTMLElement, label: string): HTMLInputElement {
  const element = Array.from(scope.querySelectorAll('label')).find(
    (item) => item.textContent === label,
  );
  const input =
    element === undefined ? null : scope.querySelector<HTMLInputElement>(`#${element.htmlFor}`);
  if (input === null) throw new Error(`no choice ${label}`);
  return input;
}

function choose(input: HTMLInputElement): void {
  input.checked = true;
  input.dispatchEvent(new Event('change'));
}

/** The site field and add button of a block, by the block's heading. */
function adder(scope: HTMLElement, heading: string) {
  const block = Array.from(scope.querySelectorAll('h3')).find(
    (item) => item.textContent === heading,
  )?.parentElement;
  const input = block?.querySelector<HTMLInputElement>('input[inputmode="url"]');
  const button = Array.from(block?.querySelectorAll('button') ?? []).find(
    (item) => item.textContent === t('siteAdd'),
  );
  if (
    block === undefined ||
    block === null ||
    input === null ||
    input === undefined ||
    button === undefined
  ) {
    throw new Error(`no site field under ${heading}`);
  }
  const add = (text: string): void => {
    input.value = text;
    button.click();
  };
  return { block, input, add };
}

const listed = (block: HTMLElement) =>
  Array.from(block.querySelectorAll('.sites .site'), (item) => item.textContent);

describe('memory section', () => {
  it('saves the memory mode, and shows the sites only with memory per site', async () => {
    const profiles = memoryProfiles({ 'site:youtube.com': { playbackRate: 1.75 } });
    const { root, settings } = await options({}, profiles);
    const memory = section(root, t('sectionMemory'));
    expect(radio(memory, t('memoryGlobal')).checked).toBe(true);
    const sites = memory.querySelector<HTMLElement>('.profiles')?.parentElement;
    expect(sites?.hidden).toBe(true);
    choose(radio(memory, t('memorySite')));
    await settled();
    expect(settings.stored['memory']).toBe('site');
    expect(sites?.hidden).toBe(false);
    expect(memory.querySelector('.profile summary')?.textContent).toBe('youtube.com1.75×');
  });

  it("edits a site's profile field by field, refusing invalid values", async () => {
    const profiles = memoryProfiles({ 'site:coursera.org': { playbackRate: 2 } });
    const { root } = await options({ memory: 'site' }, profiles);
    const memory = section(root, t('sectionMemory'));
    const row = memory.querySelector<HTMLElement>('.profile');
    const field = (label: string) => {
      const element = Array.from(row?.querySelectorAll('label') ?? []).find(
        (item) => item.textContent === label,
      );
      const control =
        element === undefined
          ? null
          : row?.querySelector<HTMLInputElement | HTMLSelectElement>(`#${element.htmlFor}`);
      if (control === null || control === undefined) throw new Error(`no field ${label}`);
      return control;
    };
    // An empty field shows what the site takes from the general settings.
    expect((field(t('holdField')) as HTMLInputElement).placeholder).toBe(
      t('profileGeneralValue', '3.00×'),
    );
    expect((field(t('seekStepField')) as HTMLInputElement).placeholder).toBe(
      t('profileGeneralValue', '5 sec'),
    );
    const speed = field(t('profileSpeed'));
    speed.focus();
    speed.value = '99';
    speed.dispatchEvent(new Event('change'));
    await settled();
    expect(speed.getAttribute('aria-invalid')).toBe('true');
    expect(profiles.stored['site:coursera.org']).toEqual({ playbackRate: 2 });
    speed.value = '1,5';
    speed.dispatchEvent(new Event('change'));
    const pitch = field(t('pitchField')) as HTMLSelectElement;
    pitch.value = 'off';
    pitch.dispatchEvent(new Event('change'));
    await settled();
    await settled();
    // Two edits in a row both land: each starts from the stored profile.
    expect(profiles.stored['site:coursera.org']).toEqual({
      playbackRate: 1.5,
      preservesPitch: false,
    });
    speed.value = '';
    speed.dispatchEvent(new Event('change'));
    await settled();
    await settled();
    expect(profiles.stored['site:coursera.org']).toEqual({ preservesPitch: false });
    const fight = field(t('fightField')) as HTMLSelectElement;
    fight.value = 'unbraked';
    fight.dispatchEvent(new Event('change'));
    await settled();
    await settled();
    expect(profiles.stored['site:coursera.org']).toEqual({
      preservesPitch: false,
      lockFight: 'unbraked',
    });
    const skip = field(t('skipSilenceField')) as HTMLSelectElement;
    skip.value = 'on';
    skip.dispatchEvent(new Event('change'));
    await settled();
    await settled();
    expect(profiles.stored['site:coursera.org']).toEqual({
      preservesPitch: false,
      lockFight: 'unbraked',
      skipSilence: true,
    });
  });

  it('names the general value in every empty field, and follows it when it changes', async () => {
    const profiles = memoryProfiles({ 'site:a.com': { playbackRate: 2 } });
    const { root, settings } = await options({ memory: 'site' }, profiles);
    const card = root.querySelector<HTMLElement>('.profile');
    const general = () =>
      [
        ...Array.from(card?.querySelectorAll('select') ?? [], (select) => select.options[0]?.text),
        ...Array.from(card?.querySelectorAll('input') ?? [], (input) => input.placeholder),
      ].filter((text) => text !== '' && text !== undefined);
    expect(general()).toEqual([
      t('profileGeneralValue', t('profileOn')),
      t('profileGeneralValue', t('policySmartShort')),
      t('profileGeneralValue', t('fightYieldShort')),
      t('profileGeneralValue', t('profileOff')),
      t('profileGeneralValue', t('profileOn')),
      t('profileGeneralValue', '5 sec'),
      t('profileGeneralValue', '3.00×'),
    ]);
    await settings.save('preservesPitch', false);
    await settings.save('ratePolicy', 'lock');
    await settings.save('lockFight', 'unbraked');
    await settings.save('seekStep', 10);
    await settings.save('skipSilence', true);
    await settled();
    expect(general()).toEqual([
      t('profileGeneralValue', t('profileOff')),
      t('profileGeneralValue', t('policyLockShort')),
      t('profileGeneralValue', t('fightUnbrakedShort')),
      t('profileGeneralValue', t('profileOn')),
      t('profileGeneralValue', t('profileOn')),
      t('profileGeneralValue', '10 sec'),
      t('profileGeneralValue', '3.00×'),
    ]);
    // The site's own value stays chosen; the general one is only its name.
    expect(card?.querySelector('select')?.value).toBe('');
  });

  it('keeps an open card open after an edit is saved and the list follows the storage', async () => {
    const profiles = memoryProfiles({
      'site:a.com': { playbackRate: 2 },
      'site:b.com': { playbackRate: 1.5 },
    });
    const { root } = await options({ memory: 'site' }, profiles);
    const card = () =>
      Array.from(root.querySelectorAll<HTMLDetailsElement>('.profile')).find(
        (item) => item.querySelector('.site')?.textContent === 'a.com',
      );
    const opened = card();
    if (opened === undefined) throw new Error('no card');
    opened.open = true;
    const speed = opened.querySelector<HTMLInputElement>('input');
    speed?.focus();
    if (speed) speed.value = '2,5';
    speed?.dispatchEvent(new Event('change'));
    await settled();
    // The user moves on: the list is rebuilt from what was saved.
    speed?.blur();
    await settled();
    await settled();
    expect(profiles.stored['site:a.com']).toEqual({ playbackRate: 2.5 });
    expect(card()?.open).toBe(true);
    expect(
      Array.from(root.querySelectorAll<HTMLDetailsElement>('.profile')).filter((item) => item.open),
    ).toHaveLength(1);
  });

  it('forgets a site', async () => {
    const profiles = memoryProfiles({ 'site:a.com': { playbackRate: 2 } });
    const { root } = await options({ memory: 'site' }, profiles);
    const forget = Array.from(root.querySelectorAll('button')).find(
      (item) => item.getAttribute('aria-label') === t('profileForgetSite', 'a.com'),
    );
    forget?.click();
    await settled();
    await settled();
    expect(profiles.stored['site:a.com']).toBeUndefined();
    expect(section(root, t('sectionMemory')).textContent).toContain(t('profilesEmpty'));
  });
});

describe('site access section', () => {
  it('reads the mode from the permissions and asks for all sites inside the click', async () => {
    const { root, access } = await options();
    const block = section(root, t('sectionAccess'));
    expect(radio(block, t('accessOnClick')).checked).toBe(true);
    choose(radio(block, t('accessAll')));
    await settled();
    await settled();
    expect([...access.origins].sort()).toEqual([...ALL_SITES].sort());
    expect(radio(block, t('accessAll')).checked).toBe(true);
  });

  it('leaves everything as it was when the browser refuses, and says so', async () => {
    const access = memoryAccess();
    access.grants = false;
    const { root } = await options({}, memoryProfiles(), access);
    const block = section(root, t('sectionAccess'));
    choose(radio(block, t('accessAll')));
    await settled();
    await settled();
    expect(access.origins.size).toBe(0);
    expect(radio(block, t('accessOnClick')).checked).toBe(true);
    expect(root.querySelector('.status')?.textContent).toBe(t('accessDeclined'));
  });

  it('adds and removes chosen sites, refusing what is not a site', async () => {
    const { root, access } = await options();
    const block = section(root, t('sectionAccess'));
    choose(radio(block, t('accessSelected')));
    await settled();
    const sites = adder(block, t('sitesChosen'));
    expect(sites.block.hidden).toBe(false);
    sites.add('javascript:alert(1)');
    await settled();
    expect(sites.input.getAttribute('aria-invalid')).toBe('true');
    expect(access.origins.size).toBe(0);
    sites.add('https://www.Example.com/watch');
    await settled();
    await settled();
    expect([...access.origins].sort()).toEqual(sitePatterns('example.com').sort());
    expect(listed(sites.block)).toEqual(['example.com']);
    Array.from(sites.block.querySelectorAll('button'))
      .find((item) => item.getAttribute('aria-label') === t('siteRemove', 'example.com'))
      ?.click();
    await settled();
    await settled();
    expect(access.origins.size).toBe(0);
  });

  it('follows a permission revoked in the browser’s own settings', async () => {
    const access = memoryAccess([...ALL_SITES]);
    const { root } = await options({}, memoryProfiles(), access);
    const block = section(root, t('sectionAccess'));
    expect(radio(block, t('accessAll')).checked).toBe(true);
    await access.setMode('on-click');
    await settled();
    await settled();
    expect(radio(block, t('accessOnClick')).checked).toBe(true);
  });

  it('keeps excluded sites with all sites, unique and valid', async () => {
    const { root, settings } = await options({}, memoryProfiles(), memoryAccess([...ALL_SITES]));
    const block = section(root, t('sectionAccess'));
    const excluded = adder(block, t('sitesExcluded'));
    expect(excluded.block.hidden).toBe(false);
    excluded.add('bank.com');
    await settled();
    excluded.add('bank.com');
    await settled();
    excluded.add('not a site');
    await settled();
    expect(settings.stored['excludedSites']).toEqual(['bank.com']);
    expect(excluded.input.getAttribute('aria-invalid')).toBe('true');
    expect(listed(excluded.block)).toEqual(['bank.com']);
  });
});
