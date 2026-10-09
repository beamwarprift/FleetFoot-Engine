// The options page: every field saves on change after validation, and shortcuts are recorded by
// pressing them.

import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/core/settings/Settings.ts';
import type { BrowserShortcuts } from '../../src/ui/options/keyboardSection.ts';
import { startOptions } from '../../src/ui/options/Options.ts';
import { resetPage } from './media.ts';
import {
  ENGLISH,
  type MemorySettings,
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
  browserShortcuts: BrowserShortcuts | null = { open: null },
  contextMenu = true,
) {
  const settings: MemorySettings = memorySettings(stored);
  let root: HTMLElement | null = null;
  const stop = await startOptions({
    localData: memoryLocalData(),
    version: TEST_VERSION,
    profiles: memoryProfiles(),
    access: memoryAccess(),
    document,
    l10n: ENGLISH,
    settings,
    layout: null,
    browserShortcuts,
    contextMenu,
    stats: memoryStats(),
    mount: (element) => {
      root = element;
      document.body.append(element);
    },
  });
  cleanups.push(stop);
  if (root === null) throw new Error('options not mounted');
  return { root: root as HTMLElement, settings };
}

function fieldByLabel(root: HTMLElement, label: string): HTMLInputElement {
  const element = Array.from(root.querySelectorAll('label')).find(
    (item) => item.textContent === label,
  );
  const control =
    element === undefined ? null : root.querySelector<HTMLInputElement>(`#${element.htmlFor}`);
  if (control === null) throw new Error(`no field ${label}`);
  return control;
}

function change(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event('change'));
}

function shortcutButton(root: HTMLElement, action: string): HTMLButtonElement {
  const row = Array.from(root.querySelectorAll('tr')).find(
    (item) => item.querySelector('th')?.textContent === action,
  );
  const button = row?.querySelector('button');
  if (button === undefined || button === null) throw new Error(`no shortcut row ${action}`);
  return button;
}

describe('options', () => {
  it('show the current settings', async () => {
    const { root } = await options({ seekStep: 15, favoriteRate: 1.75 });
    expect(fieldByLabel(root, t('seekStepField')).value).toBe('15');
    expect(fieldByLabel(root, t('favoriteField')).value).toBe('1.75');
    expect(fieldByLabel(root, t('presetsField')).value).toBe(
      '0.25 0.50 0.75 1.00 1.25 1.50 1.75 2.00 2.50 3.00 4.00',
    );
  });

  it('save presets written with dots or commas', async () => {
    const { root, settings } = await options();
    change(fieldByLabel(root, t('presetsField')), '2 1,5 1');
    await settled();
    expect(settings.stored['presets']).toEqual([1, 1.5, 2]);
  });

  it('explain an invalid value next to its field and save nothing', async () => {
    const { root, settings } = await options();
    const presets = fieldByLabel(root, t('presetsField'));
    change(presets, '1 fast');
    await settled();
    expect(presets.getAttribute('aria-invalid')).toBe('true');
    const error = document.getElementById(`${presets.id}-error`);
    expect(error?.hidden).toBe(false);
    expect(error?.textContent).toBe(t('presetsInvalid', '12'));
    expect(presets.getAttribute('aria-describedby')).toContain(`${presets.id}-error`);
    expect(settings.stored['presets']).toBeUndefined();
    const seek = fieldByLabel(root, t('seekStepField'));
    change(seek, '0');
    await settled();
    expect(seek.getAttribute('aria-invalid')).toBe('true');
    expect(settings.stored['seekStep']).toBeUndefined();
  });

  it('save switches and choices', async () => {
    const { root, settings } = await options();
    const overlay = fieldByLabel(root, t('overlayField'));
    overlay.click();
    await settled();
    expect(settings.stored['overlayEnabled']).toBe(false);
    fieldByLabel(root, t('policyLock')).click();
    await settled();
    expect(settings.stored['ratePolicy']).toBe('lock');
    fieldByLabel(root, t('fightBraked')).click();
    await settled();
    expect(settings.stored['lockFight']).toBe('braked');
  });

  it('offer Skip Silence off by default, with what counts as a silence and its speed', async () => {
    const { root, settings } = await options();
    const skip = fieldByLabel(root, t('skipSilenceField'));
    expect(skip.type).toBe('checkbox');
    expect(skip.checked).toBe(false);
    expect(document.getElementById(`${skip.id}-help`)?.textContent).toBe(t('skipSilenceHelp'));
    expect(skip.getAttribute('aria-describedby')).toContain(`${skip.id}-help`);
    expect(fieldByLabel(root, t('silenceNormal')).checked).toBe(true);
    const speed = fieldByLabel(root, t('silenceRateField'));
    expect(speed.value).toBe('5.00');
    skip.click();
    await settled();
    expect(settings.stored['skipSilence']).toBe(true);
    fieldByLabel(root, t('silenceAggressive')).click();
    await settled();
    expect(settings.stored['silenceMode']).toBe('aggressive');
    change(speed, '3,5');
    await settled();
    expect(settings.stored['silenceRate']).toBe(3.5);
    change(speed, '17');
    await settled();
    expect(speed.getAttribute('aria-invalid')).toBe('true');
    expect(document.getElementById(`${speed.id}-error`)?.textContent).toBe(
      t('rateOutOfRange', '0.10', '16.00'),
    );
    expect(settings.stored['silenceRate']).toBe(3.5);
  });

  it('show stored Skip Silence settings', async () => {
    const { root } = await options({
      skipSilence: true,
      silenceMode: 'conservative',
      silenceRate: 2,
    });
    expect(fieldByLabel(root, t('skipSilenceField')).checked).toBe(true);
    expect(fieldByLabel(root, t('silenceConservative')).checked).toBe(true);
    expect(fieldByLabel(root, t('silenceRateField')).value).toBe('2.00');
  });

  it('explains the answers to a fight behind one (i), not under each choice', async () => {
    const { root } = await options({ lockFight: 'unbraked' });
    const group = root.querySelector<HTMLFieldSetElement>('fieldset#lock-fight');
    expect(group?.querySelector('legend')?.textContent).toBe(t('fightField'));
    expect(group?.querySelectorAll('.choice .help')).toHaveLength(0);
    expect(fieldByLabel(root, t('fightUnbraked')).checked).toBe(true);
    const info = group?.querySelector<HTMLButtonElement>('legend button.info');
    expect(info?.getAttribute('aria-label')).toBe(t('fightHelpLabel'));
    const tip = root.querySelector<HTMLElement>(`#${info?.getAttribute('popovertarget')}`);
    // Each answer by name, in bold on its own line, then what it does.
    expect(
      Array.from(tip?.querySelectorAll('p') ?? [], (p) => [
        p.querySelector('strong')?.textContent,
        p.lastChild?.textContent,
      ]),
    ).toEqual([
      [t('fightYieldShort'), t('fightYieldHelp')],
      [t('fightBrakedShort'), t('fightBrakedHelp')],
      [t('fightUnbrakedShort'), t('fightUnbrakedHelp')],
    ]);
    const term = tip?.querySelector('strong');
    if (term !== null && term !== undefined) {
      expect(Number(getComputedStyle(term).fontWeight)).toBeGreaterThanOrEqual(600);
    }
    expect(tip?.matches(':popover-open')).toBe(false);
    info?.click();
    expect(tip?.matches(':popover-open')).toBe(true);
    tip?.hidePopover();
  });

  it('opens at the place a link names, with the current choice in focus', async () => {
    const before = location.href;
    cleanups.push(() => history.replaceState(null, '', before));
    history.replaceState(null, '', '#lock-fight');
    const { root } = await options({ lockFight: 'braked' });
    expect(document.activeElement).toBe(fieldByLabel(root, t('fightBraked')));
    history.replaceState(null, '', '#skip-silence');
    document.body.replaceChildren();
    const skip = await options();
    expect(document.activeElement).toBe(fieldByLabel(skip.root, t('skipSilenceField')));
    for (const hash of ['#%E0%A4%A', '#no-such-place', '#']) {
      history.replaceState(null, '', hash);
      document.body.replaceChildren();
      await expect(options()).resolves.toBeDefined();
    }
  });

  it('record a shortcut by pressing it, and cancel with Escape', async () => {
    const { root, settings } = await options();
    const faster = shortcutButton(root, t('actionFaster'));
    faster.click();
    expect(faster.textContent).toBe(t('keyPress'));
    faster.dispatchEvent(
      new KeyboardEvent('keydown', { code: 'Escape', bubbles: true, cancelable: true }),
    );
    expect(faster.textContent).toBe(']');
    faster.click();
    faster.dispatchEvent(
      new KeyboardEvent('keydown', { code: 'KeyF', altKey: true, bubbles: true, cancelable: true }),
    );
    await settled();
    expect((settings.stored['bindings'] as Record<string, unknown>)['faster']).toEqual({
      code: 'KeyF',
      alt: true,
      ctrl: false,
      meta: false,
      shift: false,
    });
    expect(faster.textContent).toBe('Alt+F');
  });

  it('refuse a key another action already uses', async () => {
    const { root, settings } = await options();
    const faster = shortcutButton(root, t('actionFaster'));
    faster.click();
    faster.dispatchEvent(
      new KeyboardEvent('keydown', { code: 'BracketLeft', bubbles: true, cancelable: true }),
    );
    await settled();
    expect(settings.stored['bindings']).toBeUndefined();
    expect(root.querySelector('.status')?.textContent).toBe(t('keyTaken', '[', t('actionSlower')));
  });

  it('remove a shortcut with the cross named for its action, which leaves an empty slot', async () => {
    const { root, settings } = await options();
    const key = shortcutButton(root, t('actionSlower'));
    expect(key.dataset['state']).toBe('set');
    const remove = root.querySelector<HTMLButtonElement>(
      `button[aria-label="${t('keyRemove', t('actionSlower'))}"]`,
    );
    if (remove === null) throw new Error('no remove button for the action');
    expect(remove.closest('tr')).toBe(key.closest('tr'));
    // A cross, no text: the name is for screen readers.
    expect(remove.textContent).toBe('');
    expect(remove.querySelector('svg')?.checkVisibility()).toBe(true);
    remove.click();
    await settled();
    expect((settings.stored['bindings'] as Record<string, unknown>)['slower']).toBeNull();
    expect(key.textContent).toBe(t('keyNone'));
    expect(key.dataset['state']).toBe('empty');
    expect(remove.checkVisibility()).toBe(false);
    key.click();
    expect(key.dataset['state']).toBe('recording');
  });

  it('restore every default only on a second click', async () => {
    const { root, settings } = await options({ seekStep: 30 });
    const restore = Array.from(root.querySelectorAll('button')).find(
      (button) => button.textContent === t('restoreDefaults'),
    );
    restore?.click();
    await settled();
    expect(settings.stored['seekStep']).toBe(30);
    expect(restore?.textContent).toBe(t('restoreConfirm'));
    restore?.click();
    await settled();
    expect(settings.stored).toEqual({});
    expect(fieldByLabel(root, t('seekStepField')).value).toBe(String(DEFAULT_SETTINGS.seekStep));
  });

  it('offer the browser shortcut settings only where the browser can open them', async () => {
    let opened = 0;
    const withLink = await options({}, { open: () => opened++ });
    const open = Array.from(withLink.root.querySelectorAll('button')).find(
      (button) => button.textContent === t('browserShortcutsOpen'),
    );
    open?.click();
    expect(opened).toBe(1);
    resetPage();
    const without = await options();
    expect(without.root.textContent).not.toContain(t('browserShortcutsOpen'));
    expect(without.root.textContent).toContain(t('browserShortcutsHelp'));
  });

  it('show the keys open with a mouse, named by their title', async () => {
    const { root } = await options();
    const keys = root.querySelector<HTMLDetailsElement>('details.keys');
    expect(keys?.open).toBe(true);
    const title = keys?.querySelector('summary');
    expect(title?.textContent).toBe(t('shortcutsTable'));
    expect(keys?.querySelector('table')?.getAttribute('aria-labelledby')).toBe(title?.id);
  });

  it('leave out what the browser does not have: its shortcuts, its right-click menu', async () => {
    const { root } = await options({}, null, false);
    expect(root.textContent).not.toContain(t('browserShortcutsHelp'));
    expect(root.textContent).not.toContain(t('browserShortcutsOpen'));
    const headings = Array.from(root.querySelectorAll('h2'), (heading) => heading.textContent);
    expect(headings).not.toContain(t('sectionMenu'));
    // The page's own shortcuts stay: they work everywhere.
    expect(headings).toContain(t('sectionKeyboard'));
  });

  it('refuse speeds and steps outside their range instead of clamping them', async () => {
    const { root, settings } = await options();
    const cases: Array<[string, string, string]> = [
      [t('favoriteField'), '20', t('rateOutOfRange', '0.10', '16.00')],
      [t('holdField'), '0,05', t('rateOutOfRange', '0.10', '16.00')],
      [t('rateStepField'), '1,5', t('stepOutOfRange', '0.01', '1.00')],
      [t('favoriteField'), '2;alert(1)', t('rateOutOfRange', '0.10', '16.00')],
    ];
    for (const [label, value, message] of cases) {
      const input = fieldByLabel(root, label);
      change(input, value);
      await settled();
      expect(input.getAttribute('aria-invalid'), value).toBe('true');
      expect(document.getElementById(`${input.id}-error`)?.textContent, value).toBe(message);
    }
    expect(settings.stored).toEqual({});
  });

  it('take only whole seconds as the seek step, and only listed speeds as presets', async () => {
    const { root, settings } = await options();
    const seek = fieldByLabel(root, t('seekStepField'));
    for (const value of ['5.5', '1e3', '-5', '<5>', '99999']) {
      change(seek, value);
      await settled();
      expect(seek.getAttribute('aria-invalid'), value).toBe('true');
    }
    const presets = fieldByLabel(root, t('presetsField'));
    for (const value of ['1 20', '1, 2', '1 2 3 4 5 6 7 8 9 10 11 12 13', '']) {
      change(presets, value);
      await settled();
      expect(presets.getAttribute('aria-invalid'), value).toBe('true');
    }
    expect(settings.stored).toEqual({});
    change(seek, '30');
    await settled();
    expect(settings.stored['seekStep']).toBe(30);
  });

  it('limit how much can be typed in each field', async () => {
    const { root } = await options();
    expect(fieldByLabel(root, t('favoriteField')).maxLength).toBe(6);
    expect(fieldByLabel(root, t('rateStepField')).maxLength).toBe(6);
    expect(fieldByLabel(root, t('seekStepField')).maxLength).toBe(4);
    expect(fieldByLabel(root, t('presetsField')).maxLength).toBe(84);
  });

  it('show the theme in use as the chosen one, and the brand as the logo writes it', async () => {
    const { root } = await options({ theme: 'sepia' });
    expect(fieldByLabel(root, t('themeSepia')).checked).toBe(true);
    expect(fieldByLabel(root, t('themeYellow')).checked).toBe(false);
    expect(root.querySelector('h1 .brand')?.textContent).toBe('FLEETFOOT ENGINE');
  });

  it('offer every text size from 100% to 200%, and take the chosen one at once', async () => {
    const { root, settings } = await options({ textSize: 130 });
    const select = fieldByLabel(root, t('textSizeField')) as unknown as HTMLSelectElement;
    expect(Array.from(select.options, (option) => [option.value, option.text])).toEqual(
      Array.from({ length: 11 }, (_, index) => {
        const size = 100 + index * 10;
        return [String(size), `${size}%`];
      }),
    );
    expect(select.value).toBe('130');
    expect(document.documentElement.style.zoom).toBe('1.3');
    // As large as the user reads it: every length on the page grows by the size.
    const before = fieldByLabel(root, t('favoriteField')).getBoundingClientRect().height;
    select.value = '200';
    select.dispatchEvent(new Event('change'));
    await settled();
    expect(settings.stored['textSize']).toBe(200);
    expect(document.documentElement.style.zoom).toBe('2');
    const after = fieldByLabel(root, t('favoriteField')).getBoundingClientRect().height;
    expect(after / before).toBeCloseTo(2 / 1.3, 1);
  });

  it('follow a text size chosen elsewhere, and start at the normal size', async () => {
    const { settings } = await options();
    expect(document.documentElement.style.zoom).toBe('1');
    await settings.save('textSize', 160);
    await settled();
    expect(document.documentElement.style.zoom).toBe('1.6');
  });

  it('group the speeds in three, each under its heading', async () => {
    const { root } = await options();
    const section = fieldByLabel(root, t('presetsField')).closest('section');
    const groups = Array.from(section?.querySelectorAll(':scope > .group') ?? []);
    expect(groups.map((group) => group.querySelector(':scope > h3')?.textContent)).toEqual([
      t('speedGroupRates'),
      t('speedGroupRestore'),
      t('speedGroupPlayers'),
    ]);
    const labels = (group: Element | undefined) =>
      Array.from(
        group?.querySelectorAll('.field > label, legend > span') ?? [],
        (label) => label.textContent,
      );
    expect(labels(groups[0])).toEqual([
      t('presetsField'),
      t('rateStepField'),
      t('favoriteField'),
      t('holdField'),
    ]);
    expect(labels(groups[1])).toEqual([t('policyField'), t('fightField')]);
    expect(labels(groups[2])).toEqual([t('targetField')]);
  });

  it('switch the colour theme of the page at once', async () => {
    const { root, settings } = await options();
    expect(document.documentElement.dataset['theme']).toBe('yellow');
    fieldByLabel(root, t('themeCyan')).click();
    await settled();
    expect(settings.stored['theme']).toBe('cyan');
    expect(document.documentElement.dataset['theme']).toBe('cyan');
  });

  it('show the time saved and reset it on a second click', async () => {
    const stats = memoryStats(3 * 3600 + 5 * 60);
    const settings = memorySettings();
    let root: HTMLElement | null = null;
    const stop = await startOptions({
      localData: memoryLocalData(),
      version: TEST_VERSION,
      profiles: memoryProfiles(),
      access: memoryAccess(),
      document,
      l10n: ENGLISH,
      settings,
      layout: null,
      browserShortcuts: { open: null },
      contextMenu: true,
      stats,
      mount: (element) => {
        root = element;
        document.body.append(element);
      },
    });
    cleanups.push(stop);
    const page = root as unknown as HTMLElement;
    expect(page.textContent).toContain(t('savedTotal', t('savedHours', '3 hr', '5 min')));
    const reset = Array.from(page.querySelectorAll('button')).find(
      (button) => button.textContent === t('savedReset'),
    );
    reset?.click();
    await settled();
    expect(await stats.load()).toBe(3 * 3600 + 5 * 60);
    reset?.click();
    await settled();
    expect(await stats.load()).toBe(0);
    expect(page.textContent).toContain(t('savedTotal', t('savedUnderMinute')));
  });

  it('state the privacy promise, how to verify it, and offer support without pleading', async () => {
    const { root } = await options();
    const text = root.textContent ?? '';
    for (const key of [
      'privacyBadge',
      'privacyBadgeSub',
      'privacyStatement',
      'verifySource',
      'sourceLink',
    ] as const) {
      expect(text, key).toContain(t(key));
    }
    expect(root.querySelector('a.support')?.textContent).toBe(t('supportDevelopmentKofi'));
  });

  it('link to the support page without a referrer, opened only on a click', async () => {
    const { root } = await options();
    const link = root.querySelector<HTMLAnchorElement>('a.support');
    expect(link?.href).toBe('https://ko-fi.com/lyuk28');
    expect(link?.rel).toBe('noopener noreferrer');
    expect(link?.target).toBe('_blank');
  });
});
