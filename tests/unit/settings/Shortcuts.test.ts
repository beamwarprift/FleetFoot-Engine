import { describe, expect, it } from 'vitest';
import {
  actionFor,
  actionMessageName,
  BROWSER_COMMAND_ACTIONS,
  bindingOf,
  DEFAULT_BINDINGS,
  type KeyLike,
  parseBinding,
  parseBindings,
  SHORTCUT_ACTIONS,
} from '../../../src/core/settings/Shortcuts.ts';

function press(code: string, modifiers: Partial<Omit<KeyLike, 'code'>> = {}): KeyLike {
  return { code, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, ...modifiers };
}

describe('bindingOf', () => {
  it('records the physical key and its modifiers', () => {
    expect(bindingOf(press('KeyS', { altKey: true, shiftKey: true }))).toEqual({
      code: 'KeyS',
      alt: true,
      ctrl: false,
      meta: false,
      shift: true,
    });
  });

  it('never records a modifier alone or an unknown key', () => {
    for (const code of [
      'ShiftLeft',
      'ControlRight',
      'AltLeft',
      'MetaLeft',
      'CapsLock',
      '',
      'Key A',
      '<x>',
    ]) {
      expect(bindingOf(press(code))).toBeNull();
    }
  });
});

describe('actionFor', () => {
  it('matches the exact key and modifiers', () => {
    expect(actionFor(DEFAULT_BINDINGS, press('BracketRight'))).toBe('faster');
    expect(actionFor(DEFAULT_BINDINGS, press('BracketRight', { shiftKey: true }))).toBe(
      'seek-forward',
    );
    expect(actionFor(DEFAULT_BINDINGS, press('BracketRight', { ctrlKey: true }))).toBeNull();
    expect(actionFor(DEFAULT_BINDINGS, press('KeyK'))).toBeNull();
  });
});

describe('parseBindings', () => {
  it('keeps defaults for missing or invalid entries and honours explicit unbinding', () => {
    const parsed = parseBindings({ faster: null, slower: { code: 'KeyQ' }, reset: 'x' });
    expect(parsed.faster).toBeNull();
    expect(parsed.slower).toEqual(DEFAULT_BINDINGS.slower);
    expect(parsed.reset).toEqual(DEFAULT_BINDINGS.reset);
  });

  it('gives a key bound twice to the first action only', () => {
    const key = { code: 'KeyQ', alt: false, ctrl: false, meta: false, shift: false };
    const parsed = parseBindings({ slower: key, faster: key });
    expect(parsed.slower).toEqual(key);
    expect(parsed.faster).toBeNull();
  });

  it('never gives the same key to two actions, defaults included', () => {
    const bound = SHORTCUT_ACTIONS.map((action) => DEFAULT_BINDINGS[action])
      .filter((binding) => binding !== null)
      .map((binding) => JSON.stringify(binding));
    expect(new Set(bound).size).toBe(bound.length);
  });

  it('rejects malformed bindings', () => {
    expect(
      parseBinding({ code: 'KeyA', alt: 'no', ctrl: false, meta: false, shift: false }),
    ).toBeUndefined();
    expect(parseBinding([])).toBeUndefined();
    expect(parseBinding(null)).toBeNull();
  });
});

describe('browser commands', () => {
  it('cover every action except the hold and the overlay', () => {
    expect(BROWSER_COMMAND_ACTIONS).toEqual(
      SHORTCUT_ACTIONS.filter((action) => action !== 'hold' && action !== 'toggle-overlay'),
    );
  });

  it('name their text after the action', () => {
    expect(actionMessageName('seek-backward')).toBe('actionSeekBackward');
    expect(actionMessageName('loop-a')).toBe('actionLoopA');
  });
});
