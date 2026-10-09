// Every interface language the layout must hold: each real catalogue, plus two pseudo-languages
// that exist only in tests. They take the English texts 40% longer, one left to right with
// accented letters, one right to left with Hebrew letters, so a layout that only fits English
// fails here before a real translation arrives.

import type { Localization, TextDirection } from '../../src/ui/i18n.ts';
import { type Catalogue, catalogueText, type Entry } from './ui.ts';

const catalogues = import.meta.glob<Catalogue>('../../public/_locales/*/messages.json', {
  eager: true,
  import: 'default',
});

/** The direction of a language, as the browser knows it; the common right-to-left ones otherwise. */
function directionOf(locale: string): TextDirection {
  const info = (
    new Intl.Locale(locale) as Intl.Locale & { getTextInfo?: () => { direction?: string } }
  ).getTextInfo?.();
  if (info?.direction !== undefined) return info.direction === 'rtl' ? 'rtl' : 'ltr';
  return ['ar', 'fa', 'he', 'ur'].includes(locale.split('-')[0] ?? '') ? 'rtl' : 'ltr';
}

export interface Language {
  readonly name: string;
  readonly l10n: Localization;
}

function language(name: string, catalogue: Catalogue, locale: string, dir: TextDirection) {
  return { name, l10n: { t: catalogueText(catalogue), locale, dir } };
}

const ACCENTED: Readonly<Record<string, string>> = {
  a: 'á',
  e: 'é',
  i: 'í',
  o: 'ó',
  u: 'ú',
  c: 'ç',
  n: 'ñ',
  A: 'Å',
  E: 'É',
  I: 'Í',
  O: 'Ö',
  U: 'Ü',
};
const HEBREW = 'אבגדהוזחטיכלמנסעפצקרשת';
/** How much longer than English a translation can run. */
const EXPANSION = 0.4;

/** Extra words of up to eight letters, the length of real words in long languages. */
function filler(length: number, letter: (char: string, index: number) => string): string {
  const words: string[] = [];
  for (let left = length; left > 0; left -= 8) words.push(letter('x', 0).repeat(Math.min(8, left)));
  return words.join(' ');
}

function pseudo(catalogue: Catalogue, letter: (char: string, index: number) => string): Catalogue {
  const result: Record<string, Entry> = {};
  for (const [key, entry] of Object.entries(catalogue)) {
    // Placeholders stay as they are; only the words around them change.
    const parts = entry.message.split(/(\$[A-Za-z_]+\$)/);
    const text = parts
      .map((part) => (part.startsWith('$') ? part : Array.from(part, letter).join('')))
      .join('');
    const words = parts.filter((part) => !part.startsWith('$')).join('');
    const padding = Math.ceil(words.replace(/\s/g, '').length * EXPANSION);
    result[key] = {
      ...entry,
      message: padding === 0 ? text : `${text} ${filler(padding, letter)}`,
    };
  }
  return result;
}

const english = catalogues['../../public/_locales/en/messages.json'];
if (english === undefined) throw new Error('the English catalogue is missing');

const real = Object.entries(catalogues).map(([path, catalogue]) => {
  // A catalogue folder is named as the browser names locales (`pt_BR`); a BCP 47 tag has a hyphen.
  const folder = path.split('/').at(-2) ?? '';
  const locale = folder.replace('_', '-');
  return language(folder, catalogue, locale, directionOf(locale));
});

export const LANGUAGES: readonly Language[] = [
  ...real,
  language(
    'pseudo-ltr',
    pseudo(english, (char) => ACCENTED[char] ?? char),
    'en',
    'ltr',
  ),
  language(
    'pseudo-rtl',
    pseudo(english, (char) => {
      const index = char.toLowerCase().charCodeAt(0) - 97;
      return index >= 0 && index < 26 ? (HEBREW[index % HEBREW.length] ?? char) : char;
    }),
    'he',
    'rtl',
  ),
];
