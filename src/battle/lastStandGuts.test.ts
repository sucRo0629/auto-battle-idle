import { describe, expect, it } from 'vitest';
import type { CombatantState, PassiveSkillDef } from './types.ts';
import {
  applyLastStandGutsHpFloor,
  isLastStandGutsActive,
  tryLastStandGuts,
} from './lastStandGuts.ts';

function mockUnit(
  overrides: Partial<CombatantState> & { id: string },
): CombatantState {
  return {
    name: overrides.id,
    hp: 20,
    maxHp: 100,
    barrierHp: 0,
    atk: 10,
    def: 5,
    res: 0,
    isAlive: true,
    role: 'defender',
    classId: 'df_duelist',
    formationRow: 'front',
    traits: { rangePx: 30, damageType: 'physical', basicAttackVfx: { enabled: true } },
    build: {
      learnedPassiveIds: ['df_duelist_passive_4'],
      learnedActiveIds: [],
      equippedActiveSlots: [],
    },
    cooldowns: [],
    statusEffects: [],
    spriteKey: 'df_duelist',
    iconKey: 'df_duelist',
    isEnemy: false,
    battleX: 0,
    corpseVisible: true,
    ...overrides,
  };
}

const passives: Record<string, PassiveSkillDef> = {
  guts: {
    id: 'df_duelist_passive_4',
    name: '不屈の闘士',
    effect: 'lastStandGuts',
  },
};

describe('lastStandGuts', () => {
  it('negates lethal damage once per wave and keeps HP at least 1', () => {
    const unit = mockUnit({ id: 'd1', hp: 10 });
    const result = tryLastStandGuts(unit, 50, {
      df_duelist_passive_4: passives.guts!,
    });
    expect(result.negated).toBe(true);
    expect(unit.hp).toBeGreaterThanOrEqual(1);
    expect(isLastStandGutsActive(unit)).toBe(true);
    expect(unit.lastStandGutsUsed).toBe(true);
  });

  it('caps damage to HP floor while active', () => {
    const unit = mockUnit({
      id: 'd2',
      hp: 5,
      statusEffects: [
        {
          id: 'guts',
          kind: 'buff',
          overlay: 'lastStandGuts',
          multiplier: 1,
          durationSec: 4,
          remainingSec: 4,
          sourceId: 'd2',
        },
      ],
    });
    expect(applyLastStandGutsHpFloor(unit, 10)).toBe(4);
  });

  it('does not trigger twice in same wave', () => {
    const unit = mockUnit({ id: 'd3', hp: 5, lastStandGutsUsed: true });
    const result = tryLastStandGuts(unit, 50, {
      df_duelist_passive_4: passives.guts!,
    });
    expect(result.negated).toBe(false);
  });
});
