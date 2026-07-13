/**
 * R9.5c: R5–R8 Player flow integration — formation module, wave prep, passive,
 * wave reset, operation result, rematch.
 *
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tryLoadGameData } from '../battle/data/loadGameData.ts';
import { setDebugLoopStageId, setDebugLoopWaveIndex } from '../dev/debugLoopStage.ts';
import { setVerifyModeEnabled } from '../dev/verifyMode.ts';
import type { BattleEngine } from '../battle/BattleEngine.ts';
import { GameSession } from './GameSession.ts';
import {
  asBattleEngineInternals,
  killAllEnemies,
  reachAwaitingNextWave,
  TICK_DT,
  waitForEngaged,
} from '../battle/test/battleFieldSpec.harness.ts';

const TICK_MS = 1000 / 60;
const FORMATION_MODULE_ID = 'df_guardian_mod_guard_focus';
const WAVE_PREP_MODULE_ID = 'df_guardian_mod_nearest_strike';
const R8C_PASSIVE_ID = 'df_guardian_passive_2';
const R8C_GUARDIAN_SLOT = 0;

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

function tickSession(session: GameSession, frames = 1): void {
  for (let i = 0; i < frames; i++) {
    session.tick(TICK_DT, TICK_MS);
  }
}

function sortieToStage(session: GameSession, stageId: string): void {
  const host = (session as unknown as {
    handleStageSortie: (id: string) => void;
  }).handleStageSortie.bind(session);
  host(stageId);
}

function triggerVictory(session: GameSession, survivingIndices: number[] = [0, 1, 2, 3]): void {
  getEngine(session).applyVictoryTransition(survivingIndices);
}

function selectFormationModule(moduleId: string): void {
  const moduleSelect = document.querySelector<HTMLSelectElement>(
    '.skill-menu-combat-module-select',
  );
  if (!moduleSelect) throw new Error('Formation combat module select not found');
  moduleSelect.value = moduleId;
  moduleSelect.dispatchEvent(new Event('change', { bubbles: true }));
}

function closeFormation(): void {
  const returnButton = document.querySelector<HTMLButtonElement>(
    '.skill-menu-return-to-battle-button',
  );
  if (!returnButton) throw new Error('Formation return button not found');
  returnButton.click();
}

function selectWavePrepModule(moduleId: string, slotIndex = R8C_GUARDIAN_SLOT): void {
  const rows = document.querySelectorAll<HTMLElement>('.wave-prep-screen__slot');
  const row = rows[slotIndex];
  if (!row) throw new Error(`Wave prep slot row not found: ${slotIndex}`);
  const select = row.querySelector<HTMLSelectElement>(
    '.wave-prep-screen__module-select',
  );
  if (!select) throw new Error('Wave prep module select not found');
  select.value = moduleId;
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

function selectWavePrepPassive(passiveId: string, slotIndex = R8C_GUARDIAN_SLOT): void {
  const rows = document.querySelectorAll<HTMLElement>('.wave-prep-screen__slot');
  const row = rows[slotIndex];
  if (!row) throw new Error(`Wave prep slot row not found: ${slotIndex}`);
  const select = row.querySelector<HTMLSelectElement>(
    '.wave-prep-screen__passive-select',
  );
  if (!select) throw new Error('Wave prep passive select not found');
  select.value = passiveId;
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

function clickWavePrepAcquire(slotIndex = R8C_GUARDIAN_SLOT): void {
  const rows = document.querySelectorAll<HTMLElement>('.wave-prep-screen__slot');
  const row = rows[slotIndex];
  if (!row) throw new Error(`Wave prep slot row not found: ${slotIndex}`);
  const button = row.querySelector<HTMLButtonElement>(
    '.wave-prep-screen__passive-acquire',
  );
  if (!button) throw new Error('Wave prep passive acquire button not found');
  button.click();
}

function clickWavePrepConfirm(): void {
  const button = document.querySelector<HTMLButtonElement>(
    '.wave-prep-screen__confirm',
  );
  if (!button) throw new Error('Wave prep confirm button not found');
  button.click();
}

function clickVictoryResultButton(label: string): void {
  const buttons = document.querySelectorAll<HTMLButtonElement>(
    '.battle-victory-result-button',
  );
  const button = [...buttons].find((entry) => entry.textContent === label);
  if (!button) throw new Error(`Victory result button not found: ${label}`);
  button.click();
}

describe('R9.5c player integration', () => {
  let session: GameSession | null = null;

  beforeEach(() => {
    localStorage.clear();
    mockCanvas2d();
    setVerifyModeEnabled(false);
    setDebugLoopStageId(null);
    setDebugLoopWaveIndex(null);
  });

  afterEach(() => {
    session?.destroy();
    session = null;
    document.body.replaceChildren();
    setVerifyModeEnabled(false);
    setDebugLoopStageId(null);
    setDebugLoopWaveIndex(null);
  });

  it('runs 2-wave operation: formation module → wave1 → prep passive/module → wave2 → result → rematch', () => {
    session = createSession();
    session.start();

    // 1. Initial prep (formation) — combat module selection
    sortieToStage(session, '1');
    expect(session.getCurrentScreen()).toBe('formation');
    selectFormationModule(FORMATION_MODULE_ID);
    closeFormation();
    expect(session.getPartySlotCombatModule(0)).toBe(FORMATION_MODULE_ID);

    const engine = getEngine(session);
    waitForEngaged(engine);

    let guardian = asBattleEngineInternals(engine).players.find(
      (player) => player.partySlotIndex === R8C_GUARDIAN_SLOT,
    );
    expect(
      guardian?.cooldowns.find((cd) => cd.slotKind === 'basic')?.skillId,
    ).toBe(FORMATION_MODULE_ID);

    // 2. Wave 1 clear → wave prep
    const beforePlayers = asBattleEngineInternals(engine).players;
    beforePlayers[0].hp = 1;
    reachAwaitingNextWave(engine);
    expect(session.getCurrentScreen()).toBe('wavePrep');
    expect(document.body.textContent).toContain('Wave 間準備');
    expect(document.body.textContent).toContain('作戦内リソース: 1');

    // 3. Wave prep — module change + passive acquire with cost/description UI
    selectWavePrepModule(WAVE_PREP_MODULE_ID);
    expect(session.getPartySlotCombatModule(0)).toBeUndefined();
    selectWavePrepPassive(R8C_PASSIVE_ID);
    expect(document.body.textContent).toContain('消費 1');
    clickWavePrepAcquire();
    expect(session.getOperationAcquiredPassiveIds(R8C_GUARDIAN_SLOT)).toEqual([
      R8C_PASSIVE_ID,
    ]);
    expect(document.body.textContent).toContain('作戦内リソース: 0');

    // 4. Confirm next wave — HP reset + module/passive retained
    clickWavePrepConfirm();
    expect(session.getCurrentScreen()).toBe('battle');
    const afterPlayers = asBattleEngineInternals(engine).players;
    expect(afterPlayers).not.toBe(beforePlayers);
    expect(afterPlayers[0].hp).toBe(afterPlayers[0].maxHp);
    expect(session.getPartySlotCombatModule(0)).toBeUndefined();

    guardian = afterPlayers.find((player) => player.partySlotIndex === R8C_GUARDIAN_SLOT);
    expect(
      guardian?.cooldowns.find((cd) => cd.slotKind === 'basic')?.skillId,
    ).toBe(WAVE_PREP_MODULE_ID);

    // 5. Final wave victory → operation result (not wave prep)
    killAllEnemies(engine);
    for (let i = 0; i < 90_000; i++) {
      session.tick(TICK_DT, TICK_MS);
      if (engine.getSnapshot().phase === 'victory') break;
    }
    triggerVictory(session);
    session.view.refreshVictoryResultOverlay();
    expect(session.getCurrentScreen()).toBe('battle');
    expect(session.getCurrentScreen()).not.toBe('wavePrep');
    expect(session.shouldShowVictoryResult()).toBe(true);
    expect(session.getOperationResult()).toEqual({
      stageId: '1',
      outcome: 'victory',
      reachedWaveIndex: 1,
    });
    expect(session.getOperationState()).toBeNull();

    // 6. Rematch — fresh OperationState
    clickVictoryResultButton('同じステージで再戦');
    expect(session.getOperationResult()).toBeNull();
    expect(session.getCurrentScreen()).toBe('formation');
    expect(session.getOperationWaveIndex()).toBe(0);
    expect(session.getOperationAcquiredPassiveIds(R8C_GUARDIAN_SLOT)).toEqual([]);
    expect(session.getOperationUnspentResource()).toBe(0);
  });

  it('rejects double wave start from wave prep confirm', () => {
    setVerifyModeEnabled(true);
    setDebugLoopStageId('1');
    session = createSession();
    session.start();
    reachAwaitingNextWave(getEngine(session));
    expect(session.confirmWavePrepAndStartNextWave()).toBe(true);
    expect(session.confirmWavePrepAndStartNextWave()).toBe(false);
  });
});
