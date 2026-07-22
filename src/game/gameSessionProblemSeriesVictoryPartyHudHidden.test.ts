/**
 * @vitest-environment happy-dom
 *
 * R12m Player 作業単位2W3C5B: 問題系列最終勝利 overlay 表示中だけ
 * 味方 party HUD 全体を非表示にする production 経路のテスト。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BattleEngine } from '../battle/BattleEngine.ts';
import { tryLoadGameData } from '../battle/data/loadGameData.ts';
import {
  killAllEnemies,
  TICK_DT,
  waitForEngaged,
} from '../battle/test/battleFieldSpec.harness.ts';
import type { ClassId, GameData, PartySlotState } from '../battle/types.ts';
import { PARTY_SLOT_COUNT } from '../battle/types.ts';
import { setVerifyModeEnabled } from '../dev/verifyMode.ts';
import { readClassDisplayLabel } from '../ui/classDisplayName.ts';
import {
  expectVictoryOverlayVisuallyHidden,
  expectVictoryOverlayVisuallyVisible,
} from '../ui/battleResultOverlayTestUtils.ts';
import { GameSession } from './GameSession.ts';

const SERIES_A_ID = 'r12m_series_a';
const RAW_FIXTURE_SEED = '  fixture-a  ';
const OUT_OF_SCOPE_CLASS_ID: ClassId = 'at_ranger';
const OPERATION_SORCERER_CLASS_ID: ClassId = 'at_sorcerer';
const FIXED_STAGE_ID = '1';
const TICK_MS = 1000 / 60;
const MAX_ENGAGE_TICKS = 5000;
const MAX_WAVE_PREP_TICKS = 90_000;

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

function requireElement<T extends Element>(
  root: ParentNode,
  selector: string,
  label: string,
): T {
  const element = root.querySelector<T>(selector);
  if (!element) {
    throw new Error(`${label} not found: ${selector}`);
  }
  return element;
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

function getPartyHudPanelRoot(root: ParentNode = document): HTMLElement {
  const panel = root.querySelector<HTMLElement>('.party-hud-panel');
  if (!panel) {
    throw new Error('party hud panel root not found');
  }
  return panel;
}

function getAllyHudDisplayNames(): string[] {
  return [...document.querySelectorAll('.party-hud-label')]
    .map((el) => (el.textContent ?? '').trim())
    .filter((name) => name.length > 0);
}

function listVisibleVictoryResultButtons(root: ParentNode): HTMLButtonElement[] {
  return [
    ...root.querySelectorAll<HTMLButtonElement>('.battle-victory-result-button'),
  ].filter((button) => !button.hidden);
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
      throw new Error(`battle ended (${snap.phase}) before wave prep`);
    }
  }
  throw new Error('wave prep not reached within tick limit');
}

function ensureSavePartyHasOutOfScopeClass(session: GameSession): void {
  const classIds = getSavePartyClassIds(session);
  expect(classIds).toContain(OUT_OF_SCOPE_CLASS_ID);
}

function enterProblemSeriesBattleViaPlayerEntry(session: GameSession): {
  appContainer: HTMLElement;
  engine: BattleEngine;
  spawnWaveEnemiesSpy: ReturnType<typeof vi.spyOn>;
} {
  const engine = getEngine(session);
  const engineInternals = engine as unknown as {
    spawnWaveEnemies: () => void;
  };
  const spawnWaveEnemiesSpy = vi.spyOn(engineInternals, 'spawnWaveEnemies');

  session.start();
  ensureSavePartyHasOutOfScopeClass(session);

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

  requireButton(
    container,
    '.problem-series-overview-confirm',
    'overview confirm button',
  ).click();

  const appContainer = getGameAppContainer();
  requireButton(
    appContainer,
    '.skill-menu-return-to-battle-button',
    'formation confirm button',
  ).click();

  expect(session.getCurrentScreen()).toBe('battle');
  expect(spawnWaveEnemiesSpy).toHaveBeenCalledTimes(1);
  waitForEngagedViaSession(session, engine);

  return { appContainer, engine, spawnWaveEnemiesSpy };
}

function reachProblemSeriesFinalVictoryViaPlayerEntry(session: GameSession): {
  appContainer: HTMLElement;
  engine: BattleEngine;
  gameData: GameData;
} {
  const loaded = tryLoadGameData();
  if (!loaded.ok) {
    throw new Error(loaded.error);
  }
  const gameData = loaded.data;

  const { appContainer, engine, spawnWaveEnemiesSpy } =
    enterProblemSeriesBattleViaPlayerEntry(session);

  advanceSessionToWavePrepAfterKill(session, engine, spawnWaveEnemiesSpy);
  requireButton(
    appContainer,
    '.wave-prep-screen__confirm',
    'Wave 1 prep confirm button',
  ).click();
  waitForEngagedViaSession(session, engine);

  advanceSessionToWavePrepAfterKill(session, engine, spawnWaveEnemiesSpy);
  requireButton(
    appContainer,
    '.wave-prep-screen__confirm',
    'Wave 2 prep confirm button',
  ).click();
  waitForEngagedViaSession(session, engine);

  expect(engine.getSnapshot().waveIndex).toBe(2);
  expect(livingEnemyCount(engine)).toBeGreaterThan(0);
  expectVictoryOverlayVisuallyHidden(appContainer);

  killAllEnemies(engine);
  for (let i = 0; i < MAX_WAVE_PREP_TICKS; i++) {
    tickSession(session, 1);
    if (engine.getSnapshot().phase === 'victory') {
      break;
    }
    if (engine.getSnapshot().phase === 'defeat') {
      throw new Error('battle ended in defeat instead of final victory');
    }
  }

  expect(engine.getSnapshot().phase).toBe('victory');
  expect(engine.getSnapshot().waveIndex).toBe(2);
  expect(session.getProblemSeriesVictoryResult()).not.toBeNull();
  expect(session.shouldShowProblemSeriesVictoryResult()).toBe(true);
  expectVictoryOverlayVisuallyVisible(appContainer);

  return { appContainer, engine, gameData };
}

function livingEnemyCount(engine: BattleEngine): number {
  return engine.getSnapshot().enemies.filter((enemy) => enemy.hp > 0).length;
}

function sortieToStage(session: GameSession, stageId: string): void {
  const host = (
    session as unknown as { handleStageSortie: (id: string) => void }
  ).handleStageSortie.bind(session);
  host(stageId);
  document.body
    .querySelector<HTMLButtonElement>('.skill-menu-return-to-battle-button')
    ?.click();
}

describe('GameSession problem-series victory party HUD hidden (R12m Player 2W3C5B)', () => {
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

  it('case 1: problem-series final victory overlay hides party HUD root even with Save fallback DOM', () => {
    const loaded = tryLoadGameData();
    if (!loaded.ok) {
      throw new Error(loaded.error);
    }
    const outOfScopeDisplayName = classDisplayName(
      loaded.data,
      OUT_OF_SCOPE_CLASS_ID,
    );

    session = createSession();
    const { appContainer, gameData } = reachProblemSeriesFinalVictoryViaPlayerEntry(
      session,
    );

    expect(session.getProblemSeriesOperationStartSnapshot()).toBeNull();
    expect(session.getOperationState()).toBeNull();
    expect(session.getOperationCheckpoint()).toBeNull();
    expect(getSavePartyClassIds(session)).toContain(OUT_OF_SCOPE_CLASS_ID);

    const overlay = requireElement<HTMLElement>(
      appContainer,
      '.battle-victory-result-overlay',
      'victory result overlay',
    );
    expect(overlay.hidden).toBe(false);
    expect(overlay.getAttribute('aria-hidden')).toBe('false');

    const visibleButtons = listVisibleVictoryResultButtons(appContainer);
    expect(visibleButtons).toHaveLength(3);
    expect(visibleButtons.map((button) => button.textContent)).toEqual([
      '同じseedで再開始',
      '新しいseedで開始',
      '作戦選択へ',
    ]);

    const partyHudRoot = getPartyHudPanelRoot(appContainer);
    expect(partyHudRoot.hidden).toBe(true);

    const operationClassIds = gameData.problemSeriesCatalog.series
      .find((entry) => entry.seriesId === SERIES_A_ID)!
      .allowedClassIds;
    expect(operationClassIds).not.toContain(OUT_OF_SCOPE_CLASS_ID);
    expect(operationClassIds).toContain(OPERATION_SORCERER_CLASS_ID);

    const saveClassIds = getSavePartyClassIds(session);
    expect(saveClassIds).toContain(OUT_OF_SCOPE_CLASS_ID);
    expect(saveClassIds).not.toContain(OPERATION_SORCERER_CLASS_ID);

    const operationSorcererDisplayName = classDisplayName(
      gameData,
      OPERATION_SORCERER_CLASS_ID,
    );
    const saveHudNames = saveClassIds.map((classId) =>
      classDisplayName(gameData, classId),
    );

    tickSession(session, 30);
    expect(partyHudRoot.hidden).toBe(true);

    const allyHudNames = getAllyHudDisplayNames();
    expect(allyHudNames.length).toBeGreaterThan(0);
    expect(allyHudNames).toContain(outOfScopeDisplayName);
    expect(allyHudNames).not.toContain(operationSorcererDisplayName);
    expect([...allyHudNames].sort()).toEqual([...saveHudNames].sort());
    expect(partyHudRoot.hidden).toBe(true);

    const returnToStageSelectButton = visibleButtons.find(
      (button) => button.textContent === '作戦選択へ',
    );
    if (returnToStageSelectButton === undefined) {
      throw new Error('visible 作戦選択へ button missing');
    }
    returnToStageSelectButton.click();

    expectVictoryOverlayVisuallyHidden(appContainer);
    expect(overlay.hidden).toBe(true);
    expect(overlay.getAttribute('aria-hidden')).toBe('true');
    expect(session.getProblemSeriesVictoryResult()).toBeNull();
    expect(session.shouldShowProblemSeriesVictoryResult()).toBe(false);
    expect(session.getCurrentScreen()).toBe('stageSelect');
    expect(partyHudRoot.hidden).toBe(false);

    expect(
      appContainer.querySelectorAll('.enemy-hud-label-name').length,
    ).toBeGreaterThan(0);
    expect(
      requireElement<HTMLElement>(
        appContainer,
        '.battle-stage-plate-wave',
        'wave plate',
      ).textContent?.trim(),
    ).toContain('WAVE');
  });

  it('case 2: during problem-series battle party HUD root stays visible with Operation party', () => {
    const loaded = tryLoadGameData();
    if (!loaded.ok) {
      throw new Error(loaded.error);
    }
    const seriesA = loaded.data.problemSeriesCatalog.series.find(
      (entry) => entry.seriesId === SERIES_A_ID,
    );
    if (seriesA === undefined) {
      throw new Error(`Expected problem series ${SERIES_A_ID}`);
    }
    const allowedClassIds = seriesA.allowedClassIds;

    session = createSession();
    const { appContainer } = enterProblemSeriesBattleViaPlayerEntry(session);

    expectVictoryOverlayVisuallyHidden(appContainer);
    expect(session.getOperationState()).not.toBeNull();

    const partyHudRoot = getPartyHudPanelRoot(appContainer);
    expect(partyHudRoot.hidden).toBe(false);

    const operationClassIds = getOperationPartyClassIds(session);
    expect(operationClassIds).toHaveLength(PARTY_SLOT_COUNT);
    expect(new Set(operationClassIds)).toEqual(new Set(allowedClassIds));

    const allyHudNames = getAllyHudDisplayNames();
    expect(allyHudNames).toHaveLength(PARTY_SLOT_COUNT);
    const expectedHudNames = operationClassIds.map((classId) =>
      classDisplayName(loaded.data, classId),
    );
    expect([...allyHudNames].sort()).toEqual([...expectedHudNames].sort());
  });

  it('case 3: fixed-stage victory overlay keeps party HUD root visible', () => {
    session = createSession();
    session.start();
    sortieToStage(session, FIXED_STAGE_ID);
    const engine = getEngine(session);
    waitForEngaged(engine);
    engine.applyVictoryTransition([0, 1, 2, 3]);
    session.view.refreshVictoryResultOverlay();

    expect(session.shouldShowVictoryResult()).toBe(true);
    expect(session.shouldShowProblemSeriesVictoryResult()).toBe(false);
    expect(session.getOperationResult()?.outcome).toBe('victory');
    expectVictoryOverlayVisuallyVisible();

    const visibleButtons = listVisibleVictoryResultButtons(document.body);
    expect(visibleButtons.some((button) => button.textContent === '同じステージで再戦')).toBe(
      true,
    );
    expect(visibleButtons.some((button) => button.textContent === 'ステージ選択へ')).toBe(
      true,
    );

    const partyHudRoot = getPartyHudPanelRoot();
    expect(partyHudRoot.hidden).toBe(false);
  });

  it('case 4: defeat retry overlay does not hide party HUD root', () => {
    session = createSession();
    session.start();
    sortieToStage(session, 'test');
    const engine = getEngine(session);
    waitForEngaged(engine);
    engine.applyDefeatTransition([]);
    session.view.refreshVictoryResultOverlay();

    expect(session.shouldShowDefeatRetry()).toBe(true);
    expectVictoryOverlayVisuallyHidden();

    const partyHudRoot = getPartyHudPanelRoot();
    expect(partyHudRoot.hidden).toBe(false);
  });
});
