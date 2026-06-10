/**
 * Shared harness for battle-field.md spec compliance tests.
 * Maps spec section IDs (F-*, A-*, I-*) to reusable engine fixtures and assertions.
 */
import { BattleEngine } from '../BattleEngine.ts';
import { loadGameData } from '../data/loadGameData.ts';
import { loadLevelCurves } from '../../progression/levelGrowth.ts';
import levelCurvesJson from '../../../data/levelCurves.json';
import { createDefaultSave } from '../../progression/victoryRewards.ts';
import { SPRITE_WIDTH } from '../../render/formationLayout.ts';
import type { CombatantSnapshot } from '../types.ts';

export const LONG_BATTLE_TIMEOUT_MS = 60_000;
export const SCREEN_MIN_X = -16;
export const SCREEN_MAX_X = 496;
export const MARCH_MAX_ALLY_SCREEN_X = 280;
export const TICK_DT = 1 / 60;

export const BACK_ROW_NAMES = ['療養師', '弓術士'] as const;

export function screenX(
  unit: Pick<CombatantSnapshot, 'visualX'>,
  combatCameraX: number,
): number {
  return unit.visualX + combatCameraX;
}

export function createStage1Engine(options?: { reliableWaveClear?: boolean }) {
  const gameData = structuredClone(loadGameData());
  if (options?.reliableWaveClear) {
    const stage = gameData.stages.find((s) => s.id === '1');
    if (stage?.waves[0]) {
      stage.waves[0].enemies = [{ templateId: 'stage1_1', spawnX: 600 }];
    }
    const wave1Enemy = gameData.enemyRegistry.stage1_1;
    if (wave1Enemy) wave1Enemy.maxHp = 1;
  }
  const levelCurves = loadLevelCurves(levelCurvesJson);
  const save = createDefaultSave(gameData, 'demo');
  save.stageProgress.currentStageId = '1';
  if (options?.reliableWaveClear) {
    for (const slot of save.party) {
      if (slot) slot.progress.level = 10;
    }
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

export function createStage1Wave2MeleeOnlyEngine() {
  const gameData = structuredClone(loadGameData());
  const stage = gameData.stages.find((s) => s.id === '1');
  if (stage?.waves[0]) {
    stage.waves[0].enemies = [{ templateId: 'stage1_1', spawnX: 600 }];
  }
  const wave1Enemy = gameData.enemyRegistry.stage1_1;
  if (wave1Enemy) wave1Enemy.maxHp = 1;
  const ranged = gameData.enemyRegistry.test_ranged;
  const melee = gameData.enemyRegistry.test_enemy;
  if (ranged) ranged.maxHp = 1;
  if (melee) melee.maxHp = 9_999;
  const levelCurves = loadLevelCurves(levelCurvesJson);
  const save = createDefaultSave(gameData, 'demo');
  save.stageProgress.currentStageId = '1';
  for (const slot of save.party) {
    if (slot) slot.progress.level = 12;
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

export type BattleSnapshot = ReturnType<BattleEngine['getSnapshot']>;

export interface TickSample {
  tick: number;
  engaged: boolean;
  waveIndex: number;
  combatCameraX: number;
  allies: CombatantSnapshot[];
  enemies: CombatantSnapshot[];
}

export function tickRecord(engine: BattleEngine, count: number): TickSample[] {
  const samples: TickSample[] = [];
  for (let i = 0; i < count; i++) {
    engine.tick(TICK_DT);
    const snap = engine.getSnapshot();
    samples.push({
      tick: i,
      engaged: snap.engaged,
      waveIndex: snap.waveIndex,
      combatCameraX: snap.combatCameraX,
      allies: snap.allies,
      enemies: snap.enemies,
    });
  }
  return samples;
}

export function waitForEngaged(engine: BattleEngine, maxTicks = 5000): void {
  for (let i = 0; i < maxTicks; i++) {
    engine.tick(TICK_DT);
    if (engine.getSnapshot().engaged) return;
  }
  throw new Error('engagement did not start');
}

export function advanceUntil(
  engine: BattleEngine,
  predicate: (snap: BattleSnapshot) => boolean,
  maxTicks = 120_000,
): BattleSnapshot | null {
  for (let i = 0; i < maxTicks; i++) {
    engine.tick(TICK_DT);
    const snap = engine.getSnapshot();
    if (predicate(snap)) return snap;
  }
  return null;
}

export function reachWave1Engage(
  engine: BattleEngine,
): { preEngage: BattleSnapshot; engageSnap: BattleSnapshot } {
  let preEngage: BattleSnapshot | null = null;
  for (let i = 0; i < 20_000; i++) {
    const before = engine.getSnapshot();
    if (
      before.waveIndex === 0 &&
      !before.engaged &&
      before.enemies.some((e) => e.hp > 0)
    ) {
      preEngage = before;
    }
    engine.tick(TICK_DT);
    const after = engine.getSnapshot();
    if (preEngage && after.waveIndex === 0 && after.engaged && !before.engaged) {
      return { preEngage, engageSnap: after };
    }
  }
  throw new Error('wave 1 engagement did not occur');
}

export function reachWave2Engage(engine: BattleEngine): BattleSnapshot {
  waitForEngaged(engine);
  let preEngage: BattleSnapshot | null = null;
  for (let i = 0; i < 200_000; i++) {
    const before = engine.getSnapshot();
    if (
      before.waveIndex === 1 &&
      !before.engaged &&
      before.enemies.some((e) => e.hp > 0)
    ) {
      preEngage = before;
    }
    engine.tick(TICK_DT);
    const after = engine.getSnapshot();
    if (preEngage && after.waveIndex === 1 && after.engaged && !before.engaged) {
      return after;
    }
  }
  throw new Error('wave 2 engagement did not occur');
}

export function countScreenXSignFlips(samples: number[]): number {
  let flips = 0;
  let prevDelta = 0;
  for (let i = 1; i < samples.length; i++) {
    const delta = samples[i]! - samples[i - 1]!;
    if (Math.abs(delta) < 0.01) continue;
    if (prevDelta !== 0 && Math.sign(delta) !== Math.sign(prevDelta)) {
      flips += 1;
    }
    prevDelta = delta;
  }
  return flips;
}

/** spec A-§4.2-01: screenX change must equal camera change only (within epsilon). */
export function assertFrozenScreenDelta(
  samples: TickSample[],
  unitId: string,
  side: 'ally' | 'enemy',
  epsilon = 0.5,
): void {
  let prevScreen: number | null = null;
  let prevCamera: number | null = null;
  let prevBattleX: number | null = null;

  for (const sample of samples) {
    const list = side === 'ally' ? sample.allies : sample.enemies;
    const unit = list.find((u) => u.id === unitId && u.hp > 0);
    if (!unit) continue;

    const sx = screenX(unit, sample.combatCameraX);
    if (prevScreen !== null && prevCamera !== null && prevBattleX !== null) {
      const battleDelta = unit.battleX - prevBattleX;
      const screenDelta = sx - prevScreen;
      const cameraDelta = sample.combatCameraX - prevCamera;
      const unexplained = Math.abs(screenDelta - cameraDelta);
      if (Math.abs(battleDelta) > 0.01 && unexplained > epsilon) {
        throw new Error(
          `unit ${unitId}: battleX Δ=${battleDelta.toFixed(2)} but screenX Δ=${screenDelta.toFixed(2)} vs camera Δ=${cameraDelta.toFixed(2)}`,
        );
      }
    }
    prevScreen = sx;
    prevCamera = sample.combatCameraX;
    prevBattleX = unit.battleX;
  }
}

export { SPRITE_WIDTH };
