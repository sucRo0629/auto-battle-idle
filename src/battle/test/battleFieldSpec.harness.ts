/**
 * Shared harness for battle-field.md spec compliance tests.
 * Maps spec section IDs (F-*, A-*, I-*) to reusable engine fixtures and assertions.
 */
import { expect } from 'vitest';
import { BattleEngine, type BattleEngineOptions } from '../BattleEngine.ts';
import { loadGameData } from '../data/loadGameData.ts';
import { loadLevelCurves } from '../../progression/levelGrowth.ts';
import levelCurvesJson from '../../../data/levelCurves.json';
import { createDefaultSave } from '../../progression/victoryRewards.ts';
import { SPRITE_WIDTH } from '../battleConstants.ts';
import type { SkillSequenceRunner } from '../skills/skillSequence.ts';
import {
  DEFAULT_MELEE_RANGE_PX,
  RANGED_ATTACK_MIN_PX,
  type CombatantSnapshot,
  type CombatantState,
  type GameData,
  type SkillTriggerKind,
} from '../types.ts';

/** private フィールドへのアクセス用（`BattleEngine & {...}` は never になるため unknown 経由） */
export type BattleEngineInternals = {
  players: CombatantState[];
  enemies: CombatantState[];
  gameData: GameData;
  skillSequenceRunner: SkillSequenceRunner;
  runUnitSkills?: (actors: CombatantState[]) => void;
  tickCountTriggers?: (unitId: string, kind: SkillTriggerKind) => void;
};

export function asBattleEngineInternals(engine: BattleEngine): BattleEngineInternals {
  return engine as unknown as BattleEngineInternals;
}

export const LONG_BATTLE_TIMEOUT_MS = 120_000;
export const SCREEN_MIN_X = -18;
export const SCREEN_MAX_X = 496;
export const MARCH_MAX_ALLY_SCREEN_X = 280;
export const TICK_DT = 1 / 60;

export const BACK_ROW_NAMES = ['療養師', '弓術士'] as const;

/** screenX = battleX（カメラ廃止） */
export function screenX(
  unit: Pick<CombatantSnapshot, 'visualX' | 'battleX'>,
  _combatCameraX: number = 0,
): number {
  return unit.battleX;
}

export function createStage1Engine(options?: { reliableWaveClear?: boolean }) {
  const gameData = structuredClone(loadGameData());
  if (options?.reliableWaveClear) {
    const stage = gameData.stages.find((s) => s.id === '1');
    if (stage?.waves[0]) {
      stage.waves[0].enemies = [{ templateId: 'stage1_1', spawnX: 120 }];
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

export function createStage1Wave1MeleeFirstDeathEngine(
  options?: BattleEngineOptions,
) {
  const gameData = structuredClone(loadGameData());
  const stage = gameData.stages.find((s) => s.id === '1');
  if (stage?.waves[0]) {
    stage.waves[0].enemies = [
      { templateId: 'test_enemy', spawnX: 100 },
      { templateId: 'test_ranged', spawnX: 160 },
    ];
  }
  const melee = gameData.enemyRegistry.test_enemy;
  const ranged = gameData.enemyRegistry.test_ranged;
  if (melee) melee.maxHp = 400;
  if (ranged) ranged.maxHp = 9_999;
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
    options,
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
  partyDeployActive: boolean;
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
      partyDeployActive: snap.partyDeployActive,
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
  const initial = engine.getSnapshot();
  if (initial.waveIndex === 0 && initial.engaged) {
    return { preEngage: initial, engageSnap: initial };
  }
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

export function reachWave2Engage(
  engine: BattleEngine,
  maxTicks = 200_000,
): BattleSnapshot {
  waitForEngaged(engine);
  let preEngage: BattleSnapshot | null = null;
  for (let i = 0; i < maxTicks; i++) {
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

export function enemyRangePx(enemy: { rangePx?: number }): number {
  return enemy.rangePx ?? DEFAULT_MELEE_RANGE_PX;
}

export function isShortRangeEnemy(enemy: { rangePx?: number }): boolean {
  return enemyRangePx(enemy) < RANGED_ATTACK_MIN_PX;
}

export function isLongRangeEnemy(enemy: { rangePx?: number }): boolean {
  return enemyRangePx(enemy) >= RANGED_ATTACK_MIN_PX;
}

/** Engaged window: short-range enemies dead, long-range alive, allies alive. */
export function isShortRangeWipedEngaged(
  snap: BattleSnapshot,
  waveIndex: number,
): boolean {
  if (snap.waveIndex !== waveIndex || !snap.engaged) return false;
  const livingAllies = snap.allies.filter((a) => a.hp > 0);
  const livingEnemies = snap.enemies.filter((e) => e.hp > 0);
  const livingShortRange = livingEnemies.filter(isShortRangeEnemy);
  return (
    livingAllies.length > 0 &&
    livingEnemies.length > 0 &&
    livingShortRange.length === 0 &&
    livingEnemies.some(isLongRangeEnemy)
  );
}

export function advanceUntilShortRangeWipe(
  engine: BattleEngine,
  waveIndex: number,
  maxTicks = 90_000,
): BattleSnapshot | null {
  return advanceUntil(
    engine,
    (s) => isShortRangeWipedEngaged(s, waveIndex),
    maxTicks,
  );
}

export interface AllyDriftAfterShortRangeWipeResult {
  wipeTick: number;
  maxLeftDrift: number;
  maxRightDrift: number;
}

/**
 * Advance to short-range wipe, then measure ally battleX drift for N ticks (§4.4 cap).
 * Fails fast when wipe window is never reached (no 120k blind loop).
 */
export function measureAllyBattleXDriftAfterShortRangeWipe(
  engine: BattleEngine,
  options: {
    waveIndex?: number;
    maxTicksToWipe?: number;
    maxTicksAfterWipe?: number;
  } = {},
): AllyDriftAfterShortRangeWipeResult {
  const waveIndex = options.waveIndex ?? 0;
  const maxTicksAfterWipe = options.maxTicksAfterWipe ?? 250;
  const maxTicksToWipe = options.maxTicksToWipe ?? 20_000;

  let wipeTick = -1;
  let minAllyXAtWipe = Infinity;
  let maxAllyXAtWipe = -Infinity;
  let maxLeftDrift = 0;
  let maxRightDrift = 0;

  for (let t = 0; t < maxTicksToWipe; t++) {
    engine.tick(TICK_DT);
    const snap = engine.getSnapshot();
    if (snap.waveIndex !== waveIndex) continue;

    const livingAllies = snap.allies.filter((a) => a.hp > 0);
    const livingEnemies = snap.enemies.filter((e) => e.hp > 0);
    const livingShortRange = livingEnemies.filter(isShortRangeEnemy);

    if (
      wipeTick < 0 &&
      livingShortRange.length === 0 &&
      livingAllies.length > 0 &&
      livingEnemies.length > 0 &&
      livingEnemies.some(isLongRangeEnemy)
    ) {
      wipeTick = t;
      minAllyXAtWipe = Math.min(...livingAllies.map((a) => a.battleX));
      maxAllyXAtWipe = Math.max(...livingAllies.map((a) => a.battleX));
    }

    if (
      wipeTick >= 0 &&
      t - wipeTick <= maxTicksAfterWipe &&
      snap.engaged
    ) {
      const minNow = Math.min(...livingAllies.map((a) => a.battleX));
      const maxNow = Math.max(...livingAllies.map((a) => a.battleX));
      maxLeftDrift = Math.max(maxLeftDrift, minAllyXAtWipe - minNow);
      maxRightDrift = Math.max(maxRightDrift, maxNow - maxAllyXAtWipe);
    }

    if (wipeTick >= 0 && t - wipeTick > maxTicksAfterWipe) break;
  }

  return { wipeTick, maxLeftDrift, maxRightDrift };
}


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
  let prevEnemySignature = '';

  for (let i = 0; i < maxTicks; i++) {
    engine.tick(TICK_DT);
    const snap = engine.getSnapshot();
    if (!snap.engaged) {
      engagedTicks = 0;
      prevScreenX.clear();
      prevEnemySignature = '';
      continue;
    }
    engagedTicks += 1;

    for (const unit of [...snap.allies, ...snap.enemies].filter((u) => u.hp > 0)) {
      expect(unit.visualX).toBe(unit.battleX);
    }

    const enemySignature = snap.enemies
      .filter((e) => e.hp > 0)
      .map((e) => e.id)
      .sort()
      .join(',');
    if (enemySignature !== prevEnemySignature) {
      prevScreenX.clear();
      prevEnemySignature = enemySignature;
    }

    if (engagedTicks <= skipAfterEngage) continue;

    for (const enemy of snap.enemies.filter((e) => e.hp > 0)) {
      const sx = screenX(enemy, 0);
      const prev = prevScreenX.get(enemy.id);
      if (prev !== undefined) {
        maxJump = Math.max(maxJump, Math.abs(sx - prev));
      }
      prevScreenX.set(enemy.id, sx);
    }
  }
  expect(maxJump).toBeLessThanOrEqual(maxJumpPx);
}

/** 接敵中: 構成変化後も生存敵・死体の screenX が 1-tick で大きく動かない */
export function assertEngagedDeathVisualStability(
  engine: BattleEngine,
  options: {
    maxTicks?: number;
    livingMaxDeltaPx?: number;
    corpseMaxDeltaPx?: number;
    corpseTrackTicksAfterDeath?: number;
  } = {},
): void {
  const maxTicks = options.maxTicks ?? 120_000;
  const livingMaxDelta = options.livingMaxDeltaPx ?? 24;
  const corpseMaxDelta = options.corpseMaxDeltaPx ?? 20;
  const trackAfter = options.corpseTrackTicksAfterDeath ?? 90;
  const prevLivingScreenX = new Map<string, number>();
  const corpsePrevScreenX = new Map<string, number>();
  const deathTick = new Map<string, number>();
  let prevLivingSignature = '';
  let maxLivingJump = 0;
  let maxCorpseJump = 0;
  let sawDeath = false;

  for (let i = 0; i < maxTicks; i++) {
    engine.tick(TICK_DT);
    const snap = engine.getSnapshot();
    if (!snap.engaged) {
      prevLivingScreenX.clear();
      corpsePrevScreenX.clear();
      deathTick.clear();
      prevLivingSignature = '';
      continue;
    }

    const living = snap.enemies.filter((e) => e.hp > 0);
    const signature = living
      .map((e) => e.id)
      .sort()
      .join(',');
    if (signature !== prevLivingSignature) {
      prevLivingScreenX.clear();
      prevLivingSignature = signature;
      for (const enemy of living) {
        prevLivingScreenX.set(enemy.id, screenX(enemy, 0));
      }
    } else {
      for (const enemy of living) {
        const sx = screenX(enemy, 0);
        const prev = prevLivingScreenX.get(enemy.id);
        if (prev !== undefined) {
          maxLivingJump = Math.max(maxLivingJump, Math.abs(sx - prev));
        }
        prevLivingScreenX.set(enemy.id, sx);
      }
    }

    for (const enemy of snap.enemies.filter((e) => e.hp <= 0)) {
      // ウェーブ全滅後の settle bake は対象外
      if (living.length === 0) continue;

      const sx = screenX(enemy, 0);
      if (!deathTick.has(enemy.id)) {
        deathTick.set(enemy.id, i);
        corpsePrevScreenX.set(enemy.id, sx);
        sawDeath = true;
        continue;
      }
      const start = deathTick.get(enemy.id)!;
      if (i - start > trackAfter) continue;
      const prev = corpsePrevScreenX.get(enemy.id)!;
      maxCorpseJump = Math.max(maxCorpseJump, Math.abs(sx - prev));
      corpsePrevScreenX.set(enemy.id, sx);
    }
  }

  expect(sawDeath).toBe(true);
  expect(maxLivingJump).toBeLessThanOrEqual(livingMaxDelta);
  expect(maxCorpseJump).toBeLessThanOrEqual(corpseMaxDelta);
}

/** 最初の敵死亡から N tick だけ死体 screenX を追跡（ウェーブ遷移のノイズ除外） */
export function assertFirstEnemyDeathCorpseStable(
  engine: BattleEngine,
  options: {
    maxTicks?: number;
    trackTicksAfterFirstDeath?: number;
    maxSingleTickDeltaPx?: number;
  } = {},
): void {
  const maxTicks = options.maxTicks ?? 120_000;
  const trackAfter = options.trackTicksAfterFirstDeath ?? 120;
  const maxDelta = options.maxSingleTickDeltaPx ?? 8;
  const corpsePrevScreenX = new Map<string, number>();
  let firstDeathTick: number | null = null;
  let maxCorpseJump = 0;

  for (let i = 0; i < maxTicks; i++) {
    engine.tick(TICK_DT);
    const snap = engine.getSnapshot();
    if (!snap.engaged) continue;
    if (firstDeathTick !== null && i - firstDeathTick > trackAfter) break;

    const living = snap.enemies.filter((e) => e.hp > 0);
    for (const enemy of snap.enemies.filter((e) => e.hp <= 0)) {
      if (living.length === 0) continue;
      const sx = screenX(enemy, 0);
      if (firstDeathTick === null) {
        firstDeathTick = i;
        corpsePrevScreenX.set(enemy.id, sx);
        continue;
      }
      const prev = corpsePrevScreenX.get(enemy.id);
      if (prev !== undefined) {
        maxCorpseJump = Math.max(maxCorpseJump, Math.abs(sx - prev));
      }
      corpsePrevScreenX.set(enemy.id, sx);
    }
  }

  expect(firstDeathTick).not.toBeNull();
  expect(maxCorpseJump).toBeLessThanOrEqual(maxDelta);
}

/** ウェーブ全滅 settle 時: 最後の敵 death tick から screenX が大きく動かない */
export function assertWaveWipeCorpseNoJump(
  engine: BattleEngine,
  options: {
    waveIndex: number;
    maxTicks?: number;
    maxWipeJumpPx?: number;
  },
): void {
  const maxTicks = options.maxTicks ?? 200_000;
  const maxJump = options.maxWipeJumpPx ?? 20;

  for (let i = 0; i < maxTicks; i++) {
    const before = engine.getSnapshot();
    engine.tick(TICK_DT);
    const after = engine.getSnapshot();

    if (before.waveIndex !== options.waveIndex) continue;

    const wipeTick =
      before.enemies.some((e) => e.hp > 0) &&
      after.enemies.every((e) => e.hp <= 0);
    if (!wipeTick) continue;

    for (const enemy of after.enemies) {
      const livingBefore = before.enemies.find(
        (e) => e.id === enemy.id && e.hp > 0,
      );
      if (!livingBefore) continue;
      const beforeSx = screenX(livingBefore, 0);
      const afterSx = screenX(enemy, 0);
      expect(Math.abs(afterSx - beforeSx)).toBeLessThanOrEqual(maxJump);
    }
    return;
  }

  expect.fail(`wave ${options.waveIndex} wipe did not occur`);
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
      ...livingEnemies.map((e) => screenX(e, 0) + SPRITE_WIDTH),
    );
    const maxFrontAllyScreen = Math.max(
      ...frontAllies.map((a) => screenX(a, 0) + SPRITE_WIDTH),
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
        prevScreenX.set(ally.id, screenX(ally, 0));
      }
    }
    engine.tick(TICK_DT);
    const after = engine.getSnapshot();

    if (tracking && shouldTrack(after)) {
      for (const ally of after.allies.filter((a) => a.hp > 0)) {
        const sx = screenX(ally, 0);
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

/** spec A-§4.2-01: screenX === battleX（カメラ廃止） */
export function assertFrozenScreenDelta(
  samples: TickSample[],
  unitId: string,
  side: 'ally' | 'enemy',
  epsilon = 0.5,
): void {
  let prevScreen: number | null = null;
  let prevBattleX: number | null = null;

  for (const sample of samples) {
    const list = side === 'ally' ? sample.allies : sample.enemies;
    const unit = list.find((u) => u.id === unitId && u.hp > 0);
    if (!unit) continue;

    const sx = screenX(unit);
    if (prevScreen !== null && prevBattleX !== null) {
      const battleDelta = unit.battleX - prevBattleX;
      const screenDelta = sx - prevScreen;
      if (Math.abs(screenDelta - battleDelta) > epsilon) {
        throw new Error(
          `unit ${unitId}: screenX Δ=${screenDelta.toFixed(2)} expected ${battleDelta.toFixed(2)}`,
        );
      }
    }
    prevScreen = sx;
    prevBattleX = unit.battleX;
  }
}

export { SPRITE_WIDTH };
