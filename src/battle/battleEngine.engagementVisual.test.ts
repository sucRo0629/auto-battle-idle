import { describe, expect, it } from 'vitest';
import { BattleEngine, WAVE_APPROACH_MARCH_SEC } from './BattleEngine.ts';
import { loadGameData } from './data/loadGameData.ts';
import { loadLevelCurves } from '../progression/levelGrowth.ts';
import levelCurvesJson from '../../data/levelCurves.json';
import { createDefaultSave } from '../progression/victoryRewards.ts';
import {
  computeAllyPositions,
  engagedFrontLineGap,
  engagedMinLeftEdgeGap,
  isFormationSpacingRestored,
  ROW_X,
  SCROLL_SPEED,
  SPRITE_GAP,
  SPRITE_WIDTH,
} from '../render/formationLayout.ts';
import type { CombatantSnapshot, GameData } from './types.ts';

function createStage2Engine(options?: { reliableWaveClear?: boolean }) {
  const gameData = loadGameData();
  const levelCurves = loadLevelCurves(levelCurvesJson);
  const save = createDefaultSave(gameData, 'demo');
  save.stageProgress.currentStageId = '2';
  if (options?.reliableWaveClear) {
    for (const slot of save.party) {
      if (slot) slot.progress.level = 10;
    }
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

function createStage1Engine(options?: { reliableWaveClear?: boolean }) {
  const gameData = loadGameData();
  const levelCurves = loadLevelCurves(levelCurvesJson);
  const save = createDefaultSave(gameData, 'demo');
  save.stageProgress.currentStageId = '1';
  if (options?.reliableWaveClear) {
    for (const slot of save.party) {
      if (slot) slot.progress.level = 10;
    }
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

function expectLivingAlliesFormationSpacing(allies: CombatantSnapshot[]): void {
  const living = allies
    .filter((a) => a.hp > 0)
    .map((a) => ({
      id: a.id,
      role: a.role!,
      formationRow: a.formationRow,
      isAlive: true as const,
      visualX: a.visualX,
    }));
  expect(isFormationSpacingRestored(living)).toBe(true);
}

function allyScreenX(
  ally: CombatantSnapshot,
  combatCameraX: number,
): number {
  return ally.visualX + combatCameraX;
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

  it('Stage 2: does not oscillate ally screen X during wave formation reset', () => {
    const engine = createStage2Engine({ reliableWaveClear: true });
    waitForEngaged(engine);

    let signFlipCount = 0;
    const prevDeltaByAlly = new Map<string, number>();
    for (let i = 0; i < 120000; i++) {
      engine.tick(1 / 60);
      const snap = engine.getSnapshot();
      const living = snap.allies.filter((a) => a.hp > 0);

      if (snap.formationResetActive && living.length > 0) {
        for (const ally of living) {
          const screenX = allyScreenX(ally, snap.combatCameraX);
          const prev = prevDeltaByAlly.get(`${ally.id}:x`);
          const prevX = prevDeltaByAlly.get(`${ally.id}:prevX`);
          if (prevX !== undefined) {
            const delta = screenX - prevX;
            if (Math.abs(delta) >= 0.5 && prev !== undefined && prev !== 0) {
              if (Math.sign(delta) !== Math.sign(prev)) {
                signFlipCount += 1;
              }
            }
            if (Math.abs(delta) >= 0.5) {
              prevDeltaByAlly.set(`${ally.id}:x`, delta);
            }
          }
          prevDeltaByAlly.set(`${ally.id}:prevX`, screenX);
        }
      }

      if (
        !snap.formationResetActive &&
        snap.waveIndex === 1
      ) {
        expect(signFlipCount).toBeLessThan(4);
        return;
      }
    }
    expect.fail('wave formation reset did not complete');
  });

  it('Stage 2: eases allies back to formation after wave clear instead of snapping', () => {
    const engine = createStage2Engine({ reliableWaveClear: true });
    waitForEngaged(engine);

    const prevScreenX = new Map<string, number>();
    let maxSingleTickDelta = 0;
    let sawWaveClear = false;
    for (let i = 0; i < 120000; i++) {
      engine.tick(1 / 60);
      const snap = engine.getSnapshot();
      const living = snap.allies.filter((a) => a.hp > 0);
      if (living.length === 0) break;

      if (i > 0 && sawWaveClear && snap.formationResetActive) {
        for (const ally of living) {
          const screenX = allyScreenX(ally, snap.combatCameraX);
          const prev = prevScreenX.get(ally.id);
          if (prev !== undefined) {
            maxSingleTickDelta = Math.max(
              maxSingleTickDelta,
              Math.abs(screenX - prev),
            );
          }
        }
      }
      for (const ally of living) {
        prevScreenX.set(ally.id, allyScreenX(ally, snap.combatCameraX));
      }

      if (
        !sawWaveClear &&
        !snap.engaged &&
        snap.enemies.length === 0 &&
        snap.waveIndex === 0
      ) {
        sawWaveClear = true;
        maxSingleTickDelta = 0;
      }
      if (
        sawWaveClear &&
        !snap.formationResetActive &&
        snap.waveIndex === 1
      ) {
        expect(maxSingleTickDelta).toBeLessThan(20);
        return;
      }
    }
    expect.fail('wave formation reset did not complete');
  });

  it('Stage 2: restores formation when advancing to the next wave', () => {
    const gameData = loadGameData();
    const engine = createStage2Engine({ reliableWaveClear: true });
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
        snap.waveIndex === 1 &&
        snap.enemies.length > 0 &&
        snap.combatCameraX === 0
      ) {
        expectLivingAlliesInFormation(snap.allies, gameData);
        return;
      }
    }
    expect.fail('wave formation reset did not complete');
  });

  it('Stage 2: does not warp ally screen X at wave start', () => {
    const gameData = loadGameData();
    const engine = createStage2Engine({ reliableWaveClear: true });
    waitForEngaged(engine);

    let prevWaveIndex = 0;
    let sawWave1Clear = false;

    for (let i = 0; i < 120000; i++) {
      engine.tick(1 / 60);
      const snap = engine.getSnapshot();
      const living = snap.allies.filter((a) => a.hp > 0);
      if (living.length === 0) break;

      if (
        !sawWave1Clear &&
        !snap.engaged &&
        snap.enemies.length === 0 &&
        snap.waveIndex === 0
      ) {
        sawWave1Clear = true;
      }

      if (sawWave1Clear && prevWaveIndex === 0 && snap.waveIndex === 1) {
        expect(snap.combatCameraX).toBe(0);
        expectLivingAlliesInFormation(snap.allies, gameData);
        return;
      }

      prevWaveIndex = snap.waveIndex;
    }
    expect.fail('wave 2 did not start');
  });

  it('Stage 2: trail column waits until lead column spacing is restored', () => {
    const gameData = loadGameData();
    const engine = createStage2Engine({ reliableWaveClear: true });
    waitForEngaged(engine);

    for (let i = 0; i < 120000; i++) {
      engine.tick(1 / 60);
      const snap = engine.getSnapshot();
      if (snap.waveIndex === 0 && snap.enemies.some((e) => e.hp > 0)) continue;

      if (
        snap.waveIndex === 1 &&
        snap.enemies.length > 0 &&
        snap.combatCameraX === 0 &&
        !snap.formationResetActive
      ) {
        expectLivingAlliesInFormation(snap.allies, gameData);
        return;
      }
    }
    expect.fail('wave formation reset did not complete');
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
      engagedFrontLineGap(),
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

  it('Stage 2 Wave 2: front row stays on-screen after guard death', () => {
    const engine = createStage2Engine();
    waitForEngaged(engine);

    let wave2Engaged = false;
    for (let i = 0; i < 120000; i++) {
      engine.tick(1 / 60);
      const snap = engine.getSnapshot();
      if (snap.waveIndex === 1 && snap.engaged) {
        wave2Engaged = true;
        break;
      }
    }
    expect(wave2Engaged).toBe(true);

    let guardDeathSnap: ReturnType<BattleEngine['getSnapshot']> | null = null;
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
      if (!guard && sword && livingEnemies.length > 0 && snap.engaged) {
        guardDeathSnap = snap;
        break;
      }
    }
    expect(guardDeathSnap).not.toBeNull();

    const swordId = guardDeathSnap!.allies.find(
      (ally) => ally.name === '剣術士',
    )!.id;
    let prevSwordX = guardDeathSnap!.allies.find((a) => a.id === swordId)!
      .visualX;
    let prevMinEnemyX = Math.min(
      ...guardDeathSnap!.enemies
        .filter((e) => e.hp > 0)
        .map((e) => e.visualX),
    );
    const cameraAtDeath = guardDeathSnap!.combatCameraX;

    const swordAtDeath = guardDeathSnap!.allies.find((a) => a.id === swordId)!.visualX;
    for (let i = 0; i < 90; i++) {
      engine.tick(1 / 60);
      const snap = engine.getSnapshot();
      const sword = snap.allies.find((a) => a.id === swordId && a.hp > 0);
      if (!sword) break;

      const swordScreenX = sword.visualX + snap.combatCameraX;
      expect(swordScreenX).toBeGreaterThan(-SPRITE_WIDTH);
      expect(swordScreenX).toBeLessThan(480 + SPRITE_WIDTH);

      const swordDelta = sword.visualX - prevSwordX;
      expect(swordDelta).toBeGreaterThan(-30);
      prevSwordX = sword.visualX;

      const livingEnemies = snap.enemies.filter((e) => e.hp > 0);
      if (livingEnemies.length > 0) {
        const minEnemyScreenX = Math.min(
          ...livingEnemies.map((e) => e.visualX + snap.combatCameraX),
        );
        expect(minEnemyScreenX).toBeGreaterThan(-SPRITE_WIDTH * 2);
        const enemyDelta =
          Math.min(...livingEnemies.map((e) => e.visualX)) - prevMinEnemyX;
        expect(enemyDelta).toBeGreaterThan(-30);
        prevMinEnemyX = Math.min(...livingEnemies.map((e) => e.visualX));
      }
    }

    const finalSnap = engine.getSnapshot();
    const finalSword = finalSnap.allies.find((a) => a.id === swordId);
    if (finalSword && finalSword.hp > 0) {
      expect(finalSword.visualX - swordAtDeath).toBeGreaterThan(-50);
      expect(Math.abs(finalSnap.combatCameraX - cameraAtDeath)).toBeLessThan(80);
    }
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

  it('Stage 2 Wave 2: back row stays separated when one front-row ally falls', () => {
    const engine = createStage2Engine();
    waitForEngaged(engine);

    let wave2Engaged = false;
    for (let i = 0; i < 120000; i++) {
      engine.tick(1 / 60);
      const snap = engine.getSnapshot();
      if (snap.waveIndex === 1 && snap.engaged) {
        wave2Engaged = true;
        break;
      }
    }
    expect(wave2Engaged).toBe(true);

    const minGap = engagedMinLeftEdgeGap();
    for (let i = 0; i < 120000; i++) {
      engine.tick(1 / 60);
      const snap = engine.getSnapshot();
      if (!snap.engaged) continue;

      const guard = snap.allies.find(
        (ally) => ally.name === '鉄衛士' && ally.hp > 0,
      );
      const sword = snap.allies.find(
        (ally) => ally.name === '剣術士' && ally.hp > 0,
      );
      const cleric = snap.allies.find(
        (ally) => ally.name === '療養師' && ally.hp > 0,
      );
      const ranger = snap.allies.find(
        (ally) => ally.name === '弓術士' && ally.hp > 0,
      );
      if (!cleric || !ranger) continue;

      const exactlyOneFrontDead = Boolean(guard) !== Boolean(sword);
      if (!exactlyOneFrontDead) continue;

      expect(ranger.visualX - cleric.visualX).toBeGreaterThanOrEqual(minGap - 1);

      for (let j = 0; j < 90; j++) {
        engine.tick(1 / 60);
        const later = engine.getSnapshot();
        const laterCleric = later.allies.find(
          (ally) => ally.name === '療養師' && ally.hp > 0,
        );
        const laterRanger = later.allies.find(
          (ally) => ally.name === '弓術士' && ally.hp > 0,
        );
        if (!laterCleric || !laterRanger) break;
        expect(laterRanger.visualX - laterCleric.visualX).toBeGreaterThanOrEqual(
          minGap - 1,
        );
      }
      return;
    }
    expect.fail('no single front-row death while back row survived');
  });

  it('Stage 2 Wave 2: back row stays separated after a front-row ally falls', () => {
    const engine = createStage2Engine();
    waitForEngaged(engine);

    let wave2Engaged = false;
    for (let i = 0; i < 120000; i++) {
      engine.tick(1 / 60);
      const snap = engine.getSnapshot();
      if (snap.waveIndex === 1 && snap.engaged) {
        wave2Engaged = true;
        break;
      }
    }
    expect(wave2Engaged).toBe(true);

    const minGap = engagedMinLeftEdgeGap();
    for (let i = 0; i < 120000; i++) {
      engine.tick(1 / 60);
      const snap = engine.getSnapshot();
      if (!snap.engaged) continue;

      const guard = snap.allies.find(
        (ally) => ally.name === '鉄衛士' && ally.hp > 0,
      );
      const sword = snap.allies.find(
        (ally) => ally.name === '剣術士' && ally.hp > 0,
      );
      const cleric = snap.allies.find(
        (ally) => ally.name === '療養師' && ally.hp > 0,
      );
      const ranger = snap.allies.find(
        (ally) => ally.name === '弓術士' && ally.hp > 0,
      );
      if (!cleric || !ranger) continue;

      const frontAlive = Boolean(guard || sword);
      if (frontAlive) continue;

      expect(ranger.visualX - cleric.visualX).toBeGreaterThanOrEqual(minGap - 1);

      for (let j = 0; j < 90; j++) {
        engine.tick(1 / 60);
        const later = engine.getSnapshot();
        const laterCleric = later.allies.find(
          (ally) => ally.name === '療養師' && ally.hp > 0,
        );
        const laterRanger = later.allies.find(
          (ally) => ally.name === '弓術士' && ally.hp > 0,
        );
        if (!laterCleric || !laterRanger) break;
        expect(laterRanger.visualX - laterCleric.visualX).toBeGreaterThanOrEqual(
          minGap - 1,
        );
      }
      return;
    }
    expect.fail('both front-row allies did not fall while back row survived');
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

  it('Stage 1: does not jump ally screen X after wave 1 clear', () => {
    const engine = createStage1Engine({ reliableWaveClear: true });
    waitForEngaged(engine);

    const prevScreenX = new Map<string, number>();
    let sawWave1Combat = false;
    let maxScreenDelta = 0;

    for (let i = 0; i < 120000; i++) {
      engine.tick(1 / 60);
      const snap = engine.getSnapshot();
      const living = snap.allies.filter((a) => a.hp > 0);
      if (living.length === 0) break;

      if (snap.engaged && snap.enemies.some((e) => e.hp > 0)) {
        sawWave1Combat = true;
      }

      if (sawWave1Combat && snap.formationResetActive) {
        for (const ally of living) {
          const screenX = allyScreenX(ally, snap.combatCameraX);
          const prev = prevScreenX.get(ally.id);
          if (prev !== undefined) {
            maxScreenDelta = Math.max(maxScreenDelta, Math.abs(screenX - prev));
          }
          prevScreenX.set(ally.id, screenX);
        }
      }

      if (sawWave1Combat && !snap.formationResetActive && snap.waveIndex === 1) {
        expect(maxScreenDelta).toBeLessThan(20);
        return;
      }

      for (const ally of living) {
        if (!snap.formationResetActive) {
          prevScreenX.set(ally.id, allyScreenX(ally, snap.combatCameraX));
        }
      }
    }
    expect.fail('wave 1 formation reset did not complete');
  });

  it('Stage 1 Wave 2: ranged enemies stay visually separated when engaged', () => {
    const engine = createStage1Engine();
    waitForEngaged(engine);

    let wave2Engaged = false;
    for (let i = 0; i < 120000; i++) {
      engine.tick(1 / 60);
      const snap = engine.getSnapshot();
      if (snap.waveIndex === 1 && snap.engaged) {
        wave2Engaged = true;
        break;
      }
    }
    expect(wave2Engaged).toBe(true);

    for (let i = 0; i < 120; i++) {
      engine.tick(1 / 60);
    }

    const snap = engine.getSnapshot();
    const ranged = snap.enemies.filter(
      (enemy) => enemy.name === 'test_ranged' && enemy.hp > 0,
    );
    expect(ranged.length).toBe(2);
    const minGap = engagedMinLeftEdgeGap();
    const xs = ranged.map((enemy) => enemy.visualX).sort((a, b) => a - b);
    expect(xs[1]! - xs[0]!).toBeGreaterThanOrEqual(minGap - 1);
    for (const enemy of ranged) {
      expect(enemy.visualX + snap.combatCameraX).toBeGreaterThanOrEqual(0);
    }
    const melee = snap.enemies.find(
      (enemy) => enemy.name === 'test_enemy' && enemy.hp > 0,
    );
    expect(melee).toBeDefined();
    const maxMeleeVisualX = melee!.visualX;
    for (const enemy of ranged) {
      expect(enemy.visualX).toBeLessThan(
        maxMeleeVisualX - engagedMinLeftEdgeGap() + 1,
      );
    }
  });

  it('Stage 1 Wave 2: ranged battleX stays behind melee while melee lives', () => {
    const engine = createStage1Engine();
    waitForEngaged(engine);

    let wave2Engaged = false;
    for (let i = 0; i < 120000; i++) {
      engine.tick(1 / 60);
      const snap = engine.getSnapshot();
      if (snap.waveIndex === 1 && snap.engaged) {
        wave2Engaged = true;
      }
      if (!wave2Engaged || !snap.engaged) continue;

      const melee = snap.enemies.find(
        (e) => e.name === 'test_enemy' && e.hp > 0,
      );
      const ranged = snap.enemies.filter(
        (e) => e.name === 'test_ranged' && e.hp > 0,
      );
      if (!melee || ranged.length === 0) continue;

      const meleeX = melee.battleX;
      for (const r of ranged) {
        expect(r.battleX).toBeLessThanOrEqual(meleeX - SPRITE_GAP + 1);
      }
      return;
    }
    expect.fail('wave 2 engaged with melee and ranged did not occur');
  });

  it('Stage 1 Wave 2: front allies advance toward ranged after melee falls', () => {
    const engine = createStage1Engine();
    waitForEngaged(engine);

    let wave2Engaged = false;
    for (let i = 0; i < 120000; i++) {
      engine.tick(1 / 60);
      const snap = engine.getSnapshot();
      if (snap.waveIndex === 1 && snap.engaged) {
        wave2Engaged = true;
        break;
      }
    }
    expect(wave2Engaged).toBe(true);

    for (let i = 0; i < 120000; i++) {
      engine.tick(1 / 60);
      const snap = engine.getSnapshot();
      if (!snap.engaged) continue;

      const melee = snap.enemies.find(
        (enemy) => enemy.name === 'test_enemy' && enemy.hp > 0,
      );
      const ranged = snap.enemies.filter(
        (enemy) => enemy.name === 'test_ranged' && enemy.hp > 0,
      );
      const frontAllies = snap.allies.filter(
        (ally) => ally.hp > 0 && ally.formationRow === 'front',
      );
      if (melee || ranged.length === 0 || frontAllies.length === 0) continue;

      const startBattleX = Math.max(...frontAllies.map((a) => a.battleX));
      const rangedBattleX = Math.max(...ranged.map((e) => e.battleX));
      const startDist = Math.abs(startBattleX - rangedBattleX);
      for (let j = 0; j < 180; j++) {
        engine.tick(1 / 60);
      }
      const later = engine.getSnapshot();
      const laterFront = later.allies.filter(
        (ally) => ally.hp > 0 && ally.formationRow === 'front',
      );
      const laterRanged = later.enemies.filter(
        (enemy) => enemy.name === 'test_ranged' && enemy.hp > 0,
      );
      if (laterFront.length === 0 || laterRanged.length === 0) break;

      const endBattleX = Math.max(...laterFront.map((a) => a.battleX));
      const laterRangedX = Math.max(...laterRanged.map((e) => e.battleX));
      const endDist = Math.abs(endBattleX - laterRangedX);
      expect(endDist).toBeLessThan(startDist);
      return;
    }
    expect.fail('melee did not fall while ranged survived on stage 1 wave 2');
  });
});
