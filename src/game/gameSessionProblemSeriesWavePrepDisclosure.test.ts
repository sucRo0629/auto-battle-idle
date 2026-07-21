/**
 * @vitest-environment happy-dom
 *
 * R12m Player 作業単位2U6B: GameSession から WavePrep 開示 panel への production 接続。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BattleEngine } from '../battle/BattleEngine.ts';
import { tryLoadGameData } from '../battle/data/loadGameData.ts';
import { createEnemiesForStage } from '../battle/entities.ts';
import { expandEnemyGroupsList } from '../battle/enemyGroupSpawn.ts';
import * as operationStartSnapshotModule from '../battle/problemSeries/operationStartSnapshot.ts';
import type { ProblemSeriesOperationStartSnapshot } from '../battle/problemSeries/operationStartSnapshot.ts';
import * as seedResolveModule from '../battle/problemSeries/seedResolve.ts';
import {
  createProblemSeriesWavePrepDisclosureContext,
} from '../battle/problemSeries/wavePrepDisclosure.ts';
import { createProblemSeriesWavePrepEnemyChanges } from '../battle/problemSeries/wavePrepEnemyChanges.ts';
import type { ResolvedWavesCombatInput } from '../battle/resolvedWaveCombatInput.ts';
import {
  killAllEnemies,
  TICK_DT,
} from '../battle/test/battleFieldSpec.harness.ts';
import type { ClassId, GameData } from '../battle/types.ts';
import { PARTY_SLOT_COUNT } from '../battle/types.ts';
import { setVerifyModeEnabled } from '../dev/verifyMode.ts';
import { loadLevelCurves } from '../progression/levelGrowth.ts';
import { createProblemSeriesWavePrepDisclosureDisplay } from '../ui/problemSeriesWavePrepDisclosureViewModel.ts';
import { GameSession } from './GameSession.ts';
import levelCurvesJson from '../../data/levelCurves.json';

const levelCurves = loadLevelCurves(levelCurvesJson);

const PROBLEM_SERIES_SOURCE = { kind: 'problemSeries' } as const;
const SERIES_A_ID = 'r12m_series_a';
const SERIES_A_WAVE_COUNT = 3;
const RAW_FIXTURE_SEED = '  fixture-a  ';
const NORMALIZED_FIXTURE_SEED = 'fixture-a';
const GENERATOR_VERSION = 'r12m-v1';

const TICK_MS = 1000 / 60;
const MAX_ENGAGE_TICKS = 5000;
const MAX_WAVE_PREP_TICKS = 90_000;

const SERIES_A_INTERNAL_CLASS_STRINGS = [
  'single_protection',
  'multi_protection',
  'protection_scatter_pressure_composite',
] as const;

const SERIES_B_INTERNAL_CLASS_STRINGS = [
  'concentrated_pressure',
  'scattered_pressure',
  'concentrated_scattered_simultaneous_pressure',
] as const;

const FORBIDDEN_PANEL_DOM_SUBSTRINGS = [
  'fixture-a',
  'fixture-b',
  SERIES_A_ID,
  'r12m_series_b',
  GENERATOR_VERSION,
  'internalProblemClass',
  'expectedFailureModes',
  'connection',
  'waveRelationSummary',
  'finalWaveCompositeOf',
  'stageId',
  '推奨編成',
  '推奨撃破順',
  '撃破順',
  '勝率',
  '正解',
] as const;

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
    strokeText: vi.fn(),
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
    .filter((classId): classId is string => classId !== undefined);
}

function tickSession(session: GameSession, frames = 1): void {
  for (let i = 0; i < frames; i++) {
    session.tick(TICK_DT, TICK_MS);
  }
}

function waitForEngagedViaSession(
  session: GameSession,
  engine: BattleEngine,
  maxTicks = MAX_ENGAGE_TICKS,
): void {
  for (let i = 0; i < maxTicks; i++) {
    tickSession(session, 1);
    if (engine.getSnapshot().engaged) return;
  }
  throw new Error('engagement did not start via production tick');
}

function advanceSessionToWavePrepAfterKill(
  session: GameSession,
  engine: BattleEngine,
  spawnWaveEnemiesSpy: { mock: { calls: unknown[] } },
  maxTicks = MAX_WAVE_PREP_TICKS,
): void {
  const spawnCallsBeforeAdvance = spawnWaveEnemiesSpy.mock.calls.length;
  killAllEnemies(engine);
  for (let i = 0; i < maxTicks; i++) {
    tickSession(session, 1);
    if (session.getCurrentScreen() === 'wavePrep') {
      expect(spawnWaveEnemiesSpy.mock.calls.length).toBe(spawnCallsBeforeAdvance);
      return;
    }
    const snap = engine.getSnapshot();
    if (snap.phase === 'victory' || snap.phase === 'defeat') {
      throw new Error(
        [
          `battle ended (${snap.phase}) before wave prep`,
          `screen=${session.getCurrentScreen()}`,
          `waveIndex=${snap.waveIndex}`,
        ].join('; '),
      );
    }
  }
  throw new Error(
    [
      'wave prep not reached within tick limit',
      `screen=${session.getCurrentScreen()}`,
      `waveIndex=${engine.getSnapshot().waveIndex}`,
    ].join('; '),
  );
}

function getGameAppContainer(): HTMLElement {
  const container = document.body.querySelector('.game-app');
  if (!container) {
    throw new Error('game-app container not found');
  }
  return container as HTMLElement;
}

function getStageSelectContainer(session: GameSession): HTMLElement {
  const container = getGameAppContainer();
  if (session.getCurrentScreen() !== 'stageSelect') {
    throw new Error(
      `expected stageSelect screen, got ${session.getCurrentScreen()}`,
    );
  }
  return container;
}

function requireButton(
  root: ParentNode,
  selector: string,
  label: string,
): HTMLButtonElement {
  const button = root.querySelector<HTMLButtonElement>(selector);
  if (!button) {
    throw new Error(`${label} not found: ${selector}`);
  }
  return button;
}

function requireInput(
  root: ParentNode,
  selector: string,
  label: string,
): HTMLInputElement {
  const input = root.querySelector<HTMLInputElement>(selector);
  if (!input) {
    throw new Error(`${label} not found: ${selector}`);
  }
  return input;
}

function expandWaveExpectedClassIds(
  snapshot: ProblemSeriesOperationStartSnapshot,
  waveIndex: number,
): string[] {
  const wave = snapshot.waves[waveIndex];
  if (wave === undefined) {
    throw new Error(`prepared snapshot has no Wave ${waveIndex}`);
  }
  expect(wave.enemyGroups.length).toBeGreaterThan(0);
  const specs = expandEnemyGroupsList([...wave.enemyGroups]);
  expect(specs.length).toBeGreaterThan(0);
  return specs.map((spec) => spec.classId);
}

function countSnapshotEnemyGroups(
  snapshot: ProblemSeriesOperationStartSnapshot,
): number {
  return snapshot.waves.reduce(
    (total, wave) => total + wave.enemyGroups.length,
    0,
  );
}

function enemyClassIdsForFixedStageWave(
  gameData: GameData,
  stageId: string,
  waveIndex: number,
): string[] {
  const enemies = createEnemiesForStage(
    gameData,
    stageId,
    waveIndex,
    levelCurves,
  );
  expect(enemies.length).toBeGreaterThan(0);
  return enemies
    .map((enemy) => enemy.classId)
    .filter((id): id is string => id !== undefined);
}

function resolveEligibleFixedStageId(
  gameData: GameData,
  seriesAWave0ClassIds: readonly string[],
): { stageId: string; waveCount: number; wave0ClassIds: string[]; displayName: string } {
  const sortedSeriesClassIds = [...seriesAWave0ClassIds].sort();
  const eligibleStages = gameData.stages.filter((stage) => {
    if (stage.waves.length < 2) {
      return false;
    }
    const wave0ClassIds = enemyClassIdsForFixedStageWave(gameData, stage.id, 0);
    if (wave0ClassIds.length === 0) {
      return false;
    }
    return (
      JSON.stringify([...wave0ClassIds].sort()) !==
      JSON.stringify(sortedSeriesClassIds)
    );
  });

  expect(
    eligibleStages.length,
    'no eligible fixed stage: must exist, wave0 enemies non-empty, waveCount>=2, wave0 differs from series A',
  ).toBeGreaterThan(0);

  const stage = eligibleStages[0]!;
  const wave0ClassIds = enemyClassIdsForFixedStageWave(gameData, stage.id, 0);
  return {
    stageId: stage.id,
    waveCount: stage.waves.length,
    wave0ClassIds,
    displayName: stage.displayName,
  };
}

function selectFixedStageInDom(container: ParentNode, displayName: string): void {
  const listItems = container.querySelectorAll<HTMLButtonElement>(
    '.stage-selection-list-item',
  );
  for (const item of listItems) {
    const nameEl = item.querySelector('.stage-selection-list-item-name');
    if (nameEl?.textContent === displayName) {
      item.click();
      return;
    }
  }
  throw new Error(`stage list item not found for displayName: ${displayName}`);
}

function assertFixedStageSource(session: GameSession, stageId: string): void {
  const fixedSource = { kind: 'fixedStage', stageId } as const;
  const operation = session.getOperationState();
  expect(operation).not.toBeNull();
  expect(operation!.source).toStrictEqual(fixedSource);
}

function queryDisclosureHosts(root: ParentNode): NodeListOf<Element> {
  return root.querySelectorAll('.wave-prep-screen__problem-series-disclosure');
}

function queryPanelRoots(root: ParentNode): NodeListOf<Element> {
  return root.querySelectorAll('.problem-series-wave-prep-disclosure');
}

function assertPanelNonDisclosure(panelRoot: HTMLElement): void {
  const textContent = panelRoot.textContent ?? '';
  const outerHTML = panelRoot.outerHTML;
  for (const forbidden of FORBIDDEN_PANEL_DOM_SUBSTRINGS) {
    expect(textContent).not.toContain(forbidden);
    expect(outerHTML).not.toContain(forbidden);
  }
  for (const internalClass of SERIES_A_INTERNAL_CLASS_STRINGS) {
    expect(textContent).not.toContain(internalClass);
    expect(outerHTML).not.toContain(internalClass);
  }
  for (const internalClass of SERIES_B_INTERNAL_CLASS_STRINGS) {
    expect(textContent).not.toContain(internalClass);
    expect(outerHTML).not.toContain(internalClass);
  }
}

function expectedDisclosureFromSnapshot(
  snapshot: ProblemSeriesOperationStartSnapshot,
  targetWaveIndex: number,
  gameData: GameData,
) {
  const context = createProblemSeriesWavePrepDisclosureContext(
    snapshot,
    targetWaveIndex,
    gameData,
  );
  const enemyChanges = createProblemSeriesWavePrepEnemyChanges(context);
  return createProblemSeriesWavePrepDisclosureDisplay(context, enemyChanges);
}

function prepareProblemSeriesViaPlayerEntry(
  session: GameSession,
): ProblemSeriesOperationStartSnapshot {
  session.start();
  const container = getStageSelectContainer(session);

  requireButton(
    container,
    '.stage-selection-main-operation',
    'main operation button',
  ).click();

  const seedInput = requireInput(
    container,
    '.problem-series-entry-seed-input',
    'seed input',
  );
  seedInput.value = RAW_FIXTURE_SEED;
  seedInput.dispatchEvent(new Event('input', { bubbles: true }));

  requireButton(
    container,
    '.problem-series-entry-prepare',
    'prepare button',
  ).click();

  const snapshot = session.getProblemSeriesOperationStartSnapshot();
  if (snapshot === null) {
    throw new Error('prepared snapshot is null after Prepare');
  }
  expect(snapshot.seriesId).toBe(SERIES_A_ID);
  expect(snapshot.waves).toHaveLength(SERIES_A_WAVE_COUNT);
  expect(countSnapshotEnemyGroups(snapshot)).toBeGreaterThan(0);

  requireButton(
    container,
    '.problem-series-overview-confirm',
    'overview confirm button',
  ).click();

  return snapshot;
}

function confirmFormationAndStartWave0(session: GameSession): void {
  const appContainer = getGameAppContainer();
  requireButton(
    appContainer,
    '.skill-menu-return-to-battle-button',
    'formation confirm button',
  ).click();
}

describe('GameSession problem-series WavePrep disclosure (R12m Player unit2U6B — Wave 2 prep)', () => {
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

  it('1–2: series A Wave 2 prep shows disclosure panel; resolver/factory not re-run', () => {
    const loaded = tryLoadGameData();
    if (!loaded.ok) {
      throw new Error(loaded.error);
    }
    const gameData = loaded.data;

    const resolveSpy = vi.spyOn(
      seedResolveModule,
      'resolveProblemSeriesFromSeed',
    );
    const snapshotFactorySpy = vi.spyOn(
      operationStartSnapshotModule,
      'createProblemSeriesOperationStartSnapshot',
    );

    session = createSession();
    const engine = getEngine(session);
    const engineInternals = engine as unknown as {
      spawnWaveEnemies: () => void;
    };
    const spawnWaveEnemiesSpy = vi.spyOn(engineInternals, 'spawnWaveEnemies');

    const snapshot = prepareProblemSeriesViaPlayerEntry(session);
    const snapshotRefAtPrepare = snapshot;

    const resolveCallsAfterPrepare = resolveSpy.mock.calls.length;
    const factoryCallsAfterPrepare = snapshotFactorySpy.mock.calls.length;
    expect(resolveCallsAfterPrepare).toBe(1);
    expect(factoryCallsAfterPrepare).toBe(1);

    confirmFormationAndStartWave0(session);

    expect(session.getCurrentScreen()).toBe('battle');
    expect(engine.getSnapshot().waveIndex).toBe(0);

    waitForEngagedViaSession(session, engine);
    const livingDuringWave0 = livingEnemyClassIds(engine);
    expect(livingDuringWave0.length).toBeGreaterThan(0);

    advanceSessionToWavePrepAfterKill(session, engine, spawnWaveEnemiesSpy);

    const appContainer = getGameAppContainer();
    expect(session.getCurrentScreen()).toBe('wavePrep');

    const operation = session.getOperationState();
    if (operation === null) {
      throw new Error('operation state is null after Wave 0 clear');
    }
    expect(operation.source).toStrictEqual(PROBLEM_SERIES_SOURCE);
    expect(operation.clearedWaveCount).toBe(1);
    expect(operation.currentWaveIndex).toBe(0);
    expect(operation.isWavePrepEditable).toBe(true);
    expect(session.getProblemSeriesOperationStartSnapshot()).toBe(snapshotRefAtPrepare);

    const disclosureHosts = queryDisclosureHosts(appContainer);
    expect(disclosureHosts).toHaveLength(1);

    const panelRoots = queryPanelRoots(appContainer);
    expect(panelRoots).toHaveLength(1);

    const nextWaveSection = panelRoots[0]!.querySelector(
      '.problem-series-wave-prep-disclosure__next-wave',
    );
    expect(nextWaveSection).not.toBeNull();
    expect(nextWaveSection?.querySelector('h3')?.textContent).toBe('Wave 2');

    const expectedDisplay = expectedDisclosureFromSnapshot(snapshot, 1, gameData);
    expect(expectedDisplay.nextWave.waveNumber).toBe(2);
    expect(expectedDisplay.enemyChanges.map((change) => change.classId)).toEqual([
      'df_guardian',
      'sp_cleric',
      'at_sorcerer',
    ]);

    const changesSection = panelRoots[0]!.querySelector(
      '.problem-series-wave-prep-disclosure__changes',
    );
    for (const change of expectedDisplay.enemyChanges) {
      expect(changesSection?.textContent).toContain(change.classDisplayName);
    }

    const remainingSection = panelRoots[0]!.querySelector(
      '.problem-series-wave-prep-disclosure__remaining',
    );
    expect(remainingSection?.querySelector('h3')?.textContent).toBe('Wave 3');
    expect(remainingSection?.textContent).not.toContain('次Wave以降のWaveなし');

    expect(appContainer.querySelectorAll('.wave-prep-screen__slot')).toHaveLength(
      PARTY_SLOT_COUNT,
    );
    expect(appContainer.querySelector('.wave-prep-screen__resource')).not.toBeNull();
    expect(appContainer.querySelector('.wave-prep-screen__confirm')).not.toBeNull();
    expect(
      appContainer.querySelectorAll('.wave-prep-screen__module-section').length,
    ).toBeGreaterThan(0);
    expect(
      appContainer.querySelectorAll('.wave-prep-screen__passive-block').length,
    ).toBeGreaterThan(0);

    assertPanelNonDisclosure(panelRoots[0] as HTMLElement);

    expect(resolveSpy.mock.calls.length).toBe(resolveCallsAfterPrepare);
    expect(snapshotFactorySpy.mock.calls.length).toBe(factoryCallsAfterPrepare);
  });
});

describe('GameSession problem-series WavePrep disclosure (R12m Player unit2U6B — Wave 3 prep)', () => {
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

  it('3: Wave 3 prep replaces Wave 2 disclosure; snapshot and resolver/factory unchanged', () => {
    const loaded = tryLoadGameData();
    if (!loaded.ok) {
      throw new Error(loaded.error);
    }
    const gameData = loaded.data;

    const resolveSpy = vi.spyOn(
      seedResolveModule,
      'resolveProblemSeriesFromSeed',
    );
    const snapshotFactorySpy = vi.spyOn(
      operationStartSnapshotModule,
      'createProblemSeriesOperationStartSnapshot',
    );

    session = createSession();
    const engine = getEngine(session);
    const engineInternals = engine as unknown as {
      spawnWaveEnemies: () => void;
    };
    const spawnWaveEnemiesSpy = vi.spyOn(engineInternals, 'spawnWaveEnemies');

    const snapshot = prepareProblemSeriesViaPlayerEntry(session);
    const snapshotRefAtPrepare = snapshot;

    const resolveCallsAfterPrepare = resolveSpy.mock.calls.length;
    const factoryCallsAfterPrepare = snapshotFactorySpy.mock.calls.length;
    expect(resolveCallsAfterPrepare).toBe(1);
    expect(factoryCallsAfterPrepare).toBe(1);

    confirmFormationAndStartWave0(session);

    const expectedWave1ClassIds = expandWaveExpectedClassIds(snapshot, 1);

    waitForEngagedViaSession(session, engine);
    advanceSessionToWavePrepAfterKill(session, engine, spawnWaveEnemiesSpy);

    const appContainer = getGameAppContainer();
    expect(queryPanelRoots(appContainer)).toHaveLength(1);
    expect(
      queryPanelRoots(appContainer)[0]!.querySelector(
        '.problem-series-wave-prep-disclosure__next-wave h3',
      )?.textContent,
    ).toBe('Wave 2');

    requireButton(
      appContainer,
      '.wave-prep-screen__confirm',
      'wave prep confirm button',
    ).click();

    expect(session.getCurrentScreen()).toBe('battle');
    expect(engine.getSnapshot().waveIndex).toBe(1);

    waitForEngagedViaSession(session, engine);
    const livingWave1 = livingEnemyClassIds(engine);
    expect(livingWave1.length).toBeGreaterThan(0);
    expect(livingWave1).toEqual(expectedWave1ClassIds);

    advanceSessionToWavePrepAfterKill(session, engine, spawnWaveEnemiesSpy);

    expect(session.getCurrentScreen()).toBe('wavePrep');

    const operation = session.getOperationState();
    if (operation === null) {
      throw new Error('operation state is null after Wave 1 clear');
    }
    expect(operation.clearedWaveCount).toBe(2);
    expect(operation.currentWaveIndex).toBe(1);
    expect(session.getProblemSeriesOperationStartSnapshot()).toBe(snapshotRefAtPrepare);

    const panelRoots = queryPanelRoots(appContainer);
    expect(panelRoots).toHaveLength(1);

    const nextWaveSection = panelRoots[0]!.querySelector(
      '.problem-series-wave-prep-disclosure__next-wave',
    );
    expect(nextWaveSection?.querySelector('h3')?.textContent).toBe('Wave 3');
    expect(panelRoots[0]!.textContent).not.toContain('Wave 2');

    const remainingSection = panelRoots[0]!.querySelector(
      '.problem-series-wave-prep-disclosure__remaining',
    );
    expect(remainingSection?.textContent).toContain('次Wave以降のWaveなし');
    expect(
      remainingSection?.querySelectorAll('.problem-series-wave-prep-disclosure__wave'),
    ).toHaveLength(0);

    const expectedDisplay = expectedDisclosureFromSnapshot(snapshot, 2, gameData);
    expect(expectedDisplay.nextWave.waveNumber).toBe(3);

    assertPanelNonDisclosure(panelRoots[0] as HTMLElement);

    expect(resolveSpy.mock.calls.length).toBe(resolveCallsAfterPrepare);
    expect(snapshotFactorySpy.mock.calls.length).toBe(factoryCallsAfterPrepare);
  });
});

describe('GameSession problem-series WavePrep disclosure (R12m Player unit2U6B — fixedStage boundary)', () => {
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

  it('4: retained snapshot with active fixedStage shows no problem-series panel', () => {
    const loaded = tryLoadGameData();
    if (!loaded.ok) {
      throw new Error(loaded.error);
    }
    const gameData = loaded.data;

    const resolveSpy = vi.spyOn(
      seedResolveModule,
      'resolveProblemSeriesFromSeed',
    );
    const snapshotFactorySpy = vi.spyOn(
      operationStartSnapshotModule,
      'createProblemSeriesOperationStartSnapshot',
    );

    session = createSession();

    const prepared = session.prepareProblemSeriesOperationStart(NORMALIZED_FIXTURE_SEED);
    expect(prepared.seriesId).toBe(SERIES_A_ID);
    const snapshotRefAtPrepare = prepared;
    expect(session.getProblemSeriesOperationStartSnapshot()).toBe(snapshotRefAtPrepare);

    const resolveCallsAfterPrepare = resolveSpy.mock.calls.length;
    const factoryCallsAfterPrepare = snapshotFactorySpy.mock.calls.length;
    expect(resolveCallsAfterPrepare).toBe(1);
    expect(factoryCallsAfterPrepare).toBe(1);

    const seriesAWave0ClassIds = expandWaveExpectedClassIds(prepared, 0);
    const eligible = resolveEligibleFixedStageId(gameData, seriesAWave0ClassIds);
    expect(eligible.waveCount).toBeGreaterThanOrEqual(2);
    expect(eligible.wave0ClassIds.length).toBeGreaterThan(0);

    session.start();
    const container = getStageSelectContainer(session);
    selectFixedStageInDom(container, eligible.displayName);
    requireButton(container, '.stage-selection-sortie', 'sortie button').click();

    assertFixedStageSource(session, eligible.stageId);
    expect(session.getProblemSeriesOperationStartSnapshot()).toBe(snapshotRefAtPrepare);

    confirmFormationAndStartWave0(session);

    const engine = getEngine(session);
    const provider = getEngineProvider(engine);
    if (provider === undefined) {
      throw new Error('BattleEngine resolved waves provider is missing');
    }
    expect(provider()).toBeNull();

    const engineInternals = engine as unknown as {
      spawnWaveEnemies: () => void;
    };
    const spawnWaveEnemiesSpy = vi.spyOn(engineInternals, 'spawnWaveEnemies');

    waitForEngagedViaSession(session, engine);
    const livingDuringWave0 = livingEnemyClassIds(engine);
    expect(livingDuringWave0.length).toBeGreaterThan(0);
    expect(livingDuringWave0).toEqual(eligible.wave0ClassIds);
    expect(livingDuringWave0).not.toEqual(seriesAWave0ClassIds);

    advanceSessionToWavePrepAfterKill(session, engine, spawnWaveEnemiesSpy);

    const appContainer = getGameAppContainer();
    expect(session.getCurrentScreen()).toBe('wavePrep');
    assertFixedStageSource(session, eligible.stageId);
    expect(session.getProblemSeriesOperationStartSnapshot()).toBe(snapshotRefAtPrepare);

    expect(queryDisclosureHosts(appContainer)).toHaveLength(1);
    expect(queryPanelRoots(appContainer)).toHaveLength(0);

    expect(appContainer.querySelectorAll('.wave-prep-screen__slot')).toHaveLength(
      PARTY_SLOT_COUNT,
    );
    expect(appContainer.querySelector('.wave-prep-screen__resource')).not.toBeNull();
    expect(appContainer.querySelector('.wave-prep-screen__confirm')).not.toBeNull();

    const wavePrepScreenHost = (
      session as unknown as {
        wavePrepScreenHost: {
          callbacks: {
            getAllowedClassIds?: () => readonly ClassId[] | undefined;
          };
        };
      }
    ).wavePrepScreenHost;
    expect(wavePrepScreenHost.callbacks.getAllowedClassIds?.()).toBeUndefined();

    expect(resolveSpy.mock.calls.length).toBe(resolveCallsAfterPrepare);
    expect(snapshotFactorySpy.mock.calls.length).toBe(factoryCallsAfterPrepare);
  });
});
