import { describe, expect, it } from "vitest";
import { loadGameData } from "./data/loadGameData.ts";
import { loadLevelCurves } from "../progression/levelGrowth.ts";
import levelCurvesJson from "../../data/levelCurves.json";
import { createDefaultSave } from "../progression/victoryRewards.ts";
import { BattleEngine } from "./BattleEngine.ts";
import { __testOnlyBattleLayout } from "./battleLayout.ts";
import {
  LONG_BATTLE_TIMEOUT_MS,
  TICK_DT,
  advanceUntil,
  createStage1Engine,
  createStage1Wave1MeleeFirstDeathEngine,
  createStage1Wave2MeleeOnlyEngine,
  createStage1Wave2ToRangedOnlyRegressionEngine,
  isLongRangeEnemy,
  isShortRangeWipedEngaged,
  reachWave2Engage,
  screenX,
  waitForEngaged,
  asBattleEngineInternals,
} from "./test/battleFieldSpec.harness.ts";
import { CANVAS_W, MOVE_PX_PER_SEC } from "./battleConstants.ts";
import { resolveEnemyDeployTargets } from "./combatPosition.ts";

function createStage1FastMeleeWipeEngine(): BattleEngine {
  const gameData = structuredClone(loadGameData());
  const stage = gameData.stages.find((s) => s.id === "1");
  if (stage?.waves[0]) {
    stage.waves[0].enemies = [
      { templateId: "test_enemy", spawnX: 100 },
      { templateId: "test_ranged", spawnX: 160 },
    ];
    const melee = gameData.enemyRegistry.test_enemy;
    if (melee) melee.maxHp = 400;
  }
  const ranged = gameData.enemyRegistry.test_ranged;
  if (ranged) ranged.maxHp = 9_999;
  const levelCurves = loadLevelCurves(levelCurvesJson);
  const save = createDefaultSave(gameData, "demo");
  save.stageProgress.currentStageId = "1";
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

function partyResourceTotal(
  snap: ReturnType<BattleEngine["getSnapshot"]>,
): number {
  return snap.allies.reduce(
    (sum, ally) =>
      sum + Math.max(0, ally.hp) + Math.max(0, ally.barrierHp ?? 0),
    0,
  );
}

/** Wave 1 engaged window: only enemies with rangePx >= 100 remain. */
function isLongRangeOnlyWave1(snap: ReturnType<BattleEngine["getSnapshot"]>) {
  return isShortRangeWipedEngaged(snap, 0);
}

describe(
  "battle-field transition spec (T-* / §4.3–§4.4)",
  { timeout: LONG_BATTLE_TIMEOUT_MS },
  () => {
    it("debug battleX trace is omitted from normal snapshots", () => {
      const engine = createStage1Engine();

      engine.tick(TICK_DT);

      expect(engine.getSnapshot().battleXDebugTrace).toBeUndefined();
    });

    it("T-engage-01: engage start does not warp battleX (deploy end positions kept)", () => {
      const engine = createStage1Engine();

      for (let i = 0; i < 5000; i++) {
        const before = engine.getSnapshot();
        engine.tick(TICK_DT);
        const after = engine.getSnapshot();
        if (!before.engaged && after.engaged) {
          for (const unit of [
            ...before.allies.filter((a) => a.hp > 0),
            ...before.enemies.filter((e) => e.hp > 0),
          ]) {
            const afterUnit = [...after.allies, ...after.enemies].find(
              (u) => u.id === unit.id,
            );
            expect(afterUnit).toBeDefined();
            expect(
              Math.abs(afterUnit!.battleX - unit.battleX),
            ).toBeLessThanOrEqual(8);
          }
          return;
        }
      }
      expect.fail("engage did not start");
    });

    it("T-engage-03: PartyDeploy ends with enemies at spawn targets", () => {
      const engine = createStage1Engine();
      const spawnTargets = resolveEnemyDeployTargets(
        asBattleEngineInternals(engine).enemies,
      );

      for (let i = 0; i < 5000; i++) {
        const before = engine.getSnapshot();
        engine.tick(TICK_DT);
        const after = engine.getSnapshot();
        if (before.partyDeployActive && !after.partyDeployActive) {
          for (const enemy of after.enemies.filter((e) => e.hp > 0)) {
            const target = spawnTargets.get(enemy.id);
            expect(target).toBeDefined();
            expect(Math.abs(enemy.battleX - target!)).toBeLessThanOrEqual(8);
          }
          return;
        }
      }
      expect.fail("PartyDeploy did not finish");
    });

    it("T-engage-02: PartyDeploy enemies march left only, not past target", () => {
      const engine = createStage1Engine();

      const prevX = new Map<string, number>();

      for (let i = 0; i < 5000; i++) {
        const snap = engine.getSnapshot();
        if (!snap.partyDeployActive) {
          if (snap.engaged) break;
          engine.tick(TICK_DT);
          continue;
        }

        for (const enemy of snap.enemies.filter((e) => e.hp > 0)) {
          const prev = prevX.get(enemy.id);
          if (prev !== undefined) {
            expect(enemy.battleX).toBeLessThanOrEqual(prev + 0.01);
          }
          prevX.set(enemy.id, enemy.battleX);
        }
        engine.tick(TICK_DT);
      }
    });

    it("T-L1-02: resolveEngagedLayout is not called during Engaged (including composition change)", () => {
      const engine = createStage1Engine();
      engine.startBattle();

      for (let i = 0; i < 5000; i++) {
        engine.tick(TICK_DT);
        if (engine.getSnapshot().engaged) break;
      }
      expect(engine.getSnapshot().engaged).toBe(true);

      __testOnlyBattleLayout.resetResolveEngagedLayoutCallCount();
      const countBefore =
        __testOnlyBattleLayout.getResolveEngagedLayoutCallCount();

      for (let i = 0; i < 120; i++) {
        engine.tick(TICK_DT);
      }
      expect(__testOnlyBattleLayout.getResolveEngagedLayoutCallCount()).toBe(
        countBefore,
      );
    });

    it("T-§4.4-01: after short-range wipe (rangePx < 100) battleX jumps stay bounded for 60 ticks", () => {
      const engine = createStage1FastMeleeWipeEngine();

      const wiped = advanceUntil(engine, isLongRangeOnlyWave1, 90_000);
      expect(wiped).not.toBeNull();

      let maxJump = 0;
      const prev = new Map<string, number>();

      for (let i = 0; i < 60; i++) {
        engine.tick(TICK_DT);
        const snap = engine.getSnapshot();
        if (!isLongRangeOnlyWave1(snap)) continue;

        for (const unit of [
          ...snap.allies.filter((a) => a.hp > 0 && a.formationRow === "front"),
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

    it("T-§4.4-02: enemy with rangePx 100 does not freeze after short-range wipe", () => {
      const engine = createStage1FastMeleeWipeEngine();

      const wiped = advanceUntil(engine, isLongRangeOnlyWave1, 90_000);
      expect(wiped).not.toBeNull();

      let prevBattleX: number | null = null;
      let sawLongRange = false;
      let sawBattleXChange = false;
      let partyResourceDrop = false;
      const resourcesAtWipe = partyResourceTotal(wiped!);

      for (let i = 0; i < 600; i++) {
        engine.tick(TICK_DT);
        const snap = engine.getSnapshot();
        if (!isLongRangeOnlyWave1(snap)) continue;

        const longRange = snap.enemies.find(
          (e) => e.hp > 0 && isLongRangeEnemy(e) && e.name === "test_ranged",
        );
        if (!longRange) continue;
        sawLongRange = true;
        if (partyResourceTotal(snap) < resourcesAtWipe) {
          partyResourceDrop = true;
        }
        if (prevBattleX !== null) {
          if (Math.abs(longRange.battleX - prevBattleX) > 0.5) {
            sawBattleXChange = true;
          }
        }
        prevBattleX = longRange.battleX;
      }

      expect(sawLongRange).toBe(true);
      expect(sawBattleXChange || partyResourceDrop).toBe(true);
    });

    it("T-deploy-01: enemies start off-screen right during PartyDeploy", () => {
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

    it("T-deploy-02: ally and enemy deploy finish together before engage", () => {
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
      expect.fail("engage did not start");
    });

    it("T-§4.4-03: enemies with rangePx 100 advance or attack after short-range wipe", () => {
      let longRangeHit = false;
      const engine = createStage1Wave1MeleeFirstDeathEngine({
        onDamageApplied: (actor, _target, amount) => {
          if (
            actor.isEnemy &&
            actor.name === "test_ranged" &&
            (actor.traits.rangePx ?? 0) >= 100 &&
            amount > 0
          ) {
            longRangeHit = true;
          }
        },
      });
      waitForEngaged(engine);

      const wiped = advanceUntil(
        engine,
        (snap) => isShortRangeWipedEngaged(snap, 0),
        90_000,
      );
      expect(wiped).not.toBeNull();

      let longRangeStartX = 0;
      let longRangeEndX = 0;
      let partyResourceDrop = false;
      let resourcesAtWipe = partyResourceTotal(wiped!);
      const longRangeAtWipe = wiped!.enemies.find(
        (e) => e.hp > 0 && e.name === "test_ranged",
      );
      expect(longRangeAtWipe).toBeDefined();
      longRangeStartX = longRangeAtWipe!.battleX;

      for (let i = 0; i < 300; i++) {
        engine.tick(TICK_DT);
        const snap = engine.getSnapshot();
        const longRange = snap.enemies.find(
          (e) => e.hp > 0 && e.name === "test_ranged",
        );
        if (!longRange) break;
        longRangeEndX = longRange.battleX;
        if (partyResourceTotal(snap) < resourcesAtWipe) {
          partyResourceDrop = true;
        }
      }

      expect(
        longRangeStartX - longRangeEndX > 10 ||
          longRangeHit ||
          partyResourceDrop,
      ).toBe(true);
    });

    it("T-§4.4-04: after front melee dies, allies keep advancing toward test_ranged", () => {
      const engine = createStage1Wave1MeleeFirstDeathEngine();
      waitForEngaged(engine);

      const wiped = advanceUntil(
        engine,
        (snap) => isShortRangeWipedEngaged(snap, 0),
        90_000,
      );
      expect(wiped).not.toBeNull();

      const startMaxAllyX = Math.max(
        ...wiped!.allies.filter((a) => a.hp > 0).map((a) => a.battleX),
      );
      let advanced = false;

      for (let i = 0; i < 180; i++) {
        engine.tick(TICK_DT);
        const snap = engine.getSnapshot();
        if (snap.waveIndex !== 0 || !snap.engaged) continue;
        const currentMaxAllyX = Math.max(
          ...snap.allies.filter((a) => a.hp > 0).map((a) => a.battleX),
        );
        if (currentMaxAllyX > startMaxAllyX + 0.5) {
          advanced = true;
          break;
        }
      }

      expect(advanced).toBe(true);
    });

    it("T-wave2-01: front row per-unit approach stop battleX on wave 2 engage", () => {
      const engine = createStage1Wave2MeleeOnlyEngine();
      reachWave2Engage(engine);

      for (let i = 0; i < 120; i++) {
        engine.tick(TICK_DT);
      }

      const snap = engine.getSnapshot();
      expect(snap.waveIndex).toBe(1);
      expect(snap.engaged).toBe(true);

      const front = snap.allies.filter(
        (a) => a.hp > 0 && a.formationRow === "front",
      );
      expect(front.length).toBeGreaterThanOrEqual(2);
      const sorted = [...front].sort((a, b) => a.battleX - b.battleX);
      const gap = sorted[1]!.battleX - sorted[0]!.battleX;
      expect(gap).toBeGreaterThanOrEqual(3);
    });

    it("T-Phase3d-02: iron guard battleX does not jump after test_to_ranged becomes sole enemy", () => {
      const engine = createStage1Wave2ToRangedOnlyRegressionEngine();
      const reached = advanceUntil(
        engine,
        (snap) => {
          if (snap.waveIndex !== 1 || !snap.engaged) return false;
          const living = snap.enemies.filter((e) => e.hp > 0);
          return living.length === 1 && living[0]?.name === "遠隔狙い";
        },
        120_000,
      );
      expect(reached).not.toBeNull();

      let maxIronGuardJump = 0;
      let trackedTicks = 0;
      let sawContinuousForwardMovement = false;
      let previousIronGuardX =
        reached!.allies.find((ally) => ally.name === "鉄衛士")?.battleX ?? null;

      for (let i = 0; i < 1800; i++) {
        engine.tick(TICK_DT);
        const after = engine.getSnapshot();
        if (after.waveIndex !== 1 || !after.engaged) continue;

        const living = after.enemies.filter((enemy) => enemy.hp > 0);
        if (living.length !== 1 || living[0]?.name !== "遠隔狙い") {
          break;
        }

        const ironGuard = after.allies.find(
          (ally) => ally.name === "鉄衛士" && ally.hp > 0,
        );
        if (!ironGuard || previousIronGuardX === null) continue;

        const jump = Math.abs(ironGuard.battleX - previousIronGuardX);
        maxIronGuardJump = Math.max(maxIronGuardJump, jump);
        trackedTicks += 1;
        if (ironGuard.battleX > previousIronGuardX + 0.5) {
          sawContinuousForwardMovement = true;
        }
        previousIronGuardX = ironGuard.battleX;
      }

      expect(trackedTicks).toBeGreaterThanOrEqual(900);
      expect(maxIronGuardJump).toBeLessThanOrEqual(8);
      expect(sawContinuousForwardMovement).toBe(true);
    });

    it("T-Phase3d-03: iron guard does not exceed approach speed while overlap resolves after test_to_ranged remains", () => {
      const engine = createStage1Wave2ToRangedOnlyRegressionEngine();
      const reached = advanceUntil(
        engine,
        (snap) => {
          if (snap.waveIndex !== 1 || !snap.engaged) return false;
          const living = snap.enemies.filter((e) => e.hp > 0);
          return living.length === 1 && living[0]?.name === "遠隔狙い";
        },
        120_000,
      );
      expect(reached).not.toBeNull();

      const maxExpectedDelta = MOVE_PX_PER_SEC * TICK_DT + 0.75;
      let maxIronGuardDelta = 0;
      let trackedTicks = 0;
      let previousIronGuardX =
        reached!.allies.find((ally) => ally.name === "鉄衛士")?.battleX ?? null;

      for (let i = 0; i < 1800; i++) {
        engine.tick(TICK_DT);
        const after = engine.getSnapshot();
        if (after.waveIndex !== 1 || !after.engaged) continue;

        const living = after.enemies.filter((enemy) => enemy.hp > 0);
        if (living.length !== 1 || living[0]?.name !== "遠隔狙い") {
          break;
        }

        const ironGuard = after.allies.find(
          (ally) => ally.name === "鉄衛士" && ally.hp > 0,
        );
        if (!ironGuard || previousIronGuardX === null) continue;

        const deltaX = Math.abs(ironGuard.battleX - previousIronGuardX);
        maxIronGuardDelta = Math.max(maxIronGuardDelta, deltaX);
        trackedTicks += 1;
        previousIronGuardX = ironGuard.battleX;
      }

      expect(trackedTicks).toBeGreaterThanOrEqual(900);
      expect(maxIronGuardDelta).toBeLessThanOrEqual(maxExpectedDelta);
    });

    it("T-wave-exit-01: wave clear marches living allies right before next WaveAnnouncement", () => {
      const engine = createStage1Engine({ reliableWaveClear: true });
      waitForEngaged(engine);

      let marchStartX = 0;
      let marchStartOffset = 0;
      let sawWaveExitMarch = false;

      for (let i = 0; i < 90_000; i++) {
        const before = engine.getSnapshot();
        engine.tick(TICK_DT);
        const after = engine.getSnapshot();

        if (
          after.phase === "running" &&
          after.runtimePhase === "VictoryExit" &&
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
      expect.fail(
        "wave exit march did not complete before wave 2 announcement",
      );
    });

    it("T-wave-exit-02: inter-wave march uses Victory exit speed", () => {
      const engine = createStage1Engine({ reliableWaveClear: true });
      waitForEngaged(engine);

      for (let i = 0; i < 90_000; i++) {
        const before = engine.getSnapshot();
        engine.tick(TICK_DT);
        const after = engine.getSnapshot();
        if (
          before.phase === "running" &&
          before.runtimePhase === "VictoryExit" &&
          after.runtimePhase === "VictoryExit"
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
      expect.fail("inter-wave VictoryExit march did not occur");
    });
  },
);
