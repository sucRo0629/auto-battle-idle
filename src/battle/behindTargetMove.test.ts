import { describe, expect, it } from "vitest";
import levelCurvesJson from "../../data/levelCurves.json";
import { BattleEngine } from "./BattleEngine.ts";
import { loadGameData } from "./data/loadGameData.ts";
import { loadLevelCurves } from "../progression/levelGrowth.ts";
import { createDefaultSave } from "../progression/victoryRewards.ts";
import { createMemberFromClass } from "../progression/partyCompose.ts";
import {
  asBattleEngineInternals,
  reachWave1Engage,
  reachWave2Engage,
  TICK_DT,
} from "./test/battleFieldSpec.harness.ts";

function createAssassinFrontEngine(): BattleEngine {
  const gameData = structuredClone(loadGameData());
  const save = createDefaultSave(gameData, "demo");
  save.stageProgress.currentStageId = "1";
  save.party[0] = createMemberFromClass("at_assassin", gameData);
  for (const slot of save.party) {
    if (slot) slot.progress.level = 10;
  }
  const engine = new BattleEngine(
    gameData,
    loadLevelCurves(levelCurvesJson),
    () => save.party,
    () => save.stageProgress.currentStageId
  );
  engine.startBattle();
  return engine;
}

function createAssassinTestDummyEngine(): BattleEngine {
  const gameData = structuredClone(loadGameData());
  const save = createDefaultSave(gameData, "demo");
  save.stageProgress.currentStageId = "test";
  save.party[0] = createMemberFromClass("at_assassin", gameData);
  for (const slot of save.party) {
    if (slot) slot.progress.level = 10;
  }
  const engine = new BattleEngine(
    gameData,
    loadLevelCurves(levelCurvesJson),
    () => save.party,
    () => save.stageProgress.currentStageId
  );
  engine.startBattle();
  return engine;
}

describe("toAnchor offset move", () => {
  it("moves toward the selected MoveAnchor while backstab skill motion is active", () => {
    const engine = createAssassinFrontEngine();
    reachWave2Engage(engine);
    const internal = asBattleEngineInternals(engine);
    const assassin = internal.players.find((p) => p.name === "双刃士")!;
    const activeCd = assassin.cooldowns.find(
      (cd) => cd.skillId === "at_assassin_active_2"
    );
    expect(activeCd).toBeDefined();
    activeCd!.remaining = 0;

    const startX = assassin.battleX;
    let sawSkillMotion = false;
    let maxXDuringMotion = assassin.battleX;

    for (let t = 0; t < 600; t++) {
      engine.tick(TICK_DT);
      if (internal.skillSequenceRunner.isActorInSkillMotion(assassin.id)) {
        sawSkillMotion = true;
        maxXDuringMotion = Math.max(maxXDuringMotion, assassin.battleX);
      }
      if (
        sawSkillMotion &&
        !internal.skillSequenceRunner.isActorInSkillMotion(assassin.id)
      ) {
        break;
      }
    }

    expect(sawSkillMotion).toBe(true);
    expect(maxXDuringMotion).toBeGreaterThan(startX + 50);
  });

  it("attacks from behind after backstab toAnchor while in range", () => {
    const engine = createAssassinFrontEngine();
    reachWave2Engage(engine);
    const internal = asBattleEngineInternals(engine);
    const assassin = internal.players.find((p) => p.name === "双刃士")!;
    const enemy = internal.enemies.find((e) => e.isAlive)!;
    const activeCd = assassin.cooldowns.find(
      (cd) => cd.skillId === "at_assassin_active_2"
    );
    activeCd!.remaining = 0;

    const startX = assassin.battleX;
    const hpBefore = enemy.hp;
    let peakX = assassin.battleX;
    let damagedWhileBehind = false;

    for (let t = 0; t < 900; t++) {
      engine.tick(TICK_DT);
      peakX = Math.max(peakX, assassin.battleX);
      if (
        peakX > startX + 50 &&
        assassin.battleX >= enemy.battleX + 8 &&
        enemy.hp < hpBefore
      ) {
        damagedWhileBehind = true;
        break;
      }
    }

    expect(peakX).toBeGreaterThan(startX + 50);
    expect(damagedWhileBehind).toBe(true);
  });

  it("holds behind position through damage waitAfterSec on wave 2", () => {
    const engine = createAssassinFrontEngine();
    reachWave2Engage(engine);
    const internal = asBattleEngineInternals(engine);
    const assassin = internal.players.find((p) => p.name === "双刃士")!;
    const enemy = internal.enemies.find((e) => e.isAlive)!;
    const activeCd = assassin.cooldowns.find(
      (cd) => cd.skillId === "at_assassin_active_2"
    );
    activeCd!.remaining = 0;

    const startX = assassin.battleX;
    let peakX = assassin.battleX;
    let peakTick = -1;
    let heldBehindDuringWait = false;

    for (let t = 0; t < 200; t++) {
      engine.tick(TICK_DT);
      if (assassin.battleX > peakX + 0.5) {
        peakX = assassin.battleX;
        peakTick = t;
      }
      if (
        peakTick >= 0 &&
        t > peakTick &&
        t <= peakTick + 28 &&
        assassin.battleX >= enemy.battleX + 8
      ) {
        heldBehindDuringWait = true;
      }
    }

    expect(peakX).toBeGreaterThan(startX + 50);
    expect(heldBehindDuringWait).toBe(true);
  });

  it("stays behind training dummy through damage waitAfterSec", () => {
    const engine = createAssassinTestDummyEngine();
    reachWave1Engage(engine);
    const internal = asBattleEngineInternals(engine);

    const assassin = internal.players.find((p) => p.name === "双刃士")!;
    const dummy = internal.enemies.find((e) => e.isAlive)!;
    const activeCd = assassin.cooldowns.find(
      (cd) => cd.skillId === "at_assassin_active_2"
    );
    expect(activeCd).toBeDefined();
    activeCd!.remaining = 0;

    let behindDuringWait = false;
    let rearAssaultStateDuringWait = false;
    for (let t = 0; t < 900; t++) {
      engine.tick(TICK_DT);
      if (assassin.accessState === "rearAssault") {
        rearAssaultStateDuringWait = true;
      }
      if (
        internal.skillSequenceRunner.isActorInSkillMotion(assassin.id) &&
        assassin.battleX >= dummy.battleX + 8
      ) {
        behindDuringWait = true;
      }
      if (
        rearAssaultStateDuringWait &&
        assassin.accessState === "rearAssault" &&
        assassin.battleX >= dummy.battleX + 8
      ) {
        behindDuringWait = true;
      }
      if (
        behindDuringWait &&
        !internal.skillSequenceRunner.isActorInSkillMotion(assassin.id)
      ) {
        break;
      }
    }

    expect(rearAssaultStateDuringWait).toBe(true);
    expect(behindDuringWait).toBe(true);
  });

  it("at_assassin_active_2 damage hits enemy after move behind", () => {
    const engine = createAssassinFrontEngine();
    reachWave2Engage(engine);
    const internal = asBattleEngineInternals(engine);

    const assassin = internal.players.find((p) => p.name === "双刃士")!;
    const activeCd = assassin.cooldowns.find(
      (cd) => cd.skillId === "at_assassin_active_2"
    );
    expect(activeCd).toBeDefined();
    activeCd!.remaining = 0;

    let shadowBladeStarted = false;
    let reachedBehind = false;
    let hpWhenShadowStarted = 0;
    let damageAfterBehindMove = false;

    const sumEnemyHp = () =>
      internal.enemies
        .filter((e) => e.isAlive)
        .reduce((sum, e) => sum + e.hp, 0);

    const unsub = engine.onEvent((event) => {
      if (event.type !== "skill" || event.actorId !== assassin.id) return;
      if (event.skillId === "at_assassin_active_2" && !shadowBladeStarted) {
        shadowBladeStarted = true;
        hpWhenShadowStarted = sumEnemyHp();
      }
    });

    for (let t = 0; t < 900; t++) {
      engine.tick(TICK_DT);
      if (!shadowBladeStarted) continue;

      const frontEnemyX = Math.max(
        ...internal.enemies.filter((e) => e.isAlive).map((e) => e.battleX),
      );
      if (!reachedBehind && assassin.battleX >= frontEnemyX + 8) {
        reachedBehind = true;
      }
      if (reachedBehind && sumEnemyHp() < hpWhenShadowStarted) {
        damageAfterBehindMove = true;
        break;
      }
    }
    unsub();

    expect(shadowBladeStarted).toBe(true);
    expect(reachedBehind).toBe(true);
    expect(damageAfterBehindMove).toBe(true);
  });

  it("sets runtime accessState on rear assault and clears after engage return", () => {
    const engine = createAssassinFrontEngine();
    reachWave2Engage(engine);
    const internal = asBattleEngineInternals(engine);
    const assassin = internal.players.find((p) => p.name === "双刃士")!;
    const activeCd = assassin.cooldowns.find(
      (cd) => cd.skillId === "at_assassin_active_2"
    );
    activeCd!.remaining = 0;

    let sawRearAssaultState = false;
    let clearedAfterSequence = false;

    for (let t = 0; t < 900; t++) {
      engine.tick(TICK_DT);
      if (assassin.accessState === "rearAssault") {
        sawRearAssaultState = true;
      }
      if (
        sawRearAssaultState &&
        assassin.accessState !== "rearAssault" &&
        !internal.skillSequenceRunner.isActorInSkillMotion(assassin.id)
      ) {
        clearedAfterSequence = true;
        break;
      }
    }

    expect(sawRearAssaultState).toBe(true);
    expect(clearedAfterSequence).toBe(true);
  });
});
