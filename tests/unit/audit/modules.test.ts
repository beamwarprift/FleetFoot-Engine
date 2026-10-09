import { describe, expect, it } from 'vitest';
import {
  auditModules,
  isProductModule,
  lineCount,
  parseModulePolicy,
} from '../../../scripts/audit/modules.ts';

const policy = (baseline: Record<string, number> = {}) => ({ maxLines: 302, baseline });

describe('auditModules', () => {
  it('accepts modules up to the cap, the exact cap included', () => {
    expect(auditModules({ 'src/a.ts': 302, 'src/b.ts': 1 }, policy())).toEqual([]);
  });

  it('refuses a module over the cap that is not approved debt', () => {
    expect(auditModules({ 'src/a.ts': 303 }, policy())).toEqual([
      'src/a.ts: 303 lines, over the cap of 302',
    ]);
  });

  it('holds approved debt to its length, and makes the baseline follow it down', () => {
    expect(auditModules({ 'src/a.ts': 400 }, policy({ 'src/a.ts': 400 }))).toEqual([]);
    expect(auditModules({ 'src/a.ts': 401 }, policy({ 'src/a.ts': 400 }))).toEqual([
      'src/a.ts: 401 lines, over its approved 400',
    ]);
    expect(auditModules({ 'src/a.ts': 350 }, policy({ 'src/a.ts': 400 }))).toEqual([
      'src/a.ts: 350 lines, lower its baseline from 400',
    ]);
    expect(auditModules({ 'src/a.ts': 302 }, policy({ 'src/a.ts': 400 }))).toEqual([
      'src/a.ts: 302 lines, back under the cap: remove it from the baseline',
    ]);
    expect(auditModules({}, policy({ 'src/gone.ts': 400 }))).toEqual([
      'src/gone.ts: in the baseline, not in the tree',
    ]);
  });
});

describe('lineCount', () => {
  it('counts lines as an editor numbers them', () => {
    expect(lineCount('')).toBe(0);
    expect(lineCount('a')).toBe(1);
    expect(lineCount('a\n')).toBe(1);
    expect(lineCount('a\nb\n')).toBe(2);
    expect(lineCount('a\n\nb')).toBe(3);
  });
});

describe('isProductModule', () => {
  it('covers the TypeScript of src and entrypoints only', () => {
    expect(isProductModule('src/ui/popup/PopupView.ts')).toBe(true);
    expect(isProductModule('entrypoints/background.ts')).toBe(true);
    for (const path of ['tests/browser/Popup.test.ts', 'scripts/audit.ts', 'src/ui/theme.css']) {
      expect(isProductModule(path)).toBe(false);
    }
    expect(isProductModule('src/types.d.ts')).toBe(false);
  });
});

describe('parseModulePolicy', () => {
  it('reads a cap and a baseline of lengths, nothing else', () => {
    expect(parseModulePolicy({ maxLines: 302, baseline: { 'src/a.ts': 400 } }, 'x')).toEqual({
      maxLines: 302,
      baseline: { 'src/a.ts': 400 },
    });
    for (const value of [
      { maxLines: 0, baseline: {} },
      { maxLines: 302.5, baseline: {} },
      { maxLines: 302, baseline: [] },
      { maxLines: 302, baseline: { 'src/a.ts': '400' } },
      { maxLines: 302 },
    ]) {
      expect(() => parseModulePolicy(value, 'x')).toThrow();
    }
  });
});
