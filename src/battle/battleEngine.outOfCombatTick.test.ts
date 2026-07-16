import { describe, expect, it } from 'vitest';
import { BattleEngine } from './BattleEngine.ts';
import { loadGameData } from './data/loadGameData.ts';
import { loadLevelCurves } from '../progression/levelGrowth.ts';
import levelCurvesJson from '../../data/levelCurves.json';
import { createDefaultSave } from '../progression/victoryRewards.ts';
import { createMemberFromClass } from '../progression/partyCompose.ts';
import type { CombatantState } from './types.ts';
import { SkillSequenceRunner } from './skills/skillSequence.ts';

function createEngine(options?: { replaceRangerWithLancer?: boolean }) {
  const gameData = loadGameData();
  const levelCurves = loadLevelCurves(levelCurvesJson);
  const save = createDefaultSave(gameData, 'demo');
  if (options?.replaceRangerWithLancer) {
    const lancer = createMemberFromClass('at_lancer', gameData);
    save.party = save.party.map((member) => {
      if (!member || member.classId !== 'at_ranger') return member;
      return {
        ...lancer,
        progress: { ...member.progress },
      };
    });
  }
  const engine = new BattleEngine(
    gameData,
    levelCurves,
    () => save.party,
    () => save.stageProgress.currentStageId,
  );
  engine.startBattle();
  return engine;
}

function getAllies(engine: BattleEngine): CombatantState[] {
  return (engine as unknown as { players: CombatantState[] }).players;
}

describe('BattleEngine out-of-combat ticking', () => {
  it('starts module class without legacy active cooldown slots at stage start', () => {
    const engine = createEngine();
    const guardian = getAllies(engine).find((a) => a.classId === 'df_guardian')!;
    const basicCd = guardian.cooldowns.find((cd) => cd.slotKind === 'basic')!;
    const activeCds = guardian.cooldowns.filter((cd) => cd.slotKind === 'active');

    expect(basicCd.remaining).toBeGreaterThan(0);
    expect(activeCds).toHaveLength(0);
  });

  it('starts legacy class skill cooldowns unfilled at stage start', () => {
    const engine = createEngine({ replaceRangerWithLancer: true });
    const lancer = getAllies(engine).find((a) => a.classId === 'at_lancer')!;
    const basicCd = lancer.cooldowns.find((cd) => cd.slotKind === 'basic')!;
    const activeCd = lancer.cooldowns.find((cd) => cd.slotKind === 'active')!;

    expect(basicCd.remaining).toBeGreaterThan(0);
    expect(activeCd.remaining).toBeGreaterThan(0);
  });

  it('ticks buff duration and time-trigger active cooldowns during wave intermission', () => {
    const engine = createEngine();
    const guardian = getAllies(engine).find((a) => a.classId === 'df_guardian')!;
    const activeCd = {
      skillId: 'df_paladin_active_1',
      remaining: 5,
      slotKind: 'active' as const,
      slotIndex: 0,
      storedCharges: 0,
    };
    guardian.cooldowns.push(activeCd);
    guardian.statusEffects.push({
      id: 'test_buff',
      kind: 'buff',
      stat: 'def',
      multiplier: 1.5,
      remainingSec: 4,
      durationSec: 4,
    });

    engine.tick(1);

    expect(activeCd.remaining).toBeCloseTo(4, 5);
    const buff = guardian.statusEffects.find((e) => e.id === 'test_buff');
    expect(buff?.remainingSec).toBeCloseTo(3, 5);
  });

  it('ticks DoT/HoT overlay durations before engagement', () => {
    const engine = createEngine();
    const guardian = getAllies(engine).find((a) => a.classId === 'df_guardian')!;
    guardian.statusEffects.push({
      id: 'test_dot',
      kind: 'debuff',
      overlay: 'dot',
      sourceId: guardian.id,
      multiplier: 1,
      amount: { kind: 'flat', flatAmount: 1 },
      remainingSec: 3,
      durationSec: 3,
      tickSec: 1,
    });

    engine.tick(0.5);

    const dot = guardian.statusEffects.find((e) => e.id === 'test_dot');
    expect(dot?.remainingSec).toBeCloseTo(2.5, 5);
  });

  it('continues ticking time-trigger active cooldowns while an actor is anim-locked', () => {
    const engine = createEngine();
    const guardian = getAllies(engine).find((a) => a.classId === 'df_guardian')!;
    const activeCd = {
      skillId: 'df_paladin_active_1',
      remaining: 5,
      slotKind: 'active' as const,
      slotIndex: 0,
      storedCharges: 0,
    };
    guardian.cooldowns.push(activeCd);
    const runner = (engine as unknown as {
      skillSequenceRunner: SkillSequenceRunner;
    }).skillSequenceRunner;

    runner.beginAnimLock(guardian.id, 1);
    engine.tick(1);

    expect(activeCd.remaining).toBeCloseTo(4, 5);
    expect(runner.isActorUseLocked(guardian.id)).toBe(false);
  });

  it('pauses basic and active cooldowns while an actor is use-locked', () => {
    const engine = createEngine({ replaceRangerWithLancer: true });
    const lancer = getAllies(engine).find((a) => a.classId === 'at_lancer')!;
    const basicCd = lancer.cooldowns.find((cd) => cd.slotKind === 'basic')!;
    const activeCd = lancer.cooldowns.find((cd) => cd.slotKind === 'active')!;
    basicCd.remaining = 2;
    activeCd.remaining = 5;
    const runner = (engine as unknown as {
      skillSequenceRunner: SkillSequenceRunner;
    }).skillSequenceRunner;

    runner.beginUse(lancer.id, 1);
    engine.tick(0.5);

    expect(basicCd.remaining).toBeCloseTo(2, 5);
    expect(activeCd.remaining).toBeCloseTo(5, 5);
    expect(runner.isActorUseLocked(lancer.id)).toBe(true);
  });

  it('pauses hitsTaken charge progression while an actor is use-locked', () => {
    const engine = createEngine({ replaceRangerWithLancer: true });
    const lancer = getAllies(engine).find((a) => a.classId === 'at_lancer')!;
    const hitsTakenCd = {
      skillId: 'at_lancer_active_2',
      remaining: 2,
      slotKind: 'active' as const,
      slotIndex: 0,
      storedCharges: 0,
    };
    lancer.cooldowns.push(hitsTakenCd);
    const runner = (engine as unknown as {
      skillSequenceRunner: SkillSequenceRunner;
    }).skillSequenceRunner;
    const tickCountTriggers = (
      engine as unknown as {
        tickCountTriggers: (unitId: string, kind: 'hitsTaken') => void;
      }
    ).tickCountTriggers.bind(engine);

    runner.beginUse(lancer.id, 1);
    tickCountTriggers(lancer.id, 'hitsTaken');

    expect(hitsTakenCd.remaining).toBe(2);
    expect(runner.isActorUseLocked(lancer.id)).toBe(true);
  });
});
