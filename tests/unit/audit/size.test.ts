import { describe, expect, it } from 'vitest';
import { auditSize, isJavaScript } from '../../../scripts/audit/size.ts';

const BUDGET = { jsBytesMax: 150_000, zipBytesMax: 300_000 };

describe('auditSize', () => {
  it('accepts a build within budget, including the exact limit', () => {
    expect(auditSize('chrome', { jsBytes: 150_000, zipBytes: 300_000 }, BUDGET)).toEqual([]);
  });

  it('rejects JS or zip over budget', () => {
    expect(auditSize('chrome', { jsBytes: 150_001, zipBytes: 1 }, BUDGET)).toHaveLength(1);
    expect(auditSize('chrome', { jsBytes: 1, zipBytes: 300_001 }, BUDGET)).toHaveLength(1);
  });

  it('counts only JavaScript files', () => {
    expect(isJavaScript('chunks/a.js')).toBe(true);
    expect(isJavaScript('a.mjs')).toBe(true);
    expect(isJavaScript('popup.html')).toBe(false);
    expect(isJavaScript('a.js.map')).toBe(false);
  });
});
