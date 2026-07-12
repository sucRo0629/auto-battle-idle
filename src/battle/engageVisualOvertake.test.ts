import { describe, expect, it } from 'vitest';
import { loadGameData } from './data/loadGameData.ts';
import { loadLevelCurves } from '../progression/levelGrowth.ts';
import levelCurvesJson from '../../data/levelCurves.json';
import { createDefaultSave } from '../progression/victoryRewards.ts';
import { BattleEngine } from './BattleEngine.ts';
import {
  assertEngagedDeathVisualStability,
  assertEngagedEnemyScreenStable,
  assertFirstEnemyDeathCorpseStable,
  assertNoFrontOvertake,
  assertWaveWipeCorpseNoJump,
  createStage1Engine,
  createStage1Wave1MeleeFirstDeathEngine,
  createStage1Wave2MeleeOnlyEngine,
  reachWave1Engage,
  TICK_DT,
  waitForEngaged,
} from './test/battleFieldSpec.harness.ts';
import {
  PARTY_FORMATION_LEFT_ANCHOR,
  PARTY_FORMATION_SLOT_SPACING,
} from './battleConstants.ts';

function createStage2Engine(): BattleEngine {
  const gameData = structuredClone(loadGameData());
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

describe('engage visual sync & overtaking', () => {
  it('engaged: enemy screenX stays stable with unified battleX (stage 1)', () => {
    const engine = createStage1Engine();
    reachWave1Engage(engine);
    assertEngagedEnemyScreenStable(engine, {
      maxTicks: 240,
      skipTicksAfterEngage: 60,
    });
  });

  it('stage 1: front row melee allies per-unit approach stop by rangePx', () => {
    const engine = createStage1Engine();
    waitForEngaged(engine);
    for (let i = 0; i < 180; i++) {
      engine.tick(TICK_DT);
    }
    const snap = engine.getSnapshot();
    const front = snap.allies.filter(
      (a) => a.hp > 0 && a.formationRow === 'front',
    );
    expect(front.length).toBeGreaterThanOrEqual(2);
    const sorted = [...front].sort((a, b) => a.battleX - b.battleX);
    const gap = sorted[1]!.battleX - sorted[0]!.battleX;
    // L10: 前列 melee は rangePx 差で停止するが、接敵 overlap 解消で gap が縮む場合あり。
    // 上限は隊形スロット間隔（48）。旧上限 30 は spacing 拡大後も縮まないケースで破れる。
    expect(gap).toBeGreaterThanOrEqual(0);
    expect(gap).toBeLessThanOrEqual(PARTY_FORMATION_SLOT_SPACING);
  });

  it('stage 1: front allies never pass living enemies on screen', () => {
    assertNoFrontOvertake(createStage1Engine());
  });

  it('stage 2: front allies never pass living enemies on screen', () => {
    assertNoFrontOvertake(createStage2Engine());
  });

  it('stage 1 wave 2: after melee wipe, front allies do not pass living enemies on screen', () => {
    const engine = createStage1Wave2MeleeOnlyEngine();
    waitForEngaged(engine);

    const isRangedOnlyEngaged = (snap: ReturnType<BattleEngine['getSnapshot']>) => {
      if (snap.waveIndex !== 1 || !snap.engaged) return false;
      const living = snap.enemies.filter((e) => e.hp > 0);
      return (
        !living.some((e) => e.name === 'test_enemy') &&
        living.some((e) => e.name === 'test_ranged')
      );
    };

    let meleeWiped = false;
    for (let i = 0; i < 200_000; i++) {
      if (isRangedOnlyEngaged(engine.getSnapshot())) {
        meleeWiped = true;
        break;
      }
      engine.tick(TICK_DT);
    }
    expect(meleeWiped).toBe(true);

    assertNoFrontOvertake(engine, {
      maxTicks: 900,
      when: isRangedOnlyEngaged,
    });
  });

  it('wave 1: first enemy death — corpse screen-stable for 2s', () => {
    const engine = createStage1Engine();
    waitForEngaged(engine);
    assertFirstEnemyDeathCorpseStable(engine, { maxTicks: 90_000 });
  });

  it('wave 2: melee death — living ranged and corpse stay screen-stable', () => {
    const engine = createStage1Wave2MeleeOnlyEngine();
    waitForEngaged(engine);
    assertEngagedDeathVisualStability(engine, {
      maxTicks: 200_000,
      corpseMaxDeltaPx: 8,
    });
  });

  it('stage 1 wave 2: after melee wipe living ranged do not lurch on screen', () => {
    const engine = createStage1Wave2MeleeOnlyEngine();
    waitForEngaged(engine);

    let meleeWiped = false;
    for (let i = 0; i < 200_000; i++) {
      const snap = engine.getSnapshot();
      if (
        snap.waveIndex === 1 &&
        snap.engaged &&
        !snap.enemies.some((e) => e.hp > 0 && e.name === 'test_enemy') &&
        snap.enemies.some((e) => e.hp > 0 && e.name === 'test_ranged')
      ) {
        meleeWiped = true;
        break;
      }
      engine.tick(TICK_DT);
    }
    expect(meleeWiped).toBe(true);

    assertEngagedEnemyScreenStable(engine, {
      maxTicks: 900,
      skipTicksAfterEngage: 0,
      maxJumpPx: 12,
    });
  });

  it('wave 1: first melee death — living ranged stay screen-stable while allies re-approach', () => {
    const engine = createStage1Wave1MeleeFirstDeathEngine();
    waitForEngaged(engine);

    let firstMeleeDead = false;
    for (let i = 0; i < 200_000; i++) {
      const snap = engine.getSnapshot();
      const living = snap.enemies.filter((e) => e.hp > 0);
      const dead = snap.enemies.filter((e) => e.hp <= 0);
      if (
        snap.waveIndex === 0 &&
        snap.engaged &&
        living.some((e) => e.name === 'test_ranged') &&
        dead.length > 0 &&
        living.length > 0
      ) {
        firstMeleeDead = true;
        break;
      }
      engine.tick(TICK_DT);
    }
    expect(firstMeleeDead).toBe(true);

    assertEngagedEnemyScreenStable(engine, {
      maxTicks: 900,
      skipTicksAfterEngage: 0,
      maxJumpPx: 8,
    });
  });

  it('PartyDeploy complete: leftmost ally near formation anchor', () => {
    const engine = createStage1Engine();
    waitForEngaged(engine);
    const snap = engine.getSnapshot();
    const living = snap.allies.filter((a) => a.hp > 0);
    const leftmost = living.reduce((left, ally) =>
      ally.battleX < left.battleX ? ally : left,
    );
    expect(Math.abs(leftmost.battleX - PARTY_FORMATION_LEFT_ANCHOR)).toBeLessThanOrEqual(
      80,
    );
  });

  it('PartyDeploy: engaged false until deploy completes', () => {
    const engine = createStage1Engine();
    let deployTicks = 0;
    for (let i = 0; i < 5000; i++) {
      const before = engine.getSnapshot();
      engine.tick(TICK_DT);
      const after = engine.getSnapshot();
      if (before.partyDeployActive) deployTicks += 1;
      if (!before.engaged && after.engaged) {
        expect(deployTicks).toBeGreaterThan(0);
        return;
      }
    }
    expect.fail('engage did not start');
  });

  it('stage 1 wave 2 victory wipe: last ranged corpse stays on screen on settle', () => {
    const engine = createStage1Engine({ reliableWaveClear: true, legacyAutoWaveAdvance: true });
    waitForEngaged(engine);

    for (let i = 0; i < 200_000; i++) {
      if (engine.getSnapshot().waveIndex === 1) break;
      engine.tick(TICK_DT);
    }
    expect(engine.getSnapshot().waveIndex).toBe(1);

    assertWaveWipeCorpseNoJump(engine, { waveIndex: 1, maxWipeJumpPx: 15 });
  });

  it('stage 1: engaged 15s then 30s after melee wipe — battleX stable, no overtake', () => {
    const engine = createStage1Wave2MeleeOnlyEngine();
    waitForEngaged(engine);

    for (let i = 0; i < 900; i++) {
      engine.tick(TICK_DT);
    }

    let meleeWiped = false;
    for (let i = 0; i < 200_000; i++) {
      const snap = engine.getSnapshot();
      if (
        snap.waveIndex === 1 &&
        snap.engaged &&
        !snap.enemies.some((e) => e.hp > 0 && e.name === 'test_enemy') &&
        snap.enemies.some((e) => e.hp > 0 && e.name === 'test_ranged')
      ) {
        meleeWiped = true;
        break;
      }
      engine.tick(TICK_DT);
    }
    expect(meleeWiped).toBe(true);

    assertNoFrontOvertake(engine, { maxTicks: 1800 });
  });
});
