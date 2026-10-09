// Keyboard: shortcuts on the page on or off, each action's key (recorded by pressing it, refused
// when another action has it), and the way to the browser's own shortcut settings.

import {
  type Binding,
  bindingOf,
  SHORTCUT_ACTIONS,
  type ShortcutAction,
  sameBinding,
} from '../../core/settings/Shortcuts.ts';
import { h, setAttr, setText } from '../dom.ts';
import type { MessageKey } from '../i18n.ts';
import { icon } from '../icons.ts';
import { bindingLabel, type LayoutMap } from './keyLabel.ts';
import { type Control, type OptionsSection, type SectionDeps, settingsSection } from './section.ts';
import { settingControls } from './settingControls.ts';

export interface BrowserShortcuts {
  readonly open: (() => void) | null;
}

export interface KeyboardDeps extends SectionDeps {
  readonly layout: LayoutMap | null;
  /**
   * The browser's own shortcuts: null where the browser has none; `open` null where it offers no
   * way to reach their settings.
   */
  readonly browserShortcuts: BrowserShortcuts | null;
}

const ACTION_LABELS: Readonly<Record<ShortcutAction, MessageKey>> = {
  slower: 'actionSlower',
  faster: 'actionFaster',
  reset: 'actionReset',
  favorite: 'actionFavorite',
  hold: 'actionHold',
  'seek-backward': 'actionSeekBackward',
  'seek-forward': 'actionSeekForward',
  'toggle-pitch': 'actionTogglePitch',
  'loop-a': 'actionLoopA',
  'loop-b': 'actionLoopB',
  'loop-toggle': 'actionLoopToggle',
  'next-player': 'actionNextPlayer',
  'toggle-overlay': 'actionToggleOverlay',
};

/** The one table of keys on the page: its title is its name. */
const KEYS_TITLE_ID = 'keys-title';
/** A finger rather than a mouse: the same query the stylesheets size controls by. */
const COARSE_POINTER = '(pointer: coarse)';

/** Keys that keep their meaning while a shortcut is being recorded. */
const RECORDER_KEYS = { cancel: 'Escape', leave: 'Tab' } as const;

function shortcutsTable(deps: KeyboardDeps): Control {
  const { document, settings, save } = deps;
  const { t } = deps.l10n;
  const saveBinding = (action: ShortcutAction, binding: Binding | null) =>
    save('bindings', { ...settings().bindings, [action]: binding });
  const refreshers: Array<() => void> = [];
  const rows = SHORTCUT_ACTIONS.map((action) => {
    const name = t(ACTION_LABELS[action]);
    const record = h(document, 'button', { className: 'key', attrs: { type: 'button' } });
    const clear = h(
      document,
      'button',
      { className: 'key-remove', attrs: { type: 'button', 'aria-label': t('keyRemove', name) } },
      [icon(document, 'close')],
    );
    let recording = false;
    const show = () => {
      const binding = settings().bindings[action];
      setText(
        record,
        recording
          ? t('keyPress')
          : binding === null
            ? t('keyNone')
            : bindingLabel(binding, deps.layout),
      );
      // Drawn as a key when one is set, as an empty slot when none is.
      setAttr(record, 'data-state', recording ? 'recording' : binding === null ? 'empty' : 'set');
      setAttr(record, 'aria-label', t('keyChange', name, record.textContent ?? ''));
      clear.hidden = binding === null;
    };
    const stopRecording = () => {
      recording = false;
      show();
    };
    record.addEventListener('click', () => {
      recording = true;
      show();
    });
    record.addEventListener('blur', stopRecording);
    record.addEventListener('keydown', (event) => {
      if (!recording) return;
      const key = event as KeyboardEvent;
      if (key.code === RECORDER_KEYS.leave) return;
      key.preventDefault();
      if (key.code === RECORDER_KEYS.cancel) {
        stopRecording();
        return;
      }
      const binding = bindingOf(key);
      if (binding === null) return;
      const owner = SHORTCUT_ACTIONS.find((other) => {
        const bound = settings().bindings[other];
        return other !== action && bound !== null && sameBinding(bound, binding);
      });
      if (owner !== undefined) {
        deps.say(t('keyTaken', bindingLabel(binding, deps.layout), t(ACTION_LABELS[owner])));
        return;
      }
      recording = false;
      void saveBinding(action, binding);
    });
    clear.addEventListener('click', () => void saveBinding(action, null));
    refreshers.push(show);
    // The roles are explicit: a narrow page lays the rows out as grids, and a browser may drop a
    // table's meaning when its display changes.
    return h(document, 'tr', { attrs: { role: 'row' } }, [
      h(document, 'th', { text: name, attrs: { scope: 'row', role: 'rowheader' } }),
      h(document, 'td', { attrs: { role: 'cell' } }, [record]),
      h(document, 'td', { attrs: { role: 'cell' } }, [clear]),
    ]);
  });
  // Under a finger the keys start folded: a phone seldom has a keyboard. The title names the table.
  const title = h(document, 'summary', { text: t('shortcutsTable'), attrs: { id: KEYS_TITLE_ID } });
  const keys = h(document, 'details', { className: 'keys' }, [
    title,
    h(
      document,
      'table',
      { className: 'shortcuts', attrs: { role: 'table', 'aria-labelledby': KEYS_TITLE_ID } },
      [h(document, 'tbody', { attrs: { role: 'rowgroup' } }, rows)],
    ),
  ]);
  keys.open = !(document.defaultView?.matchMedia(COARSE_POINTER).matches ?? false);
  return {
    element: keys,
    refresh() {
      for (const refresh of refreshers) refresh();
    },
  };
}

export function keyboardSection(deps: KeyboardDeps): OptionsSection {
  const { document } = deps;
  const { t } = deps.l10n;
  const controls = [
    settingControls(deps).checkbox('pageShortcuts', 'pageShortcutsField', 'pageShortcutsHelp'),
    shortcutsTable(deps),
  ];
  const shortcuts = deps.browserShortcuts;
  const open = shortcuts?.open ?? null;
  return settingsSection(
    deps.fields.section('sectionKeyboard', [
      ...controls.map((control) => control.element),
      shortcuts === null
        ? null
        : h(document, 'p', { className: 'help', text: t('browserShortcutsHelp') }),
      open === null
        ? null
        : h(document, 'button', {
            text: t('browserShortcutsOpen'),
            attrs: { type: 'button' },
            on: { click: () => open() },
          }),
    ]),
    controls,
  );
}
