import { describe, expect, it } from 'vitest';
import {
  statusBadgeRowWidth,
  statusBadgeStride,
} from './statusBadgeRenderer.ts';

const hot = { category: 'hot' as const };
const dot = { category: 'dot' as const };
const atk = { category: 'atk' as const };

describe('statusBadgeRowWidth', () => {
  it('includes outline clearance between adjacent badges', () => {
    expect(statusBadgeRowWidth([hot, dot], 1, 8, 1, 0)).toBe(20);
  });

  it('matches legacy width when outline is disabled', () => {
    expect(statusBadgeRowWidth([hot, dot], 1, 8, 0, 0)).toBe(16);
  });

  it('adds outline clearance for each additional badge', () => {
    expect(statusBadgeRowWidth([atk, hot, dot], 1, 8, 1, 0)).toBe(32);
  });
});

describe('statusBadgeStride', () => {
  it('adds 2px outline pad per side between icons', () => {
    expect(statusBadgeStride(1, 8, 1, 0)).toBe(12);
  });
});
