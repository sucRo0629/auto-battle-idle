import { describe, expect, it } from 'vitest';
import { formatClassSummary } from './formatClassSummary.ts';

describe('formatClassSummary', () => {
  it('returns trimmed ja summary', () => {
    expect(
      formatClassSummary({ summary: { ja: '  前線構築型。  ' } }),
    ).toBe('前線構築型。');
  });

  it('returns empty when summary is missing', () => {
    expect(formatClassSummary(undefined)).toBe('');
    expect(formatClassSummary({})).toBe('');
  });

  it('falls back to ja when en is requested but missing', () => {
    expect(
      formatClassSummary({ summary: { ja: '日本語' } }, 'en'),
    ).toBe('日本語');
  });
});
