/**
 * @vitest-environment happy-dom
 *
 * R12m Player unit 2X1: ally HUD metadata for problem-series battles must come from
 * resolveBattleParty (OperationState party), not Save party.
 * Fixed-stage battles must still match Save party (non-regression).
 *
 * R12m Player unit 2X3: problem-series battles omit fixed STAGE plate from Save
 * currentStageId; fixed-stage battles keep STAGE {stageId}; residual snapshot alone
 * must not switch the plate.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BattleEngine } from '../battle/BattleEngine.ts';
import { tryLoadGameData } from '../battle/data/loadGameData.ts';
import type { ClassId, GameData, PartySlotState } from '../battle/types.ts';
import { PARTY_SLOT_COUNT } from '../battle/types.ts';
import { setVerifyModeEnabled } from '../dev/verifyMode.ts';
import { readClassDisplayLabel } from '../ui/classDisplayName.ts';
import { GameSession } from './GameSession.ts';

const SERIES_A_ID = 'r12m_series_a';
const PROBLEM_SERIES_SOURCE = { kind: 'problemSeries' } as const;
const RAW_FIXTURE_SEED = '  fixture-a  ';
const OUT_OF_SCOPE_CLASS_ID: ClassId = 'at_ranger';
const FIXED_STAGE_ID = '1';
const TICK_DT = 1 / 60;
const TICK_MS = 1000 / 60;

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

function classDisplayName(gameData: GameData, classId: ClassId): string {
  const preset = gameData.classRegistry[classId];
  return readClassDisplayLabel(preset, classId).displayName;
}

function getSavePartyClassIds(session: GameSession): ClassId[] {
  return session
    .getSaveState()
    .party.filter((member): member is NonNullable<PartySlotState> => member !== null)
    .map((member) => member.classId);
}

function getOperationPartyClassIds(session: GameSession): ClassId[] {
  const party = session.getOperationParty();
  if (party === null) {
    throw new Error('operation party is null');
  }
  return party
    .filter((member): member is NonNullable<PartySlotState> => member !== null)
    .map((member) => member.classId);
}

function livingAllyClassIds(engine: BattleEngine): string[] {
  return engine
    .getSnapshot()
    .allies.filter((ally) => ally.hp > 0)
    .map((ally) => ally.classId)
    .filter((classId): classId is string => classId !== undefined);
}

function livingEnemyClassIds(engine: BattleEngine): string[] {
  return engine
    .getSnapshot()
    .enemies.filter((enemy) => enemy.hp > 0)
    .map((enemy) => enemy.classId)
    .filter((classId): classId is string => classId !== undefined);
}

function getAllyHudDisplayNames(): string[] {
  return [...document.querySelectorAll('.party-hud-label')]
    .map((el) => (el.textContent ?? '').trim())
    .filter((name) => name.length > 0);
}

function tickSession(session: GameSession, frames = 3): void {
  for (let i = 0; i < frames; i++) {
    session.tick(TICK_DT, TICK_MS);
  }
}

function ensureSavePartyHasOutOfScopeClass(session: GameSession): void {
  const classIds = getSavePartyClassIds(session);
  expect(classIds).toContain(OUT_OF_SCOPE_CLASS_ID);
}

function selectFixedStageById(container: ParentNode, stageId: string, displayName: string): void {
  const options = [
    ...container.querySelectorAll<HTMLButtonElement>(
      '.stage-selection-list-item[role="option"]',
    ),
  ];
  expect(options.length).toBeGreaterThan(0);
  const match = options.find((option) => {
    const name = option.querySelector('.stage-selection-list-item-name')?.textContent?.trim();
    return name === displayName;
  });
  if (!match) {
    throw new Error(`fixed stage option not found for id=${stageId} name=${displayName}`);
  }
  match.click();
}

describe('GameSession problem-series battle HUD party (R12m Player 2X1)', () => {
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

  it('problemSeries: ally HUD uses OperationState party via resolveBattleParty, not Save party', () => {
    const loaded = tryLoadGameData();
    if (!loaded.ok) {
      throw new Error(loaded.error);
    }
    const gameData = loaded.data;
    const seriesA = gameData.problemSeriesCatalog.series.find(
      (entry) => entry.seriesId === SERIES_A_ID,
    );
    if (seriesA === undefined) {
      throw new Error(`Expected problem series ${SERIES_A_ID}`);
    }
    const allowedClassIds = seriesA.allowedClassIds;
    expect(allowedClassIds).toHaveLength(PARTY_SLOT_COUNT);
    expect(allowedClassIds).not.toContain(OUT_OF_SCOPE_CLASS_ID);

    const outOfScopeDisplayName = classDisplayName(gameData, OUT_OF_SCOPE_CLASS_ID);
    expect(outOfScopeDisplayName.length).toBeGreaterThan(0);

    session = createSession();
    session.start();
    ensureSavePartyHasOutOfScopeClass(session);
    const saveBefore = structuredClone(session.getSaveState());

    const resolveBattlePartySpy = vi.spyOn(
      session as unknown as { resolveBattleParty: () => PartySlotState[] },
      'resolveBattleParty',
    );

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
    expect(snapshot.allowedClassIds).toEqual(allowedClassIds);

    requireButton(
      container,
      '.problem-series-overview-confirm',
      'overview confirm button',
    ).click();

    expect(session.getCurrentScreen()).toBe('formation');
    expect(session.getOperationState()?.source).toStrictEqual(PROBLEM_SERIES_SOURCE);

    requireButton(
      getGameAppContainer(),
      '.skill-menu-return-to-battle-button',
      'formation confirm button',
    ).click();

    expect(session.getCurrentScreen()).toBe('battle');
    const engine = getEngine(session);
    expect(engine.getSnapshot().waveIndex).toBe(0);

    const callsBeforeHudRefresh = resolveBattlePartySpy.mock.calls.length;
    tickSession(session, 5);
    expect(resolveBattlePartySpy.mock.calls.length).toBeGreaterThan(
      callsBeforeHudRefresh,
    );

    expect(getSavePartyClassIds(session)).toContain(OUT_OF_SCOPE_CLASS_ID);
    expect(session.getSaveState().party).toEqual(saveBefore.party);

    const operationClassIds = getOperationPartyClassIds(session);
    expect(operationClassIds).toHaveLength(PARTY_SLOT_COUNT);
    expect(new Set(operationClassIds)).toEqual(new Set(allowedClassIds));
    expect(operationClassIds).not.toContain(OUT_OF_SCOPE_CLASS_ID);

    const livingAllies = livingAllyClassIds(engine);
    expect(livingAllies).toHaveLength(PARTY_SLOT_COUNT);
    expect(livingAllies.sort()).toEqual([...operationClassIds].sort());
    expect(livingAllies).not.toContain(OUT_OF_SCOPE_CLASS_ID);

    const allyHudNames = getAllyHudDisplayNames();
    expect(allyHudNames).toHaveLength(PARTY_SLOT_COUNT);

    const expectedHudNames = operationClassIds.map((classId) =>
      classDisplayName(gameData, classId),
    );
    expect([...allyHudNames].sort()).toEqual([...expectedHudNames].sort());
    expect(allyHudNames).not.toContain(outOfScopeDisplayName);

    // Keep enemy HUD selectors separate from ally HUD checks.
    expect(livingEnemyClassIds(engine).length).toBeGreaterThan(0);
    expect(document.querySelectorAll('.party-hud-label')).toHaveLength(
      PARTY_SLOT_COUNT,
    );
    expect(
      document.querySelectorAll('.enemy-hud-label-name').length,
    ).toBeGreaterThan(0);
    expect(
      document.querySelectorAll('.party-hud-panel .enemy-hud-label-name').length,
    ).toBe(0);

    expect(session.getSaveState()).toEqual(saveBefore);
  });

  it('problemSeries 2X3: stage plate empty while Save currentStageId remains non-empty', () => {
    const loaded = tryLoadGameData();
    if (!loaded.ok) {
      throw new Error(loaded.error);
    }
    const gameData = loaded.data;
    const seriesA = gameData.problemSeriesCatalog.series.find(
      (entry) => entry.seriesId === SERIES_A_ID,
    );
    if (seriesA === undefined) {
      throw new Error(`Expected problem series ${SERIES_A_ID}`);
    }

    session = createSession();
    session.start();

    const saveStageId = session.getSaveState().stageProgress.currentStageId;
    expect(saveStageId.length).toBeGreaterThan(0);
    expect(saveStageId).toBe('test');

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
    requireButton(
      container,
      '.problem-series-overview-confirm',
      'overview confirm button',
    ).click();

    expect(session.getCurrentScreen()).toBe('formation');
    expect(session.getOperationState()?.source).toStrictEqual(PROBLEM_SERIES_SOURCE);

    requireButton(
      getGameAppContainer(),
      '.skill-menu-return-to-battle-button',
      'formation confirm button',
    ).click();

    expect(session.getCurrentScreen()).toBe('battle');
    expect(session.getOperationState()?.source).toStrictEqual(PROBLEM_SERIES_SOURCE);
    expect(session.getSaveState().stageProgress.currentStageId).toBe(saveStageId);

    const engine = getEngine(session);
    expect(engine.getSnapshot().waveIndex).toBe(0);
    tickSession(session, 5);

    const stagePlate = document.querySelector('.battle-stage-plate-stage');
    if (!(stagePlate instanceof HTMLElement)) {
      throw new Error('.battle-stage-plate-stage not found');
    }
    expect(stagePlate.textContent ?? '').toBe('');
    expect(stagePlate.textContent ?? '').not.toContain('STAGE');
    expect(stagePlate.textContent ?? '').not.toContain('test');
    expect(stagePlate.textContent ?? '').not.toContain(saveStageId);

    const wavePlate = document.querySelector('.battle-stage-plate-wave');
    if (!(wavePlate instanceof HTMLElement)) {
      throw new Error('.battle-stage-plate-wave not found');
    }
    expect((wavePlate.textContent ?? '').trim()).toBe('WAVE 1 / 3');

    expect(livingEnemyClassIds(engine).length).toBeGreaterThan(0);
    expect(getAllyHudDisplayNames()).toHaveLength(PARTY_SLOT_COUNT);
    expect(document.querySelectorAll('.party-hud-label')).toHaveLength(
      PARTY_SLOT_COUNT,
    );
  });

  it('fixedStage: BattleEngine and ally HUD keep Save party', () => {
    const loaded = tryLoadGameData();
    if (!loaded.ok) {
      throw new Error(loaded.error);
    }
    const gameData = loaded.data;
    const fixedStage = gameData.stages.find((stage) => stage.id === FIXED_STAGE_ID);
    if (fixedStage === undefined) {
      throw new Error(`Expected fixed stage ${FIXED_STAGE_ID}`);
    }
    expect(gameData.stages.length).toBeGreaterThan(0);

    const outOfScopeDisplayName = classDisplayName(gameData, OUT_OF_SCOPE_CLASS_ID);

    session = createSession();
    session.start();
    ensureSavePartyHasOutOfScopeClass(session);
    const saveBefore = structuredClone(session.getSaveState());
    const saveClassIds = getSavePartyClassIds(session);
    expect(saveClassIds).toContain(OUT_OF_SCOPE_CLASS_ID);

    const resolveBattlePartySpy = vi.spyOn(
      session as unknown as { resolveBattleParty: () => PartySlotState[] },
      'resolveBattleParty',
    );

    const container = getStageSelectContainer(session);
    selectFixedStageById(container, FIXED_STAGE_ID, fixedStage.displayName);
    requireButton(container, '.stage-selection-sortie', 'sortie button').click();

    expect(session.getCurrentScreen()).toBe('formation');
    expect(session.getOperationState()?.source).toEqual({
      kind: 'fixedStage',
      stageId: FIXED_STAGE_ID,
    });

    requireButton(
      getGameAppContainer(),
      '.skill-menu-return-to-battle-button',
      'formation confirm button',
    ).click();

    expect(session.getCurrentScreen()).toBe('battle');
    const engine = getEngine(session);

    const callsBeforeHudRefresh = resolveBattlePartySpy.mock.calls.length;
    tickSession(session, 5);
    expect(resolveBattlePartySpy.mock.calls.length).toBeGreaterThan(
      callsBeforeHudRefresh,
    );

    const operationClassIds = getOperationPartyClassIds(session);
    expect(operationClassIds).toEqual(saveClassIds);
    expect(operationClassIds).toContain(OUT_OF_SCOPE_CLASS_ID);

    const livingAllies = livingAllyClassIds(engine);
    expect(livingAllies.sort()).toEqual([...saveClassIds].sort());
    expect(livingAllies).toContain(OUT_OF_SCOPE_CLASS_ID);

    const allyHudNames = getAllyHudDisplayNames();
    expect(allyHudNames).toHaveLength(PARTY_SLOT_COUNT);
    expect(allyHudNames).toContain(outOfScopeDisplayName);
    const expectedHudNames = saveClassIds.map((classId) =>
      classDisplayName(gameData, classId),
    );
    expect([...allyHudNames].sort()).toEqual([...expectedHudNames].sort());

    expect(session.getSaveState().party).toEqual(saveBefore.party);
    expect(getSavePartyClassIds(session)).toContain(OUT_OF_SCOPE_CLASS_ID);
  });

  it('fixedStage 2X3: STAGE plate shows stageId; residual problemSeries snapshot does not switch plate', () => {
    const loaded = tryLoadGameData();
    if (!loaded.ok) {
      throw new Error(loaded.error);
    }
    const gameData = loaded.data;
    const fixedStage = gameData.stages.find((stage) => stage.id === FIXED_STAGE_ID);
    if (fixedStage === undefined) {
      throw new Error(`Expected fixed stage ${FIXED_STAGE_ID}`);
    }
    const expectedWaveTotal = fixedStage.waves.length;
    expect(expectedWaveTotal).toBeGreaterThan(0);

    session = createSession();
    session.start();

    // Residual prepared snapshot must not drive battle HUD while active source is fixedStage.
    const prepared = session.prepareProblemSeriesOperationStart(RAW_FIXTURE_SEED);
    expect(prepared.waves).toHaveLength(3);
    expect(session.getProblemSeriesOperationStartSnapshot()).toBe(prepared);
    expect(session.getOperationState()).toBeNull();

    const container = getStageSelectContainer(session);
    selectFixedStageById(container, FIXED_STAGE_ID, fixedStage.displayName);
    requireButton(container, '.stage-selection-sortie', 'sortie button').click();

    expect(session.getCurrentScreen()).toBe('formation');
    expect(session.getOperationState()?.source).toEqual({
      kind: 'fixedStage',
      stageId: FIXED_STAGE_ID,
    });
    expect(session.getProblemSeriesOperationStartSnapshot()).toBe(prepared);

    requireButton(
      getGameAppContainer(),
      '.skill-menu-return-to-battle-button',
      'formation confirm button',
    ).click();

    expect(session.getCurrentScreen()).toBe('battle');
    expect(session.getOperationState()?.source).toEqual({
      kind: 'fixedStage',
      stageId: FIXED_STAGE_ID,
    });
    expect(session.getProblemSeriesOperationStartSnapshot()).toBe(prepared);

    const engine = getEngine(session);
    expect(engine.getSnapshot().waveIndex).toBe(0);
    tickSession(session, 5);

    const stagePlate = document.querySelector('.battle-stage-plate-stage');
    if (!(stagePlate instanceof HTMLElement)) {
      throw new Error('.battle-stage-plate-stage not found');
    }
    expect((stagePlate.textContent ?? '').trim()).toBe(`STAGE ${FIXED_STAGE_ID}`);

    const wavePlate = document.querySelector('.battle-stage-plate-wave');
    if (!(wavePlate instanceof HTMLElement)) {
      throw new Error('.battle-stage-plate-wave not found');
    }
    expect((wavePlate.textContent ?? '').trim()).toBe(
      `WAVE 1 / ${expectedWaveTotal}`,
    );

    expect(livingEnemyClassIds(engine).length).toBeGreaterThan(0);
  });
});
