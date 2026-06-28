import { describe, expect, it } from "vitest";
import type { GameData } from "./types.ts";
import {
  resolveAllPlayerApproachBattleX,
  resolvePlayerApproachBattleX,
  shouldSkipEngagedAutoApproach,
} from "./resolveApproachBattleX.ts";
import { updateUnitApproach } from "./combatPosition.ts";
import { isWithinSkillRange } from "./skills/rangeUtils.ts";
import {
  mockApproachCombatant as mockCombatant,
  mockApproachGameData,
} from "./testFixtures.ts";

const gameData = mockApproachGameData();

describe("resolvePlayerApproachBattleX", () => {
  it("applies contact cap to all on-field units regardless of formationRow", () => {
    const archer = mockCombatant({ id: "archer" });
    const frontMelee = mockCombatant({
      id: "melee",
      isEnemy: true,
      battleX: 280,
      traits: {
        rangePx: 0,
        damageType: "physical",
        basicAttackVfx: { enabled: true },
      },
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
      cooldowns: [],
    });
    const backRanged = mockCombatant({
      id: "ranged",
      isEnemy: true,
      battleX: 320,
      traits: {
        rangePx: 100,
        damageType: "physical",
        basicAttackVfx: { enabled: true },
      },
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
      cooldowns: [],
    });

    const approachX = resolvePlayerApproachBattleX(
      archer,
      [archer],
      [frontMelee, backRanged],
      gameData,
    );

    expect(approachX).toBe(280 - 100);
    expect(approachX).toBeLessThan(320 - 100);
  });

  it("front row clamp prevents advancing beyond the enemy front line", () => {
    const guard = mockCombatant({
      id: "guard",
      formationRow: "front",
      traits: {
        rangePx: 0,
        damageType: "physical",
        basicAttackVfx: { enabled: true },
      },
      cooldowns: [{ skillId: "basic_melee", remaining: 0, slotKind: "basic" }],
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const frontMelee = mockCombatant({
      id: "melee",
      isEnemy: true,
      battleX: 280,
      traits: {
        rangePx: 0,
        damageType: "physical",
        basicAttackVfx: { enabled: true },
      },
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
      cooldowns: [],
    });
    const backRanged = mockCombatant({
      id: "ranged",
      isEnemy: true,
      battleX: 320,
      traits: {
        rangePx: 100,
        damageType: "physical",
        basicAttackVfx: { enabled: true },
      },
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
      cooldowns: [],
    });

    const approachX = resolvePlayerApproachBattleX(
      guard,
      [guard],
      [frontMelee, backRanged],
      gameData,
    );

    expect(approachX).toBe(280 - 0);
  });

  it("melee band: front row separates by rangePx depth (L10)", () => {
    const guardian = mockCombatant({
      id: "guardian",
      role: "defender",
      formationRow: "front",
      battleX: 220,
      traits: {
        rangePx: 5,
        damageType: "physical",
        basicAttackVfx: { enabled: true },
      },
      cooldowns: [{ skillId: "basic_melee", remaining: 0, slotKind: "basic" }],
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const warrior = mockCombatant({
      id: "warrior",
      role: "attacker",
      formationRow: "front",
      battleX: 178,
      traits: {
        rangePx: 8,
        damageType: "physical",
        basicAttackVfx: { enabled: true },
      },
      cooldowns: [{ skillId: "basic_melee", remaining: 0, slotKind: "basic" }],
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const frontMelee = mockCombatant({
      id: "melee",
      isEnemy: true,
      battleX: 280,
      traits: {
        rangePx: 0,
        damageType: "physical",
        basicAttackVfx: { enabled: true },
      },
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
      cooldowns: [],
    });

    const guardianX = resolvePlayerApproachBattleX(
      guardian,
      [guardian, warrior],
      [frontMelee],
      gameData,
    );
    const warriorX = resolvePlayerApproachBattleX(
      warrior,
      [guardian, warrior],
      [frontMelee],
      gameData,
    );

    const guardianStop = 280 - 5;
    const warriorStop = 280 - 8;
    expect(guardianX).toBe(guardianStop);
    expect(warriorX).toBe(warriorStop);
    expect(guardianX - warriorX).toBe(3);
  });

  it("uses shared chase fallback when only melee frontline enemies exist", () => {
    const archer = mockCombatant({ id: "archer" });
    const frontMelee = mockCombatant({
      id: "melee",
      isEnemy: true,
      battleX: 280,
      traits: {
        rangePx: 0,
        damageType: "physical",
        basicAttackVfx: { enabled: true },
      },
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
      cooldowns: [],
    });

    const approachX = resolvePlayerApproachBattleX(
      archer,
      [archer],
      [frontMelee],
      gameData,
    );

    expect(approachX).toBe(280 - 100);
  });

  it("front row approaches ranged target after melee enemies are gone", () => {
    const guard = mockCombatant({
      id: "guard",
      formationRow: "front",
      traits: {
        rangePx: 0,
        damageType: "physical",
        basicAttackVfx: { enabled: true },
      },
      cooldowns: [{ skillId: "bow_basic", remaining: 0, slotKind: "basic" }],
    });
    const ranged = mockCombatant({
      id: "ranged",
      isEnemy: true,
      battleX: 280,
      traits: {
        rangePx: 100,
        damageType: "physical",
        basicAttackVfx: { enabled: true },
      },
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
      cooldowns: [],
    });

    const approachX = resolvePlayerApproachBattleX(
      guard,
      [guard],
      [ranged],
      gameData,
    );

    expect(approachX).toBe(280 - 100);
  });

  it("back row stops at skill range from target, not formation depth pull-forward", () => {
    const guard = mockCombatant({
      id: "guard",
      formationRow: "front",
      battleX: 200,
      traits: {
        rangePx: 0,
        damageType: "physical",
        basicAttackVfx: { enabled: true },
      },
      cooldowns: [{ skillId: "basic_melee", remaining: 0, slotKind: "basic" }],
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const enchanter = mockCombatant({
      id: "enchanter",
      formationRow: "back",
      battleX: 60,
      traits: {
        rangePx: 100,
        damageType: "magic",
        basicAttackVfx: { enabled: true },
      },
      cooldowns: [{ skillId: "bow_basic", remaining: 0, slotKind: "basic" }],
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const meleeEnemy = mockCombatant({
      id: "melee",
      isEnemy: true,
      battleX: 250,
      traits: {
        rangePx: 0,
        damageType: "physical",
        basicAttackVfx: { enabled: true },
      },
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
      cooldowns: [{ skillId: "basic_melee", remaining: 0, slotKind: "basic" }],
    });

    const approachX = resolvePlayerApproachBattleX(
      enchanter,
      [guard, enchanter],
      [meleeEnemy],
      gameData,
    );

    expect(approachX).toBe(250 - 100);
    expect(approachX).toBeLessThan(guard.battleX);
  });

  it("back row stopping battleX changes with attack range (120 vs 100)", () => {
    const guard = mockCombatant({
      id: "guard",
      formationRow: "front",
      battleX: 220,
      traits: {
        rangePx: 0,
        damageType: "physical",
        basicAttackVfx: { enabled: true },
      },
      cooldowns: [{ skillId: "basic_melee", remaining: 0, slotKind: "basic" }],
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const archer100 = mockCombatant({
      id: "archer100",
      formationRow: "back",
      battleX: 60,
      traits: {
        rangePx: 100,
        damageType: "physical",
        basicAttackVfx: { enabled: true },
      },
      cooldowns: [{ skillId: "bow_basic", remaining: 0, slotKind: "basic" }],
      build: {
        learnedPassiveIds: ["archer_passive"],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const archer120 = mockCombatant({
      id: "archer120",
      formationRow: "back",
      battleX: 60,
      traits: {
        rangePx: 120,
        damageType: "physical",
        basicAttackVfx: { enabled: true },
      },
      cooldowns: [{ skillId: "bow_basic", remaining: 0, slotKind: "basic" }],
      build: {
        learnedPassiveIds: ["archer_passive"],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const meleeEnemy = mockCombatant({
      id: "melee",
      isEnemy: true,
      battleX: 250,
      traits: {
        rangePx: 0,
        damageType: "physical",
        basicAttackVfx: { enabled: true },
      },
      cooldowns: [{ skillId: "basic_melee", remaining: 0, slotKind: "basic" }],
    });

    const traitsOnlyGameData = {
      ...gameData,
      skillRegistry: {
        ...gameData.skillRegistry,
        actives: {
          ...gameData.skillRegistry.actives,
          bow_basic: {
            ...gameData.skillRegistry.actives.bow_basic,
            effect: [
              {
                ...gameData.skillRegistry.actives.bow_basic.effect[0],
                range: undefined,
              },
            ],
          },
        },
      },
    } as unknown as GameData;

    const stop100 = resolvePlayerApproachBattleX(
      archer100,
      [guard, archer100],
      [meleeEnemy],
      traitsOnlyGameData,
    );
    const stop120 = resolvePlayerApproachBattleX(
      archer120,
      [guard, archer120],
      [meleeEnemy],
      traitsOnlyGameData,
    );

    expect(stop100).toBe(250 - 100);
    expect(stop120).toBe(250 - 120);
    expect(stop120).toBeLessThan(stop100);
  });

  it("back row stops at shorter equipped active range when skill is ready (sorcerer actives 50)", () => {
    const sorcererBasic = {
      id: "at_sorcerer_basic_attack",
      name: "魔弾",
      trigger: { kind: "time", value: 2 },
      effect: [
        {
          target: { kind: "distance", side: "enemy", order: "nearest" },
          type: "damage",
          amount: { kind: "atkBased", atkScale: 0.85 },
        },
      ],
    };
    const sorcererActive = {
      id: "at_sorcerer_active_1",
      name: "魔弾",
      trigger: { kind: "time", value: 8 },
      effect: [
        {
          target: { kind: "distance", side: "enemy", order: "nearest" },
          type: "damage",
          damageType: "magic",
          amount: { kind: "atkBased", atkScale: 1.4 },
          range: 50,
        },
      ],
    };
    const sorcererData = {
      skillRegistry: {
        passives: {},
        actives: {
          at_sorcerer_basic_attack: sorcererBasic,
          at_sorcerer_active_1: sorcererActive,
        },
      },
    } as unknown as GameData;
    const mage = mockCombatant({
      id: "mage",
      formationRow: "back",
      classId: "at_sorcerer",
      traits: {
        rangePx: 200,
        damageType: "magic",
        basicAttackVfx: { enabled: true },
      },
      battleX: 40,
      cooldowns: [
        {
          skillId: "at_sorcerer_basic_attack",
          remaining: 0,
          slotKind: "basic",
        },
        {
          skillId: "at_sorcerer_active_1",
          remaining: 0,
          slotKind: "active",
          slotIndex: 0,
        },
      ],
    });
    const meleeEnemy = mockCombatant({
      id: "melee",
      isEnemy: true,
      battleX: 280,
      traits: {
        rangePx: 0,
        damageType: "physical",
        basicAttackVfx: { enabled: true },
      },
      cooldowns: [{ skillId: "basic_melee", remaining: 0, slotKind: "basic" }],
    });

    const stop = resolvePlayerApproachBattleX(
      mage,
      [mage],
      [meleeEnemy],
      sorcererData,
    );
    expect(stop).toBe(280 - 50);
  });

  it("back row uses basic range while shorter active is on cooldown", () => {
    const sorcererBasic = {
      id: "at_sorcerer_basic_attack",
      name: "魔弾",
      trigger: { kind: "time", value: 2 },
      effect: [
        {
          target: { kind: "distance", side: "enemy", order: "nearest" },
          type: "damage",
          amount: { kind: "atkBased", atkScale: 0.85 },
        },
      ],
    };
    const sorcererActive = {
      id: "at_sorcerer_active_1",
      name: "魔弾",
      trigger: { kind: "time", value: 8 },
      effect: [
        {
          target: { kind: "distance", side: "enemy", order: "nearest" },
          type: "damage",
          damageType: "magic",
          amount: { kind: "atkBased", atkScale: 1.4 },
          range: 50,
        },
      ],
    };
    const sorcererData = {
      skillRegistry: {
        passives: {},
        actives: {
          at_sorcerer_basic_attack: sorcererBasic,
          at_sorcerer_active_1: sorcererActive,
        },
      },
    } as unknown as GameData;
    const mage = mockCombatant({
      id: "mage",
      formationRow: "back",
      classId: "at_sorcerer",
      traits: {
        rangePx: 200,
        damageType: "magic",
        basicAttackVfx: { enabled: true },
      },
      battleX: 40,
      cooldowns: [
        {
          skillId: "at_sorcerer_basic_attack",
          remaining: 0,
          slotKind: "basic",
        },
        {
          skillId: "at_sorcerer_active_1",
          remaining: 8,
          slotKind: "active",
          slotIndex: 0,
        },
      ],
    });
    const meleeEnemy = mockCombatant({
      id: "melee",
      isEnemy: true,
      battleX: 280,
      traits: {
        rangePx: 0,
        damageType: "physical",
        basicAttackVfx: { enabled: true },
      },
      cooldowns: [{ skillId: "basic_melee", remaining: 0, slotKind: "basic" }],
    });

    const stop = resolvePlayerApproachBattleX(
      mage,
      [mage],
      [meleeEnemy],
      sorcererData,
    );
    expect(stop).toBe(280 - 200);
  });

  it("back row does not retreat when already closer than approach stop", () => {
    const sorcererBasic = {
      id: "at_sorcerer_basic_attack",
      name: "魔弾",
      trigger: { kind: "time", value: 2 },
      effect: [
        {
          target: { kind: "distance", side: "enemy", order: "nearest" },
          type: "damage",
          amount: { kind: "atkBased", atkScale: 0.85 },
        },
      ],
    };
    const sorcererActive = {
      id: "at_sorcerer_active_1",
      name: "魔弾",
      trigger: { kind: "time", value: 8 },
      effect: [
        {
          target: { kind: "distance", side: "enemy", order: "nearest" },
          type: "damage",
          damageType: "magic",
          amount: { kind: "atkBased", atkScale: 1.4 },
          range: 50,
        },
      ],
    };
    const sorcererData = {
      skillRegistry: {
        passives: {},
        actives: {
          at_sorcerer_basic_attack: sorcererBasic,
          at_sorcerer_active_1: sorcererActive,
        },
      },
    } as unknown as GameData;
    const mage = mockCombatant({
      id: "mage",
      formationRow: "back",
      classId: "at_sorcerer",
      traits: {
        rangePx: 200,
        damageType: "magic",
        basicAttackVfx: { enabled: true },
      },
      battleX: 240,
      cooldowns: [
        {
          skillId: "at_sorcerer_basic_attack",
          remaining: 0,
          slotKind: "basic",
        },
        {
          skillId: "at_sorcerer_active_1",
          remaining: 0,
          slotKind: "active",
          slotIndex: 0,
        },
      ],
    });
    const meleeEnemy = mockCombatant({
      id: "melee",
      isEnemy: true,
      battleX: 280,
      traits: {
        rangePx: 0,
        damageType: "physical",
        basicAttackVfx: { enabled: true },
      },
      cooldowns: [{ skillId: "basic_melee", remaining: 0, slotKind: "basic" }],
    });

    const stop = resolvePlayerApproachBattleX(
      mage,
      [mage],
      [meleeEnemy],
      sorcererData,
    );
    expect(stop).toBe(240);
  });

  it("back row uses traits range when basic attack has no range field (sorcerer)", () => {
    const sorcererBasic = {
      id: "at_sorcerer_basic_attack",
      name: "魔弾",
      trigger: { kind: "time", value: 2 },
      effect: [
        {
          target: { kind: "distance", side: "enemy", order: "nearest" },
          type: "damage",
          amount: { kind: "atkBased", atkScale: 0.85 },
        },
      ],
    };
    const sorcererData = {
      skillRegistry: {
        passives: {},
        actives: { at_sorcerer_basic_attack: sorcererBasic },
      },
    } as unknown as GameData;
    const mage = mockCombatant({
      id: "mage",
      formationRow: "back",
      classId: "at_sorcerer",
      traits: {
        rangePx: 200,
        damageType: "magic",
        basicAttackVfx: { enabled: true },
      },
      battleX: 40,
      cooldowns: [
        {
          skillId: "at_sorcerer_basic_attack",
          remaining: 0,
          slotKind: "basic",
        },
      ],
    });
    const meleeEnemy = mockCombatant({
      id: "melee",
      isEnemy: true,
      battleX: 280,
      traits: {
        rangePx: 0,
        damageType: "physical",
        basicAttackVfx: { enabled: true },
      },
      cooldowns: [{ skillId: "basic_melee", remaining: 0, slotKind: "basic" }],
    });

    const stop = resolvePlayerApproachBattleX(
      mage,
      [mage],
      [meleeEnemy],
      sorcererData,
    );
    expect(stop).toBe(280 - 200);
  });

  it("approaches test_ranged when melee contact is gone", () => {
    const archer = mockCombatant({
      id: "archer",
      formationRow: "back",
      battleX: 80,
      traits: {
        rangePx: 100,
        damageType: "physical",
        basicAttackVfx: { enabled: true },
      },
      cooldowns: [{ skillId: "bow_basic", remaining: 0, slotKind: "basic" }],
    });
    const ranged = mockCombatant({
      id: "ranged",
      isEnemy: true,
      battleX: 320,
      traits: {
        rangePx: 100,
        damageType: "physical",
        basicAttackVfx: { enabled: true },
      },
      cooldowns: [{ skillId: "bow_basic", remaining: 0, slotKind: "basic" }],
    });

    const stop = resolvePlayerApproachBattleX(
      archer,
      [archer],
      [ranged],
      gameData,
    );
    expect(stop).toBe(220);
  });

  it("front row survivor inherits forward depth when same-range tank falls", () => {
    const meleeEnemy = mockCombatant({
      id: "melee",
      isEnemy: true,
      traits: {
        rangePx: 0,
        damageType: "physical",
        basicAttackVfx: { enabled: true },
      },
      battleX: 300,
      cooldowns: [{ skillId: "basic_melee", remaining: 0, slotKind: "basic" }],
    });
    const duelist = mockCombatant({
      id: "duelist",
      role: "defender",
      formationRow: "front",
      battleX: 220,
      isAlive: false,
      traits: {
        rangePx: 5,
        damageType: "physical",
        basicAttackVfx: { enabled: true },
      },
      cooldowns: [{ skillId: "basic_melee", remaining: 0, slotKind: "basic" }],
    });
    const assassin = mockCombatant({
      id: "assassin",
      role: "attacker",
      formationRow: "front",
      battleX: 200,
      traits: {
        rangePx: 5,
        damageType: "physical",
        basicAttackVfx: { enabled: true },
      },
      cooldowns: [{ skillId: "basic_melee", remaining: 0, slotKind: "basic" }],
    });
    const players = [duelist, assassin];

    const assassinX = resolvePlayerApproachBattleX(
      assassin,
      players,
      [meleeEnemy],
      gameData as unknown as GameData,
    );
    const soloForwardStop = 300 - 5 + 3;
    expect(assassinX).toBe(soloForwardStop);
  });

  it("same-range front row melee separates by id not role", () => {
    const meleeEnemy = mockCombatant({
      id: "melee",
      isEnemy: true,
      traits: {
        rangePx: 0,
        damageType: "physical",
        basicAttackVfx: { enabled: true },
      },
      battleX: 300,
      cooldowns: [{ skillId: "basic_melee", remaining: 0, slotKind: "basic" }],
    });
    const duelist = mockCombatant({
      id: "duelist",
      role: "defender",
      formationRow: "front",
      battleX: 100,
      traits: {
        rangePx: 5,
        damageType: "physical",
        basicAttackVfx: { enabled: true },
      },
      cooldowns: [{ skillId: "basic_melee", remaining: 0, slotKind: "basic" }],
    });
    const assassin = mockCombatant({
      id: "assassin",
      role: "attacker",
      formationRow: "front",
      battleX: 100,
      traits: {
        rangePx: 5,
        damageType: "physical",
        basicAttackVfx: { enabled: true },
      },
      cooldowns: [{ skillId: "basic_melee", remaining: 0, slotKind: "basic" }],
    });
    const players = [duelist, assassin];

    const duelistX = resolvePlayerApproachBattleX(
      duelist,
      players,
      [meleeEnemy],
      gameData as unknown as GameData,
    );
    const assassinX = resolvePlayerApproachBattleX(
      assassin,
      players,
      [meleeEnemy],
      gameData as unknown as GameData,
    );

    expect(assassinX).toBeLessThan(duelistX);
  });

  it("front row melee allies approach to per-unit range stop", () => {
    const meleeEnemy = mockCombatant({
      id: "melee",
      isEnemy: true,
      traits: {
        rangePx: 0,
        damageType: "physical",
        basicAttackVfx: { enabled: true },
      },
      battleX: 300,
      cooldowns: [{ skillId: "basic_melee", remaining: 0, slotKind: "basic" }],
    });
    const guardian = mockCombatant({
      id: "guardian",
      formationRow: "front",
      role: "defender",
      traits: {
        rangePx: 5,
        damageType: "physical",
        basicAttackVfx: { enabled: true },
      },
      battleX: 100,
      cooldowns: [{ skillId: "basic_melee", remaining: 0, slotKind: "basic" }],
    });
    const warrior = mockCombatant({
      id: "warrior",
      formationRow: "front",
      role: "attacker",
      traits: {
        rangePx: 8,
        damageType: "physical",
        basicAttackVfx: { enabled: true },
      },
      battleX: 100,
      cooldowns: [{ skillId: "basic_melee", remaining: 0, slotKind: "basic" }],
    });
    const players = [guardian, warrior];
    const enemies = [meleeEnemy];

    const guardStop = resolvePlayerApproachBattleX(
      guardian,
      players,
      enemies,
      gameData as unknown as GameData,
    );
    const warriorStop = resolvePlayerApproachBattleX(
      warrior,
      players,
      enemies,
      gameData as unknown as GameData,
    );

    expect(guardStop - warriorStop).toBe(3);
    expect(guardStop).toBeGreaterThan(guardian.battleX);
    expect(warriorStop).toBeGreaterThan(warrior.battleX);
  });

  describe("Phase 3d shared player approach matrix", () => {
    const roleSets = [
      ["D"],
      ["A"],
      ["S"],
      ["D", "A"],
      ["D", "S"],
      ["A", "S"],
      ["D", "A", "S"],
    ] as const;

    const enemyScenarios = [
      {
        name: "melee only",
        enemies: () => [enemy("melee", 280, 30)],
      },
      {
        name: "melee + test_ranged",
        enemies: () => [
          enemy("melee", 280, 30),
          enemy("test_ranged", 340, 100),
        ],
      },
      {
        name: "melee + test_ranged + test_to_ranged",
        enemies: () => [
          enemy("melee", 280, 30),
          enemy("test_ranged", 340, 100),
          enemy("test_to_ranged", 400, 300),
        ],
      },
      {
        name: "frontline wiped; test_to_ranged remains",
        enemies: () => [enemy("test_to_ranged", 400, 300)],
      },
    ] as const;

    function player(symbol: "D" | "A" | "S") {
      const common = {
        build: {
          learnedPassiveIds: [],
          learnedActiveIds: [],
          equippedActiveSlots: [],
        },
        cooldowns: [
          { skillId: "basic_melee", remaining: 0, slotKind: "basic" as const },
        ],
      };
      if (symbol === "D") {
        return mockCombatant({
          ...common,
          id: "defender",
          role: "defender",
          formationRow: "front",
          battleX: 100,
          traits: {
            rangePx: 5,
            damageType: "physical",
            basicAttackVfx: { enabled: true },
          },
        });
      }
      if (symbol === "A") {
        return mockCombatant({
          ...common,
          id: "attacker",
          role: "attacker",
          formationRow: "front",
          battleX: 92,
          traits: {
            rangePx: 8,
            damageType: "physical",
            basicAttackVfx: { enabled: true },
          },
        });
      }
      return mockCombatant({
        ...common,
        id: "supporter",
        role: "supporter",
        formationRow: "back",
        battleX: 60,
        traits: {
          rangePx: 100,
          damageType: "magic",
          basicAttackVfx: { enabled: true },
        },
        cooldowns: [{ skillId: "bow_basic", remaining: 0, slotKind: "basic" }],
      });
    }

    function enemy(id: string, battleX: number, rangePx: number) {
      return mockCombatant({
        id,
        isEnemy: true,
        battleX,
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
        cooldowns: [
          { skillId: "basic_melee", remaining: 0, slotKind: "basic" },
        ],
      });
    }

    it.each(roleSets)(
      "keeps shared approach invariants for roles %s",
      (...roles) => {
        for (const scenario of enemyScenarios) {
          const players = roles.map(player);
          const enemies = scenario.enemies();
          const targets = resolveAllPlayerApproachBattleX(
            players,
            enemies,
            gameData as unknown as GameData,
          );
          const livingEnemyMaxX = Math.max(
            ...enemies.map((unit) => unit.battleX),
          );

          for (const unit of players) {
            const target = targets.get(unit.id);
            expect(target, scenario.name).toBeDefined();
            expect(target!).toBeGreaterThanOrEqual(unit.battleX);
            expect(target!).toBeLessThanOrEqual(livingEnemyMaxX);

            const beforeX = unit.battleX;
            updateUnitApproach(unit, target!, 2);
            expect(Math.abs(unit.battleX - beforeX)).toBeLessThanOrEqual(2);

            const skip = shouldSkipEngagedAutoApproach(
              unit,
              players,
              enemies,
              gameData as unknown as GameData,
            );
            const anyEnemyInApproachRange = enemies.some((targetEnemy) =>
              isWithinSkillRange(unit, targetEnemy, unit.traits.rangePx),
            );
            expect(skip).toBe(anyEnemyInApproachRange);
          }

          const frontTargets = players
            .filter((unit) => unit.formationRow === "front")
            .map((unit) => targets.get(unit.id) ?? unit.battleX);
          if (frontTargets.length > 0) {
            expect(Math.max(...frontTargets)).toBeLessThanOrEqual(
              livingEnemyMaxX,
            );
          }
        }
      },
    );
  });
});
