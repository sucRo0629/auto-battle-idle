import { describe, expect, it } from 'vitest';
import type { CombatantState } from '../types.ts';
import { mockUnit } from '../testFixtures.ts';
import { battleDistance, isWithinSkillRange, resolveSkillRangePx } from './rangeUtils.ts';

function mockActor(rangePx: number): CombatantState {
  return mockUnit('ally', 0, { rangePx, formationRow: 'front' });
}

describe('battleDistance / isWithinSkillRange', () => {
  it('measures ally-to-enemy distance', () => {
    const ally = mockUnit('ally', 200);
    const enemy = mockUnit('e1', 100, { isEnemy: true });
    expect(battleDistance(ally, enemy)).toBe(100);
    expect(isWithinSkillRange(ally, enemy, 120)).toBe(true);
    expect(isWithinSkillRange(ally, enemy, 80)).toBe(false);
  });
});

describe('resolveSkillRangePx', () => {
  it('uses effect range when set', () => {
    const actor = mockActor(40);
    expect(resolveSkillRangePx(actor, { range: 120 })).toBe(120);
  });

  it('falls back to actor traits.rangePx when omitted', () => {
    const actor = mockActor(40);
    expect(resolveSkillRangePx(actor, {})).toBe(40);
  });

  it('extends ally-targeted heal range to party formation depth', () => {
    const actor = mockActor(90);
    expect(
      resolveSkillRangePx(
        actor,
        {
          type: 'heal',
          target: { kind: 'stat', side: 'ally', stat: 'hp', order: 'ratio' },
        },
        4,
      ),
    ).toBe(96);
  });

  it('extends ally-targeted buff range to party formation depth', () => {
    const actor = mockActor(90);
    expect(
      resolveSkillRangePx(
        actor,
        {
          type: 'buff',
          target: {
            kind: 'distance',
            side: 'ally',
            order: 'selfOrigin',
          },
        },
        4,
      ),
    ).toBe(96);
  });
});
