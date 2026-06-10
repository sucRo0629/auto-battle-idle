/**
 * Shared harness for battle-field.md spec compliance tests.
 * Maps spec section IDs (F-*, A-*, I-*) to reusable engine fixtures and assertions.
 */
import { expect } from 'vitest';
import { BattleEngine } from '../BattleEngine.ts';
import { loadGameData } from '../data/loadGameData.ts';
import { loadLevelCurves } from '../../progression/levelGrowth.ts';
import levelCurvesJson from '../../../data/levelCurves.json';
import { createDefaultSave } from '../../progression/victoryRewards.ts';
import { SPRITE_WIDTH } from '../../render/formationLayout.ts';
import type { CombatantSnapshot } from '../types.ts';

export const LONG_BATTLE_TIMEOUT_MS = 60_000;
export const SCREEN_MIN_X = -18;
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
  // Wave 2: melee dies first; ranged survive for ranged-only engaged window
  if (ranged) ranged.maxHp = 9_999;
  if (melee) melee.maxHp = 400;
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

const ROW_ORDER = ['front', 'middle', 'back'] as const;

/** Snapshot 版: R1-fix 後は常に 0（battleX === visualX） */
export function battleVisualOffsetFromSnapshot(
  allies: CombatantSnapshot[],
): number | null {
  const living = allies.filter((a) => a.hp > 0);
  if (living.length === 0) return null;
  for (const unit of living) {
    if (Math.abs(unit.visualX - unit.battleX) > 0.01) return null;
  }
  return 0;
}

export interface EngagedVisualAssertOptions {
  maxTicks?: number;
  /** 接敵開始直後の 1 tick 再配置を許容 */
  skipTicksAfterEngage?: number;
}

/**
 * R1-fix: 接敵中 battleX === visualX かつ敵 screenX の 1-tick 変化が閾値以内。
 * 構成変化時の layout bake 1 回分を許容するため skip / 閾値を緩める。
 */
export function assertEngagedEnemyScreenStable(
  engine: BattleEngine,
  options: EngagedVisualAssertOptions & { maxJumpPx?: number } = {},
): void {
  const maxTicks = options.maxTicks ?? 36_000;
  const maxJumpPx = options.maxJumpPx ?? 24;
  const skipAfterEngage = options.skipTicksAfterEngage ?? 90;
  let engagedTicks = 0;
  let maxJump = 0;
  const prevScreenX = new Map<string, number>();

  for (let i = 0; i < maxTicks; i++) {
    engine.tick(TICK_DT);
    const snap = engine.getSnapshot();
    if (!snap.engaged) {
      engagedTicks = 0;
      prevScreenX.clear();
      continue;
    }
    engagedTicks += 1;

    for (const unit of [...snap.allies, ...snap.enemies].filter((u) => u.hp > 0)) {
      expect(unit.visualX).toBe(unit.battleX);
    }

    if (engagedTicks <= skipAfterEngage) continue;

    for (const enemy of snap.enemies.filter((e) => e.hp > 0)) {
      const sx = screenX(enemy, snap.combatCameraX);
      const prev = prevScreenX.get(enemy.id);
      if (prev !== undefined) {
        maxJump = Math.max(maxJump, Math.abs(sx - prev));
      }
      prevScreenX.set(enemy.id, sx);
    }
  }
  expect(maxJump).toBeLessThanOrEqual(maxJumpPx);
}

/** @deprecated L1 以降は assertEngagedEnemyScreenStable を使用 */
export function assertEnemyVisualBattleSync(
  engine: BattleEngine,
  options: EngagedVisualAssertOptions & {
    epsilon?: number;
    maxJumpPx?: number;
  } = {},
): void {
  assertEngagedEnemyScreenStable(engine, {
    ...options,
    maxJumpPx: options.maxJumpPx ?? 24,
  });
}

/** 接敵中: 前線味方の画面右端が生存敵の右端を大きく超えない */
export function assertNoFrontOvertake(
  engine: BattleEngine,
  options: EngagedVisualAssertOptions & {
    maxOvertakePx?: number;
    when?: (snap: BattleSnapshot) => boolean;
  } = {},
): void {
  const maxTicks = options.maxTicks ?? 36_000;
  const maxOvertakePx = options.maxOvertakePx ?? 8;
  let maxOvertake = 0;

  for (let i = 0; i < maxTicks; i++) {
    engine.tick(TICK_DT);
    const snap = engine.getSnapshot();
    if (!snap.engaged) continue;
    if (options.when && !options.when(snap)) continue;

    const livingEnemies = snap.enemies.filter((e) => e.hp > 0);
    const frontAllies = snap.allies.filter(
      (a) => a.hp > 0 && a.formationRow === 'front',
    );
    if (livingEnemies.length === 0 || frontAllies.length === 0) continue;

    const maxEnemyScreen = Math.max(
      ...livingEnemies.map((e) => screenX(e, snap.combatCameraX) + SPRITE_WIDTH),
    );
    const maxFrontAllyScreen = Math.max(
      ...frontAllies.map((a) => screenX(a, snap.combatCameraX) + SPRITE_WIDTH),
    );
    maxOvertake = Math.max(maxOvertake, maxFrontAllyScreen - maxEnemyScreen);
  }
  expect(maxOvertake).toBeLessThanOrEqual(maxOvertakePx);
}

/** 条件を満たす tick 区間で味方 screenX の最大 1-tick 変化を返す */
export function measureMaxAllyScreenJump(
  engine: BattleEngine,
  shouldTrack: (snap: BattleSnapshot) => boolean,
  maxTicks = 200_000,
): number {
  const prevScreenX = new Map<string, number>();
  let maxJump = 0;
  let tracking = false;

  for (let i = 0; i < maxTicks; i++) {
    const before = engine.getSnapshot();
    if (shouldTrack(before)) {
      tracking = true;
      for (const ally of before.allies.filter((a) => a.hp > 0)) {
        prevScreenX.set(ally.id, screenX(ally, before.combatCameraX));
      }
    }
    engine.tick(TICK_DT);
    const after = engine.getSnapshot();

    if (tracking && shouldTrack(after)) {
      for (const ally of after.allies.filter((a) => a.hp > 0)) {
        const sx = screenX(ally, after.combatCameraX);
        const prev = prevScreenX.get(ally.id);
        if (prev !== undefined) {
          maxJump = Math.max(maxJump, Math.abs(sx - prev));
        }
        prevScreenX.set(ally.id, sx);
      }
    } else if (tracking && !shouldTrack(after)) {
      tracking = false;
      prevScreenX.clear();
    }
  }
  return maxJump;
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

/** spec A-§4.2-01: screenX Δ = battleX Δ + camera Δ（R1-fix 単一座標） */
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
      const expectedScreenDelta = battleDelta + cameraDelta;
      if (Math.abs(screenDelta - expectedScreenDelta) > epsilon) {
        throw new Error(
          `unit ${unitId}: screenX Δ=${screenDelta.toFixed(2)} expected ${expectedScreenDelta.toFixed(2)} (battleX Δ=${battleDelta.toFixed(2)}, camera Δ=${cameraDelta.toFixed(2)})`,
        );
      }
    }
    prevScreen = sx;
    prevCamera = sample.combatCameraX;
    prevBattleX = unit.battleX;
  }
}

export { SPRITE_WIDTH };
