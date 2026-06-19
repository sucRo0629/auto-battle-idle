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

  it("returns toward nearest player after backstab toAnchor step", () => {
    const engine = createAssassinFrontEngine();
    reachWave2Engage(engine);
    const internal = asBattleEngineInternals(engine);
    const assassin = internal.players.find((p) => p.name === "双刃士")!;
    const activeCd = assassin.cooldowns.find(
      (cd) => cd.skillId === "at_assassin_active_2"
    );
    activeCd!.remaining = 0;

    const startX = assassin.battleX;
    let peakX = assassin.battleX;
    let returnedTowardEngage = false;

    for (let t = 0; t < 900; t++) {
      engine.tick(TICK_DT);
      peakX = Math.max(peakX, assassin.battleX);
      if (peakX > startX + 50 && assassin.battleX < peakX - 20) {
        returnedTowardEngage = true;
        break;
      }
    }

    expect(peakX).toBeGreaterThan(startX + 50);
    expect(returnedTowardEngage).toBe(true);
  });

  it("waits after damage before engage clamp pulls actor back", () => {
    const engine = createAssassinFrontEngine();
    reachWave2Engage(engine);
    const internal = asBattleEngineInternals(engine);
    const assassin = internal.players.find((p) => p.name === "双刃士")!;
    const activeCd = assassin.cooldowns.find(
      (cd) => cd.skillId === "at_assassin_active_2"
    );
    activeCd!.remaining = 0;

    const startX = assassin.battleX;
    let peakX = assassin.battleX;
    let peakTick = -1;
    let returnStartTick = -1;

    for (let t = 0; t < 120; t++) {
      engine.tick(TICK_DT);
      if (assassin.battleX > peakX + 0.5) {
        peakX = assassin.battleX;
        peakTick = t;
      }
      if (
        peakTick >= 0 &&
        returnStartTick < 0 &&
        assassin.battleX < peakX - 3
      ) {
        returnStartTick = t;
        break;
      }
    }

    expect(peakX).toBeGreaterThan(startX + 50);
    expect(returnStartTick).toBeGreaterThan(peakTick);
    expect(returnStartTick - peakTick).toBeGreaterThanOrEqual(28);
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
    for (let t = 0; t < 900; t++) {
      engine.tick(TICK_DT);
      if (
        internal.skillSequenceRunner.isActorInSkillMotion(assassin.id) &&
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

    expect(behindDuringWait).toBe(true);
  });
});
