/**
 * battle-field.md §4.1 — integration screen-space outcomes (minimal I-* set).
 */
import { describe, expect, it } from 'vitest';
import { BattleEngine } from './BattleEngine.ts';
import { loadGameData } from './data/loadGameData.ts';
import { loadLevelCurves } from '../progression/levelGrowth.ts';
import levelCurvesJson from '../../data/levelCurves.json';
import { createDefaultSave } from '../progression/victoryRewards.ts';
import {
  LONG_BATTLE_TIMEOUT_MS,
  MARCH_MAX_ALLY_SCREEN_X,
  SCREEN_MAX_X,
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
  it('I-§4.1-01: pre-engage PartyDeploy keeps allies on the left side of screen', () => {
    const engine = createStage1Engine();
    let sawDeploy = false;
    let sawLeftSideAlly = false;
    for (let i = 0; i < 8000; i++) {
      engine.tick(TICK_DT);
      const snap = engine.getSnapshot();
      if (snap.partyDeployActive) {
        sawDeploy = true;
        expect(snap.engaged).toBe(false);
        for (const ally of snap.allies.filter((a) => a.hp > 0)) {
          if (allyScreenX(ally) <= MARCH_MAX_ALLY_SCREEN_X) {
            sawLeftSideAlly = true;
          }
        }
      }
      if (snap.engaged) break;
    }
    expect(sawDeploy).toBe(true);
    expect(sawLeftSideAlly).toBe(true);
  });

  it('I-§4.1-03b: Wave 1 engaged first 15s — living allies stay on screen (battleX)', () => {
    const engine = createStage1Engine();
    reachWave1Engage(engine);

    for (let t = 0; t < 900; t++) {
      engine.tick(TICK_DT);
      const snap = engine.getSnapshot();
      if (!snap.engaged || snap.waveIndex !== 0) break;
      if (t < 60) continue;
      for (const ally of snap.allies.filter((a) => a.hp > 0)) {
        const sx = allyScreenX(ally);
        expect(sx).toBeLessThanOrEqual(SCREEN_MAX_X);
      }
    }
  });

  it('I-§4.1-07: Wave 1 engaged — enemies stay on screen with stable per-tick battleX delta', () => {
    const engine = createStage1Engine();
    reachWave1Engage(engine);

    let prevScreenX = new Map<string, number>();
    let maxSingleTickDelta = 0;

    for (let t = 0; t < 360; t++) {
      engine.tick(TICK_DT);
      const snap = engine.getSnapshot();
      if (!snap.engaged || snap.waveIndex !== 0) break;
      const living = snap.enemies.filter((e) => e.hp > 0);
      for (const enemy of living) {
        const sx = enemyScreenX(enemy);
        expect(sx).toBeLessThanOrEqual(SCREEN_MAX_X);
        const prev = prevScreenX.get(enemy.id);
        if (prev !== undefined) {
          maxSingleTickDelta = Math.max(maxSingleTickDelta, Math.abs(sx - prev));
        }
        prevScreenX.set(enemy.id, sx);
      }
    }

    expect(maxSingleTickDelta).toBeLessThanOrEqual(32);
  });

  it('I-§4.1-06a: victory / wipe transition — ally battleX single-tick jump bounded', () => {
    const engine = createStage1Engine({ reliableWaveClear: true, legacyAutoWaveAdvance: true });
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
            allyScreenX(ally),
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
              allyScreenX(ally),
            );
          }
        } else {
          for (const ally of after.allies.filter((a) => a.hp > 0)) {
            const sx = allyScreenX(ally);
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

    expect(maxSingleTickJump).toBeLessThanOrEqual(32);
  });

  it('I-§4.1-05: Wave 1 clear → Wave 2 PartyDeploy — ally battleX jump bounded', () => {
    const engine = createStage1Engine({ reliableWaveClear: true, legacyAutoWaveAdvance: true });

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
          prevScreenX.set(ally.id, allyScreenX(ally));
        }
        continue;
      }

      if (tracking) {
        ticksAfterWave1Clear += 1;
        if (after.engaged && !wasEngaged) {
          for (const ally of after.allies.filter((a) => a.hp > 0)) {
            prevScreenX.set(ally.id, allyScreenX(ally));
          }
        } else {
          for (const ally of after.allies.filter((a) => a.hp > 0)) {
            const sx = allyScreenX(ally);
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
    expect(maxJump).toBeLessThanOrEqual(500);
  });

  it('I-§4.1-06b: Wave 2 enemy wipe tick — ally battleX jump stays under 20px', () => {
    const engine = createStage1Engine({ reliableWaveClear: true, legacyAutoWaveAdvance: true });
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
          const prev = allyScreenX(beforeAlly);
          const sx = allyScreenX(ally);
          maxWipeJump = Math.max(maxWipeJump, Math.abs(sx - prev));
        }
        break;
      }

      if (after.phase === 'victory') break;
    }

    expect(sawWipe).toBe(true);
    expect(maxWipeJump).toBeLessThanOrEqual(20);
  });

  it('I-Victory-01: allies on-screen (battleX) before exit march', () => {
    const gameData = loadGameData();
    const stage1 = gameData.stages.find((s) => s.id === '1');
    if (stage1) {
      stage1.waves = [
        {
          enemies: [{ templateId: 'stage1_1', spawnX: 120 }],
        },
      ];
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

    for (let i = 0; i < 120000; i++) {
      engine.tick(TICK_DT);
      const snap = engine.getSnapshot();
      if (snap.phase === 'victory') {
        expect(snap.victoryAwaitExitMarch).toBe(true);
        const maxScreenX = Math.max(
          ...snap.allies
            .filter((a) => a.hp > 0)
            .map((a) => a.battleX + SPRITE_WIDTH),
        );
        expect(maxScreenX).toBeGreaterThan(0);
        expect(snap.alliesOffScreen).toBe(false);
        return;
      }
    }
    expect.fail('victory did not occur');
  });

  it('I-Victory-03: victory preserves pre-wipe engaged ally battleX (no formation snap)', () => {
    const engine = createStage1Engine({ reliableWaveClear: true, legacyAutoWaveAdvance: true });
    waitForEngaged(engine);

    const preVictoryBattleX = new Map<string, number>();
    for (let i = 0; i < 120_000; i++) {
      const before = engine.getSnapshot();
      engine.tick(TICK_DT);
      const after = engine.getSnapshot();
      const stage = before.waveCount;
      const isFinalWave = before.waveIndex === stage - 1;
      if (
        isFinalWave &&
        before.engaged &&
        before.enemies.some((e) => e.hp > 0) &&
        after.enemies.every((e) => e.hp <= 0)
      ) {
        for (const ally of before.allies.filter((a) => a.hp > 0)) {
          preVictoryBattleX.set(ally.id, ally.battleX);
        }
      }
      if (after.phase === 'victory') {
        expect(preVictoryBattleX.size).toBeGreaterThan(0);
        for (const ally of after.allies.filter((a) => a.hp > 0)) {
          const prev = preVictoryBattleX.get(ally.id);
          expect(prev).toBeDefined();
          expect(Math.abs(ally.battleX - prev!)).toBeLessThanOrEqual(5);
        }
        return;
      }
    }
    expect.fail('victory did not occur');
  });

  it('I-Victory-02: allies march off-screen to the right (+battleX)', () => {
    const gameData = loadGameData();
    const stage1 = gameData.stages.find((s) => s.id === '1');
    if (stage1?.waves[0]) {
      stage1.waves = stage1.waves.slice(0, 1);
      stage1.waves[0].enemies = [{ templateId: 'stage1_1', spawnX: 120 }];
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
      ...victorySnap!.allies.filter((a) => a.hp > 0).map((a) => a.battleX),
    );
    for (let i = 0; i < 120; i++) {
      engine.tick(TICK_DT);
    }
    const later = engine.getSnapshot();
    const laterX = Math.min(
      ...later.allies.filter((a) => a.hp > 0).map((a) => a.battleX),
    );
    expect(laterX).toBeGreaterThan(startX);
  });
});
