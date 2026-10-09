import { describe, expect, it } from 'vitest';
import { isolate } from '../../../src/ui/i18n.ts';

describe('isolate', () => {
  it('keeps an inserted value apart from the direction of its sentence (FSI … PDI)', () => {
    expect(isolate('1,75×')).toBe('⁨1,75×⁩');
    expect([...isolate('')]).toEqual(['⁨', '⁩']);
  });
});
