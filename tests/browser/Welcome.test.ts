// The first-run page: three short steps in this order, nothing asked of the user beyond
// them, every choice saved as on the options page; WCAG 2.2 AA in every theme, and nothing cut or
// out of the page in any language, from a phone's width to a desktop's.

import axe from 'axe-core';
import { afterEach, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import '../../entrypoints/options/style.css';
import { ALL_SITES } from '../../src/core/settings/Access.ts';
import { THEME_NAMES } from '../../src/core/settings/Themes.ts';
import type { Localization } from '../../src/ui/i18n.ts';
import { startWelcome } from '../../src/ui/welcome/Welcome.ts';
import { LANGUAGES } from './languages.ts';
import { layoutFaults } from './layout.ts';
import { resetPage } from './media.ts';
import {
  ENGLISH,
  type MemoryAccess,
  memoryAccess,
  memorySettings,
  settled,
  englishText as t,
  WCAG_22_AA,
} from './ui.ts';

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  resetPage();
  document.body.replaceChildren();
});

async function welcome(
  options: { l10n?: Localization; access?: MemoryAccess; stored?: Record<string, unknown> } = {},
) {
  const settings = memorySettings(options.stored ?? {});
  const access = options.access ?? memoryAccess();
  const closed = { count: 0 };
  let root: HTMLElement | null = null;
  const stop = await startWelcome({
    document,
    l10n: options.l10n ?? ENGLISH,
    settings,
    access,
    mount: (element) => {
      root = element;
      document.body.append(element);
    },
    close: () => {
      closed.count++;
    },
  });
  cleanups.push(stop);
  await settled();
  if (root === null) throw new Error('welcome not mounted');
  return { root: root as HTMLElement, settings, access, closed };
}

const label = (root: HTMLElement, text: string) => {
  const found = Array.from(root.querySelectorAll('label')).find(
    (item) => item.textContent === text,
  );
  if (found === undefined) throw new Error(`no label ${text}`);
  return found.control as HTMLInputElement;
};

describe('the first-run page', () => {
  it('says three things, in this order, and asks for no support', async () => {
    const { root } = await welcome();
    expect(Array.from(root.querySelectorAll('h2'), (heading) => heading.textContent)).toEqual([
      t('welcomePrivacy'),
      t('sectionAccess'),
      t('welcomeSpeed'),
    ]);
    expect(root.textContent).toContain(t('privacyStatement'));
    expect(root.textContent).not.toContain(t('supportDevelopment'));
    expect(root.querySelector('a[href*="ko-fi"]')).toBeNull();
  });

  it('starts with access only when called, and nothing granted', async () => {
    const { root, access } = await welcome();
    expect(label(root, t('accessOnClick')).checked).toBe(true);
    expect(access.origins.size).toBe(0);
  });

  it('asks for access inside the click, and a refusal changes nothing', async () => {
    const access = memoryAccess();
    access.grants = false;
    const { root } = await welcome({ access });
    label(root, t('accessAll')).click();
    await settled();
    expect(access.origins.size).toBe(0);
    expect(label(root, t('accessOnClick')).checked).toBe(true);
    expect(root.querySelector('.status')?.textContent).toBe(t('accessDeclined'));
    access.grants = true;
    label(root, t('accessAll')).click();
    await settled();
    expect([...access.origins].sort()).toEqual([...ALL_SITES].sort());
  });

  it('saves the favorite speed as the options page does, and refuses one out of range', async () => {
    const { root, settings } = await welcome();
    const speed = label(root, t('favoriteField'));
    speed.value = '99';
    speed.dispatchEvent(new Event('change'));
    await settled();
    expect(speed.getAttribute('aria-invalid')).toBe('true');
    expect(settings.stored['favoriteRate']).toBeUndefined();
    speed.value = '1.5';
    speed.dispatchEvent(new Event('change'));
    await settled();
    expect(settings.stored['favoriteRate']).toBe(1.5);
  });

  it('keeps its own size whatever text size the options page has', async () => {
    await welcome({ stored: { textSize: 200 } });
    expect(document.documentElement.style.zoom).toBe('');
  });

  it('closes on Done, and leads to every setting', async () => {
    const { root, closed } = await welcome();
    const done = Array.from(root.querySelectorAll('button')).find(
      (button) => button.textContent === t('welcomeDone'),
    );
    done?.click();
    expect(closed.count).toBe(1);
    const all = Array.from(root.querySelectorAll('a')).find(
      (link) => link.textContent === t('welcomeAllSettings'),
    );
    expect(all?.getAttribute('href')).toBe('/options.html');
  });

  it.each(THEME_NAMES)('meets WCAG 2.2 AA in the %s theme', async (theme) => {
    document.documentElement.lang = 'en';
    document.title = 'FleetFoot Engine';
    const { root } = await welcome({ stored: { theme } });
    const result = await axe.run(root, { runOnly: { type: 'tag', values: WCAG_22_AA } });
    expect(
      result.violations.map(
        (violation) =>
          `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`,
      ),
    ).toEqual([]);
  });

  describe.each(LANGUAGES)('in $name', ({ l10n }) => {
    it.each([360, 1000])('holds at %i px, nothing cut or out of the page', async (width) => {
      await page.viewport(width, 1600);
      const { root } = await welcome({ l10n });
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
        document.documentElement.clientWidth,
      );
      const pageBox = new DOMRect(0, 0, document.documentElement.clientWidth, Infinity);
      expect(layoutFaults(root, pageBox)).toEqual([]);
    });
  });
});
