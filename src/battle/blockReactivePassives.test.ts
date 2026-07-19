import { describe, expect, it } from 'vitest';
import { applyHealOnBlock, applyKnockbackOnBlock } from './blockReactivePassives.ts';
import type { CombatantState, PassiveSkillDef } from './types.ts';

function unit(
  partial: Partial<CombatantState> & Pick<CombatantState, 'id'>,
): CombatantState {
  return {
    id: partial.id,
    classId: partial.classId ?? 'test',
    name: partial.name ?? partial.id,
    isEnemy: partial.isEnemy ?? false,
    isAlive: partial.isAlive ?? true,
    corpseVisible: partial.corpseVisible ?? false,
    hp: partial.hp ?? 100,
    maxHp: partial.maxHp ?? 100,
    barrierHp: partial.barrierHp ?? 0,
    atk: partial.atk ?? 100,
    def: partial.def ?? 50,
    res: partial.res ?? 0,
    battleX: partial.battleX ?? 0,
    role: partial.role ?? 'defender',
    formationRow: partial.formationRow ?? 'front',
    traits: partial.traits ?? {
      rangePx: 80,
      damageType: 'physical',
      basicAttackVfx: { enabled: true },
    },
    build: partial.build ?? {
      learnedPassiveIds: [],
      learnedActiveIds: [],
      equippedActiveSlots: [],
    },
    statusEffects: partial.statusEffects ?? [],
    cooldowns: partial.cooldowns ?? [],
    spriteKey: partial.spriteKey ?? 'placeholder',
    iconKey: partial.iconKey ?? 'placeholder',
  };
}

describe('blockReactivePassives', () => {
  it('heals defender on block without overflow', () => {
    const defender = unit({
      id: 'guardian',
      hp: 85,
      build: {
        learnedPassiveIds: ['heal'],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const passives = {
      heal: {
        id: 'heal',
        name: '戦線維持',
        effect: 'healOnBlock',
        healOnBlockAmount: { kind: 'flat', flatAmount: 10 },
      } satisfies PassiveSkillDef,
    };

    expect(applyHealOnBlock(defender, passives)).toBe(10);
    expect(defender.hp).toBe(95);
  });

  it('knocks back nearby hostiles on block', () => {
    const defender = unit({
      id: 'guardian',
      build: {
        learnedPassiveIds: ['knockback'],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const nearEnemy = unit({ id: 'near', isEnemy: true, battleX: 40 });
    const farEnemy = unit({ id: 'far', isEnemy: true, battleX: 120 });
    const passives = {
      knockback: {
        id: 'knockback',
        name: '城塞の構え',
        effect: 'knockbackOnBlock',
        knockbackOnBlockRadiusPx: 50,
        knockbackOnBlockDistancePx: 50,
      } satisfies PassiveSkillDef,
    };

    const moved = applyKnockbackOnBlock(
      defender,
      [nearEnemy, farEnemy],
      passives,
    );

    expect(moved.map((entry) => entry.id)).toEqual(['near']);
    expect(nearEnemy.battleX).toBe(90);
    expect(farEnemy.battleX).toBe(120);
  });
});
