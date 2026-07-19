import { describe, expect, it, vi } from 'vitest';
import { getPassiveDefenseIgnoreSpec } from './defenseIgnore.ts';
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
    role: partial.role ?? 'attacker',
    formationRow: partial.formationRow ?? 'front',
    traits: partial.traits ?? {
      rangePx: 100,
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

describe('getPassiveDefenseIgnoreSpec', () => {
  it('collects defenseIgnore from targetRuleOverride passives', () => {
    const attacker = unit({
      id: 'attacker',
      build: {
        learnedPassiveIds: ['focus'],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const target = unit({ id: 'target', isEnemy: true, def: 100 });
    const passives = {
      focus: {
        id: 'focus',
        name: '重装狙い',
        effect: 'targetRuleOverride',
        targetRuleOverride: {
          kind: 'stat',
          side: 'enemy',
          stat: 'def',
          order: 'highest',
        },
        targetRuleOverrideApplyTo: 'enemy',
        defenseIgnore: {
          def: {
            mode: 'percent',
            amount: 0.1,
          },
        },
      } satisfies PassiveSkillDef,
    };

    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(getPassiveDefenseIgnoreSpec(attacker, target, passives)).toEqual({
      def: {
        mode: 'percent',
        amount: 0.1,
      },
    });
    vi.restoreAllMocks();
  });
});
