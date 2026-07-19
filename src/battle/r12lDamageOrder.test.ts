import { describe, expect, it, vi } from 'vitest';
import { resolveDamage } from './combatMath.ts';
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
    def: partial.def ?? 0,
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

describe('R12l physical hit damage order', () => {
  it('applies phys +5% to subtotal including ignoredDef bonus, then damageTaken', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const attacker = unit({
      id: 'swordsman',
      atk: 100,
      build: {
        learnedPassiveIds: ['ignore', 'bonus', 'physUp'],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const target = unit({
      id: 'tank',
      isEnemy: true,
      def: 100,
      statusEffects: [
        {
          id: 'dr',
          kind: 'debuff',
          stat: 'damageTaken',
          multiplier: 0.5,
          durationSec: 10,
          remainingSec: 10,
        },
      ],
    });
    const passives: Record<string, PassiveSkillDef> = {
      ignore: {
        id: 'ignore',
        name: '防御力無視率増加',
        effect: 'defenseIgnore',
        defenseIgnore: { def: { mode: 'percent', amount: 0.5 } },
      },
      bonus: {
        id: 'bonus',
        name: '剛剣の冴え',
        effect: 'ignoredDefBonusDamage',
        ignoredDefBonusScale: 0.5,
      },
      physUp: {
        id: 'physUp',
        name: '物理ダメージ増加',
        effect: 'outgoingHitDamageIncrease',
        outgoingHitDamageIncrease: 0.05,
        outgoingHitDamageType: 'physical',
      },
    };

    const damage = resolveDamage(
      attacker,
      target,
      {
        type: 'damage',
        target: { kind: 'distance', side: 'enemy', order: 'nearest' },
        damageType: 'physical',
        amount: { kind: 'flat', flatAmount: 100 },
      },
      passives,
      { passiveContext: { isHitDamage: true } },
    );

    // effectiveDef = 100 * 0.5 = 50
    // afterDefense = floor((100-50)*100/(100+50)) = 33
    // ignoredDef bonus = floor(50 * 0.5) = 25
    // subtotal = 58
    // hit mul 1.05 → floor(58*1.05)=60
    // damageTaken 0.5 → floor(60*0.5)=30, max(1,30)=30
    expect(damage).toBe(30);
    vi.restoreAllMocks();
  });
});
