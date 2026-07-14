/**
 * @vitest-environment happy-dom
 *
 * 想定仕様: Wave 戦闘中ポーズからリトライ 3 種 + ステージ選択へ到達できること。
 * API のみではなく、ポーズ銘板のボタン表示と各導線先を固定する。
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

function enterBattleFromStageSelect(session: GameSession, stageIndex = 1): void {
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
}

function visiblePauseActionLabels(container: ParentNode): string[] {
  return [...container.querySelectorAll<HTMLButtonElement>('.battle-pause-action-button')]
    .filter((button) => !button.hidden)
    .map((button) => button.textContent ?? '');
}

function clickPauseAction(container: ParentNode, label: string): void {
  const button = [...container.querySelectorAll<HTMLButtonElement>('.battle-pause-action-button')]
    .find((entry) => !entry.hidden && entry.textContent === label);
  if (!button) throw new Error(`Pause action not found: ${label}`);
  button.click();
}

function pauseDuringWave(session: GameSession): void {
  expect(session.getCurrentScreen()).toBe('battle');
  expect(session.getOperationState()).not.toBeNull();
  expect(session.shouldShowDefeatRetry()).toBe(false);
  session.view.setBattlePaused(true);
  expect(session.canUsePauseOperationRetry()).toBe(true);
}

describe('GameSession pause retry (operation-loop §9)', () => {
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

  it('mid-wave pause plate shows retry 3 + stage select', () => {
    session = createSession();
    session.start();
    enterBattleFromStageSelect(session);
    pauseDuringWave(session);

    expect(visiblePauseActionLabels(document.body)).toEqual([
      '現在Waveを同設定で再戦',
      '準備へ戻る',
      '作戦をWave 0からやり直す',
      'ステージ選択へ',
    ]);
  });

  it('pause → retry current wave resumes battle without defeat', () => {
    session = createSession();
    session.start();
    enterBattleFromStageSelect(session);
    waitForEngaged(getEngine(session));
    asBattleEngineInternals(getEngine(session)).players[0].hp = 1;
    pauseDuringWave(session);

    clickPauseAction(document.body, '現在Waveを同設定で再戦');

    expect(session.getCurrentScreen()).toBe('battle');
    expect(session.view.isBattlePaused()).toBe(false);
    expect(session.shouldShowDefeatRetry()).toBe(false);
    expect(session.getOperationState()?.isDefeated).toBe(false);
    const players = asBattleEngineInternals(getEngine(session)).players;
    expect(players[0].hp).toBe(players[0].maxHp);
  });

  it('pause → return to prep opens formation without starting battle', () => {
    session = createSession();
    session.start();
    enterBattleFromStageSelect(session);
    const restartAtWaveSpy = vi.spyOn(getEngine(session), 'restartBattleAtWave');
    pauseDuringWave(session);

    clickPauseAction(document.body, '準備へ戻る');

    expect(session.getCurrentScreen()).toBe('formation');
    expect(restartAtWaveSpy).not.toHaveBeenCalled();
    expect(
      document.body.querySelector('.skill-menu-return-to-battle-button'),
    ).not.toBeNull();
  });

  it('pause → restart from wave zero opens formation at wave 0', () => {
    session = createSession();
    session.start();
    enterBattleFromStageSelect(session);
    pauseDuringWave(session);

    clickPauseAction(document.body, '作戦をWave 0からやり直す');

    expect(session.getCurrentScreen()).toBe('formation');
    expect(session.getOperationWaveIndex()).toBe(0);
    expect(session.getClearedWaveCount()).toBe(0);
    expect(session.getOperationState()?.isDefeated).toBe(false);
  });

  it('pause → stage select aborts incomplete operation', () => {
    session = createSession();
    session.start();
    enterBattleFromStageSelect(session);
    const stageId = session.getSaveState().stageProgress.currentStageId;
    pauseDuringWave(session);

    clickPauseAction(document.body, 'ステージ選択へ');

    expect(session.getCurrentScreen()).toBe('stageSelect');
    expect(session.getOperationState()).toBeNull();
    expect(session.getSaveState().stageProgress.currentStageId).toBe(stageId);
  });
});
