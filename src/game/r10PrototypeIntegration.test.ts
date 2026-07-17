/**
 * R10: New-spec 2-wave prototype stage — load, spawn per wave, prep judgments,
 * finish, rematch.
 *
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import levelCurvesJson from '../../data/levelCurves.json';
import { tryLoadGameData } from '../battle/data/loadGameData.ts';
import { createEnemiesForStage } from '../battle/entities.ts';
import { loadLevelCurves } from '../progression/levelGrowth.ts';
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
import { resolveStageEnemyCompositionPreview } from '../ui/stageEnemyCompositionPreview.ts';

const TICK_MS = 1000 / 60;
const STAGE_ID = 'r10_prototype';
const FORMATION_MODULE_ID = 'df_guardian_mod_guard_focus';
const WAVE_PREP_MODULE_ID = 'df_guardian_mod_nearest_strike';
const WAVE_PREP_PASSIVE_ID = 'df_guardian_op_wall_aura';
const GUARDIAN_SLOT = 0;
const SWORDSMAN_PASSIVE_ID = 'at_swordsman_op_high_def_focus';
const WAVE_CLEAR_RESOURCE_GRANT = 12;
const WAVE_PREP_PASSIVE_COST = 10;
const levelCurves = loadLevelCurves(levelCurvesJson);

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

function livingEnemyClassCounts(engine: BattleEngine): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const enemy of engine.getSnapshot().enemies.filter((unit) => unit.hp > 0)) {
    if (!enemy.classId) continue;
    counts[enemy.classId] = (counts[enemy.classId] ?? 0) + 1;
  }
  return counts;
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
  const candidate = document.querySelector<HTMLButtonElement>(
    `.combat-module-prep__candidate[data-module-id="${moduleId}"]`,
  );
  if (!candidate) throw new Error('Formation combat module candidate not found');
  candidate.click();
}

function closeFormation(): void {
  const returnButton = document.querySelector<HTMLButtonElement>(
    '.skill-menu-return-to-battle-button',
  );
  if (!returnButton) throw new Error('Formation return button not found');
  returnButton.click();
}

function selectWavePrepModule(moduleId: string, slotIndex = GUARDIAN_SLOT): void {
  const rows = document.querySelectorAll<HTMLElement>('.wave-prep-screen__slot');
  const row = rows[slotIndex];
  if (!row) throw new Error(`Wave prep slot row not found: ${slotIndex}`);
  const candidate = row.querySelector<HTMLButtonElement>(
    `.combat-module-prep__candidate[data-module-id="${moduleId}"]`,
  );
  if (!candidate) throw new Error('Wave prep module candidate not found');
  candidate.click();
}

function clickWavePrepAcquire(
  passiveId: string = WAVE_PREP_PASSIVE_ID,
  slotIndex = GUARDIAN_SLOT,
): void {
  const rows = document.querySelectorAll<HTMLElement>('.wave-prep-screen__slot');
  const row = rows[slotIndex];
  if (!row) throw new Error(`Wave prep slot row not found: ${slotIndex}`);
  const card = row.querySelector<HTMLElement>(
    `.operation-passive-prep__candidate[data-passive-id="${passiveId}"]`,
  );
  if (!card) throw new Error(`Wave prep passive card not found: ${passiveId}`);
  const button =
    card.querySelector<HTMLButtonElement>('.operation-passive-prep__acquire:not(:disabled)') ??
    card.querySelector<HTMLButtonElement>('.operation-passive-prep__acquire');
  if (!button) throw new Error('Wave prep passive acquire button not found');
  button.click();
}

function clickWavePrepConfirm(): void {
  const button = document.querySelector<HTMLButtonElement>('.wave-prep-screen__confirm');
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

describe('R10 prototype stage', () => {
  const loaded = tryLoadGameData();
  if (!loaded.ok) throw new Error(loaded.error);
  const gameData = loaded.data;

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

  it('loads r10_prototype as 2-wave waveEnemyGroups with module ids', () => {
    const stage = gameData.stages.find((entry) => entry.id === STAGE_ID);
    expect(stage).toBeDefined();
    expect(stage!.waves).toHaveLength(2);
    expect(stage!.enemyGroups).toBeUndefined();
    expect(stage!.waves[0]?.enemyGroups?.map((g) => g.selectedCombatModuleId)).toEqual([
      'at_swordsman_mod_single_slash',
      'df_guardian_mod_nearest_strike',
    ]);
    expect(stage!.waves[1]?.enemyGroups?.map((g) => g.selectedCombatModuleId)).toEqual([
      'at_sorcerer_mod_chain',
      'at_swordsman_mod_pierce_slash',
    ]);

    const preview = resolveStageEnemyCompositionPreview(stage!);
    expect(preview.usesWaveEnemyGroups).toBe(true);
    expect(preview.totalEnemyCount).toBe(6);
  });

  it('spawns different enemyGroups for wave 0 and wave 1', () => {
    const wave0 = createEnemiesForStage(gameData, STAGE_ID, 0, levelCurves);
    const wave1 = createEnemiesForStage(gameData, STAGE_ID, 1, levelCurves);

    const counts = (units: typeof wave0) =>
      units.reduce<Record<string, number>>((acc, unit) => {
        const classId = unit.classId ?? 'unknown';
        acc[classId] = (acc[classId] ?? 0) + 1;
        return acc;
      }, {});

    expect(counts(wave0)).toEqual({ at_swordsman: 2, df_guardian: 1 });
    expect(counts(wave1)).toEqual({ at_sorcerer: 2, at_swordsman: 1 });
    // 新仕様: recommendedLevel なし。敵ステは基礎 + scale
    expect(gameData.stages.find((entry) => entry.id === STAGE_ID)?.recommendedLevel).toBeUndefined();
    expect(
      wave0
        .filter((unit) => unit.classId === 'at_swordsman')
        .every((unit) =>
          unit.cooldowns.some(
            (cd) => cd.slotKind === 'basic' && cd.skillId === 'at_swordsman_mod_single_slash',
          ),
        ),
    ).toBe(true);
    expect(
      wave1
        .filter((unit) => unit.classId === 'at_swordsman')
        .every((unit) =>
          unit.cooldowns.some(
            (cd) => cd.slotKind === 'basic' && cd.skillId === 'at_swordsman_mod_pierce_slash',
          ),
        ),
    ).toBe(true);
  });

  it('exposes R5 operation-passive candidates for wave prep judgments', () => {
    expect(gameData.operationPassiveCatalog.candidatesByClass).toMatchObject({
      df_guardian: expect.arrayContaining([WAVE_PREP_PASSIVE_ID]),
      at_swordsman: expect.arrayContaining([SWORDSMAN_PASSIVE_ID]),
      at_sorcerer: expect.arrayContaining(['at_sorcerer_op_arc_bolt']),
      sp_cleric: expect.arrayContaining(['sp_cleric_op_triage']),
    });
    expect(gameData.operationPassiveCatalog.passiveAcquireCost).toBe(1);
    expect(gameData.operationPassiveCatalog.waveClearResourceGrant).toBe(
      WAVE_CLEAR_RESOURCE_GRANT,
    );
    expect(gameData.operationPassiveCatalog.sameClassStackStep).toBe(1);
  });

  it('runs r10_prototype from formation through rematch with module and passive', () => {
    session = createSession();
    session.start();

    sortieToStage(session, STAGE_ID);
    expect(session.getCurrentScreen()).toBe('formation');
    selectFormationModule(FORMATION_MODULE_ID);
    closeFormation();
    expect(session.getPartySlotCombatModule(0)).toBe(FORMATION_MODULE_ID);

    const engine = getEngine(session);
    waitForEngaged(engine);
    expect(livingEnemyClassCounts(engine)).toEqual({
      at_swordsman: 2,
      df_guardian: 1,
    });

    let guardian = asBattleEngineInternals(engine).players.find(
      (player) => player.partySlotIndex === GUARDIAN_SLOT,
    );
    expect(
      guardian?.cooldowns.find((cd) => cd.slotKind === 'basic')?.skillId,
    ).toBe(FORMATION_MODULE_ID);

    reachAwaitingNextWave(engine);
    expect(session.getCurrentScreen()).toBe('wavePrep');
    expect(document.body.textContent).toContain(
      `作戦内リソース: ${WAVE_CLEAR_RESOURCE_GRANT}`,
    );
    expect(document.body.textContent).toContain('城壁の護り');

    selectWavePrepModule(WAVE_PREP_MODULE_ID);
    clickWavePrepAcquire();
    expect(session.getOperationAcquiredPassiveIds(GUARDIAN_SLOT)).toEqual([
      WAVE_PREP_PASSIVE_ID,
    ]);
    expect(session.getOperationUnspentResource()).toBe(
      WAVE_CLEAR_RESOURCE_GRANT - WAVE_PREP_PASSIVE_COST,
    );

    clickWavePrepConfirm();
    expect(session.getCurrentScreen()).toBe('battle');
    waitForEngaged(engine);
    expect(livingEnemyClassCounts(engine)).toEqual({
      at_sorcerer: 2,
      at_swordsman: 1,
    });

    guardian = asBattleEngineInternals(engine).players.find(
      (player) => player.partySlotIndex === GUARDIAN_SLOT,
    );
    expect(
      guardian?.cooldowns.find((cd) => cd.slotKind === 'basic')?.skillId,
    ).toBe(WAVE_PREP_MODULE_ID);
    expect(guardian?.build.learnedPassiveIds).toContain(WAVE_PREP_PASSIVE_ID);

    killAllEnemies(engine);
    for (let i = 0; i < 90_000; i++) {
      session.tick(TICK_DT, TICK_MS);
      if (engine.getSnapshot().phase === 'victory') break;
    }
    triggerVictory(session);
    session.view.refreshVictoryResultOverlay();
    expect(session.getOperationResult()).toEqual({
      stageId: STAGE_ID,
      outcome: 'victory',
      reachedWaveIndex: 1,
    });
    expect(session.getOperationState()).toBeNull();

    clickVictoryResultButton('同じステージで再戦');
    expect(session.getCurrentScreen()).toBe('formation');
    expect(session.getOperationWaveIndex()).toBe(0);
    expect(session.getOperationAcquiredPassiveIds(GUARDIAN_SLOT)).toEqual([]);
    expect(session.getOperationUnspentResource()).toBe(0);
  });
});
