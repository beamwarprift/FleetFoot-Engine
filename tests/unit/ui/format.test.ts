import { describe, expect, it } from 'vitest';
import {
  formatCount,
  formatPercent,
  formatQuantity,
  formatRate,
  formatRemaining,
  parseRateInput,
} from '../../../src/ui/format.ts';

describe('formatRate', () => {
  it('always shows two decimals with the separator of the language', () => {
    expect(formatRate(1.75, 'en')).toBe('1.75×');
    expect(formatRate(1.75, 'it')).toBe('1,75×');
    expect(formatRate(0.1, 'en')).toBe('0.10×');
    expect(formatRate(16, 'it')).toBe('16,00×');
  });
});

describe('parseRateInput', () => {
  it.each([
    ['1.75', 1.75],
    ['1,75', 1.75],
    [' 2 ', 2],
    ['2.5×', 2.5],
    ['3x', 3],
    ['16', 16],
    ['0,1', 0.1],
    // The digits the interface shows in the language's own script.
    ['১.৫০', 1.5],
    ['١٫٥', 1.5],
    ['۲٫۲۵', 2.25],
    ['२', 2],
    ['２.５', 2.5],
    // Mathematical bold digits: the second run of ten in a row, read as 0-9 again.
    ['𝟐', 2],
  ])('reads %s', (text, rate) => {
    expect(parseRateInput(text)).toBe(rate);
  });

  it.each([
    '',
    'fast',
    '1..2',
    '1,2,3',
    '-1',
    '1e2',
    '.5',
    '2 x 3',
    '1000',
    '1.234',
    '1,999',
    '<b>2</b>',
    '১০০০',
    '٢,٢,٢',
  ])('refuses %s', (text) => {
    expect(parseRateInput(text)).toBeNull();
  });
});

describe('formatRemaining', () => {
  it('follows the length of the content', () => {
    expect(formatRemaining(75, 600)).toBe('01:15');
    expect(formatRemaining(75, 7200)).toBe('00:01:15');
    expect(formatRemaining(75, null)).toBe('01:15');
  });
});

describe('formatQuantity', () => {
  it('uses the plural forms of the language, which the catalogues never hold', () => {
    expect(formatQuantity(1, 'second', 'en', 'long')).toBe('1 second');
    expect(formatQuantity(5, 'second', 'en', 'long')).toBe('5 seconds');
    expect(formatQuantity(1, 'second', 'it', 'long')).toBe('1 secondo');
    expect(formatQuantity(5, 'second', 'it', 'long')).toBe('5 secondi');
    // Russian has more than two forms: 1, 2-4, 5 and up read differently.
    const russian = [1, 2, 5].map((n) => formatQuantity(n, 'second', 'ru', 'long'));
    expect(new Set(russian).size).toBe(3);
  });

  it('keeps the compact units approved for Italian', () => {
    expect(formatQuantity(12, 'hour', 'it', 'short')).toBe('12 h');
    expect(formatQuantity(34, 'minute', 'it', 'short')).toBe('34 min');
    expect(formatQuantity(5, 'second', 'it', 'short')).toBe('5 s');
  });
});

describe('counts', () => {
  it('read with the digits and grouping of the language, never with decimals', () => {
    expect(formatCount(1234, 'en')).toBe('1,234');
    expect(formatCount(1234, 'it')).toBe('1234');
    expect(formatCount(12345, 'it')).toBe('12.345');
    expect(formatCount(0, 'en')).toBe('0');
  });
});

describe('percent', () => {
  it('reads as the language writes a percentage, in its digits', () => {
    expect(formatPercent(150, 'en')).toBe('150%');
    expect(formatPercent(150, 'it')).toBe('150%');
    expect(formatPercent(150, 'fr')).toBe('150\u00a0%');
    expect(formatPercent(150, 'tr')).toBe('%150');
    expect(formatPercent(100, 'bn')).toBe('১০০%');
  });
});
