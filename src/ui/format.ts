// How numbers read in the interface: rates always with two decimals and the separator of the
// interface language (1.75× in English, 1,75× in Italian); speeds typed by the user accept both;
// amounts of time with their unit, in the language's plural forms.

import { formatTimestamp } from '../core/media/RemainingTime.ts';

export { formatTimestamp };

const rateFormats = new Map<string, Intl.NumberFormat>();

function rateFormat(locale: string): Intl.NumberFormat {
  let format = rateFormats.get(locale);
  if (format === undefined) {
    format = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    rateFormats.set(locale, format);
  }
  return format;
}

export function formatRate(rate: number, locale: string): string {
  return `${rateFormat(locale).format(rate)}×`;
}

const countFormats = new Map<string, Intl.NumberFormat>();

/** A whole count with the digits and grouping of the interface language. */
export function formatCount(value: number, locale: string): string {
  let format = countFormats.get(locale);
  if (format === undefined) {
    format = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
    countFormats.set(locale, format);
  }
  return format.format(value);
}

const percentFormats = new Map<string, Intl.NumberFormat>();

/** A size in percent as the interface language writes it («150%», «150 %», «%150»). */
export function formatPercent(percent: number, locale: string): string {
  let format = percentFormats.get(locale);
  if (format === undefined) {
    format = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 });
    percentFormats.set(locale, format);
  }
  return format.format(percent / 100);
}

export type TimeUnit = 'second' | 'minute' | 'hour';

const quantityFormats = new Map<string, Intl.NumberFormat>();

/**
 * An amount of time with its unit in the interface language («5 seconds», «1 secondo», «12 h»):
 * the browser applies each language's plural rules and digits, so the catalogues hold no plural
 * forms. `long` for sentences and accessible names, `short` for compact labels.
 */
export function formatQuantity(
  value: number,
  unit: TimeUnit,
  locale: string,
  display: 'short' | 'long',
): string {
  const key = `${locale}|${unit}|${display}`;
  let format = quantityFormats.get(key);
  if (format === undefined) {
    format = new Intl.NumberFormat(locale, { style: 'unit', unit, unitDisplay: display });
    quantityFormats.set(key, format);
  }
  return format.format(value);
}

const DECIMAL_DIGIT = /\p{Nd}/u;
/** The decimal separator Unicode has besides `.` and `,` (U+066B), the one Arabic script uses. */
const ARABIC_DECIMAL_SEPARATOR = '\u066B';

/**
 * A typed number in the digits 0-9, whatever script its digits were written in: the interface
 * shows numbers in the language's own digits (Bengali «১.৫০»), so it reads them back. Unicode
 * encodes each script's decimal digits as one run from 0 to 9, so a digit's value is its place in
 * that run; consecutive runs (mathematical digits) repeat 0-9, hence the remainder.
 */
export function toLatinDigits(text: string): string {
  let latin = '';
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code <= 0x7f || !DECIMAL_DIGIT.test(char)) {
      latin += char === ARABIC_DECIMAL_SEPARATOR ? '.' : char;
      continue;
    }
    let start = code;
    while (DECIMAL_DIGIT.test(String.fromCodePoint(start - 1))) start--;
    latin += String((code - start) % 10);
  }
  return latin;
}

/**
 * Up to three digits, an optional decimal part of one or two digits after `.` or `,`, an optional
 * trailing `×` or `x`. Anything else typed or pasted is not a speed.
 */
const RATE_INPUT = /^([0-9]{1,3})(?:[.,]([0-9]{1,2}))?\s*[×xX]?$/;

/** A speed the user typed, or null when it is not one. The range is checked by the caller. */
export function parseRateInput(text: string): number | null {
  const match = RATE_INPUT.exec(toLatinDigits(text.trim()));
  if (match === null) return null;
  const [, whole, fraction] = match;
  return Number(`${whole}.${fraction ?? '0'}`);
}

/** A speed or step the user typed, only inside [min, max]: outside it is refused, never clamped. */
export function parseRateIn(text: string, min: number, max: number): number | null {
  const rate = parseRateInput(text);
  return rate === null || rate < min || rate > max ? null : rate;
}

/** A remaining time in the clock format of its content (hours when it lasts an hour or more). */
export function formatRemaining(seconds: number, duration: number | null): string | null {
  return formatTimestamp(seconds, duration ?? Number.NaN);
}
