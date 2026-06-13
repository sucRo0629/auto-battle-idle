import { describe, expect, it } from 'vitest';
import { applyStunToTarget, isUnitStunned } from './ccEffects.ts';
import { shouldTickCooldown } from './skillTrigger.ts';
import type { ActiveSkillDef, CombatantState, SkillCooldown } from './types.ts';

function mockUnit(
  cooldowns: SkillCooldown[],
  overrides: Partial<CombatantState> = {},
): CombatantState {
  return {
    name: 'unit',
    id: 'unit',
    hp: 50,
    maxHp: 100,
    barrierHp: 0,
    atk: 20,
    def: 5,
    reg: 0,
    isAlive: true,
    role: 'attacker',
    classId: 'test',
    formationRow: 'front',
    traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { preset: 'slash' } },
    build: {
      learnedPassiveIds: [],
      learnedActiveIds: [],
      equippedActiveSlots: [],
    },
    cooldowns,
    statusEffects: [],
    spriteKey: 'placeholder',
    iconKey: 'placeholder',
    isEnemy: true,
    battleX: 200,
    visualX: 200,
    corpseVisible: true,
    ...overrides,
  };
}

const actives: Record<string, ActiveSkillDef> = {
  test_basic: {
    id: 'test_basic',
    name: 'test_basic',
    trigger: { kind: 'time', value: 2 },
    effect: [],
  },
  test_active: {
    id: 'test_active',
    name: 'test_active',
    trigger: { kind: 'time', value: 8 },
    effect: [],
  },
};

function tickStunStatus(unit: CombatantState, deltaTime: number): void {
  for (const effect of unit.statusEffects) {
    effect.remainingSec -= deltaTime;
  }
  unit.statusEffects = unit.statusEffects.filter(
    (effect) => effect.remainingSec > 0,
  );
}

function tickCooldownLikeEngine(
  unit: CombatantState,
  deltaTime: number,
  basicRate = 1,
): void {
  for (const cd of unit.cooldowns) {
    if (cd.remaining <= 0) continue;
    const skill = actives[cd.skillId];
    if (!skill || !shouldTickCooldown(skill, cd.slotKind)) continue;
    if (isUnitStunned(unit) && cd.slotKind === 'active') {
      continue;
    }
    const rate = cd.slotKind === 'active' ? 1 : basicRate;
    cd.remaining = Math.max(0, cd.remaining - deltaTime * rate);
  }
}

describe('stun cooldown side effects', () => {
  it('pauses time-trigger active cooldown while stunned', () => {
    const activeCd: SkillCooldown = {
      skillId: 'test_active',
      remaining: 8,
      slotKind: 'active',
      slotIndex: 0,
    };
    const basicCd: SkillCooldown = {
      skillId: 'test_basic',
      remaining: 2,
      slotKind: 'basic',
    };
    const unit = mockUnit([basicCd, activeCd]);

    applyStunToTarget(
      unit,
      2,
      { skillId: 'stun_test', sourceId: 'ally' },
      { actives },
    );

    tickStunStatus(unit, 0.5);
    tickCooldownLikeEngine(unit, 0.5);
    expect(activeCd.remaining).toBe(8);
    tickStunStatus(unit, 0.5);
    tickCooldownLikeEngine(unit, 0.5);
    expect(activeCd.remaining).toBe(8);
    expect(isUnitStunned(unit)).toBe(true);

    tickStunStatus(unit, 1);
    tickCooldownLikeEngine(unit, 1);
    expect(isUnitStunned(unit)).toBe(false);
    expect(activeCd.remaining).toBe(7);
  });

  it('ticks basic cooldown while stunned after stun reset', () => {
    const basicCd: SkillCooldown = {
      skillId: 'test_basic',
      remaining: 0,
      slotKind: 'basic',
    };
    const unit = mockUnit([basicCd]);

    applyStunToTarget(
      unit,
      2,
      { skillId: 'stun_test', sourceId: 'ally' },
      { actives },
    );
    expect(basicCd.remaining).toBe(2);

    tickCooldownLikeEngine(unit, 1);
    expect(basicCd.remaining).toBe(1);
  });
});
