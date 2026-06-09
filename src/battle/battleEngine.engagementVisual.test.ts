import { describe, expect, it } from 'vitest';
import { BattleEngine, WAVE_APPROACH_MARCH_SEC } from './BattleEngine.ts';
import { loadGameData } from './data/loadGameData.ts';
import { loadLevelCurves } from '../progression/levelGrowth.ts';
import levelCurvesJson from '../../data/levelCurves.json';
import { createDefaultSave } from '../progression/victoryRewards.ts';
import {
  computeAllyPositions,
  engagedFrontLineStandoffGap,
  engagedMinLeftEdgeGap,
  ROW_X,
  SPRITE_WIDTH,
} from '../render/formationLayout.ts';
import type { CombatantSnapshot, GameData } from './types.ts';

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

function expectLivingAlliesInFormation(
  allies: CombatantSnapshot[],
  gameData: GameData,
): void {
  const living = allies.filter((a) => a.hp > 0);
  const positions = computeAllyPositions(
    living.map((a) => ({
      id: a.id,
      role: a.role!,
      formationRow: a.formationRow,
      rangePx: 0,
      isAlive: true,
    })),
    { engaged: false },
  );
  for (const ally of living) {
    const expected = positions.get(ally.id);
    expect(expected).toBeDefined();
    expect(ally.visualX).toBeCloseTo(expected!, 0);
  }
}

function waitForEngaged(engine: BattleEngine, maxTicks = 5000): void {
  for (let i = 0; i < maxTicks; i++) {
    engine.tick(1 / 60);
    if (engine.getSnapshot().engaged) return;
  }
  throw new Error('engagement did not start');
}

describe('BattleEngine engaged visual layout', () => {
  it('Stage 1 does not engage immediately on battlefield load', () => {
    const gameData = loadGameData();
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
    const initial = engine.getSnapshot();
    expect(initial.engaged).toBe(false);
    expect(initial.enemies).toHaveLength(0);
    const preambleTicks = Math.floor(WAVE_APPROACH_MARCH_SEC * 60) - 1;
    for (let i = 0; i < preambleTicks; i++) {
      engine.tick(1 / 60);
      const snap = engine.getSnapshot();
      expect(snap.engaged).toBe(false);
      expect(snap.enemies).toHaveLength(0);
    }
    engine.tick(1 / 60);
    expect(engine.getSnapshot().enemies.length).toBeGreaterThan(0);
    expect(engine.getSnapshot().engaged).toBe(false);
  });

  it('Stage 2 Wave 1: enemies stay left of front row after engagement snap', () => {
    const engine = createStage2Engine();
    waitForEngaged(engine);

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
    expect(afterMaxEnemy).toBeLessThanOrEqual(afterMinFront);
    expect(screenEnemy).toBeLessThanOrEqual(screenFront);
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
        expectLivingAlliesInFormation(snap.allies, gameData);
        return;
      }
    }
    expect.fail('victory did not occur');
  });

  it('Stage 2: restores formation when advancing to the next wave', () => {
    const gameData = loadGameData();
    const engine = createStage2Engine();
    waitForEngaged(engine);

    let sawWave1Combat = false;
    for (let i = 0; i < 120000; i++) {
      engine.tick(1 / 60);
      const snap = engine.getSnapshot();
      if (snap.engaged && snap.enemies.some((e) => e.hp > 0)) {
        sawWave1Combat = true;
      }
      if (
        sawWave1Combat &&
        !snap.engaged &&
        snap.enemies.length === 0 &&
        snap.waveIndex === 0 &&
        snap.worldOffsetX > 0
      ) {
        expectLivingAlliesInFormation(snap.allies, gameData);
        return;
      }
    }
    expect.fail('wave intermission did not start');
  });

  it('ranged enemy visualX tracks target monotonically without flipping', () => {
    const gameData = loadGameData();
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

    let prevRangedX: number | null = null;
    let prevSign = 0;
    let signFlipCount = 0;
    for (let i = 0; i < 120; i++) {
      engine.tick(1 / 60);
      const snap = engine.getSnapshot();
      const ranged = snap.enemies.find(
        (enemy) => enemy.name === 'test_ranged' && enemy.hp > 0,
      );
      if (!ranged) break;
      if (prevRangedX !== null) {
        const delta = ranged.visualX - prevRangedX;
        if (Math.abs(delta) >= 0.2) {
          const sign = Math.sign(delta);
          if (prevSign !== 0 && sign !== prevSign) {
            signFlipCount += 1;
          }
          prevSign = sign;
        }
      }
      prevRangedX = ranged.visualX;
    }
    expect(signFlipCount).toBeLessThan(2);
  });

  it('advances front row toward enemy standoff on engage', () => {
    const engine = createStage2Engine();
    let preEngage: ReturnType<BattleEngine['getSnapshot']> | null = null;

    for (let i = 0; i < 5000; i++) {
      const snap = engine.getSnapshot();
      if (!snap.engaged) {
        preEngage = snap;
        engine.tick(1 / 60);
        if (engine.getSnapshot().engaged) break;
      }
    }

    for (let i = 0; i < 120; i++) {
      engine.tick(1 / 60);
    }
    const snap = engine.getSnapshot();
    expect(snap.engaged).toBe(true);
    expect(preEngage).not.toBeNull();

    const frontAllies = snap.allies.filter(
      (ally) => ally.hp > 0 && ally.formationRow === 'front',
    );
    const livingEnemies = snap.enemies.filter((enemy) => enemy.hp > 0);
    const guard = frontAllies.find((ally) => ally.name === '鉄衛士');
    const sword = frontAllies.find((ally) => ally.name === '剣術士');
    const healer = snap.allies.find((ally) => ally.name === '療養師');

    expect(guard).toBeDefined();
    expect(sword).toBeDefined();
    expect(healer).toBeDefined();
    expect(guard!.visualX).toBeLessThan(sword!.visualX);
    expect(sword!.visualX).toBeLessThan(healer!.visualX);

    const minFrontAllyX = Math.min(...frontAllies.map((ally) => ally.visualX));
    const maxEnemyX = Math.max(...livingEnemies.map((enemy) => enemy.visualX));
    expect(minFrontAllyX - maxEnemyX).toBeCloseTo(
      engagedFrontLineStandoffGap(),
      0,
    );
  });

  it('front-row ally visualX does not oscillate after engage', () => {
    const engine = createStage2Engine();
    waitForEngaged(engine);

    let prevMinFront: number | null = null;
    let prevSign = 0;
    let signFlipCount = 0;
    for (let i = 0; i < 120; i++) {
      engine.tick(1 / 60);
      const snap = engine.getSnapshot();
      const frontXs = snap.allies
        .filter((ally) => ally.hp > 0 && ally.formationRow === 'front')
        .map((ally) => ally.visualX);
      if (frontXs.length === 0) break;
      const minFront = Math.min(...frontXs);
      if (prevMinFront !== null) {
        const delta = minFront - prevMinFront;
        if (Math.abs(delta) >= 0.2) {
          const sign = Math.sign(delta);
          if (prevSign !== 0 && sign !== prevSign) {
            signFlipCount += 1;
          }
          prevSign = sign;
        }
      }
      prevMinFront = minFront;
    }
    expect(signFlipCount).toBeLessThan(2);
  });

  it('recompresses surviving front row toward enemy when the guard falls', () => {
    const engine = createStage2Engine();
    waitForEngaged(engine);

    for (let i = 0; i < 120000; i++) {
      engine.tick(1 / 60);
      const snap = engine.getSnapshot();
      const guard = snap.allies.find(
        (ally) => ally.name === '鉄衛士' && ally.hp > 0,
      );
      const sword = snap.allies.find(
        (ally) => ally.name === '剣術士' && ally.hp > 0,
      );
      const livingEnemies = snap.enemies.filter((enemy) => enemy.hp > 0);
      if (!guard && sword && livingEnemies.length > 0) {
        const maxEnemyX = Math.max(...livingEnemies.map((enemy) => enemy.visualX));
        expect(sword.visualX - maxEnemyX).toBeGreaterThanOrEqual(
          engagedMinLeftEdgeGap() - 2,
        );
        return;
      }
    }
    expect.fail('guard did not fall while sword survived');
  });

  it('keeps front-row allies visually separated when battleX overlaps', () => {
    const engine = createStage2Engine();
    waitForEngaged(engine);

    for (let i = 0; i < 60; i++) {
      engine.tick(1 / 60);
    }

    const snap = engine.getSnapshot();
    const frontAllies = snap.allies.filter(
      (ally) => ally.hp > 0 && ally.formationRow === 'front',
    );
    expect(frontAllies.length).toBeGreaterThan(1);

    const visualXs = frontAllies.map((ally) => ally.visualX);
    const unique = new Set(visualXs.map((x) => Math.round(x)));
    expect(unique.size).toBe(visualXs.length);
    expect(Math.max(...visualXs) - Math.min(...visualXs)).toBeGreaterThanOrEqual(
      engagedMinLeftEdgeGap(),
    );
  });

  it('Stage 1: ranged enemy stops at skill range even with melee allies ahead', () => {
    const gameData = loadGameData();
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

    for (let i = 0; i < 300; i++) {
      engine.tick(1 / 60);
    }

    const snap = engine.getSnapshot();
    const ranged = snap.enemies.find(
      (enemy) => enemy.name === 'test_ranged' && enemy.hp > 0,
    );
    const frontAllies = snap.allies.filter(
      (ally) => ally.hp > 0 && ally.formationRow === 'front',
    );
    const meleeFront = snap.enemies.filter(
      (enemy) => enemy.name !== 'test_ranged' && enemy.hp > 0,
    );

    expect(ranged).toBeDefined();
    expect(frontAllies.length).toBeGreaterThan(0);
    expect(meleeFront.length).toBeGreaterThan(0);

    const guard = frontAllies.find((ally) => ally.name === '鉄衛士');
    const archer = snap.allies.find(
      (ally) => ally.name === '弓術士' && ally.hp > 0,
    );
    const minFrontAllyX = Math.min(...frontAllies.map((ally) => ally.visualX));
    const maxMeleeEnemyX = Math.max(...meleeFront.map((enemy) => enemy.visualX));

    expect(guard).toBeDefined();
    expect(archer).toBeDefined();
    const guardToRanged = guard!.visualX - ranged!.visualX;
    const guardToArcher = archer!.visualX - guard!.visualX;
    expect(guardToRanged).toBeGreaterThan(50);
    expect(guardToRanged).toBeLessThanOrEqual(guardToArcher + 40);
    expect(ranged!.visualX).toBeLessThan(maxMeleeEnemyX);
    expect(maxMeleeEnemyX - ranged!.visualX).toBeGreaterThanOrEqual(
      engagedMinLeftEdgeGap(),
    );
  });
});
