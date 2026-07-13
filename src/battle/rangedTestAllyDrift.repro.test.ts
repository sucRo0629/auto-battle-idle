/**
 * ranged_test: 敵に短射程がいない（または全滅後）ケースで味方が左へ流れないこと。
 */
import { describe, expect, it } from 'vitest';
import { BattleEngine } from './BattleEngine.ts';
import { loadGameData } from './data/loadGameData.ts';
import { createEnemiesForStage } from './entities.ts';
import { loadLevelCurves } from '../progression/levelGrowth.ts';
import levelCurvesJson from '../../data/levelCurves.json';
import { createDefaultSave } from '../progression/victoryRewards.ts';
import { createMemberFromClass } from '../progression/partyCompose.ts';
import {
  asBattleEngineInternals,
  reachWave1Engage,
  SCREEN_MIN_X,
  TICK_DT,
} from './test/battleFieldSpec.harness.ts';
import { resolveAllPlayerApproachBattleX } from './resolveApproachBattleX.ts';
import { resolveUnitAttackMethod } from './data/resolveUnitAttackMethod.ts';

const levelCurves = loadLevelCurves(levelCurvesJson);

function createRangedTestEngine(options?: { rangedOnly?: boolean }): BattleEngine {
  const gameData = structuredClone(loadGameData());
  const stage = gameData.stages.find((s) => s.id === 'ranged_test');
  if (!stage) throw new Error('ranged_test stage missing');
  if (options?.rangedOnly) {
    stage.enemyGroups = [{ classId: 'at_hunter', count: 3 }];
  }
  const save = createDefaultSave(gameData, 'demo');
  save.stageProgress.currentStageId = 'ranged_test';
  for (const slot of save.party) {
    if (slot) slot.progress.level = 10;
  }
  return new BattleEngine(
    gameData,
    levelCurves,
    () => save.party,
    () => 'ranged_test',
  );
}

function minAllyXWhileEngaged(engine: BattleEngine, ticks: number): number {
  let minAllyX = Infinity;
  for (let t = 0; t < ticks; t++) {
    engine.tick(TICK_DT);
    const snap = engine.getSnapshot();
    if (!snap.engaged) continue;
    for (const ally of snap.allies.filter((a) => a.hp > 0)) {
      minAllyX = Math.min(minAllyX, ally.battleX);
    }
  }
  return minAllyX;
}

describe('ranged_test ally left drift', () => {
  it('ranged-only enemies: allies stay on-field after engage', () => {
    const engine = createRangedTestEngine({ rangedOnly: true });
    engine.startBattle();
    reachWave1Engage(engine);
    expect(minAllyXWhileEngaged(engine, 3600)).toBeGreaterThan(SCREEN_MIN_X);
  });

  it('after df_guardian removed: allies stay on-field after engage', () => {
    const engine = createRangedTestEngine();
    engine.startBattle();
    reachWave1Engage(engine);
    const guardian = asBattleEngineInternals(engine).enemies.find(
      (e) => e.classId === 'df_guardian',
    );
    expect(guardian).toBeDefined();
    guardian!.hp = 0;
    guardian!.isAlive = false;
    expect(minAllyXWhileEngaged(engine, 1800)).toBeGreaterThan(SCREEN_MIN_X);
  });

  it('overshot allies vs ranged-only enemies settle without leaving screen', () => {
    const engine = createRangedTestEngine({ rangedOnly: true });
    engine.startBattle();
    reachWave1Engage(engine);
    const internals = asBattleEngineInternals(engine);

    for (const ally of internals.players) {
      if (ally.isAlive) ally.battleX = 560;
    }
    for (const enemy of internals.enemies) {
      if (enemy.isAlive) enemy.battleX = 500 + (enemy.spawnX ?? 0);
    }

    let minX = Infinity;
    for (let t = 0; t < 300; t++) {
      for (const target of resolveAllPlayerApproachBattleX(
        internals.players,
        internals.enemies,
        internals.gameData,
      ).values()) {
        minX = Math.min(minX, target);
      }
      engine.tick(TICK_DT);
      for (const ally of internals.players) {
        if (ally.isAlive) minX = Math.min(minX, ally.battleX);
      }
    }
    expect(minX).toBeGreaterThan(SCREEN_MIN_X);
  });

  it('ranged_test spawn bands: guardian melee, hunter ranged', () => {
    const gameData = loadGameData();
    const enemies = createEnemiesForStage(gameData, 'ranged_test', 0, levelCurves);
    const guardian = enemies.find((e) => e.classId === 'df_guardian')!;
    expect(resolveUnitAttackMethod(guardian, gameData)).not.toBe('ranged');
    for (const hunter of enemies.filter((e) => e.classId === 'at_hunter')) {
      expect(resolveUnitAttackMethod(hunter, gameData)).toBe('ranged');
    }
  });
});
