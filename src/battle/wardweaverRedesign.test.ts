import { describe, expect, it } from 'vitest';
import { tryTriggerBarrierDepletionHeal } from './barrierDepletionHeal.ts';
import { applyBarrierToTarget, applyDamageToTarget } from './combatMath.ts';
import { loadGameData } from './data/loadGameData.ts';
import { evaluatePendingIncomingDamage } from './pendingIncomingDamage.ts';
import { shouldFireActiveSkill, type FireGateContext } from './skills/fireGate.ts';
import {
  applyWardBarrierToIncomingDamage,
  applyWardBarrierToTarget,
} from './wardBarrier.ts';
import type {
  CombatantState,
  PassiveSkillDef,
  PendingSkillHit,
} from './types.ts';

function mockUnit(
  partial: Partial<CombatantState> & { id: string },
): CombatantState {
  return {
    hp: partial.hp ?? 100,
    maxHp: partial.maxHp ?? 100,
    atk: partial.atk ?? 100,
    def: partial.def ?? 10,
    res: partial.res ?? 0,
    barrierHp: partial.barrierHp ?? 0,
    isAlive: partial.isAlive ?? true,
    isEnemy: partial.isEnemy ?? false,
    statusEffects: partial.statusEffects ?? [],
    classId: partial.classId ?? 'test',
    role: partial.role ?? 'supporter',
    formationRow: partial.formationRow ?? 'back',
    traits: partial.traits ?? { rangePx: 50, damageType: 'magic' },
    build: partial.build ?? { learnedPassiveIds: [], learnedActiveIds: [], equippedActiveSlots: [] },
    cooldowns: partial.cooldowns ?? [],
    spriteKey: partial.id,
    iconKey: partial.id,
    battleX: partial.battleX ?? 0,
    corpseVisible: true,
    ...partial,
  } as CombatantState;
}

describe('wardweaver redesign — barrier max merge', () => {
  it('does not apply a smaller grant without barrierStack', () => {
    const target = mockUnit({ id: 'ally', barrierHp: 80 });
    applyBarrierToTarget(target, 30);
    expect(target.barrierHp).toBe(80);
  });

  it('adds with barrierStack true', () => {
    const target = mockUnit({ id: 'ally', barrierHp: 80 });
    applyBarrierToTarget(target, 30, true);
    expect(target.barrierHp).toBe(110);
  });
});

describe('wardweaver redesign — wardBarrier', () => {
  it('reduces damage by ratio and consumes one stack', () => {
    const target = mockUnit({ id: 'ally' });
    applyWardBarrierToTarget(target, 2, 0.1, 'skill', 'src');
    const result = applyWardBarrierToIncomingDamage(target, 100);
    expect(result.damage).toBe(10);
    expect(target.statusEffects[0]?.stacks).toBe(1);
  });

  it('applies before barrierHp in damage pipeline', () => {
    const target = mockUnit({ id: 'ally', barrierHp: 50 });
    applyWardBarrierToTarget(target, 1, 0.1, 'skill', 'src');
    const ward = applyWardBarrierToIncomingDamage(target, 100);
    const damage = applyDamageToTarget(target, ward.damage);
    expect(damage.barrierDamage).toBe(10);
    expect(target.barrierHp).toBe(40);
  });
});

describe('wardweaver redesign — barrierDepletionHeal', () => {
  const passives: Record<string, PassiveSkillDef> = {
    sp_wardweaver_passive_2: {
      id: 'sp_wardweaver_passive_2',
      name: 'p2',
      effect: 'barrierDepletionHeal',
      healAmount: { kind: 'atkBased', atkScale: 0.65 },
    },
  };

  it('heals once per ally per wave when barrier is fully broken', () => {
    const wardweaver = mockUnit({
      id: 'abj',
      atk: 200,
      build: { learnedPassiveIds: ['sp_wardweaver_passive_2'], learnedActiveIds: [], equippedActiveSlots: [] },
    });
    const target = mockUnit({ id: 'guard', barrierHp: 40, hp: 50 });
    const before = target.barrierHp;
    applyDamageToTarget(target, before);
    const result = tryTriggerBarrierDepletionHeal(
      target,
      before,
      before,
      [wardweaver, target],
      passives,
    );
    expect(result.healed).toBe(50);
    expect(target.hp).toBe(100);
    expect(target.barrierDepletionHealUsed).toBe(true);
    target.hp = 50;
    const second = tryTriggerBarrierDepletionHeal(
      target,
      10,
      10,
      [wardweaver, target],
      passives,
    );
    expect(second.healed).toBe(0);
  });

  it('does not fire when only ward stacks are consumed', () => {
    const wardweaver = mockUnit({
      id: 'abj',
      atk: 200,
      build: { learnedPassiveIds: ['sp_wardweaver_passive_2'], learnedActiveIds: [], equippedActiveSlots: [] },
    });
    const target = mockUnit({ id: 'guard', barrierHp: 0 });
    applyWardBarrierToTarget(target, 2, 0.1, 'skill', 'src');
    applyWardBarrierToIncomingDamage(target, 100);
    const result = tryTriggerBarrierDepletionHeal(
      target,
      0,
      0,
      [wardweaver, target],
      passives,
    );
    expect(result.healed).toBe(0);
  });
});

describe('wardweaver redesign — pendingIncomingDamage fire gate', () => {
  const gameData = loadGameData();
  const skill = gameData.skillRegistry.actives['sp_wardweaver_active_4']!;

  function ctx(
    overrides: Partial<FireGateContext> & {
      allies?: CombatantState[];
      enemies?: CombatantState[];
      pendingHitQueue?: PendingSkillHit[];
    } = {},
  ): FireGateContext {
    const allies = overrides.allies ?? [mockUnit({ id: 'ally', hp: 80, maxHp: 100 })];
    const enemies = overrides.enemies ?? [
      mockUnit({ id: 'enemy', isEnemy: true, atk: 200, traits: { rangePx: 50, damageType: 'physical' } }),
    ];
    return {
      actor: allies[0]!,
      allies,
      enemies,
      skill,
      passives: [],
      gameData,
      battleTimeSec: 0,
      isWaveStartPhase: false,
      isWaveEndPhase: false,
      pendingHitQueue: overrides.pendingHitQueue ?? [],
      ...overrides,
    };
  }

  it('fires when pending queue has lethal-looking damage', () => {
    const allies = [mockUnit({ id: 'ally', hp: 100, maxHp: 100, def: 0 })];
    const enemies = [
      mockUnit({
        id: 'enemy',
        isEnemy: true,
        atk: 500,
        traits: { rangePx: 50, damageType: 'physical' },
      }),
    ];
    const pending: PendingSkillHit[] = [
      {
        applyAtBattleSec: 2,
        actorId: 'enemy',
        skillId: 'enemy_basic',
        skillName: 'hit',
        effectDef: {
          type: 'damage',
          target: { kind: 'distance', side: 'enemy', order: 'nearest' },
          amount: { kind: 'atkBased', atkScale: 1 },
          damageType: 'physical',
        },
        effectIndex: 0,
        slotKind: 'basic',
        hitIndex: 0,
        targets: [{ targetId: 'ally' }],
      },
    ];
    expect(
      evaluatePendingIncomingDamage(
        allies,
        enemies,
        pending,
        0,
        0.25,
        4,
        gameData.skillRegistry.passives,
      ),
    ).toBe(true);
    expect(shouldFireActiveSkill(ctx({ allies, enemies, pendingHitQueue: pending }))).toBe(
      true,
    );
  });

  it('does not fire from pending alone when damage is small', () => {
    const allies = [mockUnit({ id: 'ally', hp: 100, maxHp: 100, def: 50 })];
    const enemies = [
      mockUnit({
        id: 'enemy',
        isEnemy: true,
        atk: 10,
        traits: { rangePx: 50, damageType: 'physical' },
      }),
    ];
    const pending: PendingSkillHit[] = [
      {
        applyAtBattleSec: 1,
        actorId: 'enemy',
        skillId: 'enemy_basic',
        skillName: 'hit',
        effectDef: {
          type: 'damage',
          target: { kind: 'distance', side: 'enemy', order: 'nearest' },
          amount: { kind: 'flat', flatAmount: 5 },
          damageType: 'physical',
        },
        effectIndex: 0,
        slotKind: 'basic',
        hitIndex: 0,
        targets: [{ targetId: 'ally' }],
      },
    ];
    expect(shouldFireActiveSkill(ctx({ allies, enemies, pendingHitQueue: pending }))).toBe(
      false,
    );
  });

  it('falls back to targetHp with fireConditionMatch any', () => {
    const lowHpAlly = mockUnit({ id: 'ally', hp: 40, maxHp: 100 });
    expect(
      shouldFireActiveSkill(
        ctx({
          allies: [lowHpAlly],
          enemies: [mockUnit({ id: 'enemy', isEnemy: true })],
          pendingHitQueue: [],
        }),
      ),
    ).toBe(true);
  });
});

describe('wardweaver redesign — triple ward refresh', () => {
  it('refreshes stacks on reapply without stacking duplicate wards', () => {
    const target = mockUnit({ id: 'ally' });
    applyWardBarrierToTarget(target, 2, 0.1, 'sp_wardweaver_active_4', 'abj');
    applyWardBarrierToIncomingDamage(target, 50);
    expect(target.statusEffects.filter((e) => e.overlay === 'wardBarrier')).toHaveLength(1);
    expect(target.statusEffects[0]?.stacks).toBe(1);
    applyWardBarrierToTarget(target, 2, 0.1, 'sp_wardweaver_active_4', 'abj');
    expect(target.statusEffects.filter((e) => e.overlay === 'wardBarrier')).toHaveLength(1);
    expect(target.statusEffects[0]?.stacks).toBe(2);
  });
});
