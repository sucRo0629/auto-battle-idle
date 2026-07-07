/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tryLoadGameData } from '../battle/data/loadGameData.ts';
import { setVerifyModeEnabled } from '../dev/verifyMode.ts';
import { STAGE_FIRST_PLAY_GUIDANCE_CLASS } from '../ui/stageDetailDom.ts';
import type { BattleEngine } from '../battle/BattleEngine.ts';
import { GameSession } from './GameSession.ts';

function triggerVictory(session: GameSession, survivingIndices: number[] = [0, 1, 2, 3]): void {
  const engine = (session as unknown as { engine: BattleEngine }).engine;
  (engine as unknown as { applyVictoryTransition: (indices: number[]) => void })
    .applyVictoryTransition(survivingIndices);
}

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
  const container = document.createElement('div');
  document.body.appendChild(container);
  return new GameSession(loaded.data, container);
}

describe('GameSession map → party → battle wire', () => {
  let session: GameSession | null = null;

  beforeEach(() => {
    localStorage.clear();
    mockCanvas2d();
  });

  afterEach(() => {
    session?.destroy();
    session = null;
    document.body.replaceChildren();
  });

  it('verify OFF starts on map (release flow)', () => {
    setVerifyModeEnabled(false);
    session = createSession();

    expect(session.getCurrentScreen()).toBe('map');
    expect(session.isVerifyMode()).toBe(false);
    expect(
      document.body.querySelector(`.${STAGE_FIRST_PLAY_GUIDANCE_CLASS}`),
    ).not.toBeNull();
  });

  it('verify ON starts on battle (debug flow preserved)', () => {
    setVerifyModeEnabled(true);
    session = createSession();

    expect(session.getCurrentScreen()).toBe('battle');
    expect(session.isVerifyMode()).toBe(true);
    expect(
      document.body.querySelector(`.${STAGE_FIRST_PLAY_GUIDANCE_CLASS}`),
    ).toBeNull();
  });

  it('sortie updates currentStageId, opens formation, then battle on confirm', () => {
    setVerifyModeEnabled(false);
    session = createSession();
    const gameData = tryLoadGameData();
    if (!gameData.ok) throw new Error(gameData.error);

    const targetStage = gameData.data.stages[1] ?? gameData.data.stages[0];
    if (!targetStage) throw new Error('No stages');

    const container = document.body.querySelector('div')!;
    const listItems = container.querySelectorAll<HTMLButtonElement>(
      '.stage-selection-list-item',
    );
    const targetButton = listItems[1] ?? listItems[0];
    if (!targetButton) throw new Error('No stage list item');
    targetButton.click();

    const sortieButton = container.querySelector<HTMLButtonElement>(
      '.stage-selection-sortie',
    );
    sortieButton?.click();

    expect(session.getSaveState().stageProgress.currentStageId).toBe(targetStage.id);
    expect(session.getCurrentScreen()).toBe('formation');

    const returnButton = container.querySelector<HTMLButtonElement>(
      '.skill-menu-return-to-battle-button',
    );
    expect(returnButton?.disabled).toBe(false);
    returnButton?.click();

    expect(session.getCurrentScreen()).toBe('battle');
    expect(session.getSaveState().stageProgress.currentStageId).toBe(targetStage.id);
  });

  it('verify OFF returns to map after victory with progressed currentStageId', () => {
    setVerifyModeEnabled(false);
    session = createSession();
    const gameData = tryLoadGameData();
    if (!gameData.ok) throw new Error(gameData.error);

    const firstStage = gameData.data.stages[0];
    const secondStage = gameData.data.stages[1];
    if (!firstStage || !secondStage) throw new Error('Need at least 2 stages');

    expect(session.getSaveState().stageProgress.currentStageId).toBe(firstStage.id);

    const container = document.body.querySelector('div')!;
    container.querySelector<HTMLButtonElement>('.stage-selection-sortie')?.click();
    container
      .querySelector<HTMLButtonElement>('.skill-menu-return-to-battle-button')
      ?.click();
    expect(session.getCurrentScreen()).toBe('battle');

    triggerVictory(session);

    expect(session.getSaveState().stageProgress.currentStageId).toBe(secondStage.id);
    expect(session.getCurrentScreen()).toBe('map');
    expect(
      container.querySelector('.stage-selection-list-item--selected')?.textContent,
    ).toBe(secondStage.displayName);
  });

  it('verify ON stays on battle after victory (debug loop preserved)', () => {
    setVerifyModeEnabled(true);
    session = createSession();
    const gameData = tryLoadGameData();
    if (!gameData.ok) throw new Error(gameData.error);

    const firstStage = gameData.data.stages[0];
    const secondStage = gameData.data.stages[1];
    if (!firstStage || !secondStage) throw new Error('Need at least 2 stages');

    triggerVictory(session);

    expect(session.getSaveState().stageProgress.currentStageId).toBe(secondStage.id);
    expect(session.getCurrentScreen()).toBe('battle');
  });

  it('verify ON party menu does not require map sortie', () => {
    setVerifyModeEnabled(true);
    session = createSession();
    const initialStageId = session.getSaveState().stageProgress.currentStageId;

    session.openPartyMenu();
    expect(session.getCurrentScreen()).toBe('formation');

    const container = document.body.querySelector('div')!;
    const returnButton = container.querySelector<HTMLButtonElement>(
      '.skill-menu-return-to-battle-button',
    );
    returnButton?.click();

    expect(session.getCurrentScreen()).toBe('battle');
    expect(session.getSaveState().stageProgress.currentStageId).toBe(initialStageId);
  });
});
