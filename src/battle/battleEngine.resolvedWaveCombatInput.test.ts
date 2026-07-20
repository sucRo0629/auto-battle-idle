/**
 * R12m 1C 作業単位7: BattleEngine 解決済み Wave 戦闘入力 provider.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import levelCurvesJson from '../../data/levelCurves.json';
import {
  BattleEngine,
  type BattleEngineOptions,
} from './BattleEngine.ts';
import { loadGameData } from './data/loadGameData.ts';
import { loadLevelCurves } from '../progression/levelGrowth.ts';
import { createDefaultSave } from '../progression/victoryRewards.ts';
import { createProblemSeriesOperationStartSnapshot } from './problemSeries/operationStartSnapshot.ts';
import { resolveProblemSeriesFromSeed } from './problemSeries/seedResolve.ts';
import type { GameData, StageDef } from './types.ts';
import {
  asBattleEngineInternals,
  killAllEnemies,
  TICK_DT,
  waitForEngaged,
} from './test/battleFieldSpec.harness.ts';
import type { ResolvedWavesCombatInput } from './resolvedWaveCombatInput.ts';

const FIXTURE_SEED_A = 'fixture-a';
/** 系列 A は 3 Wave。固定 Stage "1" は 2 Wave — provider 空振り防止用に意図的に不一致。 */
const MISMATCHED_FIXED_STAGE_ID = '1';
const EXPECTED_FIXED_STAGE_WAVE_COUNT = 2;
const SERIES_A_WAVE_COUNT = 3;

const SERIES_A_WAVE0 = {
  classIds: ['df_guardian', 'sp_cleric', 'at_sorcerer'],
  modules: [
    'df_guardian_mod_nearest_strike',
    'sp_cleric_mod_single_mend',
    'at_sorcerer_mod_focus',
  ],
} as const;

const SERIES_A_WAVE2 = {
  classIds: ['df_guardian', 'at_swordsman', 'sp_cleric', 'at_sorcerer'],
  modules: [
    'df_guardian_mod_guard_focus',
    'at_swordsman_mod_pierce_slash',
    'sp_cleric_mod_party_mend',
    'at_sorcerer_mod_chain',
  ],
} as const;

function createFixtureASnapshotWaves(): ResolvedWavesCombatInput {
  const catalog = loadGameData().problemSeriesCatalog;
  const result = resolveProblemSeriesFromSeed(catalog, FIXTURE_SEED_A);
  expect(result.series.seriesId).toBe('r12m_series_a');
  const snapshot = createProblemSeriesOperationStartSnapshot(result);
  expect(snapshot.waves).toHaveLength(SERIES_A_WAVE_COUNT);
  return snapshot.waves;
}

function gameDataWithAssertedMismatch(): GameData {
  const gameData = loadGameData();
  const stage = gameData.stages.find((s) => s.id === MISMATCHED_FIXED_STAGE_ID);
  expect(stage).toBeDefined();
  expect(stage!.waves.length).toBe(EXPECTED_FIXED_STAGE_WAVE_COUNT);
  expect(stage!.waves.length).not.toBe(SERIES_A_WAVE_COUNT);
  return gameData;
}

function createEngine(options: {
  gameData?: GameData;
  stageId?: string;
  getResolvedWavesCombatInput?: BattleEngineOptions['getResolvedWavesCombatInput'];
}): { engine: BattleEngine; gameData: GameData; stageId: string } {
  const gameData = options.gameData ?? gameDataWithAssertedMismatch();
  const stageId = options.stageId ?? MISMATCHED_FIXED_STAGE_ID;
  const levelCurves = loadLevelCurves(levelCurvesJson);
  const save = createDefaultSave(gameData, 'demo');
  save.stageProgress.currentStageId = stageId;
  for (const slot of save.party) {
    if (slot) slot.progress.level = 10;
  }
  const engine = new BattleEngine(
    gameData,
    levelCurves,
    () => save.party,
    () => save.stageProgress.currentStageId,
    {
      getResolvedWavesCombatInput: options.getResolvedWavesCombatInput,
    },
  );
  engine.startBattle();
  return { engine, gameData, stageId };
}

function enemyBasicSkillIds(engine: BattleEngine): string[] {
  return engine
    .getSnapshot()
    .enemies.filter((e) => e.hp > 0)
    .map((e) => {
      expect(e.basicSkillId).toBeDefined();
      return e.basicSkillId!;
    });
}

function enemyClassIds(engine: BattleEngine): string[] {
  return engine
    .getSnapshot()
    .enemies.filter((e) => e.hp > 0)
    .map((e) => e.classId)
    .filter((id): id is string => id !== undefined);
}

function reachAwaitingAfterKill(engine: BattleEngine): void {
  waitForEngaged(engine);
  killAllEnemies(engine);
  for (let i = 0; i < 90_000; i++) {
    engine.tick(TICK_DT);
    const snap = engine.getSnapshot();
    if (snap.awaitingNextWave) return;
    if (snap.phase === 'victory' || snap.phase === 'defeat') {
      throw new Error(
        `battle ended (${snap.phase}) instead of awaiting next wave`,
      );
    }
  }
  throw new Error('awaiting next wave state not reached');
}

function reachVictoryAfterKill(engine: BattleEngine): void {
  waitForEngaged(engine);
  killAllEnemies(engine);
  for (let i = 0; i < 90_000; i++) {
    engine.tick(TICK_DT);
    const snap = engine.getSnapshot();
    if (snap.phase === 'victory') return;
    if (snap.awaitingNextWave) {
      throw new Error('awaiting next wave on presumed final wave');
    }
    if (snap.phase === 'defeat') {
      throw new Error('defeat instead of victory');
    }
  }
  throw new Error('victory not reached');
}

describe('BattleEngine resolved waves combat input provider (R12m 1C unit7)', () => {
  it('fixture-a snapshot.waves → waveCount 3 and wave 0 matches series A (not fixed stage)', () => {
    const waves = createFixtureASnapshotWaves();
    const { engine, gameData, stageId } = createEngine({
      getResolvedWavesCombatInput: () => waves,
    });

    const fixedWaveCount = gameData.stages.find((s) => s.id === stageId)!
      .waves.length;
    expect(fixedWaveCount).toBe(EXPECTED_FIXED_STAGE_WAVE_COUNT);

    const snap = engine.getSnapshot();
    expect(snap.waveCount).toBe(SERIES_A_WAVE_COUNT);
    expect(snap.waveCount).not.toBe(fixedWaveCount);
    expect(snap.waveIndex).toBe(0);
    expect(enemyClassIds(engine)).toEqual([...SERIES_A_WAVE0.classIds]);
    expect(enemyBasicSkillIds(engine)).toEqual([...SERIES_A_WAVE0.modules]);
  });

  it('uses provider waveCount for next-wave transition and treats wave 2 as final', () => {
    const waves = createFixtureASnapshotWaves();
    const { engine } = createEngine({
      getResolvedWavesCombatInput: () => waves,
    });
    expect(engine.getSnapshot().waveCount).toBe(3);

    reachAwaitingAfterKill(engine);
    expect(engine.getSnapshot().awaitingNextWave).toBe(true);
    expect(engine.getSnapshot().waveIndex).toBe(0);
    expect(engine.startNextWave()).toBe(true);

    waitForEngaged(engine);
    expect(engine.getSnapshot().waveIndex).toBe(1);
    reachAwaitingAfterKill(engine);
    expect(engine.getSnapshot().awaitingNextWave).toBe(true);
    expect(engine.startNextWave()).toBe(true);

    waitForEngaged(engine);
    expect(engine.getSnapshot().waveIndex).toBe(2);
    reachVictoryAfterKill(engine);
    expect(engine.getSnapshot().phase).toBe('victory');
    expect(engine.getSnapshot().awaitingNextWave).toBe(false);
  });

  it('restartBattleAtWave(2) spawns series A wave 2; out-of-range clamps to provider count', () => {
    const waves = createFixtureASnapshotWaves();
    const { engine } = createEngine({
      getResolvedWavesCombatInput: () => waves,
    });

    engine.restartBattleAtWave(2);
    expect(engine.getSnapshot().waveIndex).toBe(2);
    expect(engine.getSnapshot().waveCount).toBe(3);
    expect(enemyClassIds(engine)).toEqual([...SERIES_A_WAVE2.classIds]);
    expect(enemyBasicSkillIds(engine)).toEqual([...SERIES_A_WAVE2.modules]);

    engine.restartBattleAtWave(99);
    expect(engine.getSnapshot().waveIndex).toBe(2);
    expect(enemyClassIds(engine)).toEqual([...SERIES_A_WAVE2.classIds]);
    expect(enemyBasicSkillIds(engine)).toEqual([...SERIES_A_WAVE2.modules]);
  });

  it('does not mutate provider waves / groups', () => {
    const waves = createFixtureASnapshotWaves();
    const before = structuredClone(waves);

    const { engine } = createEngine({
      getResolvedWavesCombatInput: () => waves,
    });
    engine.restartBattleAtWave(2);
    reachVictoryAfterKill(engine);

    expect(waves).toEqual(before);
    expect(waves[0]!.enemyGroups[0]).toEqual(before[0]!.enemyGroups[0]);
  });

  it('empty provider array does not fall back to fixed Stage', () => {
    const gameData = gameDataWithAssertedMismatch();
    const levelCurves = loadLevelCurves(levelCurvesJson);
    const save = createDefaultSave(gameData, 'demo');
    save.stageProgress.currentStageId = MISMATCHED_FIXED_STAGE_ID;

    expect(() => {
      new BattleEngine(
        gameData,
        levelCurves,
        () => save.party,
        () => save.stageProgress.currentStageId,
        { getResolvedWavesCombatInput: () => [] },
      );
    }).toThrow(/Resolved wave combat input out of range/);
  });

  it('provider null uses fixed Stage path (same as omitted provider)', () => {
    const { engine: withNull } = createEngine({
      getResolvedWavesCombatInput: () => null,
    });
    const { engine: omitted } = createEngine({});

    expect(withNull.getSnapshot().waveCount).toBe(
      EXPECTED_FIXED_STAGE_WAVE_COUNT,
    );
    expect(omitted.getSnapshot().waveCount).toBe(
      EXPECTED_FIXED_STAGE_WAVE_COUNT,
    );
    expect(withNull.getSnapshot().waveCount).not.toBe(SERIES_A_WAVE_COUNT);

    const nullClasses = enemyClassIds(withNull);
    const omittedClasses = enemyClassIds(omitted);
    expect(nullClasses.length).toBeGreaterThan(0);
    expect(nullClasses).toEqual(omittedClasses);
    expect(nullClasses).not.toEqual([...SERIES_A_WAVE0.classIds]);
  });

  it('fixed Stage without provider keeps waveCount, spawn, next-wave, and restart behavior', () => {
    const divergentStage: StageDef = {
      id: 'r12m_unit7_fixed_stage_control',
      displayName: 'Unit7 Fixed Control',
      recommendedLevel: 10,
      waves: [
        {
          enemies: [],
          enemyGroups: [{ classId: 'df_guardian', count: 1 }],
        },
        {
          enemies: [],
          enemyGroups: [{ classId: 'at_sorcerer', count: 2 }],
        },
      ],
    };
    const base = loadGameData();
    const gameData: GameData = {
      ...base,
      stages: [
        ...base.stages.filter((s) => s.id !== divergentStage.id),
        divergentStage,
      ],
    };

    const { engine } = createEngine({
      gameData,
      stageId: divergentStage.id,
    });

    expect(engine.getSnapshot().waveCount).toBe(2);
    expect(enemyClassIds(engine)).toEqual(['df_guardian']);

    reachAwaitingAfterKill(engine);
    expect(engine.startNextWave()).toBe(true);
    waitForEngaged(engine);
    expect(engine.getSnapshot().waveIndex).toBe(1);
    expect(enemyClassIds(engine)).toEqual(['at_sorcerer', 'at_sorcerer']);

    engine.restartBattleAtWave(0);
    expect(engine.getSnapshot().waveIndex).toBe(0);
    expect(enemyClassIds(engine)).toEqual(['df_guardian']);

    engine.restartBattleAtWave(99);
    expect(engine.getSnapshot().waveIndex).toBe(1);
    expect(enemyClassIds(engine)).toEqual(['at_sorcerer', 'at_sorcerer']);
  });

  it('out-of-range resolved waveIndex fails clearly without Stage fallback', () => {
    const waves = createFixtureASnapshotWaves();
    const { engine } = createEngine({
      getResolvedWavesCombatInput: () => waves,
    });
    const internals = asBattleEngineInternals(engine) as unknown as {
      waveIndex: number;
      spawnWaveEnemies: () => void;
    };
    internals.waveIndex = 99;
    expect(() => internals.spawnWaveEnemies()).toThrow(
      /Resolved wave combat input out of range/,
    );
  });

  it('BattleEngine source: provider path does not leak bare stage.waves.length', () => {
    const sourcePath = join(
      dirname(fileURLToPath(import.meta.url)),
      'BattleEngine.ts',
    );
    const source = readFileSync(sourcePath, 'utf8');
    const lines = source.split(/\r?\n/);

    const bareStageWavesLength = lines
      .map((line, index) => ({ line, n: index + 1 }))
      .filter(({ line }) => /stage\.waves\.length/.test(line));

    expect(bareStageWavesLength.length).toBeGreaterThan(0);
    for (const { line, n } of bareStageWavesLength) {
      // startNextWave / checkBattleEnd: provider 分岐の else 内のみ許可
      const nearby = lines.slice(Math.max(0, n - 30), n + 1).join('\n');
      const gated =
        nearby.includes('resolveProviderWaveCount()') &&
        (nearby.includes('providerWaveCount !== undefined') ||
          nearby.includes('else {'));
      expect(
        gated,
        `line ${n} uses stage.waves.length without provider gate: ${line.trim()}`,
      ).toBe(true);
    }

    // provider 正本の waveCount 取得は必ず resolveProviderWaveCount を先に見る
    const providerFirstSites = [
      'private resolveStartWaveIndex():',
      'private buildFireGateContext(',
      'private tryAutoFireFinalWaveStageSkills():',
      'restartBattleAtWave(waveIndex: number):',
      'getSnapshot(): BattleSnapshot',
    ];
    for (const site of providerFirstSites) {
      const idx = lines.findIndex((l) => l.includes(site));
      expect(idx, site).toBeGreaterThanOrEqual(0);
      const body = lines.slice(idx, idx + 20).join('\n');
      expect(body, site).toContain('resolveProviderWaveCount()');
    }
  });
});
