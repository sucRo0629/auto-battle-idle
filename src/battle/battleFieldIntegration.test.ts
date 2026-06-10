/**
 * battle-field.md §4.1 / §4.3 / §4.6 — integration screen-space outcomes.
 * Migrated from battleEngine.engagementVisual.test.ts with spec IDs (I-*).
 */
import { describe, expect, it } from 'vitest';
import { BattleEngine } from './BattleEngine.ts';
import { loadGameData } from './data/loadGameData.ts';
import { loadLevelCurves } from '../progression/levelGrowth.ts';
import levelCurvesJson from '../../data/levelCurves.json';
import { createDefaultSave } from '../progression/victoryRewards.ts';
import { engagedMinBodyGap } from './battleConstants.ts';
import type { CombatantSnapshot } from './types.ts';
import {
  BACK_ROW_NAMES,
  LONG_BATTLE_TIMEOUT_MS,
  MARCH_MAX_ALLY_SCREEN_X,
  SCREEN_MAX_X,
  SCREEN_MIN_X,
  SPRITE_WIDTH,
  TICK_DT,
  advanceUntil,
  countScreenXSignFlips,
  createStage1Engine,
  createStage1Wave2MeleeOnlyEngine,
  reachWave1Engage,
  reachWave2Engage,
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

  it('I-§4.1-02: Wave 2 engage ticks 0–90 back-row screen delta stays under 8px', () => {
    const engine = createStage1Engine({ reliableWaveClear: true });
    const engageSnap = reachWave2Engage(engine);

    const rearBaseline = new Map<string, number>();
    for (const name of BACK_ROW_NAMES) {
      const ally = engageSnap.allies.find((a) => a.name === name && a.hp > 0);
      expect(ally).toBeDefined();
      rearBaseline.set(
        name,
        allyScreenX(ally!, engageSnap.combatCameraX),
      );
    }

    for (let t = 0; t < 90; t++) {
      engine.tick(TICK_DT);
      const snap = engine.getSnapshot();
      if (!snap.engaged || snap.waveIndex !== 1) break;
      for (const name of BACK_ROW_NAMES) {
        const ally = snap.allies.find((a) => a.name === name && a.hp > 0);
        expect(ally).toBeDefined();
        const screenX = allyScreenX(ally!, snap.combatCameraX);
        expect(Math.abs(screenX - rearBaseline.get(name)!)).toBeLessThan(8);
      }
    }
  });

  it('I-§4.1-03: Wave 2 engage 3s all living allies stay on screen', () => {
    const engine = createStage1Engine({ reliableWaveClear: true });
    reachWave2Engage(engine);

    for (let t = 0; t < 180; t++) {
      engine.tick(TICK_DT);
      const snap = engine.getSnapshot();
      if (!snap.engaged || snap.waveIndex !== 1) break;
      for (const ally of snap.allies.filter((a) => a.hp > 0)) {
        const screenX = allyScreenX(ally, snap.combatCameraX);
        expect(screenX).toBeGreaterThanOrEqual(SCREEN_MIN_X);
        expect(screenX).toBeLessThanOrEqual(SCREEN_MAX_X);
      }
    }
  });

  it('I-§4.4-01: Wave 2 engage front row screenX advances right during first 90 ticks', () => {
    const engine = createStage1Engine({ reliableWaveClear: true });
    const engageSnap = reachWave2Engage(engine);

    const frontAtEngage = engageSnap.allies.filter(
      (a) => a.hp > 0 && a.formationRow === 'front',
    );
    const startMaxScreen = Math.max(
      ...frontAtEngage.map((a) => allyScreenX(a, engageSnap.combatCameraX)),
    );

    let maxScreen = startMaxScreen;
    for (let t = 0; t < 90; t++) {
      engine.tick(TICK_DT);
      const snap = engine.getSnapshot();
      if (!snap.engaged || snap.waveIndex !== 1) break;
      const front = snap.allies.filter(
        (a) => a.hp > 0 && a.formationRow === 'front',
      );
      maxScreen = Math.max(
        maxScreen,
        ...front.map((a) => allyScreenX(a, snap.combatCameraX)),
      );
    }
    expect(maxScreen).toBeGreaterThan(startMaxScreen + 0.5);
  });

  it('I-§4.6-03: Wave 2 engage camera pans forward without backward oscillation (first 2s)', () => {
    const engine = createStage1Engine({ reliableWaveClear: true });
    reachWave2Engage(engine);

    let prevCamera = engine.getSnapshot().combatCameraX;
    let backwardSteps = 0;
    for (let t = 0; t < 120; t++) {
      engine.tick(TICK_DT);
      const snap = engine.getSnapshot();
      if (!snap.engaged || snap.waveIndex !== 1) break;
      if (snap.combatCameraX < 3 && snap.combatCameraX < prevCamera - 0.5) {
        backwardSteps += 1;
      }
      prevCamera = snap.combatCameraX;
    }
    expect(backwardSteps).toBe(0);
  });

  it('I-§3.3-06: Wave 2 at engage defender screenX >= attacker (front row order)', () => {
    const engine = createStage1Engine({ reliableWaveClear: true });
    const engageSnap = reachWave2Engage(engine);

    const guard = engageSnap.allies.find(
      (a) => a.name === '鉄衛士' && a.hp > 0,
    );
    const sword = engageSnap.allies.find(
      (a) => a.name === '剣術士' && a.hp > 0,
    );
    expect(guard).toBeDefined();
    expect(sword).toBeDefined();
    const guardScreen = allyScreenX(guard!, engageSnap.combatCameraX);
    const swordScreen = allyScreenX(sword!, engageSnap.combatCameraX);
    expect(guardScreen).toBeGreaterThanOrEqual(swordScreen);
  });

  it('I-§4.1-08: Wave 2 engage front row screenX oscillates fewer than 3 sign flips in 90 ticks', () => {
    const engine = createStage1Engine({ reliableWaveClear: true });
    reachWave2Engage(engine);

    const screenSamples: number[] = [];
    for (let t = 0; t < 90; t++) {
      engine.tick(TICK_DT);
      const snap = engine.getSnapshot();
      if (!snap.engaged || snap.waveIndex !== 1) break;
      const front = snap.allies.filter(
        (a) => a.hp > 0 && a.formationRow === 'front',
      );
      if (front.length === 0) continue;
      const maxScreen = Math.max(
        ...front.map((a) => allyScreenX(a, snap.combatCameraX)),
      );
      screenSamples.push(maxScreen);
    }
    expect(countScreenXSignFlips(screenSamples)).toBeLessThan(3);
  });

  it('I-§4.3-01: Wave 2 engage front row battleX stays left of enemy front line', () => {
    const engine = createStage1Engine({ reliableWaveClear: true });
    reachWave2Engage(engine);

    const minStandoff = engagedMinBodyGap();
    for (let t = 0; t < 90; t++) {
      engine.tick(TICK_DT);
      const snap = engine.getSnapshot();
      if (!snap.engaged || snap.waveIndex !== 1) break;
      const livingEnemies = snap.enemies.filter((e) => e.hp > 0);
      if (livingEnemies.length === 0) continue;
      const enemyFrontBattleX = Math.min(...livingEnemies.map((e) => e.battleX));
      const front = snap.allies.filter(
        (a) => a.hp > 0 && a.formationRow === 'front',
      );
      const maxFrontBattleX = Math.max(...front.map((a) => a.battleX));
      expect(maxFrontBattleX).toBeLessThanOrEqual(
        enemyFrontBattleX - minStandoff + 0.01,
      );
    }
  });

  it('I-§4.1-04: Wave 1 engage frame 0 front non-defender + enemies screen delta < 5px vs pre-engage', () => {
    const engine = createStage1Engine();
    const { preEngage } = reachWave1Engage(engine);
    engine.tick(1 / 60);
    const engageFrame = engine.getSnapshot();

    const screenDelta = (
      post: CombatantSnapshot,
      preList: CombatantSnapshot[],
      preCamera: number,
      postCamera: number,
    ) =>
      Math.abs(
        post.visualX +
          postCamera -
          (preList.find((u) => u.id === post.id)!.visualX + preCamera),
      );

    let frontNonDefenderDelta = 0;
    let enemyDelta = 0;
    for (const ally of engageFrame.allies.filter(
      (a) => a.hp > 0 && a.formationRow === 'front' && a.role !== 'defender',
    )) {
      frontNonDefenderDelta = Math.max(
        frontNonDefenderDelta,
        screenDelta(
          ally,
          preEngage.allies,
          preEngage.combatCameraX,
          engageFrame.combatCameraX,
        ),
      );
    }
    for (const enemy of engageFrame.enemies.filter((e) => e.hp > 0)) {
      enemyDelta = Math.max(
        enemyDelta,
        screenDelta(
          enemy,
          preEngage.enemies,
          preEngage.combatCameraX,
          engageFrame.combatCameraX,
        ),
      );
    }
    expect(frontNonDefenderDelta).toBeLessThan(5);
    expect(enemyDelta).toBeLessThan(5);
  });

  it('I-§4.1-03b: Wave 1 engage first 15s all allies stay on screen', () => {
    const engine = createStage1Engine();
    reachWave1Engage(engine);

    for (let t = 0; t < 900; t++) {
      engine.tick(TICK_DT);
      const snap = engine.getSnapshot();
      if (!snap.engaged || snap.waveIndex !== 0) break;
      for (const ally of snap.allies.filter((a) => a.hp > 0)) {
        const screenX = allyScreenX(ally, snap.combatCameraX);
        expect(screenX).toBeGreaterThanOrEqual(SCREEN_MIN_X);
        expect(screenX).toBeLessThanOrEqual(SCREEN_MAX_X);
      }
    }
  });

  it('I-§4.1-07a: Wave 1 engage ticks 0-360 all living enemies stay on screen', () => {
    const engine = createStage1Engine();
    reachWave1Engage(engine);

    for (let t = 0; t < 360; t++) {
      engine.tick(TICK_DT);
      const snap = engine.getSnapshot();
      if (!snap.engaged || snap.waveIndex !== 0) break;
      for (const enemy of snap.enemies.filter((e) => e.hp > 0)) {
        const screenX = enemyScreenX(enemy, snap.combatCameraX);
        expect(screenX).toBeGreaterThan(-SPRITE_WIDTH);
        expect(screenX).toBeLessThan(500);
      }
    }
  });

  it('I-§4.1-07c: Wave 1 engage enemy max per-tick screen delta stays under 2px for 360 ticks', () => {
    const engine = createStage1Engine();
    reachWave1Engage(engine);

    let prevScreenX = new Map<string, number>();
    let maxSingleTickDelta = 0;

    for (let t = 0; t < 360; t++) {
      engine.tick(TICK_DT);
      const snap = engine.getSnapshot();
      if (!snap.engaged || snap.waveIndex !== 0) break;
      for (const enemy of snap.enemies.filter((e) => e.hp > 0)) {
        const screenX = enemyScreenX(enemy, snap.combatCameraX);
        const prev = prevScreenX.get(enemy.id);
        if (prev !== undefined) {
          maxSingleTickDelta = Math.max(
            maxSingleTickDelta,
            Math.abs(screenX - prev),
          );
        }
        prevScreenX.set(enemy.id, screenX);
      }
    }

    expect(maxSingleTickDelta).toBeLessThanOrEqual(2);
  });

  it('I-§4.1-07b: Wave 1 engage enemy min screenX does not drift left more than 20px over 360 ticks', () => {
    const engine = createStage1Engine();
    reachWave1Engage(engine);

    let minScreenX = Number.POSITIVE_INFINITY;
    let baselineMinScreenX: number | null = null;

    for (let t = 0; t < 360; t++) {
      engine.tick(TICK_DT);
      const snap = engine.getSnapshot();
      if (!snap.engaged || snap.waveIndex !== 0) break;
      const living = snap.enemies.filter((e) => e.hp > 0);
      if (living.length === 0) continue;
      const tickMin = Math.min(
        ...living.map((e) => enemyScreenX(e, snap.combatCameraX)),
      );
      if (baselineMinScreenX === null) {
        baselineMinScreenX = tickMin;
      }
      minScreenX = Math.min(minScreenX, tickMin);
    }

    expect(baselineMinScreenX).not.toBeNull();
    expect(baselineMinScreenX! - minScreenX).toBeLessThanOrEqual(20);
  });

  it('I-§4.6-04: Wave 1 engage combatCameraX never decreases', () => {
    const engine = createStage1Engine();
    reachWave1Engage(engine);

    let prevCamera = engine.getSnapshot().combatCameraX;
    for (let t = 0; t < 900; t++) {
      engine.tick(TICK_DT);
      const snap = engine.getSnapshot();
      if (!snap.engaged || snap.waveIndex !== 0) break;
      expect(snap.combatCameraX).toBeGreaterThanOrEqual(prevCamera - 0.01);
      prevCamera = snap.combatCameraX;
    }
  });

  it('I-§4.1-06a: Victory wipe max single-tick ally screen jump stays under 15px', () => {
    const engine = createStage1Engine({ reliableWaveClear: true });
    waitForEngaged(engine);

    const prevScreenX = new Map<string, number>();
    let maxSingleTickJump = 0;
    let tracking = false;

    for (let i = 0; i < 200_000; i++) {
      const before = engine.getSnapshot();
      if (
        before.waveIndex === 1 &&
        before.enemies.some((e) => e.hp > 0)
      ) {
        tracking = true;
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
        for (const ally of after.allies.filter((a) => a.hp > 0)) {
          const screenX = allyScreenX(ally, after.combatCameraX);
          const prev = prevScreenX.get(ally.id);
          if (prev !== undefined) {
            maxSingleTickJump = Math.max(
              maxSingleTickJump,
              Math.abs(screenX - prev),
            );
          }
          prevScreenX.set(ally.id, screenX);
        }
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

    expect(maxSingleTickJump).toBeLessThanOrEqual(15);
  });

  it('I-§4.1-03c: Wave 1 engage 3s all living allies stay on screen', () => {
    const engine = createStage1Engine();
    reachWave1Engage(engine);

    for (let t = 0; t < 180; t++) {
      engine.tick(TICK_DT);
      const snap = engine.getSnapshot();
      if (!snap.engaged || snap.waveIndex !== 0) break;
      for (const ally of snap.allies.filter((a) => a.hp > 0)) {
        const screenX = allyScreenX(ally, snap.combatCameraX);
        expect(screenX).toBeGreaterThanOrEqual(SCREEN_MIN_X);
        expect(screenX).toBeLessThanOrEqual(SCREEN_MAX_X);
      }
    }
  });

  it('I-§4.1-08b: Wave 1 engage front row + enemy screen sign flips < 3 in 120 ticks', () => {
    const engine = createStage1Engine();
    reachWave1Engage(engine);

    const frontSamples: number[] = [];
    const enemySamples: number[] = [];
    for (let t = 0; t < 120; t++) {
      engine.tick(TICK_DT);
      const snap = engine.getSnapshot();
      if (!snap.engaged || snap.waveIndex !== 0) break;
      const front = snap.allies.filter(
        (a) => a.hp > 0 && a.formationRow === 'front',
      );
      const enemies = snap.enemies.filter((e) => e.hp > 0);
      if (front.length > 0) {
        frontSamples.push(
          Math.max(...front.map((a) => allyScreenX(a, snap.combatCameraX))),
        );
      }
      if (enemies.length > 0) {
        enemySamples.push(
          Math.min(...enemies.map((e) => allyScreenX(e, snap.combatCameraX))),
        );
      }
    }
    expect(countScreenXSignFlips(frontSamples)).toBeLessThan(3);
    expect(countScreenXSignFlips(enemySamples)).toBeLessThan(3);
  });

  it('I-§4.1-06b: Victory transition from Wave 2 clear no ally screen jump > 20px on enemy wipe tick', () => {
    const engine = createStage1Engine({ reliableWaveClear: true });
    waitForEngaged(engine);

    let prevSnap: ReturnType<BattleEngine['getSnapshot']> | null = null;
    let maxWipeJump = 0;
    for (let i = 0; i < 200_000; i++) {
      const before = engine.getSnapshot();
      engine.tick(TICK_DT);
      const after = engine.getSnapshot();
      if (
        before.waveIndex === 1 &&
        before.enemies.some((e) => e.hp > 0) &&
        after.enemies.every((e) => e.hp <= 0)
      ) {
        const prevScreen = new Map<string, number>();
        for (const ally of before.allies.filter((a) => a.hp > 0)) {
          prevScreen.set(ally.id, allyScreenX(ally, before.combatCameraX));
        }
        for (const ally of after.allies.filter((a) => a.hp > 0)) {
          const prev = prevScreen.get(ally.id);
          if (prev !== undefined) {
            maxWipeJump = Math.max(
              maxWipeJump,
              Math.abs(allyScreenX(ally, after.combatCameraX) - prev),
            );
          }
        }
        break;
      }
      prevSnap = after;
    }
    expect(maxWipeJump).toBeLessThanOrEqual(20);
  });

  it('I-§4.1-05: Wave 2 after both test_ranged dead, no ally screen jump > 15px for 60 ticks', () => {
    const engine = createStage1Wave2MeleeOnlyEngine();
    waitForEngaged(engine);

    const meleeOnlySnap = advanceUntil(engine, (snap) => {
      if (snap.waveIndex !== 1 || !snap.engaged) return false;
      const living = snap.enemies.filter((e) => e.hp > 0);
      const meleeAlive = living.some((e) => e.name === 'test_enemy');
      const rangedAlive = living.filter((e) => e.name === 'test_ranged').length;
      return meleeAlive && rangedAlive === 0;
    });
    expect(meleeOnlySnap).not.toBeNull();

    const prevScreenX = new Map<string, number>();
    for (const ally of meleeOnlySnap!.allies.filter((a) => a.hp > 0)) {
      prevScreenX.set(
        ally.id,
        allyScreenX(ally, meleeOnlySnap!.combatCameraX),
      );
    }

    let maxSingleTickJump = 0;
    for (let t = 0; t < 60; t++) {
      engine.tick(TICK_DT);
      const snap = engine.getSnapshot();
      if (snap.waveIndex !== 1 || !snap.engaged) break;
      const livingEnemies = snap.enemies.filter((e) => e.hp > 0);
      if (
        !livingEnemies.some((e) => e.name === 'test_enemy') ||
        livingEnemies.some((e) => e.name === 'test_ranged')
      ) {
        break;
      }

      for (const ally of snap.allies.filter((a) => a.hp > 0)) {
        const screenX = allyScreenX(ally, snap.combatCameraX);
        const prev = prevScreenX.get(ally.id);
        if (prev !== undefined) {
          maxSingleTickJump = Math.max(
            maxSingleTickJump,
            Math.abs(screenX - prev),
          );
        }
        prevScreenX.set(ally.id, screenX);
      }
    }
    expect(maxSingleTickJump).toBeLessThanOrEqual(15);
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
