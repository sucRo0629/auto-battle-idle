import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ActiveSkillDef, BattleEvent, GameData, PendingSkillHit } from './types.ts';
import * as combatMath from './combatMath.ts';
import { SkillExecutor } from './skills/SkillExecutor.ts';
import { SkillSequenceRunner } from './skills/skillSequence.ts';
import { mockCombatant } from './testFixtures.ts';

const damageEffect = {
  type: 'damage' as const,
  damageType: 'physical' as const,
  target: { kind: 'distance' as const, side: 'enemy' as const, order: 'nearest' as const },
  amount: { kind: 'atkBased' as const, atkScale: 1 },
};

const basicSkill: ActiveSkillDef = {
  id: 'test_basic',
  name: 'Test Basic',
  trigger: { kind: 'time', value: 1 },
  effect: [damageEffect],
};

const pierceSkill: ActiveSkillDef = {
  id: 'test_pierce',
  name: 'Test Pierce',
  trigger: { kind: 'time', value: 1 },
  effect: [
    {
      ...damageEffect,
      pierceBlock: true,
      pierceWard: true,
      pierceBarrier: true,
      ignoreDamageTakenReduction: true,
    },
  ],
};

function makeGameData(actives: Record<string, ActiveSkillDef>): GameData {
  return {
    skillRegistry: { actives, passives: {} },
  } as unknown as GameData;
}

function evasionBuff() {
  return {
    id: 'evasion_buff',
    kind: 'buff' as const,
    overlay: 'evasion' as const,
    evasionChance: 1,
    durationSec: 5,
    remainingSec: 5,
  };
}

function createExecutor(
  gameData: GameData,
  units: ReturnType<typeof mockCombatant>[],
  onEvent: (event: BattleEvent) => void = () => {},
): SkillExecutor {
  const runner = new SkillSequenceRunner();
  return new SkillExecutor(gameData, onEvent, {
    getBattleTimeSec: () => 0,
    enqueuePendingHits: () => {},
    getAllCombatants: () => units,
    getSequenceRunner: () => runner,
  });
}

function pendingHit(
  actorId: string,
  skill: ActiveSkillDef,
  targetId: string,
  slotKind: 'basic' | 'active' = 'basic',
): PendingSkillHit {
  return {
    applyAtBattleSec: 0,
    actorId,
    skillId: skill.id,
    skillName: skill.name,
    effectDef: skill.effect[0]!,
    effectIndex: 0,
    slotKind,
    hitIndex: 0,
    targets: [{ targetId }],
  };
}

describe('evasion damage pipeline', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('skips resolveDamage and damage application on evasion success', () => {
    const resolveSpy = vi.spyOn(combatMath, 'resolveDamage');
    const gameData = makeGameData({ test_basic: basicSkill });
    const actor = mockCombatant({ id: 'attacker', atk: 50, battleX: 100 });
    const enemy = mockCombatant({
      id: 'enemy',
      isEnemy: true,
      battleX: 120,
      hp: 100,
      def: 0,
      statusEffects: [evasionBuff()],
    });
    const events: BattleEvent[] = [];
    const executor = createExecutor(gameData, [actor, enemy], (event) => {
      events.push(event);
    });

    const applied = executor.applyPendingHit(
      pendingHit(actor.id, basicSkill, enemy.id),
    );

    expect(applied).toBe(false);
    expect(resolveSpy).not.toHaveBeenCalled();
    expect(events).toEqual([{ type: 'evade', targetId: enemy.id }]);
    expect(enemy.hp).toBe(100);
  });

  it('still rolls evasion when pierce flags are all on', () => {
    const resolveSpy = vi.spyOn(combatMath, 'resolveDamage');
    const gameData = makeGameData({ test_pierce: pierceSkill });
    const actor = mockCombatant({ id: 'attacker', atk: 50, battleX: 100 });
    const enemy = mockCombatant({
      id: 'enemy',
      isEnemy: true,
      battleX: 120,
      hp: 100,
      def: 0,
      statusEffects: [evasionBuff()],
    });
    const executor = createExecutor(gameData, [actor, enemy]);

    const applied = executor.applyPendingHit(
      pendingHit(actor.id, pierceSkill, enemy.id),
    );

    expect(applied).toBe(false);
    expect(resolveSpy).not.toHaveBeenCalled();
    expect(enemy.hp).toBe(100);
  });

  it('does not charge basicAttackCount on evasion', () => {
    const gameData = makeGameData({ test_basic: basicSkill });
    const actor = mockCombatant({
      id: 'attacker',
      atk: 50,
      battleX: 100,
      cooldowns: [
        { skillId: 'count_burst', remaining: 2, slotKind: 'active', slotIndex: 0 },
      ],
    });
    const enemy = mockCombatant({
      id: 'enemy',
      isEnemy: true,
      battleX: 120,
      hp: 100,
      def: 0,
      statusEffects: [evasionBuff()],
    });
    gameData.skillRegistry.actives.count_burst = {
      id: 'count_burst',
      name: 'Count Burst',
      trigger: { kind: 'basicAttackCount', value: 3 },
      effect: [damageEffect],
    };
    const executor = createExecutor(gameData, [actor, enemy]);

    executor.applyPendingHit(pendingHit(actor.id, basicSkill, enemy.id, 'basic'));

    const countCd = actor.cooldowns.find((cd) => cd.skillId === 'count_burst');
    expect(countCd?.remaining).toBe(2);
  });

  it('applies damage when evasion fails', () => {
    const resolveSpy = vi.spyOn(combatMath, 'resolveDamage');
    const gameData = makeGameData({ test_basic: basicSkill });
    const actor = mockCombatant({ id: 'attacker', atk: 50, battleX: 100 });
    const enemy = mockCombatant({
      id: 'enemy',
      isEnemy: true,
      battleX: 120,
      hp: 100,
      def: 0,
    });
    const events: BattleEvent[] = [];
    const executor = createExecutor(gameData, [actor, enemy], (event) => {
      events.push(event);
    });

    const applied = executor.applyPendingHit(
      pendingHit(actor.id, basicSkill, enemy.id),
    );

    expect(applied).toBe(true);
    expect(resolveSpy).toHaveBeenCalledTimes(1);
    expect(events.some((event) => event.type === 'evade')).toBe(false);
    expect(events.some((event) => event.type === 'hurt')).toBe(true);
    expect(enemy.hp).toBeLessThan(100);
  });
});
