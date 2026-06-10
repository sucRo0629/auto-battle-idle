import { describe, expect, it } from 'vitest';
import { loadGameData } from './data/loadGameData.ts';
import { loadLevelCurves } from '../progression/levelGrowth.ts';
import levelCurvesJson from '../../data/levelCurves.json';
import { createDefaultSave } from '../progression/victoryRewards.ts';
import { BattleEngine } from './BattleEngine.ts';
import { __testOnlyBattleLayout } from './battleLayout.ts';
import {
  createStage1Engine,
  createStage1Wave1MeleeFirstDeathEngine,
  screenX,
  TICK_DT,
  waitForEngaged,
} from './test/battleFieldSpec.harness.ts';
import { CANVAS_W, MOVE_PX_PER_SEC } from './battleConstants.ts';
import { isMeleeRangePx } from './types.ts';
import { SPRITE_WIDTH } from '../battle/battleConstants.ts';

function frontContactScreenCenter(
  snap: ReturnType<BattleEngine['getSnapshot']>,
): number | null {
  const front = snap.allies.filter((a) => a.hp > 0 && a.formationRow === 'front');
  if (front.length === 0) return null;
  const contact = front.reduce((best, ally) =>
    ally.battleX > best.battleX ? ally : best,
  );
  return contact.battleX + SPRITE_WIDTH / 2;
}

function createStage1FastMeleeWipeEngine(): BattleEngine {
  const gameData = structuredClone(loadGameData());
  const stage = gameData.stages.find((s) => s.id === '1');
  if (stage?.waves[0]) {
    for (const spawn of stage.waves[0].enemies) {
      if (
        spawn.templateId === 'stage1_1' ||
        spawn.templateId === 'test_enemy'
      ) {
        const def = gameData.enemyRegistry[spawn.templateId];
        if (def) def.maxHp = 1;
      }
    }
  }
  const ranged = gameData.enemyRegistry.test_ranged;
  if (ranged) ranged.maxHp = 9_999;
  const levelCurves = loadLevelCurves(levelCurvesJson);
  const save = createDefaultSave(gameData, 'demo');
  save.stageProgress.currentStageId = '1';
  for (const slot of save.party) {
    if (slot) slot.progress.level = 12;
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

function isRangedOnlyWave1(snap: ReturnType<BattleEngine['getSnapshot']>) {
  if (snap.waveIndex !== 0 || !snap.engaged) return false;
  const living = snap.enemies.filter((e) => e.hp > 0);
  return (
    living.length > 0 &&
    !living.some((e) => e.name === 'stage1_1' || e.name === 'test_enemy') &&
    living.some((e) => e.name === 'test_ranged')
  );
}

describe('battle-field transition spec (T-*)', () => {
  it('T-engage-01: engage start preserves front contact screen center (no camera snap)', () => {
    const engine = createStage1Engine();
    engine.startBattle();

    for (let i = 0; i < 5000; i++) {
      const before = engine.getSnapshot();
      engine.tick(TICK_DT);
      const after = engine.getSnapshot();
      if (!before.engaged && after.engaged) {
        const beforeScreen = frontContactScreenCenter(before);
        const afterScreen = frontContactScreenCenter(after);
        expect(beforeScreen).not.toBeNull();
        expect(afterScreen).not.toBeNull();
        expect(Math.abs(afterScreen! - beforeScreen!)).toBeLessThanOrEqual(8);
        return;
      }
    }
    expect.fail('engage did not start');
  });

  it('T-engage-02: engage start does not snap front row battleX toward enemy', () => {
    const engine = createStage1Engine();
    engine.startBattle();

    for (let i = 0; i < 5000; i++) {
      const before = engine.getSnapshot();
      engine.tick(TICK_DT);
      const after = engine.getSnapshot();
      if (!before.engaged && after.engaged) {
        for (const ally of after.allies.filter(
          (a) => a.hp > 0 && a.formationRow === 'front',
        )) {
          const prev = before.allies.find((a) => a.id === ally.id);
          expect(prev).toBeDefined();
          expect(Math.abs(ally.battleX - prev!.battleX)).toBeLessThanOrEqual(5);
        }
        return;
      }
    }
    expect.fail('engage did not start');
  });

  it('T-L1-02: resolveEngagedLayout only on engage and composition change', () => {
    const engine = createStage1Engine();
    engine.startBattle();

    for (let i = 0; i < 5000; i++) {
      engine.tick(TICK_DT);
      if (engine.getSnapshot().engaged) break;
    }
    expect(engine.getSnapshot().engaged).toBe(true);

    __testOnlyBattleLayout.resetResolveEngagedLayoutCallCount();
    const countBefore = __testOnlyBattleLayout.getResolveEngagedLayoutCallCount();

    for (let i = 0; i < 120; i++) {
      engine.tick(TICK_DT);
    }
    expect(__testOnlyBattleLayout.getResolveEngagedLayoutCallCount()).toBe(
      countBefore,
    );
  });

  it('T-§4.4-01: after melee wipe screenX jumps stay bounded for 60 ticks', () => {
    const engine = createStage1FastMeleeWipeEngine();

    for (let i = 0; i < 200_000; i++) {
      engine.tick(TICK_DT);
      if (isRangedOnlyWave1(engine.getSnapshot())) break;
    }
    expect(isRangedOnlyWave1(engine.getSnapshot())).toBe(true);

    let maxJump = 0;
    const prev = new Map<string, number>();

    for (let i = 0; i < 60; i++) {
      engine.tick(TICK_DT);
      const snap = engine.getSnapshot();
      if (!isRangedOnlyWave1(snap)) continue;

      for (const unit of [
        ...snap.allies.filter((a) => a.hp > 0 && a.formationRow === 'front'),
        ...snap.enemies.filter((e) => e.hp > 0),
      ]) {
        const sx = screenX(unit);
        const p = prev.get(unit.id);
        if (p !== undefined) {
          maxJump = Math.max(maxJump, Math.abs(sx - p));
        }
        prev.set(unit.id, sx);
      }
    }

    expect(maxJump).toBeLessThanOrEqual(8);
  });

  it('T-§4.4-02: ranged enemy battleX never increases after melee wipe', () => {
    const engine = createStage1FastMeleeWipeEngine();

    for (let i = 0; i < 200_000; i++) {
      engine.tick(TICK_DT);
      if (isRangedOnlyWave1(engine.getSnapshot())) break;
    }

    let prevBattleX: number | null = null;
    let sawRanged = false;

    for (let i = 0; i < 600; i++) {
      engine.tick(TICK_DT);
      const snap = engine.getSnapshot();
      if (!isRangedOnlyWave1(snap)) continue;

      const ranged = snap.enemies.find(
        (e) => e.hp > 0 && e.name === 'test_ranged',
      );
      if (!ranged) continue;
      sawRanged = true;
      if (prevBattleX !== null) {
        expect(ranged.battleX).toBeLessThanOrEqual(prevBattleX + 0.01);
      }
      prevBattleX = ranged.battleX;
    }

    expect(sawRanged).toBe(true);
  });

  it('T-deploy-01: enemies start off-screen right during PartyDeploy', () => {
    const engine = createStage1Engine();
    let sawOffScreenEnemy = false;
    for (let i = 0; i < 5000; i++) {
      engine.tick(TICK_DT);
      const snap = engine.getSnapshot();
      if (!snap.partyDeployActive) continue;
      for (const enemy of snap.enemies.filter((e) => e.hp > 0)) {
        if (enemy.battleX > CANVAS_W) {
          sawOffScreenEnemy = true;
        }
      }
    }
    expect(sawOffScreenEnemy).toBe(true);
  });

  it('T-deploy-02: ally and enemy deploy finish together before engage', () => {
    const engine = createStage1Engine();
    for (let i = 0; i < 5000; i++) {
      const before = engine.getSnapshot();
      engine.tick(TICK_DT);
      const after = engine.getSnapshot();
      if (!before.engaged && after.engaged) {
        for (const enemy of after.enemies.filter((e) => e.hp > 0)) {
          expect(enemy.battleX).toBeLessThanOrEqual(CANVAS_W + 32);
        }
        return;
      }
    }
    expect.fail('engage did not start');
  });

  it('T-melee-wipe-01: ranged enemies advance or attack after all melee die', () => {
    const engine = createStage1Wave1MeleeFirstDeathEngine();
    waitForEngaged(engine);

    let meleeWipeTick = -1;
    let rangedStartX = 0;
    let rangedEndX = 0;
    let playerHpDrop = false;
    let hpAtWipe = 0;

    for (let i = 0; i < 120_000; i++) {
      const snap = engine.getSnapshot();
      const livingMelee = snap.enemies.filter(
        (e) => e.hp > 0 && isMeleeRangePx(e.rangePx ?? 0),
      );
      const ranged = snap.enemies.find(
        (e) => e.hp > 0 && e.name === 'test_ranged',
      );
      const playerHp = snap.allies.reduce((s, a) => s + Math.max(0, a.hp), 0);
      if (meleeWipeTick < 0 && livingMelee.length === 0 && ranged) {
        meleeWipeTick = i;
        rangedStartX = ranged.battleX;
        hpAtWipe = playerHp;
      }
      if (meleeWipeTick >= 0 && ranged) {
        rangedEndX = ranged.battleX;
        if (playerHp < hpAtWipe) playerHpDrop = true;
      }
      if (meleeWipeTick >= 0 && i - meleeWipeTick > 300) break;
      engine.tick(TICK_DT);
    }

    expect(meleeWipeTick).toBeGreaterThan(0);
    expect(
      rangedStartX - rangedEndX > 10 || playerHpDrop,
    ).toBe(true);
  });

  it('T-wave2-01: front row melee per-unit approach stop on wave 2 engage', () => {
    const engine = createStage1Engine();
    let wave2Engage = -1;
    for (let i = 0; i < 200_000; i++) {
      const before = engine.getSnapshot();
      engine.tick(TICK_DT);
      const after = engine.getSnapshot();
      if (before.waveIndex === 1 && !before.engaged && after.engaged) {
        wave2Engage = i;
      }
      if (wave2Engage >= 0 && i - wave2Engage === 120) {
        const front = after.allies.filter(
          (a) => a.hp > 0 && a.formationRow === 'front',
        );
        expect(front.length).toBeGreaterThanOrEqual(2);
        const sorted = [...front].sort((a, b) => a.battleX - b.battleX);
        const gap = sorted[1]!.battleX - sorted[0]!.battleX;
        expect(gap).toBeGreaterThanOrEqual(3);
        return;
      }
    }
    expect.fail('wave 2 engage did not occur');
  });

  it('T-wave-exit-01: wave clear marches living allies right before next WaveAnnouncement', () => {
    const engine = createStage1Engine({ reliableWaveClear: true });
    waitForEngaged(engine);

    let marchStartX = 0;
    let marchStartOffset = 0;
    let sawWaveExitMarch = false;

    for (let i = 0; i < 120_000; i++) {
      const before = engine.getSnapshot();
      engine.tick(TICK_DT);
      const after = engine.getSnapshot();

      if (
        after.phase === 'running' &&
        after.runtimePhase === 'VictoryExit' &&
        !after.waveAnnouncementActive
      ) {
        if (!sawWaveExitMarch) {
          sawWaveExitMarch = true;
          marchStartX = Math.max(
            ...after.allies.filter((a) => a.hp > 0).map((a) => a.battleX),
          );
          marchStartOffset = after.worldOffsetX;
        }
        const maxX = Math.max(
          ...after.allies.filter((a) => a.hp > 0).map((a) => a.battleX),
        );
        expect(maxX).toBeGreaterThanOrEqual(marchStartX);
        expect(after.worldOffsetX).toBeGreaterThanOrEqual(marchStartOffset);
      }

      if (
        sawWaveExitMarch &&
        after.waveAnnouncementActive &&
        after.waveIndex === 1
      ) {
        const maxX = Math.max(
          ...before.allies.filter((a) => a.hp > 0).map((a) => a.battleX),
        );
        expect(maxX).toBeGreaterThan(marchStartX);
        expect(before.worldOffsetX).toBeGreaterThan(marchStartOffset);
        return;
      }
    }
    expect(sawWaveExitMarch).toBe(true);
    expect.fail('wave exit march did not complete before wave 2 announcement');
  });

  it('T-wave-exit-02: inter-wave march uses Victory exit speed', () => {
    const engine = createStage1Engine({ reliableWaveClear: true });
    waitForEngaged(engine);

    for (let i = 0; i < 120_000; i++) {
      const before = engine.getSnapshot();
      engine.tick(TICK_DT);
      const after = engine.getSnapshot();
      if (
        before.phase === 'running' &&
        before.runtimePhase === 'VictoryExit' &&
        after.runtimePhase === 'VictoryExit'
      ) {
        const ally = after.allies.find((a) => a.hp > 0);
        const prev = before.allies.find((a) => a.id === ally?.id);
        if (!ally || !prev) continue;
        const deltaX = ally.battleX - prev.battleX;
        const expected = MOVE_PX_PER_SEC * 2 * TICK_DT;
        expect(deltaX).toBeCloseTo(expected, 4);
        return;
      }
    }
    expect.fail('inter-wave VictoryExit march did not occur');
  });
});
