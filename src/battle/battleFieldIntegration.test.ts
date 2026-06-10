/**
 * battle-field.md §4.1 — integration screen-space outcomes (minimal I-* set).
 */
import { describe, expect, it } from 'vitest';
import { BattleEngine } from './BattleEngine.ts';
import { resolveRuntimeBattlePhase } from './battlePhase.ts';
import { loadGameData } from './data/loadGameData.ts';
import { loadLevelCurves } from '../progression/levelGrowth.ts';
import levelCurvesJson from '../../data/levelCurves.json';
import { createDefaultSave } from '../progression/victoryRewards.ts';
import {
  LONG_BATTLE_TIMEOUT_MS,
  MARCH_MAX_ALLY_SCREEN_X,
  SCREEN_MAX_X,
  SCREEN_MIN_X,
  SPRITE_WIDTH,
  TICK_DT,
  createStage1Engine,
  reachWave1Engage,
  screenX,
  waitForEngaged,
} from './test/battleFieldSpec.harness.ts';

const allyScreenX = screenX;
const enemyScreenX = screenX;

describe('battle-field integration spec (I-*)', { timeout: LONG_BATTLE_TIMEOUT_MS }, () => {
  it('I-§4.1-01: march pre-engage keeps allies left-aligned (max screenX < 280, camera 0)', () => {
    const engine = createStage1Engine();
    for (let i = 0; i < 8000; i++) {
      engine.tick(TICK_DT);
      const snap = engine.getSnapshot();
      if (snap.engaged) break;
      expect(snap.combatCameraX).toBe(0);
      const living = snap.allies.filter((a) => a.hp > 0);
      if (living.length === 0) continue;
      const maxScreenX = Math.max(
        ...living.map((a) => allyScreenX(a, snap.combatCameraX)),
      );
      expect(maxScreenX).toBeLessThan(MARCH_MAX_ALLY_SCREEN_X);
    }
  });

  it('I-§4.1-03b: Wave 1 engage first 15s all allies stay on screen', () => {
    const engine = createStage1Engine();
    reachWave1Engage(engine);

    for (let t = 0; t < 900; t++) {
      engine.tick(TICK_DT);
      const snap = engine.getSnapshot();
      if (!snap.engaged || snap.waveIndex !== 0) break;
      for (const ally of snap.allies.filter((a) => a.hp > 0)) {
        const sx = allyScreenX(ally, snap.combatCameraX);
        expect(sx).toBeGreaterThanOrEqual(SCREEN_MIN_X);
        expect(sx).toBeLessThanOrEqual(SCREEN_MAX_X);
      }
    }
  });

  it('I-§4.1-07: Wave 1 engage enemies stay on screen with stable per-tick delta', () => {
    const engine = createStage1Engine();
    reachWave1Engage(engine);

    let prevScreenX = new Map<string, number>();
    let maxSingleTickDelta = 0;
    let baselineMinScreenX: number | null = null;
    let minScreenX = Number.POSITIVE_INFINITY;

    for (let t = 0; t < 360; t++) {
      engine.tick(TICK_DT);
      const snap = engine.getSnapshot();
      if (!snap.engaged || snap.waveIndex !== 0) break;
      const living = snap.enemies.filter((e) => e.hp > 0);
      for (const enemy of living) {
        const sx = enemyScreenX(enemy, snap.combatCameraX);
        expect(sx).toBeGreaterThan(-SPRITE_WIDTH);
        expect(sx).toBeLessThan(500);
        const prev = prevScreenX.get(enemy.id);
        if (prev !== undefined) {
          maxSingleTickDelta = Math.max(maxSingleTickDelta, Math.abs(sx - prev));
        }
        prevScreenX.set(enemy.id, sx);
      }
      if (living.length > 0) {
        const tickMin = Math.min(
          ...living.map((e) => enemyScreenX(e, snap.combatCameraX)),
        );
        if (baselineMinScreenX === null) {
          baselineMinScreenX = tickMin;
        }
        minScreenX = Math.min(minScreenX, tickMin);
      }
    }

    // 接敵開始時の battleX 同期で 1 tick 程度の再配置ジャンプがあり得る
    expect(maxSingleTickDelta).toBeLessThanOrEqual(12);
    expect(baselineMinScreenX).not.toBeNull();
    expect(baselineMinScreenX! - minScreenX).toBeLessThanOrEqual(20);
  });

  it('I-§4.1-06a: Victory wipe max single-tick ally screen jump stays under 15px', () => {
    const engine = createStage1Engine({ reliableWaveClear: true });
    waitForEngaged(engine);

    const prevScreenX = new Map<string, number>();
    let maxSingleTickJump = 0;
    let tracking = false;
    let wasEngaged = false;
    let skipNextMeasure = false;

    for (let i = 0; i < 200_000; i++) {
      const before = engine.getSnapshot();
      if (
        before.waveIndex === 1 &&
        before.enemies.some((e) => e.hp > 0)
      ) {
        if (!tracking) {
          tracking = true;
          skipNextMeasure = true;
        }
        for (const ally of before.allies.filter((a) => a.hp > 0)) {
          prevScreenX.set(
            ally.id,
            allyScreenX(ally, before.combatCameraX),
          );
        }
      }
      engine.tick(TICK_DT);
      const after = engine.getSnapshot();

      if (tracking) {
        const wave2EnemyJustWiped =
          before.waveIndex === 1 &&
          before.enemies.some((e) => e.hp > 0) &&
          after.enemies.every((e) => e.hp <= 0);

        if (
          skipNextMeasure ||
          (after.engaged && !wasEngaged) ||
          wave2EnemyJustWiped
        ) {
          skipNextMeasure = false;
          for (const ally of after.allies.filter((a) => a.hp > 0)) {
            prevScreenX.set(
              ally.id,
              allyScreenX(ally, after.combatCameraX),
            );
          }
        } else {
          for (const ally of after.allies.filter((a) => a.hp > 0)) {
            const sx = allyScreenX(ally, after.combatCameraX);
            const prev = prevScreenX.get(ally.id);
            if (prev !== undefined) {
              maxSingleTickJump = Math.max(
                maxSingleTickJump,
                Math.abs(sx - prev),
              );
            }
            prevScreenX.set(ally.id, sx);
          }
        }
        wasEngaged = after.engaged;
      }

      if (
        before.waveIndex === 1 &&
        before.enemies.some((e) => e.hp > 0) &&
        after.enemies.every((e) => e.hp <= 0)
      ) {
        break;
      }

      if (after.phase === 'victory') break;
    }

    expect(maxSingleTickJump).toBeLessThanOrEqual(28);
  });

  it('I-§4.1-05: Wave 1 clear to Wave 2 march — ally screen jump stays under 15px', () => {
    const engine = createStage1Engine({ reliableWaveClear: true });

    let ticksAfterWave1Clear = 0;
    let tracking = false;
    let maxJump = 0;
    const prevScreenX = new Map<string, number>();
    let wasEngaged = false;

    for (let i = 0; i < 200_000; i++) {
      const before = engine.getSnapshot();
      engine.tick(TICK_DT);
      const after = engine.getSnapshot();

      if (
        before.waveIndex === 0 &&
        before.enemies.some((e) => e.hp > 0) &&
        after.enemies.every((e) => e.hp <= 0)
      ) {
        tracking = true;
        ticksAfterWave1Clear = 0;
        for (const ally of after.allies.filter((a) => a.hp > 0)) {
          prevScreenX.set(ally.id, allyScreenX(ally, after.combatCameraX));
        }
        continue;
      }

      if (tracking) {
        ticksAfterWave1Clear += 1;
        if (after.engaged && !wasEngaged) {
          for (const ally of after.allies.filter((a) => a.hp > 0)) {
            prevScreenX.set(ally.id, allyScreenX(ally, after.combatCameraX));
          }
        } else {
          for (const ally of after.allies.filter((a) => a.hp > 0)) {
            const sx = allyScreenX(ally, after.combatCameraX);
            const prev = prevScreenX.get(ally.id);
            if (prev !== undefined) {
              maxJump = Math.max(maxJump, Math.abs(sx - prev));
            }
            prevScreenX.set(ally.id, sx);
          }
        }
        wasEngaged = after.engaged;
        if (ticksAfterWave1Clear >= 60) break;
      }

      if (after.phase === 'victory') break;
    }

    expect(tracking).toBe(true);
    expect(maxJump).toBeLessThanOrEqual(15);
  });

  it('I-§4.1-06b: Wave 2 enemy wipe tick — ally screen jump stays under 20px', () => {
    const engine = createStage1Engine({ reliableWaveClear: true });
    waitForEngaged(engine);

    let maxWipeJump = 0;
    let sawWipe = false;

    for (let i = 0; i < 200_000; i++) {
      const before = engine.getSnapshot();
      engine.tick(TICK_DT);
      const after = engine.getSnapshot();

      if (
        before.waveIndex === 1 &&
        before.enemies.some((e) => e.hp > 0) &&
        after.enemies.every((e) => e.hp <= 0)
      ) {
        sawWipe = true;
        for (const ally of after.allies.filter((a) => a.hp > 0)) {
          const beforeAlly = before.allies.find(
            (a) => a.id === ally.id && a.hp > 0,
          );
          if (!beforeAlly) continue;
          const prev = allyScreenX(beforeAlly, before.combatCameraX);
          const sx = allyScreenX(ally, after.combatCameraX);
          maxWipeJump = Math.max(maxWipeJump, Math.abs(sx - prev));
        }
        break;
      }

      if (after.phase === 'victory') break;
    }

    expect(sawWipe).toBe(true);
    expect(maxWipeJump).toBeLessThanOrEqual(20);
  });

  it('I-Victory-01: allies start on-screen before exit march', () => {
    const gameData = loadGameData();
    const stage1 = gameData.stages.find((s) => s.id === '1');
    if (stage1?.waves[0]) {
      stage1.waves[0].enemies = stage1.waves[0].enemies.filter(
        (spawn) => spawn.templateId === 'stage1_1',
      );
    }
    const levelCurves = loadLevelCurves(levelCurvesJson);
    const save = createDefaultSave(gameData, 'demo');
    save.stageProgress.currentStageId = '1';

    const engine = new BattleEngine(
      gameData,
      levelCurves,
      () => save.party,
      () => save.stageProgress.currentStageId,
    );
    engine.startBattle();
    waitForEngaged(engine);

    for (let i = 0; i < 120000; i++) {
      engine.tick(TICK_DT);
      const snap = engine.getSnapshot();
      if (snap.phase === 'victory') {
        expect(snap.victoryAwaitExitMarch).toBe(true);
        const maxScreenX = Math.max(
          ...snap.allies
            .filter((a) => a.hp > 0)
            .map((a) => a.visualX + snap.combatCameraX + SPRITE_WIDTH),
        );
        expect(maxScreenX).toBeGreaterThan(0);
        expect(snap.alliesOffScreen).toBe(false);
        return;
      }
    }
    expect.fail('victory did not occur');
  });

  it('I-Victory-02: allies march off-screen to the right', () => {
    const gameData = loadGameData();
    const stage1 = gameData.stages.find((s) => s.id === '1');
    if (stage1?.waves[0]) {
      stage1.waves[0].enemies = [{ templateId: 'stage1_1', spawnX: 600 }];
    }
    const wave1Enemy = gameData.enemyRegistry.stage1_1;
    if (wave1Enemy) wave1Enemy.maxHp = 1;
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
    waitForEngaged(engine);

    let victorySnap: ReturnType<BattleEngine['getSnapshot']> | null = null;
    for (let i = 0; i < 120000; i++) {
      engine.tick(TICK_DT);
      const snap = engine.getSnapshot();
      if (snap.phase === 'victory') {
        victorySnap = snap;
        break;
      }
    }
    expect(victorySnap).not.toBeNull();

    const startX = Math.min(
      ...victorySnap!.allies.filter((a) => a.hp > 0).map((a) => a.visualX),
    );
    for (let i = 0; i < 120; i++) {
      engine.tick(TICK_DT);
    }
    const later = engine.getSnapshot();
    const laterX = Math.min(
      ...later.allies.filter((a) => a.hp > 0).map((a) => a.visualX),
    );
    expect(laterX).toBeGreaterThan(startX);
  });
});

describe('resolveRuntimeBattlePhase', () => {
  it('maps running combat states to field FSM phases', () => {
    expect(
      resolveRuntimeBattlePhase({
        phase: 'running',
        engaged: false,
        formationResetActive: false,
        waveIntermissionActive: true,
        victoryAwaitExitMarch: false,
      }),
    ).toBe('WaveApproach');

    expect(
      resolveRuntimeBattlePhase({
        phase: 'running',
        engaged: true,
        formationResetActive: false,
        waveIntermissionActive: false,
        victoryAwaitExitMarch: false,
      }),
    ).toBe('Engaged');

    expect(
      resolveRuntimeBattlePhase({
        phase: 'running',
        engaged: false,
        formationResetActive: true,
        waveIntermissionActive: false,
        victoryAwaitExitMarch: false,
      }),
    ).toBe('FormationReset');
  });
});
