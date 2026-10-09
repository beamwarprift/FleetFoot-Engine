import { describe, expect, it } from 'vitest';
import { formatRate, MAX_RATE, MIN_RATE, toRate } from '../../../src/core/media/PlaybackRate.ts';

describe('toRate', () => {
  it('keeps rates inside the offered range on the 0.01 grid', () => {
    expect(toRate(1.75)).toBe(1.75);
    expect(toRate(2.2)).toBe(2.2);
    expect(toRate(0.1)).toBe(MIN_RATE);
    expect(toRate(16)).toBe(MAX_RATE);
  });

  it('rounds to hundredths so the applied rate equals the displayed one', () => {
    expect(toRate(1.234)).toBe(1.23);
    expect(toRate(1.236)).toBe(1.24);
    expect(toRate(0.333333)).toBe(0.33);
  });

  it('clamps finite values outside the range', () => {
    expect(toRate(0.05)).toBe(0.1);
    expect(toRate(0.0625)).toBe(0.1);
    expect(toRate(-3)).toBe(0.1);
    expect(toRate(16.01)).toBe(16);
    expect(toRate(99)).toBe(16);
  });

  it('rejects non-finite input', () => {
    expect(toRate(Number.NaN)).toBeNull();
    expect(toRate(Number.POSITIVE_INFINITY)).toBeNull();
    expect(toRate(Number.NEGATIVE_INFINITY)).toBeNull();
  });
});

describe('formatRate', () => {
  it('always shows two decimals', () => {
    expect(formatRate(0.1)).toBe('0.10×');
    expect(formatRate(1)).toBe('1.00×');
    expect(formatRate(1.75)).toBe('1.75×');
    expect(formatRate(2.5)).toBe('2.50×');
    expect(formatRate(16)).toBe('16.00×');
  });
});
