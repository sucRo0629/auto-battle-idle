/**
 * R6g-3: BattleEngine wave start → createEnemiesForStage(waveIndex) integration.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { BattleEngine } from './BattleEngine.ts';
import { loadGameData } from './data/loadGameData.ts';
import { loadLevelCurves } from '../progression/levelGrowth.ts';
import levelCurvesJson from '../../data/levelCurves.json';
import { createDefaultSave } from '../progression/victoryRewards.ts';
import type { GameData, StageDef } from './types.ts';
import {
  asBattleEngineInternals,
  createStage1Engine,
  killAllEnemies,
  reachAwaitingNextWave,
  TICK_DT,
  waitForEngaged,
} from './test/battleFieldSpec.harness.ts';

const WAVE_SPAWN_STAGE_ID = 'r6g3_wave_spawn_test';

function stageWithWaveEnemyGroups(
  waves: StageDef['waves'],
  options: { recommendedLevel?: number } = {},
): StageDef {
  return {
    id: WAVE_SPAWN_STAGE_ID,
    displayName: 'R6g-3 Wave Spawn Test',
    recommendedLevel: options.recommendedLevel ?? 10,
    waves,
  };
}

function gameDataWithStage(stage: StageDef): GameData {
  const base = loadGameData();
  return {
    ...base,
    stages: [
      ...base.stages.filter((entry) => entry.id !== stage.id),
      stage,
    ],
  };
}

function createWaveEnemyGroupsEngine(
  waves: StageDef['waves'],
): BattleEngine {
  const gameData = gameDataWithStage(stageWithWaveEnemyGroups(waves));
  const levelCurves = loadLevelCurves(levelCurvesJson);
  const save = createDefaultSave(gameData, 'demo');
  save.stageProgress.currentStageId = WAVE_SPAWN_STAGE_ID;
  for (const slot of save.party) {
    if (slot) slot.progress.level = 10;
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

function enemyClassIds(engine: BattleEngine): string[] {
  return engine
    .getSnapshot()
    .enemies.filter((enemy) => enemy.hp > 0)
    .map((enemy) => enemy.classId)
    .filter((classId): classId is string => classId !== undefined);
}

function allEnemyClassIds(engine: BattleEngine): string[] {
  return engine
    .getSnapshot()
    .enemies.map((enemy) => enemy.classId)
    .filter((classId): classId is string => classId !== undefined);
}

function reachAwaitingAfterKill(engine: BattleEngine): void {
  waitForEngaged(engine);
  killAllEnemies(engine);
  for (let i = 0; i < 90_000; i++) {
    engine.tick(TICK_DT);
    if (engine.getSnapshot().awaitingNextWave) return;
    if (
      engine.getSnapshot().phase === 'victory' ||
      engine.getSnapshot().phase === 'defeat'
    ) {
      throw new Error(
        `battle ended (${engine.getSnapshot().phase}) instead of awaiting next wave`,
      );
    }
  }
  throw new Error('awaiting next wave state not reached');
}

describe('BattleEngine wave spawn connection (R6g-3)', () => {
  beforeEach(() => {
    // entity id counter is reset inside reloadBattlefield / spawnWaveEnemies path
  });

  const twoWaveGroups = [
    { enemies: [], enemyGroups: [{ classId: 'df_guardian', count: 2 }] },
    { enemies: [], enemyGroups: [{ classId: 'at_sorcerer', count: 1 }] },
  ] as StageDef['waves'];

  it('1. spawns only wave 0 enemies when wave 0 starts', () => {
    const engine = createWaveEnemyGroupsEngine(twoWaveGroups);
    const snap = engine.getSnapshot();

    expect(snap.waveIndex).toBe(0);
    expect(snap.enemies).toHaveLength(2);
    expect(enemyClassIds(engine)).toEqual(['df_guardian', 'df_guardian']);
    expect(enemyClassIds(engine).some((id) => id === 'at_sorcerer')).toBe(false);
  });

  it('2. switches to wave 1 enemies after startNextWave', () => {
    const engine = createWaveEnemyGroupsEngine(twoWaveGroups);
    reachAwaitingAfterKill(engine);
    expect(engine.startNextWave()).toBe(true);

    const snap = engine.getSnapshot();
    expect(snap.waveIndex).toBe(1);
    expect(snap.enemies).toHaveLength(1);
    expect(enemyClassIds(engine)).toEqual(['at_sorcerer']);
    expect(allEnemyClassIds(engine).every((id) => id === 'at_sorcerer')).toBe(true);
  });

  it('3. does not spawn wave 1 enemies while awaiting next wave', () => {
    const engine = createWaveEnemyGroupsEngine(twoWaveGroups);
    waitForEngaged(engine);
    killAllEnemies(engine);

    for (let i = 0; i < 90_000; i++) {
      engine.tick(TICK_DT);
      if (engine.getSnapshot().awaitingNextWave) break;
    }

    const snap = engine.getSnapshot();
    expect(snap.awaitingNextWave).toBe(true);
    expect(snap.waveIndex).toBe(0);
    expect(snap.enemies).toHaveLength(2);
    expect(allEnemyClassIds(engine)).toEqual(['df_guardian', 'df_guardian']);
    expect(snap.enemies.every((enemy) => enemy.hp <= 0)).toBe(true);
    expect(enemyClassIds(engine)).toHaveLength(0);
  });

  it('4. does not spawn extra enemies after the final wave', () => {
    const engine = createWaveEnemyGroupsEngine([
      { enemies: [], enemyGroups: [{ classId: 'df_guardian', count: 1 }] },
    ]);
    waitForEngaged(engine);
    killAllEnemies(engine);

    let sawVictory = false;
    for (let i = 0; i < 90_000; i++) {
      engine.tick(TICK_DT);
      const snap = engine.getSnapshot();
      expect(snap.enemies).toHaveLength(1);
      expect(snap.enemies[0]!.classId).toBe('df_guardian');
      expect(enemyClassIds(engine)).toHaveLength(0);
      if (snap.phase === 'victory') {
        sawVictory = true;
        break;
      }
    }

    const snap = engine.getSnapshot();
    expect(sawVictory).toBe(true);
    expect(snap.phase).toBe('victory');
    expect(snap.waveIndex).toBe(0);
    expect(snap.enemies).toHaveLength(1);
    expect(snap.enemies.every((enemy) => enemy.hp <= 0)).toBe(true);
    expect(enemyClassIds(engine)).toHaveLength(0);
  });

  it('5. keeps legacy waves[].enemies multi-wave behavior', () => {
    const engine = createStage1Engine({ reliableWaveClear: true });
    waitForEngaged(engine);
    const wave0Enemies = asBattleEngineInternals(engine).enemies;
    const wave0Keys = new Set(
      wave0Enemies.map((enemy) => enemy.id),
    );
    expect(wave0Keys.size).toBeGreaterThan(0);

    reachAwaitingNextWave(engine);
    expect(engine.getSnapshot().waveIndex).toBe(0);
    expect(engine.startNextWave()).toBe(true);

    const wave1Snap = engine.getSnapshot();
    expect(wave1Snap.waveIndex).toBe(1);
    expect(wave1Snap.enemies.length).toBeGreaterThan(0);
    expect(wave1Snap.enemies.every((enemy) => enemy.isEnemy)).toBe(true);

    const wave1Keys = new Set(
      asBattleEngineInternals(engine).enemies.map((enemy) => enemy.id),
    );
    expect(wave1Keys.size).toBeGreaterThan(0);
    for (const id of wave1Keys) {
      expect(wave0Keys.has(id)).toBe(false);
    }
  });
});
