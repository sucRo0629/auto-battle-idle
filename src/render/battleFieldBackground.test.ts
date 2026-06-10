import { describe, expect, it } from 'vitest';
import { wrapScrollOffset } from './battleFieldBackground.ts';

describe('wrapScrollOffset', () => {
  it('wraps negative offsets into tile width range', () => {
    expect(wrapScrollOffset(0, 64)).toBe(0);
    expect(wrapScrollOffset(32, 64)).toBe(32);
    expect(wrapScrollOffset(64, 64)).toBe(0);
    expect(wrapScrollOffset(100, 64)).toBe(28);
  });

  it('floors fractional offsets before wrapping', () => {
    expect(wrapScrollOffset(32.9, 64)).toBe(wrapScrollOffset(32, 64));
    expect(wrapScrollOffset(100.7, 64)).toBe(wrapScrollOffset(100, 64));
  });

  it('returns 0 for invalid tile width', () => {
    expect(wrapScrollOffset(50, 0)).toBe(0);
  });
});
