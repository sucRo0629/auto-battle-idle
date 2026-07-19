import { describe, expect, it } from 'vitest';
import {
  applyEmberIgnitionOnCombatModuleHit,
  clearAllEmberIgnition,
  clearEmberIgnition,
  getEmberIgnitionStacks,
  shouldGrantEmberOnCombatModuleHit,
} from './emberIgnition.ts';
import type { CombatantState, PassiveSkillDef, StatusEffect } from './types.ts';

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
      damageType: 'magic',
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

/** BattleEngine.tickStatusEffects の非時間制スキップと同等の簡易 tick */
function tickStatusesLikeBattleEngine(
  units: CombatantState[],
  deltaTime: number,
): void {
  for (const unit of units) {
    const kept: StatusEffect[] = [];
    for (const effect of unit.statusEffects) {
      if (
        effect.overlay === 'emberIgnition' ||
        !Number.isFinite(effect.durationSec) ||
        !Number.isFinite(effect.remainingSec)
      ) {
        kept.push(effect);
        continue;
      }
      effect.remainingSec -= deltaTime;
      if (effect.remainingSec > 0) kept.push(effect);
    }
    unit.statusEffects = kept;
  }
}

describe('emberIgnition', () => {
  const emberPassive: PassiveSkillDef = {
    id: 'ember',
    name: '猛火の術',
    effect: 'emberIgnition',
    emberIgnitionThreshold: 5,
    emberIgnitionAtkScale: 1,
  };

  it('adds one stack per module hit until threshold', () => {
    const actor = unit({
      id: 'actor',
      build: {
        learnedPassiveIds: ['ember'],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const target = unit({ id: 'target', isEnemy: true });
    const passives = { ember: emberPassive };

    const first = applyEmberIgnitionOnCombatModuleHit(actor, target, passives);
    const second = applyEmberIgnitionOnCombatModuleHit(actor, target, passives);

    expect(first.ignited).toBe(false);
    expect(second.ignited).toBe(false);
    expect(getEmberIgnitionStacks(target)).toBe(2);
  });

  it('does not expire after long ticks (timeless, not finite seconds)', () => {
    const actor = unit({
      id: 'actor',
      build: {
        learnedPassiveIds: ['ember'],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const target = unit({ id: 'target', isEnemy: true });
    applyEmberIgnitionOnCombatModuleHit(actor, target, { ember: emberPassive });
    const effect = target.statusEffects.find((e) => e.overlay === 'emberIgnition');
    expect(effect?.remainingSec).toBe(Number.POSITIVE_INFINITY);
    expect(Number.isFinite(effect?.remainingSec ?? 0)).toBe(false);

    tickStatusesLikeBattleEngine([target], 999_999);
    expect(getEmberIgnitionStacks(target)).toBe(1);
    expect(
      target.statusEffects.find((e) => e.overlay === 'emberIgnition')?.remainingSec,
    ).toBe(Number.POSITIVE_INFINITY);
  });

  it('clears on ignition, death clear, and wave-end clearAll', () => {
    const actor = unit({
      id: 'actor',
      atk: 50,
      build: {
        learnedPassiveIds: ['ember'],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const target = unit({ id: 'target', isEnemy: true, hp: 500, maxHp: 500 });
    const passives = { ember: emberPassive };

    for (let i = 0; i < 4; i++) {
      applyEmberIgnitionOnCombatModuleHit(actor, target, passives);
    }
    expect(getEmberIgnitionStacks(target)).toBe(4);

    const ignition = applyEmberIgnitionOnCombatModuleHit(actor, target, passives);
    expect(ignition.ignited).toBe(true);
    expect(getEmberIgnitionStacks(target)).toBe(0);

    applyEmberIgnitionOnCombatModuleHit(actor, target, passives);
    expect(getEmberIgnitionStacks(target)).toBe(1);
    clearEmberIgnition(target);
    expect(getEmberIgnitionStacks(target)).toBe(0);

    applyEmberIgnitionOnCombatModuleHit(actor, target, passives);
    clearAllEmberIgnition([actor, target]);
    expect(getEmberIgnitionStacks(target)).toBe(0);
  });

  it('ignites at reduced threshold with 爆炎×魔法ダメ = 1.575', () => {
    const actor = unit({
      id: 'actor',
      atk: 100,
      build: {
        learnedPassiveIds: ['ember', 'threshold', 'bonus', 'magicUp'],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const target = unit({ id: 'target', isEnemy: true, hp: 300, maxHp: 300, res: 0 });
    const passives = {
      ember: emberPassive,
      threshold: {
        id: 'threshold',
        name: '火勢',
        effect: 'ignitionThresholdReduction',
        ignitionThresholdReduction: 1,
      } satisfies PassiveSkillDef,
      bonus: {
        id: 'bonus',
        name: '爆炎',
        effect: 'ignitionDamageBonus',
        ignitionDamageBonusScale: 1.5,
      } satisfies PassiveSkillDef,
      magicUp: {
        id: 'magicUp',
        name: '魔法ダメージ増加',
        effect: 'outgoingHitDamageIncrease',
        outgoingHitDamageIncrease: 0.05,
        outgoingHitDamageType: 'magic',
      } satisfies PassiveSkillDef,
    };

    for (let i = 0; i < 3; i++) {
      applyEmberIgnitionOnCombatModuleHit(actor, target, passives);
    }
    const ignition = applyEmberIgnitionOnCombatModuleHit(actor, target, passives);

    expect(ignition.ignited).toBe(true);
    expect(ignition.consumedStacks).toBe(4);
    // floor(100 * 1.0 * 1.5) = 150, then hit mul 1.05 → floor(150*1.05)=157 with RES 0
    expect(ignition.resolvedDamage).toBe(157);
    expect(getEmberIgnitionStacks(target)).toBe(0);
  });

  it('grants only on hostile CombatModule basic hits', () => {
    expect(
      shouldGrantEmberOnCombatModuleHit({
        actorIsEnemy: false,
        targetIsEnemy: true,
        slotKind: 'basic',
        isCombatModuleSkill: true,
        targetAlive: true,
      }),
    ).toBe(true);
    expect(
      shouldGrantEmberOnCombatModuleHit({
        actorIsEnemy: true,
        targetIsEnemy: false,
        slotKind: 'basic',
        isCombatModuleSkill: true,
        targetAlive: true,
      }),
    ).toBe(true);
    expect(
      shouldGrantEmberOnCombatModuleHit({
        actorIsEnemy: false,
        targetIsEnemy: false,
        slotKind: 'basic',
        isCombatModuleSkill: true,
        targetAlive: true,
      }),
    ).toBe(false);
    expect(
      shouldGrantEmberOnCombatModuleHit({
        actorIsEnemy: false,
        targetIsEnemy: true,
        slotKind: 'active',
        isCombatModuleSkill: true,
        targetAlive: true,
      }),
    ).toBe(false);
    expect(
      shouldGrantEmberOnCombatModuleHit({
        actorIsEnemy: false,
        targetIsEnemy: true,
        slotKind: 'basic',
        isCombatModuleSkill: false,
        targetAlive: true,
      }),
    ).toBe(false);
  });
});
