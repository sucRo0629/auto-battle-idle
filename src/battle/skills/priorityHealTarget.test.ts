import { describe, expect, it } from 'vitest';
import { resolvePriorityHealTarget } from './targeting.ts';
import { mockUnit } from './targeting.fixtures.ts';

describe('resolvePriorityHealTarget', () => {
  it('returns null when every ally is full HP', () => {
    const healthy = mockUnit('a', 200);
    expect(resolvePriorityHealTarget([healthy])).toBeNull();
  });

  it('picks most damaged ally by hp ratio', () => {
    const low = mockUnit('low', 180, { hp: 20, maxHp: 100 });
    const mid = mockUnit('mid', 200, { hp: 60, maxHp: 100 });
    expect(resolvePriorityHealTarget([low, mid])?.id).toBe('low');
  });

  it('breaks hp ratio ties by lower effectiveMaxHp', () => {
    const small = mockUnit('small', 180, { hp: 50, maxHp: 100 });
    const large = mockUnit('large', 200, { hp: 100, maxHp: 200 });
    expect(resolvePriorityHealTarget([small, large])?.id).toBe('small');
  });

  it('breaks hp ratio and maxHp ties by id lexicographic order', () => {
    const beta = mockUnit('beta', 180, { hp: 50, maxHp: 100 });
    const alpha = mockUnit('alpha', 200, { hp: 50, maxHp: 100 });
    expect(resolvePriorityHealTarget([beta, alpha])?.id).toBe('alpha');
  });
});
