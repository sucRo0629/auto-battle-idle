import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { evaluateCondition } from "./skills/effectConditions.ts";
import { resolveEffectResolution } from "./skills/targeting.ts";
import type { ActiveSkillDef, CombatantState, GameData } from "./types.ts";

function mockDuelist(battleX: number): CombatantState {
  return {
    id: "duelist",
    name: "duelist",
    hp: 100,
    maxHp: 100,
    barrierHp: 0,
    atk: 10,
    def: 5,
    res: 0,
    isAlive: true,
    role: "defender",
    classId: "df_duelist",
    formationRow: "front",
    traits: {
      rangePx: 30,
      damageType: "physical",
      basicAttackVfx: { enabled: true },
    },
    build: {
      learnedPassiveIds: [],
      learnedActiveIds: [],
      equippedActiveSlots: [],
    },
    cooldowns: [
      {
        skillId: "df_duelist_active_2",
        remaining: 0,
        slotKind: "active",
        slotIndex: 0,
      },
    ],
    statusEffects: [],
    spriteKey: "df_duelist",
    iconKey: "df_duelist",
    isEnemy: false,
    battleX,
    corpseVisible: true,
  };
}

function mockEnemy(
  id: string,
  battleX: number,
  rangePx: number,
): CombatantState {
  return {
    id,
    name: id,
    hp: 100,
    maxHp: 100,
    barrierHp: 0,
    atk: 10,
    def: 5,
    res: 0,
    isAlive: true,
    role: "attacker",
    classId: "test",
    formationRow: "front",
    traits: {
      rangePx,
      damageType: "physical",
      basicAttackVfx: { enabled: true },
    },
    build: {
      learnedPassiveIds: [],
      learnedActiveIds: [],
      equippedActiveSlots: [],
    },
    cooldowns: [],
    statusEffects: [],
    spriteKey: "enemy",
    iconKey: "enemy",
    isEnemy: true,
    battleX,
    corpseVisible: true,
  };
}

function loadReelInSkill(): ActiveSkillDef {
  const actives = JSON.parse(
    readFileSync("data/skills/actives/df_duelist.json", "utf8"),
  ) as ActiveSkillDef[];
  const skill = actives.find((entry) => entry.id === "df_duelist_active_2");
  if (!skill) throw new Error("df_duelist_active_2 not found");
  return skill;
}

function buildGameData(skill: ActiveSkillDef): GameData {
  return {
    stages: [],
    enemyRegistry: {},
    classRegistry: {},
    skillRegistry: {
      actives: { [skill.id]: skill },
      passives: {},
    },
  } as unknown as GameData;
}

describe("df_duelist_active_2 誘い込み", () => {
  const skill = loadReelInSkill();
  const gameData = buildGameData(skill);
  const reelInEffect = skill.effect[0]!;

  it("targets ranged enemy when melee is closer on the front line", () => {
    const duelist = mockDuelist(50);
    const melee = mockEnemy("melee", 120, 30);
    const ranged = mockEnemy("ranged", 250, 100);
    const enemies = [melee, ranged];

    const reelIn = resolveEffectResolution(
      reelInEffect,
      duelist,
      [duelist],
      enemies,
      gameData,
    );

    expect(reelIn?.waves[0]?.targets[0]?.unit.id).toBe("ranged");
  });

  it("does not resolve debuff against melee-only waves", () => {
    const duelist = mockDuelist(50);
    const melee = mockEnemy("melee", 120, 30);
    const enemies = [melee];

    expect(
      resolveEffectResolution(
        reelInEffect,
        duelist,
        [duelist],
        enemies,
        gameData,
      ),
    ).toBeNull();
  });

  it("smart fire waits until an enemy is within range", () => {
    const duelist = mockDuelist(50);
    const meleeOutOfRange = mockEnemy("melee", 400, 30);
    const rangedInRange = mockEnemy("ranged", 75, 100);
    const fireCondition = skill.fireConditions?.[0];
    expect(fireCondition?.kind).toBe("enemyCount");
    expect(fireCondition).toMatchObject({
      kind: "enemyCount",
      min: 1,
      scope: "inRange",
    });

    const ctx = {
      actor: duelist,
      allies: [duelist],
      enemies: [meleeOutOfRange],
      passives: [],
      gameData,
    };
    expect(evaluateCondition(ctx, fireCondition!)).toBe(false);

    ctx.enemies = [meleeOutOfRange, rangedInRange];
    expect(evaluateCondition(ctx, fireCondition!)).toBe(true);
  });
});
