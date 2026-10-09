import { describe, expect, it } from 'vitest';
import {
  MAX_REPORT_SECONDS,
  parseReport,
  parseTotal,
  timeSavedReport,
} from '../../../src/core/stats/TimeSaved.ts';
import { savedTimeText } from '../../../src/ui/savedTime.ts';

describe('time-saved reports', () => {
  it('accept a well-formed report only', () => {
    expect(parseReport(timeSavedReport(12.5))).toBe(12.5);
    expect(parseReport({ ...timeSavedReport(12), extra: 1 })).toBeNull();
    expect(parseReport({ type: 'other', seconds: 12 })).toBeNull();
    for (const seconds of [
      0,
      -1,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      MAX_REPORT_SECONDS + 1,
      '5',
    ]) {
      expect(parseReport({ type: timeSavedReport(1).type, seconds })).toBeNull();
    }
    expect(parseReport(null)).toBeNull();
  });

  it('read the stored total fail-closed', () => {
    expect(parseTotal(3600)).toBe(3600);
    for (const value of [undefined, -5, 'x', Number.NaN]) expect(parseTotal(value)).toBe(0);
  });
});

describe('savedTimeText', () => {
  const l10n = (locale: string) => ({
    t: (key: string, ...values: string[]) => [key, ...values].join(' '),
    locale,
    dir: 'ltr' as const,
  });
  it('reads in hours and minutes, never seconds, with the units of the language', () => {
    expect(savedTimeText(l10n('en'), 59)).toBe('savedUnderMinute');
    expect(savedTimeText(l10n('en'), 61)).toBe('1 min');
    expect(savedTimeText(l10n('en'), 3599)).toBe('59 min');
    expect(savedTimeText(l10n('en'), 3600 * 12 + 34 * 60 + 5)).toBe('savedHours 12 hr 34 min');
    expect(savedTimeText(l10n('it'), 3600 * 12 + 34 * 60 + 5)).toBe('savedHours 12 h 34 min');
  });
});
