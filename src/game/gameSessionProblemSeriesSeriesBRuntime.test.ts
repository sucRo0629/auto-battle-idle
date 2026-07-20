/**
 * @vitest-environment happy-dom
 *
 * R12m 1C 作業単位14E2: 系列Bが正式開始APIから BattleEngine へ渡され、
 * 全3 Wave で実Combatant spawn される production runtime 証拠。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BattleEngine } from '../battle/BattleEngine.ts';
import { tryLoadGameData } from '../battle/data/loadGameData.ts';
import { expandEnemyGroupsList } from '../battle/enemyGroupSpawn.ts';
import * as operationStartSnapshotModule from '../battle/problemSeries/operationStartSnapshot.ts';
import type { ProblemSeriesOperationStartSnapshot } from '../battle/problemSeries/operationStartSnapshot.ts';
import * as seedResolveModule from '../battle/problemSeries/seedResolve.ts';
import type { ResolvedWavesCombatInput } from '../battle/resolvedWaveCombatInput.ts';
import type { SaveGameState } from '../battle/types.ts';
import { setVerifyModeEnabled } from '../dev/verifyMode.ts';
import { GameSession } from './GameSession.ts';

const FIXTURE_SEED_A = 'fixture-a';
const FIXTURE_SEED_B = 'fixture-b';
const GENERATOR_VERSION = 'r12m-v1';
const SERIES_WAVE_COUNT = 3;
const PROBLEM_SERIES_SOURCE = { kind: 'problemSeries' } as const;

type WaveRuntimeSignature = {
  classIds: string[];
  combatModuleIds: string[];
};

function mockCanvas2d(): void {
  const ctx = {
    imageSmoothingEnabled: true,
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn(() => ({ width: 0 })),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    rotate: vi.fn(),
    setTransform: vi.fn(),
    drawImage: vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    canvas: { width: 800, height: 600 },
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    ctx as unknown as CanvasRenderingContext2D,
  );
}

function createSession(): GameSession {
  const loaded = tryLoadGameData();
  if (!loaded.ok) {
    throw new Error(loaded.error);
  }
  expect(loaded.data.problemSeriesCatalog.series.length).toBeGreaterThan(0);
  const container = document.createElement('div');
  document.body.appendChild(container);
  return new GameSession(loaded.data, container);
}

function getEngine(session: GameSession): BattleEngine {
  return (session as unknown as { engine: BattleEngine }).engine;
}

function getEngineProvider(
  engine: BattleEngine,
): (() => ResolvedWavesCombatInput | null) | undefined {
  return (
    engine as unknown as {
      getResolvedWavesCombatInput?: () => ResolvedWavesCombatInput | null;
    }
  ).getResolvedWavesCombatInput;
}

function livingEnemyClassIds(engine: BattleEngine): string[] {
  return engine
    .getSnapshot()
    .enemies.filter((enemy) => enemy.hp > 0)
    .map((enemy) => enemy.classId)
    .filter((id): id is string => id !== undefined);
}

function livingEnemyBasicSkillIds(engine: BattleEngine): string[] {
  return engine
    .getSnapshot()
    .enemies.filter((enemy) => enemy.hp > 0)
    .map((enemy) => {
      expect(enemy.basicSkillId).toBeDefined();
      return enemy.basicSkillId!;
    });
}

function expandWaveExpectations(
  waves: ProblemSeriesOperationStartSnapshot['waves'],
  waveIndex: number,
): {
  classIds: string[];
  moduleIds: string[];
  groupCount: number;
  expandedCount: number;
} {
  const wave = waves[waveIndex]!;
  expect(wave.enemyGroups.length).toBeGreaterThan(0);
  const specs = expandEnemyGroupsList([...wave.enemyGroups]);
  expect(specs.length).toBeGreaterThan(0);
  return {
    classIds: specs.map((spec) => spec.classId),
    moduleIds: specs.map((spec) => {
      expect(spec.selectedCombatModuleId).toBeDefined();
      return spec.selectedCombatModuleId!;
    }),
    groupCount: wave.enemyGroups.length,
    expandedCount: specs.length,
  };
}

function assertOperationStateLacksSeriesIdentity(session: GameSession): void {
  const op = session.getOperationState();
  expect(op).not.toBeNull();
  expect(op!.source).toEqual(PROBLEM_SERIES_SOURCE);
  expect(Object.keys(op!.source)).toEqual(['kind']);
  expect(Object.keys(op!)).not.toContain('seed');
  expect(Object.keys(op!)).not.toContain('generatorVersion');
  expect(Object.keys(op!)).not.toContain('seriesId');
  expect(Object.keys(op!)).not.toContain('waves');
  expect(Object.keys(op!)).not.toContain('stageId');
}

function assertCheckpointLacksSeriesIdentity(session: GameSession): void {
  const checkpoint = session.getOperationCheckpoint();
  expect(checkpoint).not.toBeNull();
  expect(checkpoint!.source).toEqual(PROBLEM_SERIES_SOURCE);
  expect(Object.keys(checkpoint!.source)).toEqual(['kind']);
  expect(Object.keys(checkpoint!)).not.toContain('seed');
  expect(Object.keys(checkpoint!)).not.toContain('generatorVersion');
  expect(Object.keys(checkpoint!)).not.toContain('seriesId');
  expect(Object.keys(checkpoint!)).not.toContain('waves');
  expect(Object.keys(checkpoint!)).not.toContain('stageId');
}

function assertSaveDoesNotEmbedProblemSeries(save: SaveGameState): void {
  const serialized = JSON.stringify(save);
  expect(serialized).not.toContain(FIXTURE_SEED_B);
  expect(serialized).not.toContain('r12m_series_b');
  expect(serialized).not.toContain(GENERATOR_VERSION);
  expect(serialized).not.toContain('"waves"');
}

function collectWaveRuntimeSignatures(
  session: GameSession,
  waveCount: number,
): WaveRuntimeSignature[] {
  const engine = getEngine(session);
  const signatures: WaveRuntimeSignature[] = [];

  for (let waveIndex = 0; waveIndex < waveCount; waveIndex++) {
    engine.restartBattleAtWave(waveIndex);
    const snap = engine.getSnapshot();
    expect(snap.waveIndex).toBe(waveIndex);
    expect(snap.waveCount).toBe(waveCount);
    expect(snap.enemies.filter((enemy) => enemy.hp > 0).length).toBeGreaterThan(
      0,
    );
    signatures.push({
      classIds: livingEnemyClassIds(engine),
      combatModuleIds: livingEnemyBasicSkillIds(engine),
    });
  }

  return signatures;
}

describe('GameSession series B BattleEngine runtime (R12m 1C unit14E2)', () => {
  let session: GameSession | null = null;

  beforeEach(() => {
    localStorage.clear();
    mockCanvas2d();
    setVerifyModeEnabled(false);
  });

  afterEach(() => {
    session?.destroy();
    session = null;
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it('series B: formal begin → BattleEngine spawns all 3 waves from held snapshot', () => {
    session = createSession();
    const engine = getEngine(session);
    const provider = getEngineProvider(engine);
    expect(provider).toBeTypeOf('function');

    const resolveSpy = vi.spyOn(
      seedResolveModule,
      'resolveProblemSeriesFromSeed',
    );
    const createSpy = vi.spyOn(
      operationStartSnapshotModule,
      'createProblemSeriesOperationStartSnapshot',
    );

    const returned = session.beginProblemSeriesOperation(FIXTURE_SEED_B);

    expect(returned).not.toBeNull();
    expect(returned!.seriesId).toBe('r12m_series_b');
    expect(returned!.seed).toBe(FIXTURE_SEED_B);
    expect(returned!.waves).toHaveLength(SERIES_WAVE_COUNT);
    expect(resolveSpy).toHaveBeenCalledTimes(1);
    expect(createSpy).toHaveBeenCalledTimes(1);

    expect(session.getOperationState()?.source).toEqual(PROBLEM_SERIES_SOURCE);
    expect(Object.keys(session.getOperationState()!.source)).toEqual(['kind']);
    expect(session.getOperationCheckpoint()?.source).toEqual(
      PROBLEM_SERIES_SOURCE,
    );
    expect(Object.keys(session.getOperationCheckpoint()!.source)).toEqual([
      'kind',
    ]);

    const held = session.getProblemSeriesOperationStartSnapshot();
    expect(held).toBe(returned);
    expect(provider!()).toBe(returned!.waves);
    expect(provider!()).toBe(held!.waves);

    for (let waveIndex = 0; waveIndex < SERIES_WAVE_COUNT; waveIndex++) {
      const expected = expandWaveExpectations(held!.waves, waveIndex);
      expect(expected.groupCount).toBeGreaterThan(0);
      expect(expected.expandedCount).toBeGreaterThan(0);

      engine.restartBattleAtWave(waveIndex);

      const snap = engine.getSnapshot();
      expect(snap.waveIndex).toBe(waveIndex);
      expect(snap.waveCount).toBe(SERIES_WAVE_COUNT);
      expect(livingEnemyClassIds(engine).length).toBeGreaterThan(0);
      expect(livingEnemyBasicSkillIds(engine).length).toBeGreaterThan(0);
      expect(livingEnemyClassIds(engine)).toEqual(expected.classIds);
      expect(livingEnemyBasicSkillIds(engine)).toEqual(expected.moduleIds);
    }

    expect(resolveSpy).toHaveBeenCalledTimes(1);
    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(session.getProblemSeriesOperationStartSnapshot()).toBe(returned);
    assertOperationStateLacksSeriesIdentity(session);
    assertCheckpointLacksSeriesIdentity(session);
    assertSaveDoesNotEmbedProblemSeries(session.getSaveState());
  });

  it('series A vs B: independent sessions yield distinct runtime signatures across 3 waves', () => {
    const sessionA = createSession();
    const sessionB = createSession();

    try {
      const snapshotA = sessionA.beginProblemSeriesOperation(FIXTURE_SEED_A);
      const snapshotB = sessionB.beginProblemSeriesOperation(FIXTURE_SEED_B);

      expect(snapshotA).not.toBeNull();
      expect(snapshotB).not.toBeNull();
      expect(snapshotA!.seriesId).toBe('r12m_series_a');
      expect(snapshotB!.seriesId).toBe('r12m_series_b');
      expect(snapshotA!.waves).toHaveLength(SERIES_WAVE_COUNT);
      expect(snapshotB!.waves).toHaveLength(SERIES_WAVE_COUNT);

      const signaturesA = collectWaveRuntimeSignatures(
        sessionA,
        SERIES_WAVE_COUNT,
      );
      const signaturesB = collectWaveRuntimeSignatures(
        sessionB,
        SERIES_WAVE_COUNT,
      );

      expect(signaturesA).toHaveLength(SERIES_WAVE_COUNT);
      expect(signaturesB).toHaveLength(SERIES_WAVE_COUNT);

      for (let waveIndex = 0; waveIndex < SERIES_WAVE_COUNT; waveIndex++) {
        const expectedA = expandWaveExpectations(
          snapshotA!.waves,
          waveIndex,
        );
        const expectedB = expandWaveExpectations(
          snapshotB!.waves,
          waveIndex,
        );
        expect(expectedA.groupCount).toBeGreaterThan(0);
        expect(expectedA.expandedCount).toBeGreaterThan(0);
        expect(expectedB.groupCount).toBeGreaterThan(0);
        expect(expectedB.expandedCount).toBeGreaterThan(0);

        expect(signaturesA[waveIndex]!.classIds).toEqual(expectedA.classIds);
        expect(signaturesA[waveIndex]!.combatModuleIds).toEqual(
          expectedA.moduleIds,
        );
        expect(signaturesB[waveIndex]!.classIds).toEqual(expectedB.classIds);
        expect(signaturesB[waveIndex]!.combatModuleIds).toEqual(
          expectedB.moduleIds,
        );
      }

      const allWavesIdentical = signaturesA.every(
        (signatureA, waveIndex) =>
          JSON.stringify(signatureA) ===
          JSON.stringify(signaturesB[waveIndex]),
      );
      expect(allWavesIdentical).toBe(false);

      const hasWaveDifference = signaturesA.some((signatureA, waveIndex) => {
        const signatureB = signaturesB[waveIndex]!;
        return (
          JSON.stringify(signatureA.classIds) !==
            JSON.stringify(signatureB.classIds) ||
          JSON.stringify(signatureA.combatModuleIds) !==
            JSON.stringify(signatureB.combatModuleIds)
        );
      });
      expect(hasWaveDifference).toBe(true);
    } finally {
      sessionA.destroy();
      sessionB.destroy();
    }
  });
});
