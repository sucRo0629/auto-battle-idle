/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tryLoadGameData } from '../battle/data/loadGameData.ts';
import { setVerifyModeEnabled } from '../dev/verifyMode.ts';
import type { BattleEngine } from '../battle/BattleEngine.ts';
import { GameSession } from './GameSession.ts';
import {
  asBattleEngineInternals,
  waitForEngaged,
} from '../battle/test/battleFieldSpec.harness.ts';

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


function triggerDefeat(session: GameSession, survivingIndices: number[] = []): void {
  getEngine(session).applyDefeatTransition(survivingIndices);
}

function triggerVictory(session: GameSession, survivingIndices: number[] = [0, 1, 2, 3]): void {
  getEngine(session).applyVictoryTransition(survivingIndices);
}

function enterBattleFromStageSelect(session: GameSession, stageIndex = 1): string {
  const gameData = tryLoadGameData();
  if (!gameData.ok) throw new Error(gameData.error);
  const targetStage = gameData.data.stages[stageIndex] ?? gameData.data.stages[0];
  if (!targetStage) throw new Error('No stages');

  const container = document.body.querySelector('div')!;
  const listItems = container.querySelectorAll<HTMLButtonElement>(
    '.stage-selection-list-item',
  );
  (listItems[stageIndex] ?? listItems[0])?.click();
  container.querySelector<HTMLButtonElement>('.stage-selection-sortie')?.click();
  container
    .querySelector<HTMLButtonElement>('.skill-menu-return-to-battle-button')
    ?.click();

  return targetStage.id;
}

function clickDefeatRetryButton(container: ParentNode, label: string): void {
  const buttons = container.querySelectorAll<HTMLButtonElement>(
    '.battle-defeat-retry-button',
  );
  const button = [...buttons].find((entry) => entry.textContent === label);
  if (!button) throw new Error(`Defeat retry button not found: ${label}`);
  button.click();
}

describe('GameSession defeat retry (R7c)', () => {
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

  it('1. verify OFF defeat does not auto-restart battle', () => {
    session = createSession();
    session.start();
    const stageId = enterBattleFromStageSelect(session);
    const restartSpy = vi.spyOn(getEngine(session), 'restartBattle');

    triggerDefeat(session);

    expect(session.getSaveState().stageProgress.currentStageId).toBe(stageId);
    expect(session.getCurrentScreen()).toBe('battle');
    expect(restartSpy).not.toHaveBeenCalled();
    expect(
      document.body.querySelector('.skill-menu-return-to-battle-button'),
    ).toBeNull();
  });

  it('2. verify OFF defeat shows four retry actions', () => {
    session = createSession();
    session.start();
    enterBattleFromStageSelect(session);
    triggerDefeat(session);

    expect(session.shouldShowDefeatRetry()).toBe(true);
    const buttons = document.body.querySelectorAll('.battle-defeat-retry-button');
    expect(buttons).toHaveLength(4);
    expect([...buttons].map((button) => button.textContent)).toEqual([
      '現在Waveを同設定で再戦',
      '準備へ戻る',
      '作戦をWave 0からやり直す',
      'ステージ選択へ',
    ]);
  });

  it('3. retry current wave returns to battle and resumes combat', () => {
    session = createSession();
    session.start();
    enterBattleFromStageSelect(session);
    waitForEngaged(getEngine(session));
    const playersBefore = asBattleEngineInternals(getEngine(session)).players;
    playersBefore[0].hp = 1;
    triggerDefeat(session);

    clickDefeatRetryButton(document.body, '現在Waveを同設定で再戦');

    expect(session.getCurrentScreen()).toBe('battle');
    expect(session.shouldShowDefeatRetry()).toBe(false);
    expect(session.getOperationState()?.isDefeated).toBe(false);
    const playersAfter = asBattleEngineInternals(getEngine(session)).players;
    expect(playersAfter[0].hp).toBe(playersAfter[0].maxHp);
    expect(getEngine(session).getSnapshot().phase).not.toBe('defeat');
  });

  it('4. return to formation prep opens formation without starting battle', () => {
    session = createSession();
    session.start();
    enterBattleFromStageSelect(session);
    const restartSpy = vi.spyOn(getEngine(session), 'restartBattle');
    const restartAtWaveSpy = vi.spyOn(getEngine(session), 'restartBattleAtWave');
    triggerDefeat(session);

    clickDefeatRetryButton(document.body, '準備へ戻る');

    expect(session.getCurrentScreen()).toBe('formation');
    expect(session.shouldShowDefeatRetry()).toBe(false);
    expect(restartSpy).not.toHaveBeenCalled();
    expect(restartAtWaveSpy).not.toHaveBeenCalled();
    expect(
      document.body.querySelector('.skill-menu-return-to-battle-button'),
    ).not.toBeNull();
  });

  it('5. restart operation from wave zero opens formation at wave 0', () => {
    session = createSession();
    session.start();
    enterBattleFromStageSelect(session);
    triggerDefeat(session);

    clickDefeatRetryButton(document.body, '作戦をWave 0からやり直す');

    expect(session.getCurrentScreen()).toBe('formation');
    expect(session.shouldShowDefeatRetry()).toBe(false);
    expect(session.getOperationWaveIndex()).toBe(0);
    expect(session.getClearedWaveCount()).toBe(0);
    expect(session.getOperationState()?.isActive).toBe(true);
    expect(session.getOperationState()?.isDefeated).toBe(false);
    expect(getEngine(session).getSnapshot().waveIndex).toBe(0);
  });

  it('6. retry API failure keeps defeat screen visible', () => {
    session = createSession();
    session.start();
    enterBattleFromStageSelect(session);
    triggerDefeat(session);
    session.clearOperationCheckpoint();

    clickDefeatRetryButton(document.body, '現在Waveを同設定で再戦');

    expect(session.getCurrentScreen()).toBe('battle');
    expect(session.shouldShowDefeatRetry()).toBe(true);
    expect(session.getOperationState()?.isDefeated).toBe(true);
    expect(
      document.body.querySelector('.battle-defeat-retry-overlay'),
    ).not.toBeNull();
  });

  it('7. verify ON defeat shows retry UI including stage select', () => {
    setVerifyModeEnabled(true);
    session = createSession();
    session.start();
    const gameData = tryLoadGameData();
    if (!gameData.ok) throw new Error(gameData.error);
    const firstStage = gameData.data.stages[0];
    const secondStage = gameData.data.stages[1];
    if (!firstStage || !secondStage) throw new Error('Need at least 2 stages');

    session.getSaveState().stageProgress.currentStageId = secondStage.id;
    (
      session as unknown as {
        beginOperation: (stageId: string, initialWaveIndex: number) => boolean;
      }
    ).beginOperation(secondStage.id, 0);
    triggerDefeat(session);

    expect(session.getSaveState().stageProgress.currentStageId).toBe(firstStage.id);
    expect(session.getCurrentScreen()).toBe('battle');
    expect(session.shouldShowDefeatRetry()).toBe(true);
    expect(document.body.querySelectorAll('.battle-defeat-retry-button')).toHaveLength(4);
    expect(
      document.body.querySelector('.battle-defeat-retry-overlay'),
    ).not.toBeNull();
  });

  it('8. victory does not show defeat retry UI', () => {
    session = createSession();
    session.start();
    enterBattleFromStageSelect(session);
    triggerVictory(session);

    expect(session.shouldShowDefeatRetry()).toBe(false);
    expect(document.body.querySelector('.battle-defeat-retry-overlay')?.hidden).toBe(
      true,
    );
  });

  it('9. return to stage select aborts defeated operation', () => {
    session = createSession();
    session.start();
    const stageId = enterBattleFromStageSelect(session);
    triggerDefeat(session);

    clickDefeatRetryButton(document.body, 'ステージ選択へ');

    expect(session.getCurrentScreen()).toBe('stageSelect');
    expect(session.shouldShowDefeatRetry()).toBe(false);
    expect(session.getOperationState()).toBeNull();
    expect(session.getSaveState().stageProgress.currentStageId).toBe(stageId);
  });
});
