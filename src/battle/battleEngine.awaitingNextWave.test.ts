/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { BattleEngine } from './BattleEngine.ts';
import { loadGameData } from './data/loadGameData.ts';
import { loadLevelCurves } from '../progression/levelGrowth.ts';
import levelCurvesJson from '../../data/levelCurves.json';
import { createDefaultSave } from '../progression/victoryRewards.ts';
import type { BattleEvent, GameData, SaveGameState } from './types.ts';
import {
  asBattleEngineInternals,
  createStage1Engine,
  killAllEnemies,
  reachAwaitingNextWave,
  TICK_DT,
  waitForEngaged,
} from './test/battleFieldSpec.harness.ts';
import { setVerifyModeEnabled } from '../dev/verifyMode.ts';
import { tryLoadGameData } from './data/loadGameData.ts';
import { GameSession } from '../game/GameSession.ts';

function createSingleWaveStageEngine(): BattleEngine {
  const gameData = structuredClone(loadGameData());
  const stage = gameData.stages.find((s) => s.id === '1');
  if (stage) {
    stage.waves = stage.waves.slice(0, 1);
  }
  const levelCurves = loadLevelCurves(levelCurvesJson);
  const save = createDefaultSave(gameData, 'demo');
  save.stageProgress.currentStageId = '1';
  for (const slot of save.party) {
    if (slot) slot.progress.level = 10;
  }
  const engine = new BattleEngine(
    gameData,
    levelCurves,
    () => save.party,
    () => save.stageProgress.currentStageId,
  );
  engine.startBattle();
  return engine;
}

function applyTestStatusAndCooldown(engine: BattleEngine): {
  statusRemaining: number;
  cooldownRemaining: number;
} {
  const { players } = asBattleEngineInternals(engine);
  const ally = players.find((p) => p.isAlive);
  if (!ally) throw new Error('no living ally');
  const statusRemaining = 5;
  const cooldownRemaining = 3;
  ally.statusEffects.push({
    id: 'test_dot',
    kind: 'debuff',
    stat: 'atk',
    multiplier: 0.9,
    remainingSec: statusRemaining,
    tickIntervalSec: 1,
    tickDamage: 1,
  });
  const cd = ally.cooldowns.find((c) => c.slotKind === 'basic');
  if (!cd) throw new Error('no basic cooldown');
  cd.remaining = cooldownRemaining;
  return { statusRemaining, cooldownRemaining };
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

describe('BattleEngine awaitingNextWave (R6b)', () => {
  describe('intermediate wave stop', () => {
    it('enters awaiting after exit march completes', () => {
      const engine = createStage1Engine({ reliableWaveClear: true });
      const snap = reachAwaitingNextWave(engine);
      expect(snap.awaitingNextWave).toBe(true);
      expect(snap.runtimePhase).toBe('AwaitingNextWave');
      expect(snap.waveIndex).toBe(0);
      expect(snap.waveAnnouncementActive).toBe(false);
      expect(snap.enemies.every((e) => e.hp <= 0)).toBe(true);
    });

    it('does not auto-start wave announcement or spawn next enemies', () => {
      const engine = createStage1Engine({ reliableWaveClear: true });
      reachAwaitingNextWave(engine);
      for (let i = 0; i < 600; i++) {
        engine.tick(TICK_DT);
        const snap = engine.getSnapshot();
        expect(snap.awaitingNextWave).toBe(true);
        expect(snap.waveAnnouncementActive).toBe(false);
        expect(snap.waveIndex).toBe(0);
        expect(snap.enemies.every((e) => e.hp <= 0)).toBe(true);
      }
    });

    it('freezes ally cooldown, status, and dot during awaiting', () => {
      const engine = createStage1Engine({ reliableWaveClear: true });
      waitForEngaged(engine);
      killAllEnemies(engine);
      for (let i = 0; i < 90_000; i++) {
        engine.tick(TICK_DT);
        if (engine.getSnapshot().awaitingNextWave) break;
      }
      expect(engine.getSnapshot().awaitingNextWave).toBe(true);
      const { statusRemaining, cooldownRemaining } =
        applyTestStatusAndCooldown(engine);
      for (let i = 0; i < 300; i++) {
        engine.tick(TICK_DT);
      }
      const { players } = asBattleEngineInternals(engine);
      const ally = players.find((p) => p.isAlive)!;
      const status = ally.statusEffects.find((e) => e.id === 'test_dot');
      const cd = ally.cooldowns.find((c) => c.slotKind === 'basic')!;
      expect(status?.remainingSec).toBe(statusRemaining);
      expect(cd.remaining).toBe(cooldownRemaining);
      expect(engine.getSnapshot().awaitingNextWave).toBe(true);
    });

    it('does not advance battle time or engaged combat while awaiting', () => {
      const engine = createStage1Engine({ reliableWaveClear: true });
      const awaiting = reachAwaitingNextWave(engine);
      const timeBefore = engine.getBattleTimeSec();
      const allyXBefore = awaiting.allies.find((a) => a.hp > 0)!.battleX;
      for (let i = 0; i < 120; i++) {
        engine.tick(TICK_DT);
      }
      const after = engine.getSnapshot();
      expect(after.engaged).toBe(false);
      expect(engine.getBattleTimeSec()).toBe(timeBefore);
      const allyXAfter = after.allies.find((a) => a.hp > 0)!.battleX;
      expect(allyXAfter).toBe(allyXBefore);
    });
  });

  describe('startNextWave', () => {
    it('succeeds only while awaiting and starts wave announcement', () => {
      const engine = createStage1Engine({ reliableWaveClear: true });
      reachAwaitingNextWave(engine);
      expect(engine.startNextWave()).toBe(true);
      const snap = engine.getSnapshot();
      expect(snap.awaitingNextWave).toBe(false);
      expect(snap.waveAnnouncementActive).toBe(true);
      expect(snap.waveIndex).toBe(1);
      expect(snap.enemies.some((e) => e.hp > 0)).toBe(true);
    });

    it('rejects double startNextWave', () => {
      const engine = createStage1Engine({ reliableWaveClear: true });
      reachAwaitingNextWave(engine);
      expect(engine.startNextWave()).toBe(true);
      expect(engine.startNextWave()).toBe(false);
    });

    it('rejects during combat, exit march, victory, and defeat', () => {
      const combatEngine = createStage1Engine({ reliableWaveClear: true });
      waitForEngaged(combatEngine);
      expect(combatEngine.startNextWave()).toBe(false);

      const marchEngine = createStage1Engine({ reliableWaveClear: true });
      waitForEngaged(marchEngine);
      killAllEnemies(marchEngine);
      let sawMarch = false;
      for (let i = 0; i < 90_000; i++) {
        marchEngine.tick(TICK_DT);
        const snap = marchEngine.getSnapshot();
        if (snap.runtimePhase === 'VictoryExit') {
          sawMarch = true;
          expect(marchEngine.startNextWave()).toBe(false);
        }
        if (snap.awaitingNextWave) break;
      }
      expect(sawMarch).toBe(true);

      const victoryEngine = createSingleWaveStageEngine();
      waitForEngaged(victoryEngine);
      killAllEnemies(victoryEngine);
      for (let i = 0; i < 90_000; i++) {
        victoryEngine.tick(TICK_DT);
        if (victoryEngine.getSnapshot().phase === 'victory') break;
      }
      expect(victoryEngine.getSnapshot().phase).toBe('victory');
      expect(victoryEngine.startNextWave()).toBe(false);

      const defeatEngine = createStage1Engine({ reliableWaveClear: true });
      waitForEngaged(defeatEngine);
      const { players } = asBattleEngineInternals(defeatEngine);
      for (const ally of players) {
        ally.hp = 0;
        ally.isAlive = false;
      }
      for (let i = 0; i < 90_000; i++) {
        defeatEngine.tick(TICK_DT);
        if (defeatEngine.getSnapshot().phase === 'defeat') break;
      }
      expect(defeatEngine.getSnapshot().phase).toBe('defeat');
      expect(defeatEngine.startNextWave()).toBe(false);
    });
  });

  describe('final wave', () => {
    it('single-wave stage still goes to victory without awaiting', () => {
      const engine = createSingleWaveStageEngine();
      waitForEngaged(engine);
      killAllEnemies(engine);
      let sawVictory = false;
      for (let i = 0; i < 90_000; i++) {
        engine.tick(TICK_DT);
        const snap = engine.getSnapshot();
        expect(snap.awaitingNextWave).toBe(false);
        if (snap.phase === 'victory') {
          sawVictory = true;
          break;
        }
      }
      expect(sawVictory).toBe(true);
    });

    it('final wave of multi-wave stage goes to victory without awaiting', () => {
      const engine = createStage1Engine({ reliableWaveClear: true });
      reachAwaitingNextWave(engine);
      engine.startNextWave();
      waitForEngaged(engine);
      killAllEnemies(engine);
      let sawVictory = false;
      for (let i = 0; i < 90_000; i++) {
        engine.tick(TICK_DT);
        const snap = engine.getSnapshot();
        expect(snap.awaitingNextWave).toBe(false);
        if (snap.phase === 'victory') {
          sawVictory = true;
          break;
        }
      }
      expect(sawVictory).toBe(true);
    });

    it('handleVictory fires once on final wave only', () => {
      const gameData = structuredClone(loadGameData());
      const stage = gameData.stages.find((s) => s.id === '1');
      if (stage) stage.waves = stage.waves.slice(0, 1);
      const levelCurves = loadLevelCurves(levelCurvesJson);
      const save = createDefaultSave(gameData, 'demo');
      save.stageProgress.currentStageId = '1';
      const events: BattleEvent[] = [];
      const engine = new BattleEngine(
        gameData,
        levelCurves,
        () => save.party,
        () => save.stageProgress.currentStageId,
      );
      engine.onEvent((event) => events.push(event));
      engine.startBattle();
      waitForEngaged(engine);
      killAllEnemies(engine);
      for (let i = 0; i < 90_000; i++) {
        engine.tick(TICK_DT);
        if (engine.getSnapshot().phase === 'victory') break;
      }
      const victories = events.filter(
        (e) => e.type === 'battleEnd' && e.result === 'victory',
      );
      expect(victories).toHaveLength(1);
    });
  });

  describe('reset boundaries', () => {
    it('restartBattle clears awaiting and returns to wave 0', () => {
      const engine = createStage1Engine({ reliableWaveClear: true });
      reachAwaitingNextWave(engine);
      engine.restartBattle();
      const snap = engine.getSnapshot();
      expect(snap.awaitingNextWave).toBe(false);
      expect(snap.waveIndex).toBe(0);
      expect(snap.waveAnnouncementActive).toBe(true);
    });

    it('reload via restartBattle does not leave awaiting on new battle', () => {
      const engine = createStage1Engine({ reliableWaveClear: true });
      reachAwaitingNextWave(engine);
      engine.restartBattle();
      for (let i = 0; i < 60; i++) {
        engine.tick(TICK_DT);
      }
      expect(engine.getSnapshot().awaitingNextWave).toBe(false);
    });
  });

  describe('regression', () => {
    it('preserves party combat module selection through awaiting', () => {
      const gameData = structuredClone(loadGameData());
      const levelCurves = loadLevelCurves(levelCurvesJson);
      const save = createDefaultSave(gameData, 'demo');
      save.stageProgress.currentStageId = '1';
      const stage = gameData.stages.find((s) => s.id === '1');
      if (stage?.waves[0]) {
        stage.waves[0].enemies = [{ templateId: 'stage1_1', spawnX: 120 }];
      }
      const wave1Enemy = gameData.enemyRegistry.stage1_1;
      if (wave1Enemy) wave1Enemy.maxHp = 1;
      const moduleId = 'df_guardian_mod_guard_focus';
      const engine = new BattleEngine(
        gameData,
        levelCurves,
        () => save.party,
        () => save.stageProgress.currentStageId,
        {
          getSelectedCombatModuleId: (slotIndex) =>
            slotIndex === 0 ? moduleId : undefined,
        },
      );
      engine.startBattle();
      reachAwaitingNextWave(engine);
      engine.startNextWave();
      const { players } = asBattleEngineInternals(engine);
      const guardian = players.find((p) => p.partySlotIndex === 0);
      const basicCd = guardian?.cooldowns.find((c) => c.slotKind === 'basic');
      expect(basicCd?.skillId).toBe(moduleId);
    });
  });
});

describe('GameSession startNextWave wire (R6b)', () => {
  let session: GameSession | null = null;

  beforeEach(() => {
    localStorage.clear();
    mockCanvas2d();
    setVerifyModeEnabled(true);
  });

  afterEach(() => {
    session?.destroy();
    session = null;
    document.body.replaceChildren();
  });

  function createSession(): GameSession {
    const loaded = tryLoadGameData();
    if (!loaded.ok) throw new Error(loaded.error);
    const container = document.createElement('div');
    document.body.appendChild(container);
    return new GameSession(loaded.data, container);
  }

  it('delegates startNextWave to engine without changing save', () => {
    session = createSession();
    const engine = (session as unknown as { engine: BattleEngine }).engine;
    session.setLoopStage('1');
    const saveBefore = structuredClone(session.getSaveState());
    waitForEngaged(engine);
    killAllEnemies(engine);
    for (let i = 0; i < 90_000; i++) {
      engine.tick(TICK_DT);
      if (session.isAwaitingNextWave()) break;
    }
    expect(session.isAwaitingNextWave()).toBe(true);
    expect(session.startNextWave()).toBe(true);
    expect(session.isAwaitingNextWave()).toBe(false);
    expect(session.getSaveState()).toEqual(saveBefore);
  });

  it('stage change clears awaiting state', () => {
    session = createSession();
    const engine = (session as unknown as { engine: BattleEngine }).engine;
    session.setLoopStage('1');
    waitForEngaged(engine);
    killAllEnemies(engine);
    for (let i = 0; i < 90_000; i++) {
      engine.tick(TICK_DT);
      if (session.isAwaitingNextWave()) break;
    }
    session.setLoopStage('2');
    expect(session.isAwaitingNextWave()).toBe(false);
    expect(engine.getSnapshot().waveIndex).toBe(0);
  });
});
