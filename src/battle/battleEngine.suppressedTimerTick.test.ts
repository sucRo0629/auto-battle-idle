import { describe, expect, it } from 'vitest';
import { BattleEngine } from './BattleEngine.ts';
import { loadGameData } from './data/loadGameData.ts';
import { loadLevelCurves } from '../progression/levelGrowth.ts';
import levelCurvesJson from '../../data/levelCurves.json';
import { createDefaultSave } from '../progression/victoryRewards.ts';
import type { CombatantState } from './types.ts';
import { SkillSequenceRunner } from './skills/skillSequence.ts';

function createEngine() {
  const gameData = loadGameData();
  const levelCurves = loadLevelCurves(levelCurvesJson);
  const save = createDefaultSave(gameData, 'demo');
  const engine = new BattleEngine(
    gameData,
    levelCurves,
    () => save.party,
    () => save.stageProgress.currentStageId,
  );
  engine.startBattle();
  return engine;
}

function getRunner(engine: BattleEngine): SkillSequenceRunner {
  return (engine as unknown as { skillSequenceRunner: SkillSequenceRunner })
    .skillSequenceRunner;
}

function getAllies(engine: BattleEngine): CombatantState[] {
  return (engine as unknown as { players: CombatantState[] }).players;
}

describe('BattleEngine battle timers during suppressed combat skills', () => {
  it('ticks active effect gauges while approaching before engagement', () => {
    const engine = createEngine();
    const runner = getRunner(engine);
    const ally = getAllies(engine)[0]!;

    runner.beginActiveEffectGauge(ally.id, 0, 2);

    for (let i = 0; i < 5; i++) {
      engine.tick(0.2);
    }

    const gauge = runner.getActiveEffectGauge(ally.id, 0);
    expect(gauge).toBeDefined();
    expect(gauge!.remainingSec).toBeLessThan(2);
  });

  it('ticks use locks while approaching before engagement', () => {
    const engine = createEngine();
    const runner = getRunner(engine);
    const ally = getAllies(engine)[0]!;

    runner.beginUse(ally.id, 1);
    expect(runner.isActorUseLocked(ally.id)).toBe(true);

    for (let i = 0; i < 6; i++) {
      engine.tick(0.2);
    }

    expect(runner.isActorUseLocked(ally.id)).toBe(false);
  });
});
