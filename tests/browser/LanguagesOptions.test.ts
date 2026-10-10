// The options page in every interface language, real and pseudo, from a narrow embedded panel
// to a full tab: nothing out of the page, no text cut, mirrored for right-to-left languages.

import { afterEach, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import '../../entrypoints/options/style.css';
import { ALL_SITES } from '../../src/core/settings/Access.ts';
import { sitePatterns } from '../../src/core/settings/Sites.ts';
import type { Localization } from '../../src/ui/i18n.ts';
import { startOptions } from '../../src/ui/options/Options.ts';
import { LANGUAGES } from './languages.ts';
import { layoutFaults } from './layout.ts';
import { resetPage } from './media.ts';
import {
  memoryAccess,
  memoryLocalData,
  memoryProfiles,
  memorySettings,
  memoryStats,
  settled,
  TEST_VERSION,
} from './ui.ts';

/** The narrowest panel a browser embeds the options in, and a full tab. */
const WIDTHS = [400, 1000];
/** The air above and below a control in a row of keys: `--space-3`. */
const AIR_PX = 12;
/** The normal text size and the largest: a layout that holds at both holds in between. */
const TEXT_SIZES_MEASURED = [100, 200];
/** The narrowest common phone screen in CSS pixels, the width of the phone tests. */
const PHONE_PX = 360;

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  resetPage();
});

/** The site sections filled in, the longest a site name gets in practice. */
const LONG_SITE = 'lectures.very-long-university-media-service.example.org';
const SCENARIOS = {
  // Memory per site with a profile open, and Selected Sites with a site.
  sites: {
    settings: { memory: 'site' },
    profiles: {
      [`site:${LONG_SITE}`]: { playbackRate: 1.75, preservesPitch: false },
      'site:b.example': { playbackRate: 2 },
    },
    origins: sitePatterns(LONG_SITE),
  },
  // All Sites with an excluded site.
  all: { settings: { excludedSites: [LONG_SITE] }, profiles: {}, origins: [...ALL_SITES] },
} as const;

async function options(
  l10n: Localization,
  width: number,
  scenario: keyof typeof SCENARIOS = 'sites',
  textSize = 100,
): Promise<HTMLElement> {
  await page.viewport(width, 900);
  document.body.style.margin = '0';
  let root: HTMLElement | null = null;
  const { settings, profiles, origins } = SCENARIOS[scenario];
  const stop = await startOptions({
    browserLanguage: 'en',
    localData: memoryLocalData(),
    version: TEST_VERSION,
    profiles: memoryProfiles(profiles),
    access: memoryAccess(origins),
    document,
    l10n,
    settings: memorySettings({ ...settings, textSize }),
    layout: null,
    browserShortcuts: { open: () => {} },
    contextMenu: true,
    stats: memoryStats(12 * 3600 + 34 * 60),
    mount: (element) => {
      root = element;
      document.body.append(element);
    },
  });
  await settled();
  await settled();
  const mounted = root as HTMLElement | null;
  if (mounted === null) throw new Error('options not mounted');
  for (const profile of mounted.querySelectorAll('details')) profile.open = true;
  cleanups.push(() => {
    stop();
    mounted.remove();
  });
  return mounted;
}

describe.each(LANGUAGES)('options in $name', ({ l10n }) => {
  it.each(
    TEXT_SIZES_MEASURED.flatMap((size) =>
      WIDTHS.flatMap((width) =>
        (['sites', 'all'] as const).map((scenario) => [width, scenario, size] as const),
      ),
    ),
  )(
    'hold at %i px with the %s sections filled, text at %i%, nothing cut or out of the page',
    async (width, scenario, size) => {
      const root = await options(l10n, width, scenario, size);
      const pageBox = new DOMRect(
        0,
        0,
        document.documentElement.clientWidth,
        Number.POSITIVE_INFINITY,
      );
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
        document.documentElement.clientWidth,
      );
      expect(layoutFaults(root, pageBox)).toEqual([]);
      // Each site field has its add button on the same line, beside it.
      for (const adder of root.querySelectorAll<HTMLElement>('.site-adder')) {
        if (adder.closest('[hidden]') !== null) continue;
        const input = adder.querySelector('input')?.getBoundingClientRect();
        const button = adder.querySelector('button')?.getBoundingClientRect();
        if (input === undefined || button === undefined) throw new Error('no site field');
        const middle = button.top + button.height / 2;
        expect(middle).toBeGreaterThan(input.top);
        expect(middle).toBeLessThan(input.bottom);
      }
    },
  );

  it('open the explanation behind an (i) inside the page at the largest text size', async () => {
    const root = await options(l10n, WIDTHS[0] ?? 400, 'sites', 200);
    const button = root.querySelector<HTMLButtonElement>('legend button.info');
    if (button === null) throw new Error('no (i)');
    button.scrollIntoView({ block: 'center' });
    button.click();
    const tip = root.ownerDocument.querySelector<HTMLElement>('.tip:popover-open');
    if (tip === null) throw new Error('the explanation did not open');
    const viewport = new DOMRect(
      0,
      0,
      document.documentElement.clientWidth,
      document.documentElement.clientHeight,
    );
    expect(layoutFaults(tip, viewport)).toEqual([]);
    // In the top layer, and still as large as the page.
    expect(tip.currentCSSZoom).toBe(2);
  });

  it(`point their chevrons and switches the way the language reads (${l10n.dir})`, async () => {
    const root = await options(l10n, 1000);
    const end = l10n.dir === 'rtl' ? -1 : 1;
    // Where a drawing points once turned: the corner its two borders make, on the inline end.
    const pointing = (element: Element) => {
      const { a, b, c, d } = new DOMMatrix(getComputedStyle(element, '::before').transform);
      const [x, y] = [end, 1];
      return [Math.round(a * x + c * y), Math.round(b * x + d * y)];
    };
    const [open, closed] = [...root.querySelectorAll('.profile summary')].map((summary) => {
      (summary.parentElement as HTMLDetailsElement).open =
        summary === root.querySelector('summary');
      return summary;
    });
    if (open === undefined || closed === undefined) throw new Error('two profiles expected');
    // The turn is animated: measured where it ends.
    for (const animation of document.getAnimations()) animation.finish();
    // Closed it points where the reading goes, open it points down.
    expect(pointing(closed)).toEqual([Math.round(Math.SQRT2 * end), 0]);
    expect(pointing(open)).toEqual([0, Math.round(Math.SQRT2)]);
    // A switch turned on has its knob on the inline end.
    const toggle = root.querySelector<HTMLInputElement>('.field.check input[type="checkbox"]');
    if (toggle === null) throw new Error('no switch');
    toggle.checked = true;
    for (const animation of document.getAnimations()) animation.finish();
    const shift = new DOMMatrix(getComputedStyle(toggle, '::before').transform).e;
    expect(Math.sign(shift)).toBe(end);
  });

  it('keep every key name to two lines on a phone and its key on its line, up to a full tab', async () => {
    const root = await options(l10n, 320);
    const lines = (element: Element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return new Set(Array.from(range.getClientRects(), (rect) => Math.round(rect.top))).size;
    };
    const names = () => Array.from(root.querySelectorAll('.shortcuts th'));
    // Two lines from the narrowest common phone up; a third below it, never cut.
    for (let width = 320; width <= 1000; width += 20) {
      await page.viewport(width, 900);
      const most = width < PHONE_PX ? 3 : 2;
      const long = names()
        .filter((name) => lines(name) > most)
        .map((name) => name.textContent);
      expect({ width, long }).toEqual({ width, long: [] });
    }
    // At every width each key and its cross sit on the line of their name, each on one line,
    // the keys in one column and the crosses in one column after them.
    const end = (box: DOMRect) => (l10n.dir === 'rtl' ? -box.left : box.right);
    // Within a pixel: borders and sub-pixel layout round apart.
    const near = (a: number, b: number) => Math.abs(a - b) <= 1;
    for (const width of [320, 1000]) {
      await page.viewport(width, 900);
      const table = root.querySelector('.shortcuts')?.getBoundingClientRect();
      if (table === undefined) throw new Error('no keys table');
      const keys = Array.from(root.querySelectorAll<HTMLElement>('.shortcuts .key'));
      const column = end(keys[0]?.getBoundingClientRect() ?? table);
      for (const key of keys) expect(near(end(key.getBoundingClientRect()), column)).toBe(true);
      const crosses = Array.from(
        root.querySelectorAll<HTMLElement>('.shortcuts .key-remove'),
        (cross) => cross.checkVisibility() && end(cross.getBoundingClientRect()),
      ).filter((edge) => edge !== false);
      expect(crosses.length).toBeGreaterThan(0);
      for (const edge of crosses) expect(near(edge, crosses[0] ?? 0)).toBe(true);
      // The crosses close the line, after the keys.
      expect((crosses[0] ?? 0) > column).toBe(true);
      for (const key of keys) expect(lines(key)).toBe(1);
      // Air around every control and around the name's text, within a pixel.
      for (const row of root.querySelectorAll('.shortcuts tr')) {
        const line = row.getBoundingClientRect();
        const name = row.querySelector('th');
        if (name === null) throw new Error('a row without a name');
        const text = document.createRange();
        text.selectNodeContents(name);
        const controls = Array.from(row.querySelectorAll('button')).filter((control) =>
          control.checkVisibility(),
        );
        for (const box of [
          text.getBoundingClientRect(),
          ...controls.map((c) => c.getBoundingClientRect()),
        ]) {
          expect(Math.min(box.top - line.top, line.bottom - box.bottom)).toBeGreaterThanOrEqual(
            AIR_PX - 1,
          );
        }
      }
      for (const name of names()) {
        const line = name.getBoundingClientRect();
        for (const control of name.parentElement?.querySelectorAll('button') ?? []) {
          if (!control.checkVisibility()) continue;
          const box = control.getBoundingClientRect();
          const middle = box.top + box.height / 2;
          expect({
            width,
            name: name.textContent,
            inLine: middle > line.top && middle < line.bottom,
          }).toEqual({ width, name: name.textContent, inLine: true });
        }
      }
    }
  });

  it('hold the keys in one panel, a visible rule between rows and none after the last', async () => {
    const root = await options(l10n, 1000);
    // The colour the theme gives visible borders, resolved the way the browser resolves it.
    const probe = document.createElement('div');
    probe.style.color = 'var(--border)';
    root.append(probe);
    const border = getComputedStyle(probe).color;
    probe.remove();
    const table = root.querySelector('.shortcuts');
    if (table === null) throw new Error('no keys table');
    expect(getComputedStyle(table).borderTopColor).toBe(border);
    // A key that is set stands off the panel it sits on.
    const key = table.querySelector('.key[data-state="set"]');
    if (key === null) throw new Error('no key set');
    expect(getComputedStyle(key).backgroundColor).not.toBe(getComputedStyle(table).backgroundColor);
    const rows = Array.from(table.querySelectorAll('tr'));
    for (const [index, row] of rows.entries()) {
      for (const cell of row.children) {
        const style = getComputedStyle(cell);
        const last = index === rows.length - 1;
        expect(style.borderBottomWidth).toBe(last ? '0px' : '1px');
        if (!last) expect(style.borderBottomColor).toBe(border);
      }
    }
  });

  it(`take the direction of the language (${l10n.dir})`, async () => {
    const root = await options(l10n, 1000);
    // A key is a key: Shift+[ reads left to right, its brackets never mirrored.
    const keys = root.querySelectorAll('.shortcuts .key[data-state="set"]');
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) expect(getComputedStyle(key).direction).toBe('ltr');
    // Laid out left to right: the first letter of a modifier key sits left of its last character.
    const shift = Array.from(keys).find((key) => key.textContent?.startsWith('Shift+'));
    const text = shift?.firstChild;
    if (text === undefined || text === null) throw new Error('no Shift key');
    const at = (offset: number) => {
      const range = document.createRange();
      range.setStart(text, offset);
      range.setEnd(text, offset + 1);
      return range.getBoundingClientRect().left;
    };
    expect(at(0)).toBeLessThan(at((text.textContent?.length ?? 1) - 1));
    const empty = root.querySelector('.shortcuts .key[data-state="empty"]');
    if (empty === null) throw new Error('no empty key');
    expect(getComputedStyle(empty).direction).toBe(l10n.dir);
    expect(document.documentElement.dir).toBe(l10n.dir);
    expect(document.documentElement.lang).toBe(l10n.locale);
  });
});
