// Keyboard shortcuts inside the page: which key each action is bound to.
// A binding is a physical key (`KeyboardEvent.code`) plus modifiers, recorded by pressing it, so
// the same key works on every keyboard layout.

export const SHORTCUT_ACTIONS = [
  'slower',
  'faster',
  'reset',
  'favorite',
  'hold',
  'seek-backward',
  'seek-forward',
  'toggle-pitch',
  'loop-a',
  'loop-b',
  'loop-toggle',
  'next-player',
  'toggle-overlay',
] as const;

export type ShortcutAction = (typeof SHORTCUT_ACTIONS)[number];

/**
 * Actions the browser's own shortcuts can run. A hold needs the key release, which those
 * shortcuts do not report; the overlay lives in the page.
 */
export const BROWSER_COMMAND_ACTIONS = SHORTCUT_ACTIONS.filter(
  (action) => action !== 'hold' && action !== 'toggle-overlay',
);

/** The interface text naming an action: `action` + the action in PascalCase (seek-backward → actionSeekBackward). */
export function actionMessageName(action: ShortcutAction): string {
  return `action${action
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')}`;
}

export function isShortcutAction(value: unknown): value is ShortcutAction {
  return typeof value === 'string' && (SHORTCUT_ACTIONS as readonly string[]).includes(value);
}

export interface Binding {
  readonly code: string;
  readonly alt: boolean;
  readonly ctrl: boolean;
  readonly meta: boolean;
  readonly shift: boolean;
}

/** `null`: the action has no key in the page (it stays reachable from the browser's shortcuts). */
export type Bindings = Readonly<Record<ShortcutAction, Binding | null>>;

export interface KeyLike {
  readonly code: string;
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
}

function key(code: string, shift = false): Binding {
  return { code, alt: false, ctrl: false, meta: false, shift };
}

/**
 * One cluster under the right hand, keys that common players leave free; the other actions start
 * unbound. Proposed defaults, configurable in the options.
 */
export const DEFAULT_BINDINGS: Bindings = {
  slower: key('BracketLeft'),
  faster: key('BracketRight'),
  reset: key('Backslash'),
  favorite: key('Quote'),
  hold: key('Semicolon'),
  'seek-backward': key('BracketLeft', true),
  'seek-forward': key('BracketRight', true),
  'toggle-pitch': null,
  'loop-a': null,
  'loop-b': null,
  'loop-toggle': null,
  'next-player': null,
  'toggle-overlay': null,
};

/** Keys that only modify another key, never a shortcut on their own. */
const MODIFIER_CODES: ReadonlySet<string> = new Set([
  'AltLeft',
  'AltRight',
  'ControlLeft',
  'ControlRight',
  'MetaLeft',
  'MetaRight',
  'OSLeft',
  'OSRight',
  'ShiftLeft',
  'ShiftRight',
  'CapsLock',
  'Fn',
  'FnLock',
]);

/** `KeyboardEvent.code` values are short alphanumeric identifiers (UI Events KeyboardEvent code). */
const CODE_PATTERN = /^[A-Za-z][A-Za-z0-9]{0,31}$/;

function isBindableCode(code: unknown): code is string {
  return typeof code === 'string' && CODE_PATTERN.test(code) && !MODIFIER_CODES.has(code);
}

/** The binding a key press would record, or null for a modifier alone or an unknown key. */
export function bindingOf(event: KeyLike): Binding | null {
  if (!isBindableCode(event.code)) return null;
  return {
    code: event.code,
    alt: event.altKey,
    ctrl: event.ctrlKey,
    meta: event.metaKey,
    shift: event.shiftKey,
  };
}

export function sameBinding(a: Binding, b: Binding): boolean {
  return (
    a.code === b.code &&
    a.alt === b.alt &&
    a.ctrl === b.ctrl &&
    a.meta === b.meta &&
    a.shift === b.shift
  );
}

/** The action bound to exactly this key and these modifiers. */
export function actionFor(bindings: Bindings, event: KeyLike): ShortcutAction | null {
  const pressed = bindingOf(event);
  if (pressed === null) return null;
  for (const action of SHORTCUT_ACTIONS) {
    const bound = bindings[action];
    if (bound !== null && sameBinding(bound, pressed)) return action;
  }
  return null;
}

/** A stored binding: `null` when explicitly unbound, `undefined` when not a binding at all. */
export function parseBinding(value: unknown): Binding | null | undefined {
  if (value === null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Readonly<Record<string, unknown>>;
  const { code, alt, ctrl, meta, shift } = record;
  if (!isBindableCode(code)) return undefined;
  if (
    typeof alt !== 'boolean' ||
    typeof ctrl !== 'boolean' ||
    typeof meta !== 'boolean' ||
    typeof shift !== 'boolean'
  ) {
    return undefined;
  }
  return { code, alt, ctrl, meta, shift };
}

/**
 * Stored bindings, action by action: an invalid or missing entry falls back to its default, and a
 * key bound twice stays with the first action in the list.
 */
export function parseBindings(value: unknown): Bindings {
  const record =
    typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Readonly<Record<string, unknown>>)
      : {};
  const result: Record<ShortcutAction, Binding | null> = { ...DEFAULT_BINDINGS };
  const taken: Binding[] = [];
  for (const action of SHORTCUT_ACTIONS) {
    const parsed = Object.hasOwn(record, action) ? parseBinding(record[action]) : undefined;
    const binding = parsed === undefined ? DEFAULT_BINDINGS[action] : parsed;
    if (binding !== null && taken.some((other) => sameBinding(other, binding))) {
      result[action] = null;
      continue;
    }
    if (binding !== null) taken.push(binding);
    result[action] = binding;
  }
  return result;
}
