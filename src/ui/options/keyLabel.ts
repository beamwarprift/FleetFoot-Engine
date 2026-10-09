// How a binding reads: the character the user's layout puts on that key when the browser can say
// (keyboard layout map), otherwise a readable name of the physical key.

import type { Binding } from '../../core/settings/Shortcuts.ts';

export type LayoutMap = ReadonlyMap<string, string>;

/** Physical keys whose `code` names are not what is printed on them. */
const NAMED_CODES: Readonly<Record<string, string>> = {
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  Space: 'Space',
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
};

function keyName(code: string, layout: LayoutMap | null): string {
  const mapped = layout?.get(code);
  if (mapped !== undefined && mapped.trim() !== '') return mapped.toUpperCase();
  if (code.startsWith('Key') && code.length === 4) return code.slice(3);
  if (code.startsWith('Digit') && code.length === 6) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  return NAMED_CODES[code] ?? code;
}

export function bindingLabel(binding: Binding, layout: LayoutMap | null): string {
  const parts: string[] = [];
  if (binding.ctrl) parts.push('Ctrl');
  if (binding.alt) parts.push('Alt');
  if (binding.shift) parts.push('Shift');
  if (binding.meta) parts.push('Meta');
  parts.push(keyName(binding.code, layout));
  return parts.join('+');
}
