import { describe, expect, it } from 'vitest';
import {
  isBarrierFullyBroken,
  tryTriggerBarrierBreakRegen,
} from './barrierBreakRegen.ts';
import { applyDamageToTarget } from './combatMath.ts';
import type { CombatantState, PassiveSkillDef } from './types.ts';

function mockUnit(
  partial: Partial<CombatantState> & Pick<CombatantState, 'id'>,
): CombatantState {
  return {
    id: partial.id,
    name: partial.name ?? partial.id,
    classId: partial.classId ?? 'df_guardian',
    isEnemy: partial.isEnemy ?? false,
    isAlive: partial.isAlive ?? true,
    hp: partial.hp ?? 100,
    maxHp: partial.maxHp ?? 100,
    barrierHp: partial.barrierHp ?? 0,
    atk: partial.atk ?? 100,
    def: partial.def ?? 50,
    res: partial.res ?? 0,
    traits: partial.traits ?? { rangePx: 50 },
    statusEffects: partial.statusEffects ?? [],
    cooldowns: partial.cooldowns ?? [],
    build: partial.build ?? { learnedPassiveIds: [], learnedActiveIds: [] },
    barrierBreakRegenUsed: partial.barrierBreakRegenUsed,
  } as CombatantState;
}

const passive: PassiveSkillDef = {
  id: 'sp_wardweaver_passive_4',
  name: '結界再編',
  effect: 'barrierBreakRegen',
  barrierAmount: { kind: 'atkBased', atkScale: 0.85 },
};

const passives: Record<string, PassiveSkillDef> = {
  sp_wardweaver_passive_4: passive,
};

describe('barrierBreakRegen', () => {
  it('detects full barrier break', () => {
    const target = mockUnit({ id: 't', barrierHp: 0 });
    expect(isBarrierFullyBroken(50, target, 50)).toBe(true);
    expect(isBarrierFullyBroken(50, target, 0)).toBe(false);
    expect(isBarrierFullyBroken(0, target, 10)).toBe(false);
  });

  it('grants barrier once when ally barrier is fully broken', () => {
    const wardweaver = mockUnit({
      id: 'wardweaver',
      atk: 200,
      build: { learnedPassiveIds: ['sp_wardweaver_passive_4'], learnedActiveIds: [] },
    });
    const target = mockUnit({ id: 'guardian', barrierHp: 80, hp: 100 });
    const barrierHpBefore = target.barrierHp;

    applyDamageToTarget(target, 80);
    const result = tryTriggerBarrierBreakRegen(
      target,
      barrierHpBefore,
      80,
      [wardweaver, target],
      passives,
    );

    expect(result.granted).toBe(Math.floor(200 * 0.85));
    expect(target.barrierHp).toBe(Math.floor(200 * 0.85));
    expect(target.barrierBreakRegenUsed).toBe(true);
  });

  it('does not retrigger for the same unit', () => {
    const wardweaver = mockUnit({
      id: 'wardweaver',
      atk: 200,
      build: { learnedPassiveIds: ['sp_wardweaver_passive_4'], learnedActiveIds: [] },
    });
    const target = mockUnit({
      id: 'guardian',
      barrierHp: 30,
      barrierBreakRegenUsed: true,
    });
    const barrierHpBefore = target.barrierHp;

    applyDamageToTarget(target, 30);
    const result = tryTriggerBarrierBreakRegen(
      target,
      barrierHpBefore,
      30,
      [wardweaver, target],
      passives,
    );

    expect(result.granted).toBe(0);
    expect(target.barrierHp).toBe(0);
  });

  it('does not trigger when barrier is only partially depleted', () => {
    const wardweaver = mockUnit({
      id: 'wardweaver',
      atk: 200,
      build: { learnedPassiveIds: ['sp_wardweaver_passive_4'], learnedActiveIds: [] },
    });
    const target = mockUnit({ id: 'guardian', barrierHp: 100, hp: 100 });
    const barrierHpBefore = target.barrierHp;

    applyDamageToTarget(target, 40);
    const result = tryTriggerBarrierBreakRegen(
      target,
      barrierHpBefore,
      40,
      [wardweaver, target],
      passives,
    );

    expect(result.granted).toBe(0);
    expect(target.barrierHp).toBe(60);
  });

  it('ignores enemy units as targets', () => {
    const wardweaver = mockUnit({
      id: 'wardweaver',
      atk: 200,
      build: { learnedPassiveIds: ['sp_wardweaver_passive_4'], learnedActiveIds: [] },
    });
    const enemy = mockUnit({
      id: 'enemy',
      isEnemy: true,
      barrierHp: 50,
    });
    const barrierHpBefore = enemy.barrierHp;

    applyDamageToTarget(enemy, 50);
    const result = tryTriggerBarrierBreakRegen(
      enemy,
      barrierHpBefore,
      50,
      [wardweaver, enemy],
      passives,
    );

    expect(result.granted).toBe(0);
  });
});
