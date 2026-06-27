import { describe, expect, it } from 'vitest';
import { loadGameData } from '../battle/data/loadGameData.ts';
import { getClassSkillIds } from './skillUnlocks.ts';
import {
  expectIntAtLeast,
  expectPositive,
  expectUnlockTiersMatchGameData,
} from '../test/gameDataResilience.ts';
import {
  resolveIdleAtkRampMultiplier,
  resolveIdleAtkRampSeverity,
} from '../battle/idleAtkRamp.ts';
import { resolveTargetHpRatioDamageScale } from '../battle/targetHpRatioDamageScale.ts';
import {
  armNextOutgoingDamageCharge,
  consumeNextOutgoingDamageMultiplier,
  scheduleNextOutgoingDamageCharge,
} from '../battle/nextOutgoingDamage.ts';
import type { CombatantState } from '../battle/types.ts';

function mockBallista(id: string): CombatantState {
  return {
    id,
    name: id,
    hp: 100,
    maxHp: 100,
    barrierHp: 0,
    atk: 30,
    def: 5,
    reg: 0,
    isAlive: true,
    role: 'attacker',
    classId: 'at_ballista',
    formationRow: 'back',
    traits: { rangePx: 400, damageType: 'physical' },
    build: {
      learnedPassiveIds: [
        'at_ballista_passive_2',
        'at_ballista_passive_3',
      ],
      learnedActiveIds: [],
      equippedActiveSlots: [],
    },
    cooldowns: [],
    statusEffects: [],
    spriteKey: 'at_ballista',
    iconKey: 'at_ballista',
    isEnemy: false,
    battleX: 50,
    visualX: 50,
    corpseVisible: true,
  };
}

describe('at_ballista passive / active unlock structure', () => {
  const gameData = loadGameData();
  const ballistaClass = gameData.classRegistry['at_ballista'];
  const { passives, actives } = gameData.skillRegistry;

  it('loads class skills with expected roles', () => {
    for (const id of ballistaClass.passiveIds ?? []) {
      expect(passives[id]?.id).toBe(id);
    }
    for (const id of getClassSkillIds(ballistaClass.skills)) {
      expect(passives[id] ?? actives[id]).toBeDefined();
    }

    expect(passives['at_ballista_passive_1']?.targetRuleOverride).toEqual({
      kind: 'stat',
      side: 'enemy',
      stat: 'maxHp',
      order: 'highest',
    });

    const p2 = passives['at_ballista_passive_2'];
    expect(p2?.effect).toBe('idleAtkRamp');
    expect(p2?.rampToMaxSec).toBe(2.5);
    expect(p2?.atkMulMin).toBe(1.25);
    expect(p2?.atkMulMax).toBe(1.6);

    const p3 = passives['at_ballista_passive_3'];
    expect(p3?.effect).toBe('targetHpRatioDamageScale');
    expect(p3?.damageScaleMax).toBe(1.35);
    expect(p3?.minScaleAtHpRatio).toBe(0.35);

    const p4 = passives['at_ballista_passive_4'];
    expect(p4?.effect).toBe('ballistaMark');
    expect(p4?.ballistaMarkSplashDamageScale).toBe(0.3);

    const a1 = actives['at_ballista_active_1'];
    expect(a1?.useDurationSec).toBe(5);
    expect(a1?.effect[0]?.type).toBe('grantNextOutgoingDamage');

    const a2 = actives['at_ballista_active_2'];
    const a2Damage = a2?.effect[0];
    expect(a2Damage?.type).toBe('damage');
    if (a2Damage?.type === 'damage') {
      expectPositive(a2Damage.amount.atkScale);
    }

    const a3 = actives['at_ballista_active_3'];
    expect(a3?.firePolicy).toBe('smart');

    const a4 = actives['at_ballista_active_4'];
    expect(a4?.trigger?.kind).toBe('basicAttackCount');
    expectIntAtLeast(a4?.trigger?.value, 10);
    const a4Damage = a4?.effect[0];
    if (a4Damage?.type === 'damage') {
      expect(a4Damage.targetShape).toBe('pierce');
      expectIntAtLeast(a4Damage.range, 400);
    }
  });

  it('syncs member build with resolveLearnedSkills at each unlock tier', () => {
    expectUnlockTiersMatchGameData('at_ballista', gameData);
  });
});

describe('ballista combat helpers', () => {
  const gameData = loadGameData();
  const passives = gameData.skillRegistry.passives;

  it('idleAtkRamp severity interpolates with attackSpeed debuff', () => {
    const actor = mockBallista('b1');
    actor.statusEffects.push({
      id: 'slow',
      kind: 'debuff',
      stat: 'attackSpeed',
      multiplier: 0.7,
      durationSec: 8,
      remainingSec: 8,
    });
    expect(resolveIdleAtkRampSeverity(actor, 0.7)).toBeCloseTo(1, 5);

    actor.statusEffects = [];
    expect(resolveIdleAtkRampSeverity(actor, 0.7)).toBeCloseTo(0, 5);
    expect(resolveIdleAtkRampSeverity(actor, 0.7)).toBe(0);
  });

  it('idleAtkRamp multiplier grows with elapsed time', () => {
    const actor = mockBallista('b2');
    actor.idleAtkRampElapsedSec = 0;
    const atStart = resolveIdleAtkRampMultiplier(actor, passives);
    actor.idleAtkRampElapsedSec = 2.5;
    const atMax = resolveIdleAtkRampMultiplier(actor, passives);
    expect(atMax).toBeGreaterThan(atStart);
    expect(atMax).toBeCloseTo(1.25, 2);
  });

  it('targetHpRatioDamageScale is higher on high HP targets', () => {
    const attacker = mockBallista('b3');
    const highHp = mockBallista('e-high');
    highHp.isEnemy = true;
    highHp.hp = 100;
    const lowHp = mockBallista('e-low');
    lowHp.isEnemy = true;
    lowHp.hp = 20;
    const highMul = resolveTargetHpRatioDamageScale(highHp, passives, attacker);
    const lowMul = resolveTargetHpRatioDamageScale(lowHp, passives, attacker);
    expect(highMul).toBeGreaterThan(lowMul);
    expect(highMul).toBeCloseTo(1.35, 2);
    expect(lowMul).toBeCloseTo(1, 2);
  });

  it('nextOutgoingDamage charge arms and consumes once', () => {
    const actor = mockBallista('b4');
    scheduleNextOutgoingDamageCharge(actor, 1.3, 'at_ballista_active_1', false);
    expect(consumeNextOutgoingDamageMultiplier(actor)).toBe(1);
    armNextOutgoingDamageCharge(actor);
    expect(
      actor.statusEffects.find((effect) => effect.overlay === 'nextOutgoingDamage')
        ?.displayName,
    ).toBe('次与ダメ増加');
    expect(consumeNextOutgoingDamageMultiplier(actor)).toBe(1.3);
    expect(consumeNextOutgoingDamageMultiplier(actor)).toBe(1);
  });
});
