// The popup against a real engine and real media in the page, as the user sees and uses it.

import { afterEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { createMediaEngine, type MediaEngine } from '../../src/core/MediaEngine.ts';
import type { EngineState } from '../../src/core/messages/Protocol.ts';
import { DEFAULT_SETTINGS } from '../../src/core/settings/Settings.ts';
import { siteOf } from '../../src/core/settings/Sites.ts';
import { startPageSession } from '../../src/page/PageSession.ts';
import type { ClientFailure, EngineClient } from '../../src/ui/EngineClient.ts';
import { formatQuantity } from '../../src/ui/format.ts';
import { HIDE_DELAY_MS, SHOW_DELAY_MS } from '../../src/ui/hoverCard.ts';
import { isolate } from '../../src/ui/i18n.ts';
import { type PopupHandle, startPopup } from '../../src/ui/popup/Popup.ts';
import { engineState } from '../unit/state.ts';
import { eventsDelivered, loaded, mountMedia, ready, resetPage, seekTo } from './media.ts';
import {
  ENGLISH,
  localClient,
  type MemoryAccess,
  type MemoryProfiles,
  type MemorySettings,
  type MemoryStats,
  memoryAccess,
  memoryProfiles,
  memorySettings,
  memoryStats,
  STORE_REVIEW_URL,
  settled,
  englishText as t,
} from './ui.ts';

interface Opened {
  readonly popup: PopupHandle;
  readonly root: HTMLElement;
  readonly copied: string[];
  readonly settings: MemorySettings;
  readonly profiles: MemoryProfiles;
  readonly options: { opened: number };
  readonly stats: MemoryStats;
}

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  resetPage();
});

function engine(): MediaEngine {
  const created = createMediaEngine(window);
  cleanups.push(() => created.stop());
  return created;
}

async function open(
  connect: () => Promise<EngineClient | ClientFailure>,
  settings: MemorySettings = memorySettings(),
  profiles: MemoryProfiles = memoryProfiles(),
  reviewUrl?: string,
  access?: MemoryAccess,
): Promise<Opened> {
  const copied: string[] = [];
  const options = { opened: 0 };
  const stats = memoryStats();
  const host = document.createElement('div');
  document.body.append(host);
  const popup = await startPopup({
    document,
    l10n: ENGLISH,
    settings,
    profiles,
    connect,
    copy: async (text) => {
      copied.push(text);
      return true;
    },
    openOptions: () => options.opened++,
    reviewUrl,
    stats,
    ...(access === undefined ? {} : { access }),
    mount: (root) => host.append(root),
  });
  cleanups.push(() => popup.close());
  await settled();
  return { popup, root: popup.view.root, copied, settings, profiles, options, stats };
}

/** A page with one loaded video, its engine and session, and the popup open on it. */
async function popupOnVideo(
  stored: Record<string, unknown> = {},
  remembered: Record<string, unknown> = {},
) {
  const video = mountMedia({ seconds: 120 });
  await loaded(video);
  const target = engine();
  const settings = memorySettings(stored);
  const profiles = memoryProfiles(remembered);
  const stopSession = await startPageSession({
    window,
    engine: target,
    settings,
    profiles,
    l10n: () => ENGLISH,
  });
  cleanups.push(stopSession);
  const opened = await open(async () => localClient(target), settings, profiles);
  return { video, target, ...opened };
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function button(root: HTMLElement, name: string): HTMLButtonElement {
  const found = Array.from(root.querySelectorAll('button')).find(
    (element) => element.getAttribute('aria-label') === name || element.textContent === name,
  );
  if (found === undefined) throw new Error(`no button ${name}`);
  return found;
}

/** The player picker: its button and, once open, its options. */
function picker(root: HTMLElement) {
  const combo = root.querySelector<HTMLButtonElement>('button[role="combobox"]');
  if (combo === null) throw new Error('no player picker');
  const options = () => Array.from(root.querySelectorAll<HTMLElement>('[role="option"]'));
  const option = (name: string) =>
    options().find((item) => item.querySelector('.player-option-name')?.textContent === name);
  const name = () => combo.querySelector('.player-name')?.textContent;
  return { combo, options, option, name };
}

function rateInput(root: HTMLElement): HTMLInputElement {
  const input = root.querySelector<HTMLInputElement>('input.rate');
  if (input === null) throw new Error('no rate input');
  return input;
}

function notices(root: HTMLElement): string[] {
  return Array.from(root.querySelectorAll('.notices p'), (element) => element.textContent ?? '');
}

describe('popup on a page with a video', () => {
  it('shows the speed and changes it with − and +', async () => {
    const { video, root } = await popupOnVideo();
    expect(rateInput(root).value).toBe('1.00×');
    button(root, t('faster')).click();
    await settled();
    expect(video.playbackRate).toBe(1.25);
    expect(rateInput(root).value).toBe('1.25×');
    button(root, t('slower')).click();
    button(root, t('slower')).click();
    await settled();
    expect(video.playbackRate).toBe(0.75);
  });

  it('takes a typed speed with a dot or a comma, and explains an invalid one', async () => {
    const { video, root } = await popupOnVideo();
    const input = rateInput(root);
    input.value = '2,5';
    input.dispatchEvent(new Event('change'));
    await settled();
    expect(video.playbackRate).toBe(2.5);
    input.value = 'fast';
    input.dispatchEvent(new Event('change'));
    await settled();
    expect(video.playbackRate).toBe(2.5);
    expect(notices(root)).toContain(t('rateInvalid', '0.10×', '16.00×'));
  });

  it('steps with the arrow keys inside the speed field', async () => {
    const { video, root } = await popupOnVideo();
    const input = rateInput(root);
    input.focus();
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }),
    );
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }),
    );
    await settled();
    expect(video.playbackRate).toBe(1.5);
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }),
    );
    await settled();
    expect(video.playbackRate).toBe(1.25);
  });

  it('refuses a typed speed outside the range instead of changing it silently', async () => {
    const { video, root } = await popupOnVideo();
    const input = rateInput(root);
    expect(input.maxLength).toBe(8);
    for (const typed of ['20', '0,05', '1.234', '<b>2</b>', '2;alert(1)']) {
      input.value = typed;
      input.dispatchEvent(new Event('change'));
      await settled();
      expect(video.playbackRate, typed).toBe(1);
    }
    expect(notices(root)).toContain(t('rateInvalid', '0.10×', '16.00×'));
  });

  it('applies presets and marks the current one', async () => {
    const { video, root } = await popupOnVideo();
    const preset = root.querySelector<HTMLButtonElement>('.presets button[data-rate="1.75"]');
    preset?.click();
    await settled();
    expect(video.playbackRate).toBe(1.75);
    expect(preset?.getAttribute('aria-pressed')).toBe('true');
    const pressed = root.querySelectorAll('.presets [aria-pressed="true"]');
    expect(pressed).toHaveLength(1);
  });

  it('keeps the presets closed until their title opens them, and remembers', async () => {
    const { root, settings } = await popupOnVideo();
    const title = button(root, t('presets'));
    const list = root.querySelector<HTMLElement>('.presets');
    expect(title.getAttribute('aria-expanded')).toBe('false');
    expect(title.getAttribute('aria-controls')).toBe(list?.id);
    expect(list?.checkVisibility()).toBe(false);
    title.click();
    await settled();
    expect(settings.stored['presetsOpen']).toBe(true);
    expect(title.getAttribute('aria-expanded')).toBe('true');
    expect(list?.checkVisibility()).toBe(true);
    title.click();
    await settled();
    expect(settings.stored['presetsOpen']).toBe(false);
    expect(list?.checkVisibility()).toBe(false);
  });

  it('opens with the presets shown when the user left them open', async () => {
    const { root } = await popupOnVideo({ presetsOpen: true });
    expect(button(root, t('presets')).getAttribute('aria-expanded')).toBe('true');
    expect(root.querySelector<HTMLElement>('.presets')?.checkVisibility()).toBe(true);
  });

  it('hides and shows the overlay of the page, and says what a click does', async () => {
    const { root, settings } = await popupOnVideo();
    const overlay = button(root, t('overlayToggle'));
    const drawn = () => document.querySelector('fleetfoot-engine-overlay') !== null;
    expect(overlay.getAttribute('aria-pressed')).toBe('true');
    expect(overlay.title).toBe(t('overlayHide'));
    expect(drawn()).toBe(true);
    overlay.click();
    await settled();
    await settled();
    expect(settings.stored['overlayEnabled']).toBe(false);
    expect(overlay.getAttribute('aria-pressed')).toBe('false');
    expect(overlay.title).toBe(t('overlayShow'));
    expect(drawn()).toBe(false);
    overlay.click();
    await settled();
    await settled();
    expect(settings.stored['overlayEnabled']).toBe(true);
    expect(drawn()).toBe(true);
  });

  it('hides the overlay on every site even with memory per site, never in a profile', async () => {
    const site = siteOf(window.location.hostname) ?? '';
    const { root, settings, profiles } = await popupOnVideo({ memory: 'site' });
    const overlay = button(root, t('overlayToggle'));
    overlay.click();
    await settled();
    await settled();
    expect(settings.stored['overlayEnabled']).toBe(false);
    expect(profiles.stored[`site:${site}`]).toBeUndefined();
    expect(overlay.getAttribute('aria-pressed')).toBe('false');
    expect(document.querySelector('fleetfoot-engine-overlay')).toBeNull();
  });

  it('shows the overlay setting as the options page has it', async () => {
    const { root, settings } = await popupOnVideo({ overlayEnabled: false });
    const overlay = button(root, t('overlayToggle'));
    expect(overlay.getAttribute('aria-pressed')).toBe('false');
    await settings.save('overlayEnabled', true);
    await settled();
    expect(overlay.getAttribute('aria-pressed')).toBe('true');
  });

  it('resets, returns to the previous speed and applies the favorite', async () => {
    const { video, root } = await popupOnVideo({ favoriteRate: 1.75 });
    button(root, t('favoriteRate', '1.75×')).click();
    await settled();
    expect(video.playbackRate).toBe(1.75);
    button(root, t('resetTo', '1.00×')).click();
    await settled();
    expect(video.playbackRate).toBe(1);
    button(root, t('previousRate')).click();
    await settled();
    expect(video.playbackRate).toBe(1.75);
  });

  it('saves the pitch, which reaches the page', async () => {
    const { video, root, settings } = await popupOnVideo();
    const pitch = root.querySelector<HTMLButtonElement>('[role="switch"]');
    expect(pitch?.getAttribute('aria-checked')).toBe('true');
    pitch?.click();
    await settled();
    await settled();
    expect(settings.stored['preservesPitch']).toBe(false);
    expect(video.preservesPitch).toBe(false);
    expect(pitch?.getAttribute('aria-checked')).toBe('false');
  });

  it("saves the natural voice in the site's profile with memory per site", async () => {
    const site = siteOf(window.location.hostname) ?? '';
    const { video, root, settings, profiles } = await popupOnVideo({ memory: 'site' });
    const pitch = root.querySelector<HTMLButtonElement>('[role="switch"]');
    pitch?.click();
    await settled();
    await settled();
    expect(profiles.stored[`site:${site}`]).toEqual({ preservesPitch: false });
    expect(settings.stored['preservesPitch']).toBeUndefined();
    expect(video.preservesPitch).toBe(false);
    expect(pitch?.getAttribute('aria-checked')).toBe('false');
  });

  it('keeps one natural voice setting for the shortcut and the switch', async () => {
    const { video, root, settings } = await popupOnVideo({
      bindings: {
        ...DEFAULT_SETTINGS.bindings,
        'toggle-pitch': { code: 'KeyN', alt: true, ctrl: false, meta: false, shift: false },
      },
    });
    const pitch = root.querySelector<HTMLButtonElement>('[role="switch"]');
    const keys = { code: 'KeyN', altKey: true, bubbles: true, cancelable: true };
    document.body.dispatchEvent(new KeyboardEvent('keydown', keys));
    document.body.dispatchEvent(new KeyboardEvent('keyup', keys));
    await settled();
    await settled();
    expect(video.preservesPitch).toBe(false);
    expect(settings.stored['preservesPitch']).toBe(false);
    expect(pitch?.getAttribute('aria-checked')).toBe('false');
    pitch?.click();
    await settled();
    await settled();
    expect(video.preservesPitch).toBe(true);
    expect(pitch?.getAttribute('aria-checked')).toBe('true');
  });

  it('switches Skip Silence on from the time row, saved and reaching the page', async () => {
    const { target, root, settings } = await popupOnVideo();
    const skip = button(root, t('skipSilenceField'));
    expect(skip.closest('.seek-row')).not.toBeNull();
    expect(skip.getAttribute('aria-pressed')).toBe('false');
    skip.click();
    await settled();
    await settled();
    expect(settings.stored['skipSilence']).toBe(true);
    const { state } = await target.handleMessage({ v: 1, type: 'get-state' });
    expect(state.skipSilence.status).not.toBe('off');
    expect(skip.getAttribute('aria-pressed')).toBe('true');
    skip.click();
    await settled();
    await settled();
    expect(settings.stored['skipSilence']).toBe(false);
    expect(skip.getAttribute('aria-pressed')).toBe('false');
  });

  it("saves Skip Silence in the site's profile with memory per site", async () => {
    const site = siteOf(window.location.hostname) ?? '';
    const { root, settings, profiles } = await popupOnVideo({ memory: 'site' });
    button(root, t('skipSilenceField')).click();
    await settled();
    await settled();
    expect(profiles.stored[`site:${site}`]).toEqual({ skipSilence: true });
    expect(settings.stored['skipSilence']).toBeUndefined();
  });

  it('explains Skip Silence when the mouse rests on it, with a link to its settings', async () => {
    const { root } = await popupOnVideo();
    const skip = button(root, t('skipSilenceField'));
    const card = root.querySelector<HTMLElement>('#skip-silence-card');
    if (card === null) throw new Error('no card');
    // One explanation: the card, not a native tooltip under it.
    expect(skip.hasAttribute('title')).toBe(false);
    const described = document.getElementById(skip.getAttribute('aria-describedby') ?? '');
    expect(described?.textContent).toBe(`${t('skipSilenceField')}${t('skipSilenceHelp')}`);
    const link = card.querySelector('a');
    expect(link?.textContent).toBe(t('skipSilenceSettings'));
    expect(link?.getAttribute('href')).toBe('/options.html#skip-silence');
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(card.matches(':popover-open')).toBe(false);
    await userEvent.hover(skip);
    await wait(SHOW_DELAY_MS / 2);
    expect(card.matches(':popover-open')).toBe(false);
    await wait(SHOW_DELAY_MS);
    expect(card.matches(':popover-open')).toBe(true);
    // The pointer can go from the control into the card, to its link.
    await userEvent.hover(card);
    await wait(HIDE_DELAY_MS * 2);
    expect(card.matches(':popover-open')).toBe(true);
    await userEvent.hover(root.querySelector('.brand') as HTMLElement);
    await wait(HIDE_DELAY_MS * 2);
    expect(card.matches(':popover-open')).toBe(false);
  });

  it('opens the Skip Silence card from the keyboard, Tab leads into it, Escape closes it', async () => {
    const { root } = await popupOnVideo();
    const skip = button(root, t('skipSilenceField'));
    const card = root.querySelector<HTMLElement>('#skip-silence-card');
    const pip = root.querySelector<HTMLButtonElement>('button.pip:not(.skip-silence)');
    // PiP may be hidden; the copy button comes before either way.
    (pip?.checkVisibility() ? pip : button(root, t('copyTimestamp')))?.focus();
    await userEvent.tab();
    expect(document.activeElement).toBe(skip);
    expect(card?.matches(':popover-open')).toBe(true);
    await userEvent.tab();
    expect(document.activeElement).toBe(card?.querySelector('a'));
    expect(card?.matches(':popover-open')).toBe(true);
    await userEvent.keyboard('{Escape}');
    expect(card?.matches(':popover-open')).toBe(false);
    expect(document.activeElement).toBe(skip);
  });

  it('opens the Skip Silence card with a long press on a touch screen, closed by a touch elsewhere', async () => {
    const { root } = await popupOnVideo();
    const skip = button(root, t('skipSilenceField'));
    const card = root.querySelector<HTMLElement>('#skip-silence-card');
    skip.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', bubbles: true }));
    const press = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    skip.dispatchEvent(press);
    expect(press.defaultPrevented).toBe(true);
    expect(card?.matches(':popover-open')).toBe(true);
    root.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', bubbles: true }));
    expect(card?.matches(':popover-open')).toBe(false);
    // A right click with the mouse keeps the browser's own menu.
    skip.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'mouse', bubbles: true }));
    const right = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    skip.dispatchEvent(right);
    expect(right.defaultPrevented).toBe(false);
    expect(card?.matches(':popover-open')).toBe(false);
  });

  it('seeks by the configured step', async () => {
    const { video, root } = await popupOnVideo({ seekStep: 10 });
    button(root, t('seekForward', formatQuantity(10, 'second', 'en', 'long'))).click();
    await settled();
    expect(video.currentTime).toBeCloseTo(10, 0);
  });

  it('copies the timestamp of the position', async () => {
    const { video, root, copied } = await popupOnVideo();
    video.currentTime = 75;
    await new Promise((resolve) => video.addEventListener('seeked', resolve, { once: true }));
    await settled();
    button(root, t('copyTimestamp')).click();
    await settled();
    expect(copied).toEqual(['01:15']);
    expect(notices(root)).toContain(t('copied', '01:15'));
  });

  it('shows the A–B loop on the timeline and names its times on the buttons', async () => {
    const { video, root } = await popupOnVideo();
    const range = root.querySelector<HTMLElement>('.loop-range');
    expect(range?.hidden).toBe(true);
    // Seeks one at a time, on a buffered media.
    await ready(video);
    await seekTo(video, 30);
    button(root, t('loopA')).click();
    await settled();
    await seekTo(video, 90);
    button(root, t('loopB')).click();
    await settled();
    await settled();
    expect(button(root, t('loopAAt', '00:30')).textContent).toBe('A');
    expect(button(root, t('loopBAt', '01:30')).textContent).toBe('B');
    expect(range?.hidden).toBe(false);
    // 30 s to 90 s of 120 s: from a quarter of the timeline, half of it long.
    expect(range?.style.left).toBe('25%');
    expect(range?.style.width).toBe('50%');
    button(root, t('loopClear')).click();
    await settled();
    expect(range?.hidden).toBe(true);
  });

  it('explains a refused action next to the controls', async () => {
    const { root } = await popupOnVideo();
    button(root, t('loopB')).click();
    await settled();
    expect(notices(root)).toContain(t('errorLoopInvalid'));
  });

  it('warns at speeds where the audio may suffer', async () => {
    const { root } = await popupOnVideo();
    const input = rateInput(root);
    input.value = '8';
    input.dispatchEvent(new Event('change'));
    await settled();
    expect(notices(root)).toContain(t('noticeExtremeRate'));
  });

  it('lists the players and applies to all of them on request', async () => {
    const { video, root } = await popupOnVideo();
    const second = mountMedia({ width: 160, height: 90 });
    await loaded(second);
    await eventsDelivered();
    picker(root).combo.click();
    // Automatic, the two players, all players.
    expect(picker(root).options()).toHaveLength(4);
    picker(root).option(t('playerAll'))?.click();
    await settled();
    button(root, t('faster')).click();
    await settled();
    expect(video.playbackRate).toBe(1.25);
    expect(second.playbackRate).toBe(1.25);
  });

  it('follows changes made on the page while it is open', async () => {
    const { video, root } = await popupOnVideo();
    video.playbackRate = 1.5;
    await eventsDelivered();
    expect(rateInput(root).value).toBe('1.50×');
  });

  it('never overwrites what the user is typing', async () => {
    const { video, root } = await popupOnVideo();
    const input = rateInput(root);
    input.focus();
    input.value = '3';
    video.playbackRate = 1.5;
    await eventsDelivered();
    expect(input.value).toBe('3');
  });

  it('shows the time saved once there is at least a minute, and follows it', async () => {
    const { root, stats } = await popupOnVideo();
    const saved = root.querySelector<HTMLElement>('.saved');
    expect(saved?.hidden).toBe(true);
    stats.set(59);
    await settled();
    expect(saved?.hidden).toBe(true);
    stats.set(60);
    await settled();
    expect(saved?.hidden).toBe(false);
    expect(saved?.textContent).toBe(t('savedPopup', '1 min'));
    stats.set(2 * 3600 + 3 * 60);
    await settled();
    expect(saved?.textContent).toBe(t('savedPopup', t('savedHours', '2 hr', '3 min')));
  });

  it('asks about the time saved next to the support link from the first hour', async () => {
    const { root, stats } = await popupOnVideo();
    const invite = root.querySelector('footer.bottom .invite span');
    expect(invite?.textContent).toBe(t('supportQuestion'));
    stats.set(3599);
    await settled();
    expect(invite?.textContent).toBe(t('supportQuestion'));
    stats.set(3600);
    await settled();
    expect(invite?.textContent).toBe(t('supportSaved', '1 hr'));
    stats.set(2 * 3600 + 59 * 60);
    await settled();
    expect(invite?.textContent).toBe(t('supportSaved', '2 hr'));
  });

  it('explains the A–B loop on request, in a popover that leaves the layout alone', async () => {
    const { root } = await popupOnVideo();
    const info = button(root, t('loopHelpLabel'));
    const help = root.querySelector<HTMLElement>('#loop-help');
    expect(Array.from(help?.children ?? [], (line) => line.textContent)).toEqual([
      t('loopHelp'),
      t('loopHelpSteps'),
      t('loopHelpClear'),
    ]);
    expect(help?.matches(':popover-open')).toBe(false);
    const height = root.getBoundingClientRect().height;
    info.click();
    expect(help?.matches(':popover-open')).toBe(true);
    expect(root.getBoundingClientRect().height).toBe(height);
    info.click();
    expect(help?.matches(':popover-open')).toBe(false);
  });

  it('ends with one quiet line inviting support', async () => {
    const { root } = await popupOnVideo();
    const footer = root.querySelector('footer.bottom');
    expect(root.lastElementChild).toBe(footer);
    expect(footer?.textContent).toBe(t('supportQuestion') + t('supportDevelopment'));
    const link = footer?.querySelector<HTMLAnchorElement>('a.support');
    expect(link?.textContent).toBe(t('supportDevelopment'));
    expect(link?.href).toBe('https://ko-fi.com/lionrick333');
    expect(link?.rel).toBe('noopener noreferrer');
  });

  it('opens the options', async () => {
    const { root, options } = await popupOnVideo();
    button(root, t('options')).click();
    expect(options.opened).toBe(1);
  });
});

describe('a player in a frame from another site', () => {
  /** A page with no player of its own and a player frame from `site`, reached once allowed. */
  function framedPage(site: string) {
    let connections = 0;
    const access = memoryAccess();
    const connect = async () => {
      connections += 1;
      const reached = access.origins.size > 0;
      return stateClient(
        reached
          ? engineState()
          : engineState({ players: [], activePlayerId: null, framedSites: [site] }),
      );
    };
    return { access, connect, connections: () => connections };
  }

  it('names the site and offers to allow it, or every site', async () => {
    const page = framedPage('vixcloud.co');
    const { root } = await open(page.connect, undefined, undefined, undefined, page.access);
    expect(root.querySelector('.message-title')?.textContent).toBe(t('framedTitle', 'vixcloud.co'));
    expect(root.querySelector('.message-hint')?.textContent).toBe(t('framedHint'));
    expect(button(root, t('framedAllowSite', 'vixcloud.co')).checkVisibility()).toBe(true);
    expect(button(root, t('framedAllowAll')).checkVisibility()).toBe(true);
    expect(root.querySelector('.controls')?.checkVisibility()).toBe(false);
  });

  it('asks for that site only, and reaches the player once it is given', async () => {
    const page = framedPage('vixcloud.co');
    const { root } = await open(page.connect, undefined, undefined, undefined, page.access);
    button(root, t('framedAllowSite', 'vixcloud.co')).click();
    await settled();
    await settled();
    expect([...page.access.origins].sort()).toEqual([
      'http://*.vixcloud.co/*',
      'http://vixcloud.co/*',
      'https://*.vixcloud.co/*',
      'https://vixcloud.co/*',
    ]);
    expect(page.connections()).toBe(2);
    expect(root.querySelector('.controls')?.checkVisibility()).toBe(true);
  });

  it('asks for every site with the second choice', async () => {
    const page = framedPage('vixcloud.co');
    const { root } = await open(page.connect, undefined, undefined, undefined, page.access);
    button(root, t('framedAllowAll')).click();
    await settled();
    await settled();
    expect([...page.access.origins].sort()).toEqual(['http://*/*', 'https://*/*']);
    expect(root.querySelector('.controls')?.checkVisibility()).toBe(true);
  });

  it('says so when the browser does not give the access, and changes nothing', async () => {
    const page = framedPage('vixcloud.co');
    page.access.grants = false;
    const { root } = await open(page.connect, undefined, undefined, undefined, page.access);
    button(root, t('framedAllowSite', 'vixcloud.co')).click();
    await settled();
    expect(root.querySelector('.message-hint')?.textContent).toBe(t('accessDeclined'));
    expect(page.access.origins.size).toBe(0);
    expect(page.connections()).toBe(1);
  });

  it('keeps the plain message when no frame from another site is there', async () => {
    const { root } = await open(async () =>
      stateClient(engineState({ players: [], activePlayerId: null })),
    );
    expect(root.querySelector('.message-title')?.textContent).toBe(t('noMediaTitle'));
    expect(root.querySelector('.message-actions')?.checkVisibility()).toBe(false);
  });
});

describe('popup states', () => {
  it('says when the page has no media', async () => {
    const { root } = await open(async () => localClient(engine()));
    expect(root.textContent).toContain(t('noMediaTitle'));
    expect(root.querySelector<HTMLElement>('.controls')?.hidden).toBe(true);
  });

  it('says when the page refuses extensions, without offering a pointless retry', async () => {
    const { root } = await open(async () => 'page-unavailable');
    expect(root.textContent).toContain(t('pageUnavailableTitle'));
    expect(button(root, t('retry')).hidden).toBe(true);
  });

  it('offers a retry when the page does not answer', async () => {
    let attempts = 0;
    const target = engine();
    const { root } = await open(async () => (++attempts === 1 ? 'no-answer' : localClient(target)));
    expect(root.textContent).toContain(t('noAnswerTitle'));
    button(root, t('retry')).click();
    await settled();
    expect(attempts).toBe(2);
    expect(root.textContent).toContain(t('noMediaTitle'));
  });

  it('reconnects once when the page goes away, then reports it', async () => {
    let attempts = 0;
    const lost: Array<() => void> = [];
    const client: EngineClient = {
      send: async () => ({ ok: false, failure: 'no-answer' }),
      watch: (_onState, onLost) => {
        lost.push(onLost);
        return () => {};
      },
    };
    const { root } = await open(async () => {
      attempts++;
      return client;
    });
    lost[0]?.();
    await settled();
    expect(attempts).toBe(2);
    lost[1]?.();
    await settled();
    expect(attempts).toBe(2);
    expect(root.textContent).toContain(t('noAnswerTitle'));
  });
});

/** A page that only pushes one state: what the popup shows comes from that state alone. */
function stateClient(state: EngineState): EngineClient {
  return {
    send: async () => ({ ok: false, failure: 'no-answer' }),
    watch(onState) {
      onState(state);
      return () => {};
    },
  };
}

describe('popup showing the state it is given', () => {
  it('leads from «LOCK gave way» to the option that decides it, and only from there', async () => {
    const { root } = await open(async () => stateClient(engineState({ rateContested: true })));
    const notice = root.querySelector('.notices p');
    expect(notice?.textContent).toBe(`${t('noticeContested')} ${t('noticeContestedChoose')}`);
    const link = notice?.querySelector('a');
    expect(link?.getAttribute('href')).toBe('/options.html#lock-fight');
    expect(link?.getAttribute('target')).toBe('_blank');
    const other = await open(async () => stateClient(engineState({ rate: 8 })));
    expect(other.root.querySelector('.notices p')?.textContent).toBe(t('noticeExtremeRate'));
    expect(other.root.querySelector('.notices a')).toBeNull();
  });

  it('says when Skip Silence cannot hear, and shows when it speeds through a silence', async () => {
    for (const [status, notice, pressed] of [
      ['off', null, 'false'],
      ['listening', null, 'true'],
      ['skipping', null, 'true'],
      ['waiting', 'noticeSkipSilenceWaiting', 'true'],
      ['unavailable', 'noticeSkipSilenceUnavailable', 'true'],
    ] as const) {
      const { root } = await open(async () =>
        stateClient(engineState({ skipSilence: { status } })),
      );
      expect(notices(root), status).toEqual(notice === null ? [] : [t(notice)]);
      const skip = button(root, t('skipSilenceField'));
      expect(skip.getAttribute('aria-pressed'), status).toBe(pressed);
      expect(skip.classList.contains('skipping'), status).toBe(status === 'skipping');
    }
  });

  it('names the player the user chose, not automatic choice', async () => {
    const players = [
      { id: 1, kind: 'video', playing: true, width: 1280, height: 720, frame: null },
      { id: 2, kind: 'video', playing: false, width: 640, height: 360, frame: null },
    ] as const;
    const { root } = await open(async () =>
      stateClient(engineState({ players: [...players], activePlayerId: 2, pinned: true })),
    );
    // Closed, the short name; under it, what that player is.
    expect(picker(root).name()).toBe(t('playerVideo', '2'));
    expect(root.querySelector('.player-detail')?.textContent).toBe(isolate('640×360'));
  });

  it('is driven by the keyboard as a list box: arrows, Enter to choose, Escape to leave', async () => {
    const players = [
      { id: 1, kind: 'video', playing: true, width: 1280, height: 720, frame: null },
      { id: 2, kind: 'video', playing: false, width: 640, height: 360, frame: { site: 'a.com' } },
    ] as const;
    const chosen: unknown[] = [];
    const state = engineState({ players: [...players], activePlayerId: 1 });
    const client: EngineClient = {
      send: async (command) => {
        chosen.push(command);
        return { ok: true, response: { ok: true, state } };
      },
      watch(onState) {
        onState(state);
        return () => {};
      },
    };
    const { root } = await open(async () => client);
    const { combo, options } = picker(root);
    const key = (name: string) =>
      combo.dispatchEvent(
        new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }),
      );
    combo.focus();
    key('ArrowDown');
    await settled();
    expect(combo.getAttribute('aria-expanded')).toBe('true');
    // Open on the current choice: automatic.
    expect(combo.getAttribute('aria-activedescendant')).toBe(options()[0]?.id);
    key('Escape');
    await settled();
    expect(combo.getAttribute('aria-expanded')).toBe('false');
    expect(chosen).toEqual([]);
    key('ArrowDown');
    await settled();
    key('End');
    key('ArrowUp');
    expect(combo.getAttribute('aria-activedescendant')).toBe(options()[2]?.id);
    key('Enter');
    await settled();
    expect(combo.getAttribute('aria-expanded')).toBe('false');
    expect(chosen).toContainEqual({ v: 1, type: 'select-player', playerId: 2 });
  });

  it('opens on the player already chosen', async () => {
    const players = [
      { id: 1, kind: 'video', playing: true, width: 1280, height: 720, frame: null },
      { id: 2, kind: 'video', playing: false, width: 640, height: 360, frame: null },
    ] as const;
    const { root } = await open(async () =>
      stateClient(engineState({ players: [...players], activePlayerId: 2, pinned: true })),
    );
    const { combo, option } = picker(root);
    combo.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true }));
    await settled();
    expect(combo.getAttribute('aria-activedescendant')).toBe(option(t('playerVideo', '2'))?.id);
    expect(option(t('playerVideo', '2'))?.getAttribute('aria-selected')).toBe('true');
  });

  it('names an embedded player with the site it comes from', async () => {
    const { root } = await open(async () =>
      stateClient(
        engineState({
          players: [
            {
              id: 1,
              kind: 'video',
              playing: false,
              width: 640,
              height: 360,
              frame: { site: 'b.com' },
            },
          ],
          activePlayerId: 1,
        }),
      ),
    );
    expect(picker(root).name()).toBe(t('playerAuto'));
    expect(root.querySelector('.player-detail')?.textContent).toBe(
      `${t('playerVideo', '1')} · ${isolate('640×360')} · ${t('playerEmbedded', 'b.com')}`,
    );
  });

  it('copies no time while the position is unknown', async () => {
    const { root } = await open(async () => stateClient(engineState({ currentTime: null })));
    expect(button(root, t('copyTimestamp')).disabled).toBe(true);
  });

  it('turns the loop on only once its end B is set', async () => {
    const { root } = await open(async () =>
      stateClient(engineState({ loop: { a: 10, b: null, enabled: false } })),
    );
    expect(button(root, t('loop')).disabled).toBe(true);
    expect(button(root, t('loopClear')).hidden).toBe(false);
  });

  it('keeps its own size whatever text size the options page has', async () => {
    await open(async () => stateClient(engineState()), memorySettings({ textSize: 200 }));
    expect(document.documentElement.style.zoom).toBe('');
  });

  it('shows the brand as the logo writes it', async () => {
    const { root } = await open(async () => stateClient(engineState()));
    expect(root.querySelector('.brand')?.textContent).toBe('FLEETFOOT ENGINE');
  });
});

describe('the heart for a review', () => {
  it('opens the store page in a new tab, between the brand and the options', async () => {
    const { root } = await open(
      async () => 'page-unavailable',
      memorySettings(),
      memoryProfiles(),
      STORE_REVIEW_URL,
    );
    const top = root.querySelector('.top');
    const heart = top?.querySelector<HTMLAnchorElement>('a.review');
    expect(heart?.getAttribute('href')).toBe(STORE_REVIEW_URL);
    expect(heart?.target).toBe('_blank');
    expect(heart?.rel).toBe('noopener noreferrer');
    expect(heart?.getAttribute('aria-label')).toBe(t('reviewStore'));
    expect(heart?.getAttribute('title')).toBe(t('reviewStore'));
    expect(heart?.querySelector('svg')).not.toBeNull();
    const order = Array.from(top?.children ?? [], (child) =>
      child === heart
        ? 'heart'
        : child.matches('.title')
          ? 'brand'
          : child.getAttribute('aria-label'),
    );
    // The heart stays beside the options; the overlay button comes before it.
    expect(order).toEqual(['brand', t('overlayToggle'), 'heart', t('options')]);
  });

  it('is absent when the extension did not come from a known store', async () => {
    const { root } = await open(async () => 'page-unavailable');
    expect(root.querySelector('a.review')).toBeNull();
    expect(root.querySelector('.top a')).toBeNull();
  });
});
