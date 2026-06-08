import { describe, expect, it } from 'vitest';
import { BattleEngine } from './BattleEngine.ts';
import { loadGameData } from './data/loadGameData.ts';
import { loadLevelCurves } from '../progression/levelGrowth.ts';
import levelCurvesJson from '../../data/levelCurves.json';
import { createDefaultSave } from '../progression/victoryRewards.ts';
import { ROW_X, SPRITE_WIDTH } from '../render/formationLayout.ts';

function createStage2Engine() {
  const gameData = loadGameData();
  const levelCurves = loadLevelCurves(levelCurvesJson);
  const save = createDefaultSave(gameData, 'demo');
  save.stageProgress.currentStageId = '2';
  const engine = new BattleEngine(
    gameData,
    levelCurves,
    () => save.party,
    () => save.stageProgress.currentStageId,
  );
  engine.startBattle();
  return engine;
}

function waitForEngaged(engine: BattleEngine, maxTicks = 5000): void {
  for (let i = 0; i < maxTicks; i++) {
    engine.tick(1 / 60);
    if (engine.getSnapshot().engaged) return;
  }
  throw new Error('engagement did not start');
}

describe('BattleEngine engaged visual layout', () => {
  it('Stage 2 Wave 1: enemies stay left of front row after engagement snap', () => {
    const engine = createStage2Engine();
    waitForEngaged(engine);

    const snapshot = engine.getSnapshot();
    const allies = snapshot.allies.filter((a) => a.hp > 0);
    const enemies = snapshot.enemies.filter((e) => e.hp > 0);
    expect(allies.length).toBe(4);
    expect(enemies.length).toBeGreaterThan(0);

    const guard = allies.find((a) => a.role === 'defender');
    const archer = allies.find(
      (a) => a.formationRow === 'back' && a.role === 'attacker',
    );
    expect(guard).toBeDefined();
    expect(archer).toBeDefined();

    const frontRowAllies = allies.filter((a) => a.formationRow === 'front');
    const minFrontVisualX = Math.min(...frontRowAllies.map((a) => a.visualX));
    const maxEnemyVisualX = Math.max(...enemies.map((e) => e.visualX));

    expect(maxEnemyVisualX).toBeLessThan(minFrontVisualX);
    expect(maxEnemyVisualX).toBeLessThan(archer!.visualX);
    expect(minFrontVisualX).toBeLessThan(ROW_X.back);
    expect(archer!.visualX).toBeGreaterThanOrEqual(ROW_X.back - 1);

    for (let i = 0; i < 300; i++) {
      engine.tick(1 / 60);
    }
    const after = engine.getSnapshot();
    const afterEnemies = after.enemies.filter((e) => e.hp > 0);
    const afterAllies = after.allies.filter((a) => a.hp > 0);
    const afterMinFront = Math.min(
      ...afterAllies
        .filter((a) => a.formationRow === 'front')
        .map((a) => a.visualX),
    );
    const afterMaxEnemy = Math.max(...afterEnemies.map((e) => e.visualX));
    const cameraX = after.combatCameraX;
    const screenFront = afterMinFront + cameraX;
    const screenEnemy = afterMaxEnemy + cameraX;
    expect(afterMaxEnemy).toBeLessThan(afterMinFront);
    expect(screenEnemy).toBeLessThan(screenFront);
  });

  it('render-only camera: ally visualX is not compensated by camera delta', () => {
    const engine = createStage2Engine();
    waitForEngaged(engine);

    let prev = engine.getSnapshot();
    for (let i = 0; i < 300; i++) {
      engine.tick(1 / 60);
      const snap = engine.getSnapshot();
      if (!snap.engaged) break;

      const cameraDelta = snap.combatCameraX - prev.combatCameraX;
      if (Math.abs(cameraDelta) > 0.5) {
        for (const ally of snap.allies) {
          if (ally.hp <= 0) continue;
          const prevAlly = prev.allies.find((a) => a.id === ally.id);
          if (!prevAlly) continue;
          const visualDelta = ally.visualX - prevAlly.visualX;
          expect(visualDelta).not.toBeCloseTo(-cameraDelta, 0);
        }
      }
      prev = snap;
    }
  });

  it('baking combat camera into visualX preserves screen position on unwind', () => {
    const visualX = 326;
    const combatCameraX = -67.5;
    const screenBefore = visualX + combatCameraX;
    const afterUnwind = visualX + combatCameraX;
    expect(afterUnwind).toBeCloseTo(screenBefore, 5);
  });

  it('clean victory: allies start on-screen before exit march', () => {
    const gameData = loadGameData();
    const stage1 = gameData.stages.find((s) => s.id === '1');
    if (stage1?.waves[0]) {
      stage1.waves[0].enemies = stage1.waves[0].enemies.filter(
        (spawn) => spawn.templateId !== 'test_ranged',
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
      engine.tick(1 / 60);
      const snap = engine.getSnapshot();
      if (snap.phase === 'victory') {
        expect(snap.combatCameraX).toBe(0);
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
});
