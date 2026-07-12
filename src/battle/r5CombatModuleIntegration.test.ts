/**
 * R5g — combat module vertical slice: load → registry → party/enemy selection → BattleEngine tick → SkillExecutor.
 *
 * Production path: loadGameData, PartyCombatModuleSelection, createAlliesFromPartyState,
 * createEnemiesForStage, BattleEngine (training fast-start fixture stage).
 *
 * Omitted production boundaries (fixture only):
 * - Custom stage `r5_integration_test` injected into cloned gameData (production stages.json unchanged).
 * - Post-engage HP/ATK patch on combatants to prevent premature battle end (balance values untouched).
 */
import { describe, expect, it, beforeEach } from 'vitest';
import levelCurvesJson from '../../data/levelCurves.json';
import classesJson from '../../data/classes.json';
import enemiesJson from '../../data/enemies.json';
import partiesJson from '../../data/parties.json';
import stagesDemoJson from '../../data/stages-demo.json';
import { BattleEngine } from './BattleEngine.ts';
import { getEffectiveAttackSpeedMultiplier } from './combatMath.ts';
import { loadGameData } from './data/loadGameData.ts';
import { parseAndValidateGameDataJson } from './data/validateGameData.ts';
import {
  createAlliesFromPartyState,
  createEnemiesForStage,
  PartyDuplicateClassError,
  resetEntityIdCounter,
} from './entities.ts';
import { expandEnemyGroups } from './enemyGroupSpawn.ts';
import { loadLevelCurves } from '../progression/levelGrowth.ts';
import { PartyCombatModuleSelection } from './partyCombatModuleSelection.ts';
import { asBattleEngineInternals } from './test/battleFieldSpec.harness.ts';
import { createDefaultSave } from '../progression/victoryRewards.ts';
import type {
  ActiveSkillDef,
  BattleEvent,
  ClassId,
  CombatModuleDef,
  GameData,
  PassiveSkillDef,
  PartySlotState,
  StageDef,
  StatusEffect,
} from './types.ts';
import { R5_COMBAT_MODULE_CLASS_IDS } from './types.ts';

const levelCurves = loadLevelCurves(levelCurvesJson);
const TICK_DT = 0.1;

const R5_STAGE_ID = 'r5_integration_test';

const ALLY_MODULE_BY_SLOT: Record<number, string | undefined> = {
  0: 'df_guardian_mod_guard_focus',
  1: undefined,
  2: 'at_sorcerer_mod_twin_bolt',
  3: 'sp_cleric_mod_party_mend',
};

const ALLY_CLASS_BY_SLOT: ClassId[] = [
  'df_guardian',
  'at_swordsman',
  'at_sorcerer',
  'sp_cleric',
];

const MODULE_B_BY_CLASS: Record<string, string> = {
  df_guardian: 'df_guardian_mod_guard_focus',
  at_swordsman: 'at_swordsman_mod_pierce_slash',
  at_sorcerer: 'at_sorcerer_mod_twin_bolt',
  sp_cleric: 'sp_cleric_mod_party_mend',
};

const passiveModules = import.meta.glob<PassiveSkillDef[]>(
  '../../data/skills/passives/*.json',
  { eager: true, import: 'default' },
);

const activeModules = import.meta.glob<ActiveSkillDef[]>(
  '../../data/skills/actives/*.json',
  { eager: true, import: 'default' },
);

const combatModuleFiles = import.meta.glob<CombatModuleDef[]>(
  '../../data/combat-modules/*.json',
  { eager: true, import: 'default' },
);

function mockMember(classId: ClassId) {
  return {
    classId,
    build: {
      learnedPassiveIds: [] as string[],
      learnedActiveIds: [] as string[],
      equippedActiveSlots: [] as (string | null)[],
    },
    progress: { level: 10, exp: 0 },
  };
}

function buildR5IntegrationStage(): StageDef {
  return {
    id: R5_STAGE_ID,
    displayName: 'R5 Integration',
    recommendedLevel: 10,
    enemyGroups: [
      {
        classId: 'df_guardian',
        count: 1,
        selectedCombatModuleId: 'df_guardian_mod_nearest_strike',
        atkScale: 0.05,
        hpScale: 50,
      },
      {
        classId: 'at_sorcerer',
        count: 1,
        selectedCombatModuleId: 'at_sorcerer_mod_twin_bolt',
        atkScale: 0.05,
        hpScale: 50,
      },
      {
        classId: 'at_swordsman',
        count: 1,
        atkScale: 0.05,
        hpScale: 50,
      },
      {
        classId: 'at_swordsman',
        count: 2,
        selectedCombatModuleId: 'at_swordsman_mod_pierce_slash',
        atkScale: 0.05,
        hpScale: 50,
      },
      {
        classId: 'df_paladin',
        count: 1,
        atkScale: 0.05,
        hpScale: 50,
      },
    ],
    waves: [
      {
        enemies: [{ templateId: 'test_dummy', spawnX: 0 }],
      },
    ],
  };
}

function buildIntegrationGameData(): GameData {
  const gameData = structuredClone(loadGameData());
  const stage = buildR5IntegrationStage();
  gameData.stages = [
    ...gameData.stages.filter((s) => s.id !== R5_STAGE_ID),
    stage,
  ];
  return gameData;
}

function buildIntegrationParty(): PartySlotState[] {
  return ALLY_CLASS_BY_SLOT.map((classId) => mockMember(classId));
}

function createIntegrationSelection(): PartyCombatModuleSelection {
  const selection = new PartyCombatModuleSelection();
  selection.setSelectedCombatModuleId(0, ALLY_MODULE_BY_SLOT[0]!);
  selection.setSelectedCombatModuleId(2, ALLY_MODULE_BY_SLOT[2]!);
  selection.setSelectedCombatModuleId(3, ALLY_MODULE_BY_SLOT[3]!);
  return selection;
}

function stabilizeCombatantsForLongRun(
  players: ReturnType<typeof createAlliesFromPartyState>,
  enemies: ReturnType<typeof createEnemiesForStage>,
): void {
  for (const unit of [...players, ...enemies]) {
    unit.maxHp = 50_000;
    unit.hp = 50_000;
    if (unit.isEnemy) {
      unit.atk = Math.max(1, Math.round(unit.atk * 0.05));
    }
  }
}

function withAttackSpeedEffect(
  unit: { statusEffects: StatusEffect[]; id: string },
  effect: Pick<StatusEffect, 'multiplier' | 'kind'>,
): void {
  unit.statusEffects.push({
    id: 'test_attack_speed',
    kind: effect.kind,
    stat: 'attackSpeed',
    multiplier: effect.multiplier,
    durationSec: 999,
    remainingSec: 999,
    sourceId: unit.id,
  });
}

function loadValidateBundle() {
  return {
    classes: classesJson,
    skills: {
      passives: Object.values(passiveModules).flat(),
      actives: Object.values(activeModules).flat(),
    },
    combatModules: Object.values(combatModuleFiles).flat(),
    enemies: enemiesJson,
    stages: stagesDemoJson,
    parties: partiesJson,
  };
}

function createIntegrationEngine(
  gameData: GameData,
  party: PartySlotState[],
  selection: PartyCombatModuleSelection,
): BattleEngine {
  const save = createDefaultSave(gameData, 'demo');
  save.party = party;
  save.stageProgress.currentStageId = R5_STAGE_ID;
  return new BattleEngine(gameData, levelCurves, () => save.party, () => R5_STAGE_ID, {
    getSelectedCombatModuleId: (slotIndex) =>
      selection.getSelectedCombatModuleId(slotIndex),
  });
}

function runEngagedBattleTicks(
  engine: BattleEngine,
  maxTicks: number,
): {
  events: BattleEvent[];
  battleTimeSec: number;
  engaged: boolean;
  basicFireTimes: Map<string, number>;
} {
  engine.startBattle();
  const internals = asBattleEngineInternals(engine);
  stabilizeCombatantsForLongRun(internals.players, internals.enemies);
  internals.players[0]!.hp = Math.floor(internals.players[0]!.maxHp * 0.4);

  const events: BattleEvent[] = [];
  const basicFireTimes = new Map<string, number>();
  engine.onEvent((event) => {
    events.push(event);
    if (event.type === 'skill' && event.slotKind === 'basic') {
      const key = `${event.actorId}:${event.skillId}`;
      if (!basicFireTimes.has(key)) {
        basicFireTimes.set(key, engine.getBattleTimeSec());
      }
    }
  });

  let battleTimeSec = 0;
  let engaged = false;
  for (let i = 0; i < maxTicks; i++) {
    engine.tick(TICK_DT);
    const snap = engine.getSnapshot();
    battleTimeSec = engine.getBattleTimeSec();
    engaged = snap.engaged;
    if (!snap.engaged && snap.phase !== 'running') break;
  }
  return { events, battleTimeSec, engaged, basicFireTimes };
}

describe('R5 combat module integration (R5g)', () => {
  beforeEach(() => {
    resetEntityIdCounter();
  });

  it('1-7: load, registry, party generation, ally/enemy module resolution', () => {
    const gameData = loadGameData();
    const moduleIds = Object.keys(gameData.combatModuleRegistry);
    expect(moduleIds).toHaveLength(8);

    for (const classId of R5_COMBAT_MODULE_CLASS_IDS) {
      const preset = gameData.classRegistry[classId]!;
      expect(preset.combatModuleIds).toHaveLength(2);
      for (const moduleId of preset.combatModuleIds!) {
        expect(gameData.combatModuleRegistry[moduleId]).toBeDefined();
        expect(gameData.skillRegistry.actives[moduleId]).toBeDefined();
      }
    }

    const party = buildIntegrationParty();
    const selection = createIntegrationSelection();
    const allies = createAlliesFromPartyState(
      gameData,
      party,
      levelCurves,
      (slotIndex) => selection.getSelectedCombatModuleId(slotIndex),
    );
    expect(allies).toHaveLength(4);
    expect(new Set(allies.map((a) => a.classId)).size).toBe(4);

    expect(allies[0]?.cooldowns.find((cd) => cd.slotKind === 'basic')?.skillId).toBe(
      'df_guardian_mod_guard_focus',
    );
    expect(allies[1]?.cooldowns.find((cd) => cd.slotKind === 'basic')?.skillId).toBe(
      'at_swordsman_mod_single_slash',
    );
    expect(allies[2]?.cooldowns.find((cd) => cd.slotKind === 'basic')?.skillId).toBe(
      'at_sorcerer_mod_twin_bolt',
    );
    expect(allies[3]?.cooldowns.find((cd) => cd.slotKind === 'basic')?.skillId).toBe(
      'sp_cleric_mod_party_mend',
    );

    const stage = buildR5IntegrationStage();
    const fixtureData = buildIntegrationGameData();
    const enemies = createEnemiesForStage(
      fixtureData,
      R5_STAGE_ID,
      0,
      levelCurves,
    )!;
    expect(enemies).toHaveLength(6);

    const byBasicSkill = (enemy: (typeof enemies)[number]) =>
      enemy.cooldowns.find((cd) => cd.slotKind === 'basic')?.skillId;

    const guardianA = enemies.find((e) => e.classId === 'df_guardian');
    const sorcererB = enemies.find(
      (e) => e.classId === 'at_sorcerer' && byBasicSkill(e) === 'at_sorcerer_mod_twin_bolt',
    );
    const swordsmanDefault = enemies.find(
      (e) =>
        e.classId === 'at_swordsman' &&
        byBasicSkill(e) === 'at_swordsman_mod_single_slash',
    );
    const swordsmanPierce = enemies.filter(
      (e) => byBasicSkill(e) === 'at_swordsman_mod_pierce_slash',
    );
    const legacyPaladin = enemies.find((e) => e.classId === 'df_paladin');

    expect(byBasicSkill(guardianA!)).toBe('df_guardian_mod_nearest_strike');
    expect(byBasicSkill(sorcererB!)).toBe('at_sorcerer_mod_twin_bolt');
    expect(byBasicSkill(swordsmanDefault!)).toBe('at_swordsman_mod_single_slash');
    expect(swordsmanPierce).toHaveLength(2);
    expect(byBasicSkill(legacyPaladin!)).toBe('df_paladin_basic_attack');

    const specs = expandEnemyGroups(stage);
    const pierceSpecs = specs.filter(
      (s) => s.selectedCombatModuleId === 'at_swordsman_mod_pierce_slash',
    );
    expect(pierceSpecs).toHaveLength(2);
    expect(
      specs.find((s) => s.classId === 'at_swordsman' && s.selectedCombatModuleId === undefined),
    ).toBeDefined();
  });

  it('8-15: BattleEngine vertical slice — damage, heal, multi-target, intervals, legacy, no double-fire', () => {
    const gameData = buildIntegrationGameData();
    const party = buildIntegrationParty();
    const selection = createIntegrationSelection();
    const engine = createIntegrationEngine(gameData, party, selection);

    const internalsBeforeInterval = asBattleEngineInternals(engine);
    const allySwordsmanId = internalsBeforeInterval.players.find(
      (p) => p.classId === 'at_swordsman',
    )!.id;
    const allyGuardianId = internalsBeforeInterval.players.find(
      (p) => p.classId === 'df_guardian',
    )!.id;
    const allyClericId = internalsBeforeInterval.players.find(
      (p) => p.classId === 'sp_cleric',
    )!.id;

    const { events, battleTimeSec, engaged, basicFireTimes } = runEngagedBattleTicks(
      engine,
      500,
    );

    expect(engaged).toBe(true);
    expect(battleTimeSec).toBeGreaterThan(8);

    const basicSkillEvents = events.filter(
      (e): e is Extract<BattleEvent, { type: 'skill' }> =>
        e.type === 'skill' && e.slotKind === 'basic',
    );

    const physicalDamage = basicSkillEvents.filter(
      (e) =>
        e.effect === 'damage' &&
        (e.skillId.startsWith('df_guardian_') ||
          e.skillId.startsWith('at_swordsman_')),
    );
    const magicDamage = basicSkillEvents.filter(
      (e) => e.effect === 'damage' && e.skillId.startsWith('at_sorcerer_'),
    );
    const allyHeals = basicSkillEvents.filter(
      (e) => e.effect === 'heal' && e.skillId === 'sp_cleric_mod_party_mend',
    );

    expect(physicalDamage.length).toBeGreaterThan(0);
    expect(magicDamage.length).toBeGreaterThan(0);
    expect(allyHeals.length).toBeGreaterThan(0);

    const twinBoltHits = basicSkillEvents.filter(
      (e) => e.skillId === 'at_sorcerer_mod_twin_bolt' && e.effect === 'damage',
    );
    expect(twinBoltHits.length).toBeGreaterThanOrEqual(2);

    const partyMendHeals = basicSkillEvents.filter(
      (e) => e.skillId === 'sp_cleric_mod_party_mend' && e.effect === 'heal',
    );
    expect(partyMendHeals.length).toBeGreaterThanOrEqual(2);

    const legacyBasic = basicSkillEvents.filter(
      (e) => e.skillId === 'df_paladin_basic_attack',
    );
    expect(legacyBasic.length).toBeGreaterThan(0);

    const swordsmanFirstTime = [...basicFireTimes.entries()].find(([key]) =>
      key.startsWith(`${allySwordsmanId}:`),
    )?.[1];
    const guardianFirstTime = [...basicFireTimes.entries()].find(([key]) =>
      key.startsWith(`${allyGuardianId}:`),
    )?.[1];
    const clericFirstTime = [...basicFireTimes.entries()].find(([key]) =>
      key.startsWith(`${allyClericId}:sp_cleric_mod_party_mend`),
    )?.[1];
    expect(swordsmanFirstTime).toBeDefined();
    expect(guardianFirstTime).toBeDefined();
    expect(clericFirstTime).toBeDefined();
    if (
      swordsmanFirstTime !== undefined &&
      guardianFirstTime !== undefined &&
      clericFirstTime !== undefined
    ) {
      expect(swordsmanFirstTime).toBeLessThan(guardianFirstTime);
      expect(guardianFirstTime).toBeLessThan(clericFirstTime);
    }

    const internals = asBattleEngineInternals(engine);
    const firedPerActor = new Map<string, Set<string>>();
    for (const [key, timeSec] of basicFireTimes) {
      const [actorId, skillId] = key.split(':');
      const bucket = `${timeSec.toFixed(1)}:${actorId}`;
      const set = firedPerActor.get(bucket) ?? new Set();
      set.add(skillId!);
      firedPerActor.set(bucket, set);
    }
    for (const skillIds of firedPerActor.values()) {
      expect(skillIds.size).toBe(1);
      const id = [...skillIds][0]!;
      const isModule = gameData.combatModuleRegistry[id] !== undefined;
      const isLegacy = id.endsWith('_basic_attack');
      expect(isModule || isLegacy).toBe(true);
    }

    const allySorcerer = internals.players.find((p) => p.classId === 'at_sorcerer');
    const enemyPaladin = internals.enemies.find((e) => e.classId === 'df_paladin');
    expect(
      allySorcerer?.cooldowns.find((cd) => cd.slotKind === 'basic')?.skillId,
    ).toBe('at_sorcerer_mod_twin_bolt');
    expect(
      enemyPaladin?.cooldowns.find((cd) => cd.slotKind === 'basic')?.skillId,
    ).toBe('df_paladin_basic_attack');
    expect(
      internals.enemies.some((e) => e.classId === 'df_guardian') &&
        internals.players.some((p) => p.classId === 'df_guardian'),
    ).toBe(true);
  });

  it('12-14: module basic tier-independent; attackSpeed buff applies; legacy uses tier', () => {
    const gameData = buildIntegrationGameData();
    const engine = createIntegrationEngine(
      gameData,
      buildIntegrationParty(),
      createIntegrationSelection(),
    );
    engine.startBattle();
    const internals = asBattleEngineInternals(engine);

    const swordsman = internals.players.find((p) => p.classId === 'at_swordsman')!;
    const basicCd = swordsman.cooldowns.find((cd) => cd.slotKind === 'basic')!;
    basicCd.remaining = 3;
    withAttackSpeedEffect(swordsman, { kind: 'buff', multiplier: 1.5 });
    expect(getEffectiveAttackSpeedMultiplier(swordsman)).toBeCloseTo(1.5);

    (
      engine as unknown as {
        tickCooldowns: (units: typeof internals.players, dt: number) => void;
      }
    ).tickCooldowns([swordsman], 1);
    expect(basicCd.remaining).toBeCloseTo(3 - 1.5);

    const legacyEnemy = internals.enemies.find((e) => e.classId === 'df_paladin');
    if (legacyEnemy) {
      const legacyCd = legacyEnemy.cooldowns.find((cd) => cd.slotKind === 'basic')!;
      legacyCd.remaining = 5;
      const before = legacyCd.remaining;
      (
        engine as unknown as {
          tickCooldowns: (units: typeof internals.enemies, dt: number) => void;
        }
      ).tickCooldowns([legacyEnemy], 1);
      expect(legacyCd.remaining).toBeLessThan(before);
      expect(legacyCd.remaining).not.toBeCloseTo(before - 1.5);
    }

    const moduleInterval =
      gameData.combatModuleRegistry.at_swordsman_mod_single_slash.attackIntervalSec;
    expect(moduleInterval).toBe(2.5);
    expect(
      gameData.skillRegistry.actives.at_swordsman_mod_single_slash?.trigger.value,
    ).toBe(moduleInterval);
  });

  it('16-17: duplicate ally party rejected; duplicate enemy class allowed', () => {
    const gameData = loadGameData();
    const duplicateParty: PartySlotState[] = [
      mockMember('df_guardian'),
      mockMember('df_guardian'),
      mockMember('at_sorcerer'),
      mockMember('sp_cleric'),
    ];
    expect(() =>
      createAlliesFromPartyState(gameData, duplicateParty, levelCurves),
    ).toThrow(PartyDuplicateClassError);

    const enemies = createEnemiesForStage(
      buildIntegrationGameData(),
      R5_STAGE_ID,
      0,
      levelCurves,
    )!;
    const swordsmanCount = enemies.filter((e) => e.classId === 'at_swordsman').length;
    expect(swordsmanCount).toBe(3);
  });

  it('18-20: validate rejects bad enemy module; runtime fallback; ally/enemy isolation', () => {
    const bundle = loadValidateBundle();
    expect(() =>
      parseAndValidateGameDataJson({
        ...bundle,
        stages: [
          {
            id: 'bad_enemy_module',
            displayName: 'bad',
            recommendedLevel: 10,
            enemyGroups: [
              {
                classId: 'df_guardian',
                count: 1,
                selectedCombatModuleId: 'missing_module_id',
              },
            ],
            waves: [{ enemies: [] }],
          },
        ],
      }),
    ).toThrow(/Unknown selectedCombatModuleId/);

    const gameData = loadGameData();
    const clericAlly = createAlliesFromPartyState(
      gameData,
      [mockMember('sp_cleric')],
      levelCurves,
      () => 'df_guardian_mod_guard_focus',
    )[0]!;
    expect(clericAlly.cooldowns.find((cd) => cd.slotKind === 'basic')?.skillId).toBe(
      'sp_cleric_mod_single_mend',
    );

    const selection = createIntegrationSelection();
    const enemyOnly = createEnemiesForStage(
      buildIntegrationGameData(),
      R5_STAGE_ID,
      0,
      levelCurves,
    )!;
    const sorcererEnemy = enemyOnly.find((e) => e.classId === 'at_sorcerer')!;
    expect(
      sorcererEnemy.cooldowns.find((cd) => cd.slotKind === 'basic')?.skillId,
    ).toBe('at_sorcerer_mod_twin_bolt');
    expect(selection.getSelectedCombatModuleId(2)).toBe('at_sorcerer_mod_twin_bolt');

    const allies = createAlliesFromPartyState(
      gameData,
      buildIntegrationParty(),
      levelCurves,
      (slotIndex) => selection.getSelectedCombatModuleId(slotIndex),
    );
    const allySorcerer = allies.find((a) => a.classId === 'at_sorcerer')!;
    expect(
      allySorcerer.cooldowns.find((cd) => cd.slotKind === 'basic')?.skillId,
    ).toBe('at_sorcerer_mod_twin_bolt');
    expect(
      sorcererEnemy.cooldowns.find((cd) => cd.slotKind === 'basic')?.skillId,
    ).toBe('at_sorcerer_mod_twin_bolt');
  });

  it('16b: duplicate rejection at compose API (thin wire; full coverage in partyClassDuplicate.test.ts)', () => {
    const party = buildIntegrationParty();
    const duplicateParty: PartySlotState[] = [
      party[0],
      mockMember('df_guardian'),
      party[2],
      party[3],
    ];
    expect(() =>
      createAlliesFromPartyState(loadGameData(), duplicateParty, levelCurves),
    ).toThrow(PartyDuplicateClassError);
  });

  it('covers module B intervals in initial cooldown after BattleEngine spawn', () => {
    const gameData = buildIntegrationGameData();
    const selection = createIntegrationSelection();
    const engine = createIntegrationEngine(
      gameData,
      buildIntegrationParty(),
      selection,
    );
    engine.startBattle();
    const internals = asBattleEngineInternals(engine);

    const guardian = internals.players.find((p) => p.classId === 'df_guardian')!;
    const cleric = internals.players.find((p) => p.classId === 'sp_cleric')!;
    expect(
      guardian.cooldowns.find((cd) => cd.slotKind === 'basic')?.remaining,
    ).toBe(gameData.combatModuleRegistry.df_guardian_mod_guard_focus.attackIntervalSec);
    expect(
      cleric.cooldowns.find((cd) => cd.slotKind === 'basic')?.remaining,
    ).toBe(gameData.combatModuleRegistry.sp_cleric_mod_party_mend.attackIntervalSec);

    for (const classId of R5_COMBAT_MODULE_CLASS_IDS) {
      const preset = gameData.classRegistry[classId]!;
      expect(preset.combatModuleIds?.[1]).toBe(MODULE_B_BY_CLASS[classId]);
    }
  });
});
