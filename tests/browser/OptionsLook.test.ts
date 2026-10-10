// How the options page reads with its own stylesheet: a scale from the section's name down to a
// description, descriptions in the colour that explains, a field for one number its own size.

import { afterEach, describe, expect, it } from 'vitest';
import '../../entrypoints/options/style.css';
import { startOptions } from '../../src/ui/options/Options.ts';
import { PALETTES } from '../../src/ui/themes.ts';
import { resetPage } from './media.ts';
import {
  ENGLISH,
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

async function options(stored: Record<string, unknown> = {}) {
  let root: HTMLElement | null = null;
  const stop = await startOptions({
    browserLanguage: 'en',
    localData: memoryLocalData(),
    version: TEST_VERSION,
    profiles: memoryProfiles(),
    access: memoryAccess(),
    document,
    l10n: ENGLISH,
    settings: memorySettings(stored),
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
  await settled();
  if (root === null) throw new Error('options not mounted');
  return { root: root as HTMLElement };
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

describe('the options page as it reads', () => {
  it('goes down one scale: section, group, setting, choice, description, in framed choices', async () => {
    const { root } = await options();
    const size = (selector: string) => {
      const element = root.querySelector(selector);
      if (element === null) throw new Error(`no ${selector}`);
      return Number.parseFloat(getComputedStyle(element).fontSize);
    };
    const scale = [
      size('section > h2'),
      size('.group > h3'),
      size('.field > label'),
      size('.choice > label'),
      size('.choice .help'),
    ];
    for (let index = 1; index < scale.length; index++) {
      expect(scale[index]).toBeLessThan(scale[index - 1] ?? 0);
    }
    // Every group of choices keeps its frame, its descriptions inside it.
    const fieldsets = Array.from(root.querySelectorAll('fieldset'));
    expect(fieldsets.length).toBeGreaterThan(4);
    for (const fieldset of fieldsets) {
      expect(getComputedStyle(fieldset).borderTopWidth).toBe('1px');
      for (const help of fieldset.querySelectorAll('.help')) {
        const inner = fieldset.getBoundingClientRect();
        const box = help.getBoundingClientRect();
        expect(
          box.left >= inner.left && box.right <= inner.right && box.bottom <= inner.bottom,
        ).toBe(true);
      }
    }
    // No rule drawn between two groups of a section: their headings tell them apart.
    for (const group of root.querySelectorAll('.group + .group')) {
      expect(getComputedStyle(group).borderTopWidth).toBe('0px');
    }
  });

  it('size a field for one number to that number, the presets across the page', async () => {
    const { root } = await options({ favoriteRate: 16 });
    const presets = fieldByLabel(root, t('presetsField')).getBoundingClientRect().width;
    for (const label of [
      'rateStepField',
      'favoriteField',
      'holdField',
      'seekStepField',
      'silenceRateField',
    ] as const) {
      const field = fieldByLabel(root, t(label));
      expect(field.getBoundingClientRect().width).toBeLessThan(presets / 3);
      // No wider than twice its longest value, besides its padding and borders.
      const style = getComputedStyle(field);
      const text = document.createElement('span');
      text.style.font = style.font;
      text.textContent = '16.00';
      document.body.append(text);
      const value = text.getBoundingClientRect().width;
      text.remove();
      const frame =
        Number.parseFloat(style.paddingInlineStart) +
        Number.parseFloat(style.paddingInlineEnd) +
        Number.parseFloat(style.borderInlineStartWidth) +
        Number.parseFloat(style.borderInlineEndWidth);
      expect(field.getBoundingClientRect().width).toBeLessThanOrEqual(2 * value + frame);
      // Its longest value whole, without scrolling inside the field.
      field.value = '16.00';
      expect(field.scrollWidth).toBeLessThanOrEqual(field.clientWidth);
    }
  });

  it('size the list of text sizes to its longest, not across the page', async () => {
    const { root } = await options();
    const presets = fieldByLabel(root, t('presetsField')).getBoundingClientRect().width;
    const sizes = fieldByLabel(root, t('textSizeField')).getBoundingClientRect().width;
    expect(sizes).toBeLessThan(presets / 3);
  });

  it('size the list of languages to its longest, not across the page', async () => {
    const { root } = await options();
    const presets = fieldByLabel(root, t('presetsField')).getBoundingClientRect().width;
    const languages = fieldByLabel(root, t('languageField')).getBoundingClientRect().width;
    expect(languages).toBeLessThan(presets / 1.5);
    expect(languages).toBeGreaterThan(0);
  });

  it('write descriptions in the colour that explains, names in the colour that is read', async () => {
    const { root } = await options();
    const colour = (hex: string) => {
      const probe = document.createElement('span');
      probe.style.color = hex;
      document.body.append(probe);
      const value = getComputedStyle(probe).color;
      probe.remove();
      return value;
    };
    const help = root.querySelector('.field .help');
    const choiceHelp = root.querySelector('.choice .help');
    const label = root.querySelector('.field > label');
    if (help === null || choiceHelp === null || label === null) throw new Error('no help');
    expect(getComputedStyle(help).color).toBe(colour(PALETTES.yellow.help));
    expect(getComputedStyle(choiceHelp).color).toBe(colour(PALETTES.yellow.help));
    expect(getComputedStyle(label).color).toBe(colour(PALETTES.yellow.text));
    expect(PALETTES.yellow.help).not.toBe(PALETTES.yellow.muted);
  });

  it("underline each section's title in the accent, thicker than a link's line", async () => {
    const { root } = await options();
    const probe = document.createElement('span');
    probe.style.color = PALETTES.yellow.accent;
    document.body.append(probe);
    const accent = getComputedStyle(probe).color;
    probe.remove();
    const titles = Array.from(root.querySelectorAll('section > h2'));
    expect(titles.length).toBeGreaterThan(5);
    for (const title of titles) {
      const style = getComputedStyle(title);
      expect(style.textDecorationLine, title.textContent ?? '').toBe('underline');
      expect(style.textDecorationColor).toBe(accent);
      expect(style.textDecorationThickness).toBe('2px');
    }
    const link = root.querySelector('a');
    if (link === null) throw new Error('no link');
    expect(getComputedStyle(link).textDecorationThickness).not.toBe('2px');
  });
});
