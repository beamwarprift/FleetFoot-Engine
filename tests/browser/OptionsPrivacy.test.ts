// Privacy & permissions and About on the options page: what never leaves the
// device, the access granted right now, the user's own copy of the settings brought back only
// after a check and a confirmation, everything deleted in two clicks, and plain links.

import { afterEach, describe, expect, it } from 'vitest';
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  MAX_BACKUP_BYTES,
  readBackup,
} from '../../src/core/settings/Backup.ts';
import { DEFAULT_SETTINGS } from '../../src/core/settings/Settings.ts';
import { startOptions } from '../../src/ui/options/Options.ts';
import { resetPage } from './media.ts';
import {
  ENGLISH,
  type MemoryAccess,
  type MemoryLocalData,
  type MemoryProfiles,
  type MemorySettings,
  type MemoryStats,
  memoryAccess,
  memoryLocalData,
  memoryProfiles,
  memorySettings,
  memoryStats,
  settled,
  TEST_VERSION,
  englishText as t,
} from './ui.ts';

const REPO = 'https://github.com/beamwarprift/FleetFoot-Engine';

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  resetPage();
});

interface Page {
  readonly root: HTMLElement;
  readonly settings: MemorySettings;
  readonly profiles: MemoryProfiles;
  readonly stats: MemoryStats;
  readonly access: MemoryAccess;
  readonly local: MemoryLocalData;
}

async function options(
  stored: Record<string, unknown> = {},
  sites: Record<string, unknown> = {},
  origins: readonly string[] = [],
): Promise<Page> {
  const settings = memorySettings(stored);
  const profiles = memoryProfiles(sites);
  const stats = memoryStats(3600);
  const access = memoryAccess(origins);
  const local = memoryLocalData({ settings, profiles, stats });
  let root: HTMLElement | null = null;
  const stop = await startOptions({
    browserLanguage: 'en',
    document,
    l10n: ENGLISH,
    settings,
    profiles,
    stats,
    access,
    localData: local,
    version: TEST_VERSION,
    layout: null,
    browserShortcuts: { open: null },
    contextMenu: true,
    mount: (element) => {
      root = element;
      document.body.append(element);
    },
  });
  cleanups.push(stop);
  await settled();
  if (root === null) throw new Error('options not mounted');
  return { root, settings, profiles, stats, access, local };
}

function button(root: HTMLElement, text: string): HTMLButtonElement {
  const found = Array.from(root.querySelectorAll('button')).find((b) => b.textContent === text);
  if (found === undefined) throw new Error(`no button ${text}`);
  return found;
}

function section(root: HTMLElement, title: string): HTMLElement {
  const heading = Array.from(root.querySelectorAll('h2')).find((h) => h.textContent === title);
  const found = heading?.closest('section');
  if (found === null || found === undefined) throw new Error(`no section ${title}`);
  return found;
}

/** What the page handed to the browser's downloads, read back from the file it made. */
async function captureDownload(act: () => void): Promise<{ name: string; text: string }> {
  const click = HTMLAnchorElement.prototype.click;
  const createObjectURL = URL.createObjectURL;
  let link: HTMLAnchorElement | null = null;
  let file: Blob | null = null;
  HTMLAnchorElement.prototype.click = function capture(this: HTMLAnchorElement) {
    link = this;
  };
  URL.createObjectURL = (object: Blob | MediaSource) => {
    if (object instanceof Blob) file = object;
    return createObjectURL(object);
  };
  try {
    act();
    await settled();
    await settled();
  } finally {
    HTMLAnchorElement.prototype.click = click;
    URL.createObjectURL = createObjectURL;
  }
  const got = link as HTMLAnchorElement | null;
  const blob = file as Blob | null;
  if (got === null || blob === null) throw new Error('nothing was downloaded');
  expect(got.href.startsWith('blob:')).toBe(true);
  expect(blob.type).toBe('application/json');
  return { name: got.download, text: await blob.text() };
}

/** Resolves at the first change under `element`: the page answered. */
function nextChange(element: HTMLElement): Promise<void> {
  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      observer.disconnect();
      resolve();
    });
    observer.observe(element, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
  });
}

/** The user picks a file in the browser's dialog; resolves when the page has answered. */
async function pick(root: HTMLElement, text: string, name = 'settings.json'): Promise<void> {
  const input = root.querySelector<HTMLInputElement>('input[type="file"]');
  if (input === null) throw new Error('no file input');
  const files = new DataTransfer();
  files.items.add(new File([text], name, { type: 'application/json' }));
  input.files = files.files;
  // Choosing a file closes any open question first: the answer is the change after that one.
  const panel = confirmation(root);
  const status = section(root, t('sectionPrivacy')).querySelector<HTMLElement>('[role="status"]');
  if (panel === null || status === null) throw new Error('no import controls');
  const answered = Promise.race([nextChange(status), nextAttribute(panel)]);
  input.dispatchEvent(new Event('change'));
  await answered;
}

/** Resolves when the question panel is shown. */
function nextAttribute(panel: HTMLElement): Promise<void> {
  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      if (panel.hidden) return;
      observer.disconnect();
      resolve();
    });
    observer.observe(panel, { attributes: true, attributeFilter: ['hidden'] });
  });
}

const note = (root: HTMLElement) =>
  section(root, t('sectionPrivacy')).querySelector('[role="status"]')?.textContent ?? '';
const confirmation = (root: HTMLElement) => root.querySelector<HTMLElement>('.import-confirm');

describe('privacy', () => {
  it('says what FleetFoot Engine has none of, and where the settings stay', async () => {
    const { root } = await options();
    const facts = Array.from(section(root, t('sectionPrivacy')).querySelectorAll('.facts > *'));
    expect(facts.map((item) => item.textContent)).toEqual([
      t('privacyTelemetry'),
      t('privacyTelemetryNone'),
      t('privacyAnalytics'),
      t('privacyAnalyticsNone'),
      t('privacyAccounts'),
      t('privacyAccountsNone'),
      t('privacyServers'),
      t('privacyServersNone'),
      t('privacyAds'),
      t('privacyAdsNone'),
      t('privacyAffiliate'),
      t('privacyAffiliateNone'),
      t('privacyStorage'),
      t('privacyStorageLocal'),
    ]);
  });

  it('shows the site access granted right now, and follows it as it changes', async () => {
    const { root, access } = await options({}, {}, ['https://a.example/*', 'http://a.example/*']);
    const privacy = section(root, t('sectionPrivacy'));
    expect(privacy.textContent).toContain(t('privacyWhereSelected'));
    // Each site isolated, so it reads left to right inside a right-to-left sentence too.
    expect(privacy.querySelector('.site-list')?.textContent).toContain('\u2068a.example\u2069');
    await access.addSite('b.example');
    await settled();
    await settled();
    expect(privacy.querySelector('.site-list')?.textContent).toMatch(/a\.example.*b\.example/);
    await access.setMode('on-click');
    await settled();
    await settled();
    expect(privacy.textContent).toContain(t('privacyWhereOnClick'));
    await access.setMode('all');
    await settled();
    await settled();
    expect(privacy.textContent).toContain(t('privacyWhereAll'));
    expect(privacy.querySelector<HTMLElement>('.site-list')?.hidden).toBe(true);
  });

  it('leads to the site access section to change it', async () => {
    const { root } = await options();
    const link = Array.from(root.querySelectorAll<HTMLAnchorElement>('a')).find(
      (a) => a.textContent === t('privacyAccessChange'),
    );
    const target = link?.getAttribute('href')?.slice(1) ?? '';
    expect(target).not.toBe('');
    expect(document.getElementById(target)).toBe(section(root, t('sectionAccess')));
  });
});

describe('a copy of the settings', () => {
  it('exports the settings, the remembered speed and the sites to a dated file', async () => {
    const { root } = await options(
      { rateStep: 0.5 },
      { rememberedRate: 1.5, 'site:a.example': { playbackRate: 2 } },
    );
    const { name, text } = await captureDownload(() => button(root, t('exportSettings')).click());
    expect(name).toMatch(/^fleetfoot-engine-settings-\d{4}-\d{2}-\d{2}\.json$/);
    const read = readBackup(text);
    if (!read.ok) throw new Error('the export cannot be read back');
    expect(read.backup.settings).toEqual({ ...DEFAULT_SETTINGS, rateStep: 0.5 });
    expect(read.backup.rememberedRate).toBe(1.5);
    expect(read.backup.sites).toEqual([{ site: 'a.example', profile: { playbackRate: 2 } }]);
    expect(note(root)).toBe(t('exportDone'));
  });

  it('says so when the settings cannot be read for the copy', async () => {
    const { root, profiles } = await options();
    profiles.list = () => Promise.reject(new Error('storage unavailable'));
    let downloads = 0;
    const original = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = () => {
      downloads += 1;
    };
    try {
      button(root, t('exportSettings')).click();
      await settled();
      await settled();
    } finally {
      HTMLAnchorElement.prototype.click = original;
    }
    expect(downloads).toBe(0);
    expect(note(root)).toBe(t('exportFailed'));
  });

  it('imports a file only after showing what it holds and the user confirming', async () => {
    const { root, settings, profiles, local } = await options();
    await pick(
      root,
      JSON.stringify({
        format: BACKUP_FORMAT,
        version: BACKUP_VERSION,
        settings: { rateStep: 0.5, theme: 'no-such-theme' },
        rememberedRate: 2,
        sites: { 'a.example': { playbackRate: 1.5 } },
      }),
    );
    const panel = confirmation(root);
    expect(panel?.hidden).toBe(false);
    expect(panel?.textContent).toContain(t('importSummary', '1', '1'));
    expect(panel?.textContent).toContain(t('importIgnored', '1'));
    // Nothing is written before the user says so, and the question has the focus.
    expect(local.restored).toEqual([]);
    expect(document.activeElement).toBe(button(root, t('importConfirm')));
    button(root, t('importConfirm')).click();
    await settled();
    await settled();
    expect(local.restored).toHaveLength(1);
    expect(settings.stored['rateStep']).toBe(0.5);
    expect(settings.stored['theme']).toBeUndefined();
    expect(await profiles.rememberedRate()).toBe(2);
    expect(await profiles.profile('a.example')).toEqual({ playbackRate: 1.5 });
    expect(panel?.hidden).toBe(true);
    expect(note(root)).toBe(t('importDone'));
  });

  it('counts with the digit grouping of the language', async () => {
    const { root } = await options();
    const junk = Object.fromEntries(Array.from({ length: 1234 }, (_, i) => [`junk${i}`, i]));
    await pick(root, JSON.stringify({ format: BACKUP_FORMAT, version: 1, settings: junk }));
    expect(confirmation(root)?.textContent).toContain(t('importIgnored', '1,234'));
  });

  it('shows no line of left-out values when the file holds none', async () => {
    const { root } = await options();
    await pick(root, JSON.stringify({ format: BACKUP_FORMAT, version: 1, settings: {} }));
    const ignored = Array.from(confirmation(root)?.querySelectorAll('p') ?? []).find(
      (p) => p.textContent === '',
    );
    expect(ignored?.hidden).toBe(true);
  });

  it('writes nothing when the user cancels', async () => {
    const { root, local } = await options();
    await pick(root, JSON.stringify({ format: BACKUP_FORMAT, version: 1, settings: {} }));
    button(root, t('importCancel')).click();
    await settled();
    expect(confirmation(root)?.hidden).toBe(true);
    expect(local.restored).toEqual([]);
  });

  it.each([
    ['not JSON', 'not json at all', 'importNotJson'],
    ['another JSON file', '{"name":"package"}', 'importNotBackup'],
    ['a newer copy', JSON.stringify({ format: BACKUP_FORMAT, version: 99 }), 'importNewer'],
  ] as const)('explains a file that is %s, and writes nothing', async (_kind, text, key) => {
    const { root, local } = await options();
    await pick(root, text);
    expect(note(root)).toBe(t(key));
    expect(confirmation(root)?.hidden).toBe(true);
    expect(local.restored).toEqual([]);
  });

  it('refuses a file larger than storage could hold, without reading it', async () => {
    const { root, local } = await options();
    const read = File.prototype.text;
    let reads = 0;
    File.prototype.text = function counted(this: File) {
      reads += 1;
      return read.call(this);
    };
    try {
      await pick(root, ' '.repeat(MAX_BACKUP_BYTES + 1));
    } finally {
      File.prototype.text = read;
    }
    expect(note(root)).toBe(t('importTooLarge'));
    expect(reads).toBe(0);
    expect(local.restored).toEqual([]);
  });

  it('says so when the copy cannot be written', async () => {
    const { root, local } = await options();
    await pick(root, JSON.stringify({ format: BACKUP_FORMAT, version: 1, settings: {} }));
    local.failNext = true;
    button(root, t('importConfirm')).click();
    await settled();
    await settled();
    expect(note(root)).toBe(t('importFailed'));
  });

  it('lets the same file be chosen again', async () => {
    const { root } = await options();
    const text = JSON.stringify({ format: BACKUP_FORMAT, version: 1, settings: {} });
    await pick(root, text);
    expect(root.querySelector<HTMLInputElement>('input[type="file"]')?.value).toBe('');
  });
});

describe('deleting everything on this device', () => {
  it('needs a second click, then deletes settings, sites and the time saved', async () => {
    const { root, settings, profiles, stats } = await options(
      { rateStep: 0.5, theme: 'sage' },
      { rememberedRate: 1.5, 'site:a.example': { playbackRate: 2 } },
    );
    const remove = button(root, t('deleteAll'));
    remove.click();
    await settled();
    expect(settings.stored['rateStep']).toBe(0.5);
    expect(remove.textContent).toBe(t('deleteAllConfirm'));
    remove.click();
    await settled();
    await settled();
    expect(settings.stored).toEqual({});
    expect(await profiles.list()).toEqual([]);
    expect(await profiles.rememberedRate()).toBeNull();
    expect(await stats.load()).toBe(0);
    expect(note(root)).toBe(t('deletedAll'));
  });

  it('says where the site permissions are removed, since they stay', async () => {
    const { root } = await options();
    expect(section(root, t('sectionPrivacy')).textContent).toContain(
      t('deleteAllHelp', t('sectionAccess')),
    );
  });

  it('says so when the deletion fails', async () => {
    const { root, local } = await options();
    local.failNext = true;
    const remove = button(root, t('deleteAll'));
    remove.click();
    remove.click();
    await settled();
    await settled();
    expect(note(root)).toBe(t('deleteFailed'));
  });
});

describe('about', () => {
  it('credits the author', async () => {
    const { root } = await options();
    const about = section(root, t('sectionAbout'));
    expect(about.textContent).toContain(t('aboutAuthor', 'Lionrick333'));
  });

  it('shows the version and its license, with the source and the license of that version', async () => {
    const { root } = await options();
    const about = section(root, t('sectionAbout'));
    expect(about.textContent).toContain(t('aboutVersion', TEST_VERSION));
    expect(about.textContent).toContain(t('aboutLicense'));
    const links = Object.fromEntries(
      Array.from(about.querySelectorAll<HTMLAnchorElement>('a'), (a) => [a.textContent, a]),
    );
    expect(links[t('aboutSource')]?.href).toBe(`${REPO}/tree/v${TEST_VERSION}`);
    expect(links[t('aboutLicenseLink')]?.href).toBe(`${REPO}/blob/v${TEST_VERSION}/LICENSE`);
    expect(links[t('aboutIssues')]?.href).toBe(`${REPO}/issues`);
    expect(links[t('aboutDiscussions')]?.href).toBe(`${REPO}/discussions`);
    expect(links[t('supportDevelopmentKofi')]?.href).toBe('https://ko-fi.com/lionrick333');
    for (const link of Object.values(links)) {
      expect(link?.target).toBe('_blank');
      expect(link?.rel).toBe('noopener noreferrer');
    }
  });

  it('shows no «More from the developer» while there is nothing to show', async () => {
    const { root } = await options();
    expect(root.textContent).not.toContain(t('moreFromDeveloper'));
  });

  it('links the privacy promise to the public source', async () => {
    const { root } = await options();
    const link = Array.from(
      section(root, t('sectionPrivacy')).querySelectorAll<HTMLAnchorElement>('a'),
    ).find((a) => a.textContent === t('sourceLink'));
    expect(link?.href).toBe(REPO);
  });
});
