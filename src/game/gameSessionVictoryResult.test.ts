/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tryLoadGameData } from '../battle/data/loadGameData.ts';
import {
  reachAwaitingNextWave,
  TICK_DT,
  TICK_MS,
  waitForEngaged,
} from '../battle/test/battleFieldSpec.harness.ts';
import { setVerifyModeEnabled } from '../dev/verifyMode.ts';
import type { BattleEngine } from '../battle/BattleEngine.ts';
import { GameSession } from './GameSession.ts';
import {
  expectVictoryOverlayVisuallyHidden,
  expectVictoryOverlayVisuallyVisible,
} from '../ui/battleResultOverlayTestUtils.ts';

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
    getImageData: vi.fn(() => ({
      data: new Uint8ClampedArray(4),
      width: 1,
      height: 1,
    })),
    putImageData: vi.fn(),
    canvas: { width: 800, height: 600 },
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    ctx as unknown as CanvasRenderingContext2D,
  );
}

function createSession(): GameSession {
  const loaded = tryLoadGameData();
  if (!loaded.ok) throw new Error(loaded.error);
  const container = document.createElement('div');
  document.body.appendChild(container);
  return new GameSession(loaded.data, container);
}

function getEngine(session: GameSession): BattleEngine {
  return (session as unknown as { engine: BattleEngine }).engine;
}

function triggerVictory(session: GameSession, survivingIndices: number[] = [0, 1, 2, 3]): void {
  getEngine(session).applyVictoryTransition(survivingIndices);
}

function triggerDefeat(session: GameSession, survivingIndices: number[] = []): void {
  getEngine(session).applyDefeatTransition(survivingIndices);
}

function sortieToStage(session: GameSession, stageId: string): void {
  const host = (session as unknown as {
    handleStageSortie: (id: string) => void;
  }).handleStageSortie.bind(session);
  host(stageId);
  document.body
    .querySelector<HTMLButtonElement>('.skill-menu-return-to-battle-button')
    ?.click();
}

function tickSession(session: GameSession, steps: number): void {
  for (let i = 0; i < steps; i++) {
    session.tick(TICK_DT, TICK_MS);
  }
}

function clickVictoryResultButton(label: string): void {
  const buttons = document.body.querySelectorAll<HTMLButtonElement>(
    '.battle-victory-result-button',
  );
  const button = [...buttons].find((entry) => entry.textContent === label);
  if (!button) throw new Error(`Victory result button not found: ${label}`);
  button.click();
}

describe('GameSession victory result (R7e)', () => {
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
    setVerifyModeEnabled(false);
  });

  it('1. verify OFF final victory shows result UI and stops battle progression', () => {
    session = createSession();
    session.start();
    sortieToStage(session, 'test');
    const engine = getEngine(session);
    waitForEngaged(engine);
    const battleTimeBefore = engine.getBattleTimeSec();

    triggerVictory(session);
    session.view.refreshVictoryResultOverlay();

    expect(session.getCurrentScreen()).toBe('battle');
    expect(session.shouldShowVictoryResult()).toBe(true);
    expectVictoryOverlayVisuallyVisible();

    tickSession(session, 120);
    expect(engine.getBattleTimeSec()).toBe(battleTimeBefore);
    expect(engine.getSnapshot().phase).toBe('victory');
  });

  it('2. intermediate wave clear does not show result UI', () => {
    session = createSession();
    session.start();
    sortieToStage(session, '1');
    waitForEngaged(getEngine(session));
    reachAwaitingNextWave(getEngine(session));

    expect(session.getCurrentScreen()).toBe('wavePrep');
    expect(session.getOperationResult()).toBeNull();
    expect(session.shouldShowVictoryResult()).toBe(false);
    expectVictoryOverlayVisuallyHidden();
  });

  it('3. result UI shows victory, stageId, and final wave index', () => {
    session = createSession();
    session.start();
    sortieToStage(session, '1');
    triggerVictory(session);
    session.view.refreshVictoryResultOverlay();

    const summary = document.body.querySelector('.battle-victory-result-summary');
    expect(summary?.textContent).toContain('outcome: victory');
    expect(summary?.textContent).toContain('stageId: 1');
    expect(summary?.textContent).toContain('reachedWaveIndex: 1');
    expect(session.getOperationResult()).toEqual({
      stageId: '1',
      outcome: 'victory',
      reachedWaveIndex: 1,
    });
  });

  it('4. rematch clears operationResult and opens formation at wave 0', () => {
    session = createSession();
    session.start();
    sortieToStage(session, '1');
    triggerVictory(session);
    session.view.refreshVictoryResultOverlay();

    clickVictoryResultButton('同じステージで再戦');

    expect(session.getOperationResult()).toBeNull();
    expect(session.getCurrentScreen()).toBe('formation');
    expect(session.getOperationWaveIndex()).toBe(0);
    expect(session.getClearedWaveCount()).toBe(0);
    expect(session.getOperationState()?.isActive).toBe(true);
    expect(getEngine(session).getSnapshot().waveIndex).toBe(0);
    expect(
      document.body.querySelector('.skill-menu-return-to-battle-button'),
    ).not.toBeNull();
    expectVictoryOverlayVisuallyHidden();
  });

  it('5. rematch does not keep previous checkpoint, wave prep edits, or defeat state', () => {
    session = createSession();
    session.start();
    sortieToStage(session, '1');
    waitForEngaged(getEngine(session));
    reachAwaitingNextWave(getEngine(session));
    session.trySetOperationSlotCombatModule(0, 'df_guardian_mod_guard_focus');
    expect(session.getPartySlotCombatModule(0)).toBe('df_guardian_mod_guard_focus');
    session.confirmWavePrepAndStartNextWave();
    waitForEngaged(getEngine(session));
    expect(session.getClearedWaveCount()).toBe(1);
    expect(session.getOperationWaveIndex()).toBe(1);

    triggerVictory(session);
    session.view.refreshVictoryResultOverlay();
    expect(session.getOperationState()).toBeNull();
    expect(session.hasOperationCheckpoint()).toBe(false);

    clickVictoryResultButton('同じステージで再戦');

    expect(session.getOperationResult()).toBeNull();
    expect(session.getOperationState()?.isDefeated).toBe(false);
    expect(session.getClearedWaveCount()).toBe(0);
    expect(session.getOperationWaveIndex()).toBe(0);
    expect(session.hasOperationCheckpoint()).toBe(true);
    expect(session.getOperationCheckpoint()?.currentWaveIndex).toBe(0);
    expect(session.getOperationCheckpoint()?.clearedWaveCount).toBe(0);
    expect(session.getCurrentScreen()).toBe('formation');
    expect(session.isWavePrepSuspendedForFormation()).toBe(false);
  });

  it('6. return to stage select enables next sortie', () => {
    session = createSession();
    session.start();
    sortieToStage(session, 'test');
    triggerVictory(session);
    session.view.refreshVictoryResultOverlay();

    clickVictoryResultButton('ステージ選択へ');

    expect(session.getCurrentScreen()).toBe('stageSelect');
    expect(session.getOperationResult()).toBeNull();
    expect(session.shouldShowVictoryResult()).toBe(false);

    const container = document.body.querySelector('div')!;
    container.querySelector<HTMLButtonElement>('.stage-selection-sortie')?.click();
    container
      .querySelector<HTMLButtonElement>('.skill-menu-return-to-battle-button')
      ?.click();

    expect(session.getCurrentScreen()).toBe('battle');
    expect(session.hasActiveOperation()).toBe(true);
  });

  it('7. victory rewards and clearedStageIds are applied before result UI', () => {
    session = createSession();
    session.start();
    sortieToStage(session, 'test');
    const clearedBefore = [...(session.getSaveState().stageProgress.clearedStageIds ?? [])];

    triggerVictory(session);

    expect(session.getSaveState().stageProgress.clearedStageIds).toContain('test');
    expect(session.getSaveState().stageProgress.clearedStageIds?.length).toBe(
      clearedBefore.length + (clearedBefore.includes('test') ? 0 : 1),
    );
    expect(session.shouldShowVictoryResult()).toBe(true);
    session.view.refreshVictoryResultOverlay();
    expect(session.getSaveState().stageProgress.clearedStageIds).toContain('test');
  });

  it('7b. a new sortie clears stale victory UI through stageSelect, formation, and battle', () => {
    session = createSession();
    session.start();
    sortieToStage(session, 'test');
    triggerVictory(session);

    expect(session.getOperationResult()?.outcome).toBe('victory');
    expectVictoryOverlayVisuallyVisible();

    session.openStageSelect();

    expect(session.getCurrentScreen()).toBe('stageSelect');
    expect(session.getOperationResult()).toBeNull();
    expectVictoryOverlayVisuallyHidden();

    const container = document.body.querySelector('div')!;
    container.querySelector<HTMLButtonElement>('.stage-selection-sortie')?.click();

    expect(session.getCurrentScreen()).toBe('formation');
    expect(session.getOperationResult()).toBeNull();
    expectVictoryOverlayVisuallyHidden();

    container
      .querySelector<HTMLButtonElement>('.skill-menu-return-to-battle-button')
      ?.click();

    expect(session.getCurrentScreen()).toBe('battle');
    expect(session.shouldShowVictoryResult()).toBe(false);
    expectVictoryOverlayVisuallyHidden();
  });

  it('7c. battlefield reload hides stale victory DOM when operationResult is null', () => {
    session = createSession();
    session.start();
    sortieToStage(session, 'test');
    const overlay = document.body.querySelector<HTMLElement>(
      '.battle-victory-result-overlay',
    );
    if (!overlay) throw new Error('Victory result overlay not found');
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');

    getEngine(session).restartBattle();

    expect(session.getOperationResult()).toBeNull();
    expectVictoryOverlayVisuallyHidden();
  });

  it('8. defeat keeps defeat retry UI and hides victory result UI', () => {
    session = createSession();
    session.start();
    sortieToStage(session, 'test');
    triggerDefeat(session);
    session.view.refreshVictoryResultOverlay();

    expect(session.shouldShowDefeatRetry()).toBe(true);
    expect(session.shouldShowVictoryResult()).toBe(false);
    expect(session.getOperationResult()?.outcome).toBe('defeat');
    expectVictoryOverlayVisuallyHidden();
    expect(document.body.querySelectorAll('.battle-defeat-retry-button')).toHaveLength(4);
  });

  it('9. verify ON preserves existing victory and loop behavior', () => {
    setVerifyModeEnabled(true);
    session = createSession();
    session.start();
    const gameData = tryLoadGameData();
    if (!gameData.ok) throw new Error(gameData.error);
    const firstStage = gameData.data.stages[0];
    const secondStage = gameData.data.stages[1];
    if (!firstStage || !secondStage) throw new Error('Need at least 2 stages');

    triggerVictory(session);

    expect(session.getSaveState().stageProgress.currentStageId).toBe(secondStage.id);
    expect(session.getCurrentScreen()).toBe('battle');
    expect(session.shouldShowVictoryResult()).toBe(false);
    expectVictoryOverlayVisuallyHidden();
  });

  it('10. operation failure keeps result UI and current state', () => {
    session = createSession();
    session.start();
    sortieToStage(session, 'test');

    expect(session.returnToStageSelectAfterVictory()).toBe(false);

    triggerVictory(session);
    session.view.refreshVictoryResultOverlay();

    const host = session as unknown as {
      beginOperation: (stageId: string, initialWaveIndex?: number) => boolean;
    };
    vi.spyOn(host, 'beginOperation').mockReturnValue(false);

    clickVictoryResultButton('同じステージで再戦');

    expect(session.getCurrentScreen()).toBe('battle');
    expect(session.shouldShowVictoryResult()).toBe(true);
    expect(session.getOperationResult()?.outcome).toBe('victory');
    expectVictoryOverlayVisuallyVisible();
  });
});
