/**
 * R12g-d5 — Survival 4 兵科 CombatModule 共通統合確認。
 *
 * 経路: loadGameData → PartyCombatModuleSelection / OperationState →
 * createAlliesFromPartyState / BattleEngine → SkillExecutor / targeting。
 * 個別 unit test の重複ではなく、Module 選択・排他・Wave 切替・支援 no-op・敵味方対称を固定する。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import levelCurvesJson from '../../data/levelCurves.json';
import classesJson from '../../data/classes.json';
import enemiesJson from '../../data/enemies.json';
import partiesJson from '../../data/parties.json';
import stagesJson from '../../data/stages.json';
import operationPassiveCatalogJson from '../../data/operation-passive-catalog.json';
import problemSeriesCatalogJson from '../../data/problem-series-catalog.json';
import { BattleEngine } from './BattleEngine.ts';
import {
  getDamageTakenMultiplier,
  resolveHealAmount,
  resolveResourceAmount,
} from './combatMath.ts';
import { loadGameData } from './data/loadGameData.ts';
import { synthesizeCombatModuleSkill } from './data/synthesizeCombatModuleSkill.ts';
import { parseAndValidateGameDataJson } from './data/validateGameData.ts';
import {
  createAlliesFromPartyState,
  createAllyFromMember,
  createEnemyFromClassGroup,
  resetEntityIdCounter,
} from './entities.ts';
import { expandEnemyGroups } from './enemyGroupSpawn.ts';
import { PartyCombatModuleSelection } from './partyCombatModuleSelection.ts';
import { loadLevelCurves } from '../progression/levelGrowth.ts';
import { createDefaultSave } from '../progression/victoryRewards.ts';
import { OperationState } from '../game/OperationState.ts';
import { initializeSkillCooldowns } from './skillTrigger.ts';
import {
  buildDangerTargetingRuntime,
  resolveEffectResolution,
} from './skills/targeting.ts';
import { mergeEffectWithSkillTargeting } from './skills/skillSharedTargeting.ts';
import { mockUnit } from './skills/targeting.fixtures.ts';
import { CONFIGURABLE_RANGE_PX_MAX } from './rangeLimits.ts';
import {
  isAllyBarrierBasicAttack,
  isAllyHealBasicAttack,
} from './allyHealBasicAttack.ts';
import { shouldSkipEngagedAutoApproach } from './resolveApproachBattleX.ts';
import type {
  ActiveSkillDef,
  CombatModuleDef,
  CombatantState,
  PartySlotState,
  PassiveSkillDef,
  SkillEffectDef,
  StageDef,
} from './types.ts';
import {
  resolveIronGuardianM2SelfHealFlatAmount,
  syncIronGuardianModuleStatusEffects,
} from './ironGuardianM2.ts';
import {
  DF_PALADIN_M1_PROTECTION_OVERLAY,
  hasDfPaladinM1ProtectionFrom,
} from './dfPaladinM1.ts';
import {
  clearDfPaladinM2RuntimeState,
  hasDfPaladinM2ProtectionFrom,
} from './dfPaladinM2.ts';
import { syncDfPaladinCombatModuleEffects } from './dfPaladinModules.ts';
import {
  combatModuleFilesFromDraft,
  combatModulesDraftFromModules,
  normalizeCombatModulesDraftForSave,
  validateCombatModulesDraftForSave,
} from '../editor/editorApi.ts';
import {
  findCombatModuleDraft,
  upsertCombatModuleDraft,
} from '../editor/combatModuleEditor.ts';

const levelCurves = loadLevelCurves(levelCurvesJson);
const gameData = loadGameData();

const SURVIVAL_CLASS_IDS = [
  'df_guardian',
  'df_paladin',
  'sp_cleric',
  'sp_wardweaver',
] as const;

const MODULES = {
  guardianM1: 'df_guardian_mod_nearest_strike',
  guardianM2: 'df_guardian_mod_guard_focus',
  paladinM1: 'df_paladin_mod_frontline_ward',
  paladinM2: 'df_paladin_mod_danger_guard',
  clericM1: 'sp_cleric_mod_single_mend',
  clericM2: 'sp_cleric_mod_party_mend',
  wardM1: 'sp_wardweaver_mod_focus_barrier',
  wardM2: 'sp_wardweaver_mod_spread_barrier',
} as const;

const SLOT = {
  guardian: 0,
  paladin: 1,
  cleric: 2,
  ward: 3,
} as const;

const FORBIDDEN_DESCRIPTION_FRAGMENTS = [
  '反撃',
  '自己防御',
  '余剰Barrier',
  '余剰バリア',
  'Barrier消費後回復',
  'バリア消費後回復',
  'legacy active',
  'ゲージ',
  '全体固定防護',
] as const;

function mockMember(classId: string): PartySlotState {
  return {
    classId,
    build: {
      learnedPassiveIds: [],
      learnedActiveIds: [],
      equippedActiveSlots: [],
    },
    progress: { level: 10, exp: 0 },
  };
}

function survivalParty(): PartySlotState[] {
  return [
    mockMember('df_guardian'),
    mockMember('df_paladin'),
    mockMember('sp_cleric'),
    mockMember('sp_wardweaver'),
  ];
}

function basicSkillId(unit: CombatantState): string | undefined {
  return unit.cooldowns.find((cd) => cd.slotKind === 'basic')?.skillId;
}

function makeFromClass(
  classId: string,
  moduleId: string,
  partial: Partial<CombatantState> = {},
): CombatantState {
  const preset = gameData.classRegistry[classId]!;
  const unit = createAllyFromMember(
    mockMember(classId),
    preset,
    levelCurves,
    gameData,
    moduleId,
  );
  unit.build.learnedPassiveIds = [];
  const basicCd = unit.cooldowns.find((cd) => cd.slotKind === 'basic');
  if (basicCd) basicCd.skillId = moduleId;
  initializeSkillCooldowns(unit, gameData.skillRegistry.actives);
  return {
    ...unit,
    barrierHp: 0,
    ...partial,
    id: partial.id ?? unit.id,
    isEnemy: partial.isEnemy ?? false,
  };
}

function setSelection(
  selection: PartyCombatModuleSelection,
  modules: {
    guardian: string;
    paladin: string;
    cleric: string;
    ward: string;
  },
): void {
  selection.setSelectedCombatModuleId(SLOT.guardian, modules.guardian);
  selection.setSelectedCombatModuleId(SLOT.paladin, modules.paladin);
  selection.setSelectedCombatModuleId(SLOT.cleric, modules.cleric);
  selection.setSelectedCombatModuleId(SLOT.ward, modules.ward);
}

function createAllies(
  selection: PartyCombatModuleSelection,
  party = survivalParty(),
): CombatantState[] {
  return createAlliesFromPartyState(
    gameData,
    party,
    levelCurves,
    (slot) => selection.getSelectedCombatModuleId(slot),
  );
}

function createEngine(
  selection: PartyCombatModuleSelection,
  party = survivalParty(),
): BattleEngine {
  const save = createDefaultSave(gameData, 'demo');
  return new BattleEngine(
    gameData,
    levelCurves,
    () => party,
    () => save.stageProgress.currentStageId,
    {
      getSelectedCombatModuleId: (slotIndex) =>
        selection.getSelectedCombatModuleId(slotIndex),
    },
  );
}

function runUnitSkills(engine: BattleEngine, actors: CombatantState[]): void {
  (
    engine as unknown as {
      runUnitSkills: (actors: CombatantState[]) => void;
    }
  ).runUnitSkills(actors);
}

function setEngineUnits(
  engine: BattleEngine,
  players: CombatantState[],
  enemies: CombatantState[],
): void {
  const internals = engine as unknown as {
    players: CombatantState[];
    enemies: CombatantState[];
  };
  internals.players = players;
  internals.enemies = enemies;
}

function moduleSkill(moduleId: string) {
  const module = gameData.combatModuleRegistry[moduleId];
  expect(module).toBeDefined();
  return synthesizeCombatModuleSkill(module!);
}

function primaryEffect(moduleId: string, type: 'heal' | 'barrier' | 'damage') {
  const skill = moduleSkill(moduleId);
  const raw = skill.effect.find((entry) => {
    if (type === 'barrier') {
      return (
        entry.type === 'barrier' ||
        (entry.type === 'buff' && entry.buffSubKind === 'barrier')
      );
    }
    return entry.type === type;
  });
  expect(raw).toBeDefined();
  return {
    skill,
    effect: mergeEffectWithSkillTargeting(skill, raw!),
  };
}

function resolveModuleEffect(
  moduleId: string,
  type: 'heal' | 'barrier',
  actor: CombatantState,
  allies: CombatantState[],
  enemies: CombatantState[] = [],
  targetingRuntime?: ReturnType<typeof buildDangerTargetingRuntime>,
) {
  const { skill, effect } = primaryEffect(moduleId, type);
  return resolveEffectResolution(
    effect,
    actor,
    allies,
    enemies,
    gameData,
    Math.random,
    undefined,
    skill.effect,
    undefined,
    skill,
    undefined,
    targetingRuntime,
  );
}

function makePendingHit(
  actorId: string,
  targetId: string,
  applyAtBattleSec = 0.2,
): import('./types.ts').PendingSkillHit {
  return {
    applyAtBattleSec,
    actorId,
    skillId: 'enemy_basic',
    skillName: 'enemy_basic',
    effectDef: {
      type: 'damage',
      target: { kind: 'distance', side: 'enemy', order: 'nearest' },
      damageType: 'physical',
      amount: { kind: 'flat', flatAmount: 100 },
    } as SkillEffectDef,
    effectIndex: 0,
    slotKind: 'basic',
    hitIndex: 0,
    targets: [{ targetId }],
  };
}

function resolveAttackTargets(
  units: CombatantState[],
  mapping: Record<string, string | null>,
) {
  const byId = new Map(units.map((unit) => [unit.id, unit]));
  return (attacker: CombatantState): CombatantState | null => {
    const targetId = mapping[attacker.id];
    return targetId ? byId.get(targetId) ?? null : null;
  };
}

function effectTarget(moduleId: string) {
  const module = gameData.combatModuleRegistry[moduleId]!;
  return module.action.effect[0]?.target;
}

function loadSkillsRoot() {
  const passives = import.meta.glob('../../data/skills/passives/*.json', {
    eager: true,
    import: 'default',
  }) as Record<string, PassiveSkillDef[]>;
  const actives = import.meta.glob('../../data/skills/actives/*.json', {
    eager: true,
    import: 'default',
  }) as Record<string, ActiveSkillDef[]>;
  return {
    passives: Object.values(passives).flat(),
    actives: Object.values(actives).flat(),
  };
}

const combatModuleFiles = import.meta.glob<CombatModuleDef[]>(
  '../../data/combat-modules/*.json',
  { eager: true, import: 'default' },
);

describe('Survival CombatModule integration (R12g-d5)', () => {
  beforeEach(() => {
    resetEntityIdCounter();
    clearDfPaladinM2RuntimeState();
  });

  describe('module pools and selection wiring', () => {
    it('each Survival class exposes exactly the expected M1/M2 ids', () => {
      expect(gameData.classRegistry.df_guardian?.combatModuleIds).toEqual([
        MODULES.guardianM1,
        MODULES.guardianM2,
      ]);
      expect(gameData.classRegistry.df_paladin?.combatModuleIds).toEqual([
        MODULES.paladinM1,
        MODULES.paladinM2,
      ]);
      expect(gameData.classRegistry.sp_cleric?.combatModuleIds).toEqual([
        MODULES.clericM1,
        MODULES.clericM2,
      ]);
      expect(gameData.classRegistry.sp_wardweaver?.combatModuleIds).toEqual([
        MODULES.wardM1,
        MODULES.wardM2,
      ]);
    });

    it('PartyCombatModuleSelection maps to basic skill ids (M1 exclusive of M2)', () => {
      const selection = new PartyCombatModuleSelection();
      setSelection(selection, {
        guardian: MODULES.guardianM1,
        paladin: MODULES.paladinM1,
        cleric: MODULES.clericM1,
        ward: MODULES.wardM1,
      });
      const alliesM1 = createAllies(selection);
      expect(basicSkillId(alliesM1[SLOT.guardian]!)).toBe(MODULES.guardianM1);
      expect(basicSkillId(alliesM1[SLOT.paladin]!)).toBe(MODULES.paladinM1);
      expect(basicSkillId(alliesM1[SLOT.cleric]!)).toBe(MODULES.clericM1);
      expect(basicSkillId(alliesM1[SLOT.ward]!)).toBe(MODULES.wardM1);

      setSelection(selection, {
        guardian: MODULES.guardianM2,
        paladin: MODULES.paladinM2,
        cleric: MODULES.clericM2,
        ward: MODULES.wardM2,
      });
      const alliesM2 = createAllies(selection);
      expect(basicSkillId(alliesM2[SLOT.guardian]!)).toBe(MODULES.guardianM2);
      expect(basicSkillId(alliesM2[SLOT.paladin]!)).toBe(MODULES.paladinM2);
      expect(basicSkillId(alliesM2[SLOT.cleric]!)).toBe(MODULES.clericM2);
      expect(basicSkillId(alliesM2[SLOT.ward]!)).toBe(MODULES.wardM2);
      expect(basicSkillId(alliesM2[SLOT.guardian]!)).not.toBe(
        MODULES.guardianM1,
      );
    });

    it('selection is by module id, not displayName or array order', () => {
      const selection = new PartyCombatModuleSelection();
      // M2 is combatModuleIds[1]; select by id on the sole party slot
      selection.setSelectedCombatModuleId(0, MODULES.clericM2);
      const [cleric] = createAlliesFromPartyState(
        gameData,
        [mockMember('sp_cleric')],
        levelCurves,
        (slot) => selection.getSelectedCombatModuleId(slot),
      );
      expect(basicSkillId(cleric!)).toBe(MODULES.clericM2);
      expect(gameData.combatModuleRegistry[MODULES.clericM2]?.displayName).toBe(
        '分散回復',
      );
    });
  });

  describe('鉄衛士 M1/M2', () => {
    it('M1 reduces own physical damage only; no heal / barrier / ally spread', () => {
      const guardian = makeFromClass('df_guardian', MODULES.guardianM1, {
        id: 'g',
        def: 0,
        res: 0,
        hp: 200,
        maxHp: 200,
      });
      syncIronGuardianModuleStatusEffects(
        guardian,
        gameData.combatModuleRegistry,
      );
      expect(getDamageTakenMultiplier(guardian, 'physical')).toBeCloseTo(
        0.85,
        5,
      );
      expect(getDamageTakenMultiplier(guardian, 'magic')).toBeCloseTo(1, 5);

      const ally = makeFromClass('at_swordsman', 'at_swordsman_mod_single_slash', {
        id: 'ally',
        def: 0,
      });
      expect(getDamageTakenMultiplier(ally, 'physical')).toBeCloseTo(1, 5);
      expect(guardian.barrierHp).toBe(0);
      expect(
        guardian.statusEffects.some((e) => e.overlay === 'counter'),
      ).toBe(false);
    });

    it('M2 heals on enemy attack HP hits via BattleEngine path; M1 DR absent', () => {
      const m2Heal = resolveIronGuardianM2SelfHealFlatAmount(
        gameData.combatModuleRegistry,
      )!;
      const selection = new PartyCombatModuleSelection();
      selection.setSelectedCombatModuleId(0, MODULES.guardianM2);
      const engine = createEngine(selection, [mockMember('df_guardian')]);
      const guardian = makeFromClass('df_guardian', MODULES.guardianM2, {
        id: 'ally_g',
        hp: 180,
        maxHp: 260,
        def: 0,
        res: 0,
        battleX: 100,
      });
      syncIronGuardianModuleStatusEffects(
        guardian,
        gameData.combatModuleRegistry,
      );
      expect(getDamageTakenMultiplier(guardian, 'physical')).toBeCloseTo(1, 5);

      const attacker = makeFromClass(
        'at_swordsman',
        'at_swordsman_mod_single_slash',
        {
          id: 'atk',
          isEnemy: true,
          atk: 120,
          battleX: 105,
        },
      );
      const basic = attacker.cooldowns.find((cd) => cd.slotKind === 'basic')!;
      basic.remaining = 0;
      setEngineUnits(engine, [guardian], [attacker]);
      const before = guardian.hp;
      runUnitSkills(engine, [attacker]);
      expect(guardian.hp).toBeGreaterThan(before - 120);
      expect(guardian.hp).toBeLessThanOrEqual(before - 1 + m2Heal);
    });
  });

  describe('護法士 M1/M2', () => {
    it('M1 protects multiple frontline allies with magic-focused DR; excludes back unconditionally', () => {
      const paladin = makeFromClass('df_paladin', MODULES.paladinM1, {
        id: 'paladin',
        formationRow: 'front',
        battleX: 100,
      });
      const frontA = makeFromClass(
        'at_swordsman',
        'at_swordsman_mod_single_slash',
        { id: 'front_a', formationRow: 'front', battleX: 120 },
      );
      const frontB = makeFromClass(
        'at_swordsman',
        'at_swordsman_mod_single_slash',
        { id: 'front_b', formationRow: 'front', battleX: 140 },
      );
      const back = makeFromClass('sp_cleric', MODULES.clericM1, {
        id: 'back',
        formationRow: 'back',
        battleX: 60,
      });
      const allies = [paladin, frontA, frontB, back];
      syncDfPaladinCombatModuleEffects(
        allies,
        [],
        gameData.combatModuleRegistry,
        undefined,
      );
      expect(hasDfPaladinM1ProtectionFrom(frontA, 'paladin')).toBe(true);
      expect(hasDfPaladinM1ProtectionFrom(frontB, 'paladin')).toBe(true);
      expect(hasDfPaladinM1ProtectionFrom(back, 'paladin')).toBe(false);
      expect(
        allies.filter((u) =>
          u.statusEffects.some(
            (e) => e.overlay === DF_PALADIN_M1_PROTECTION_OVERLAY,
          ),
        ).length,
      ).toBeGreaterThan(1);
    });

    it('M2 protects danger target (including back); signal 0 is noTarget; exclusive of M1', () => {
      const paladin = makeFromClass('df_paladin', MODULES.paladinM2, {
        id: 'paladin',
        formationRow: 'front',
        battleX: 100,
      });
      const dangerBack = makeFromClass('sp_cleric', MODULES.clericM1, {
        id: 'danger_back',
        formationRow: 'back',
        battleX: 40,
        hp: 40,
        maxHp: 100,
      });
      const safeFront = makeFromClass(
        'at_swordsman',
        'at_swordsman_mod_single_slash',
        {
          id: 'safe_front',
          formationRow: 'front',
          battleX: 140,
          hp: 100,
          maxHp: 100,
        },
      );
      const enemy = mockUnit('enemy', 220, { isEnemy: true, atk: 200 });
      const allies = [paladin, dangerBack, safeFront];
      const enemies = [enemy];
      const targeting = buildDangerTargetingRuntime(allies, enemies, gameData, {
        battleSec: 0,
        pendingHits: [makePendingHit(enemy.id, dangerBack.id)],
        resolveCurrentAttackTarget: resolveAttackTargets(
          [...allies, ...enemies],
          { [enemy.id]: dangerBack.id },
        ),
      });
      syncDfPaladinCombatModuleEffects(
        allies,
        enemies,
        gameData.combatModuleRegistry,
        targeting,
      );
      expect(hasDfPaladinM2ProtectionFrom(dangerBack, 'paladin')).toBe(true);
      expect(hasDfPaladinM1ProtectionFrom(dangerBack, 'paladin')).toBe(false);
      expect(hasDfPaladinM1ProtectionFrom(safeFront, 'paladin')).toBe(false);

      clearDfPaladinM2RuntimeState();
      const quiet = buildDangerTargetingRuntime(
        [paladin, safeFront],
        [],
        gameData,
        {
          battleSec: 0,
          pendingHits: [],
          resolveCurrentAttackTarget: () => null,
        },
      );
      syncDfPaladinCombatModuleEffects(
        [paladin, safeFront],
        [],
        gameData.combatModuleRegistry,
        quiet,
      );
      expect(hasDfPaladinM2ProtectionFrom(safeFront, 'paladin')).toBe(false);
    });
  });

  describe('療養師 M1/M2', () => {
    it('M1 heals single lowest-ratio wounded; full party is no-op; no barrier', () => {
      const cleric = makeFromClass('sp_cleric', MODULES.clericM1, {
        id: 'cleric',
        battleX: 80,
        atk: 100,
      });
      const low = mockUnit('low', 200, { hp: 20, maxHp: 100 });
      const mid = mockUnit('mid', 220, { hp: 50, maxHp: 100 });
      const full = mockUnit('full', 240, { hp: 100, maxHp: 100 });
      const hit = resolveModuleEffect(MODULES.clericM1, 'heal', cleric, [
        cleric,
        low,
        mid,
        full,
      ]);
      expect(hit?.waves[0]?.targets.map((t) => t.unit.id)).toEqual(['low']);

      const noop = resolveModuleEffect(MODULES.clericM1, 'heal', cleric, [
        cleric,
        full,
      ]);
      expect(noop).toBeNull();

      const { effect } = primaryEffect(MODULES.clericM1, 'heal');
      expect(effect.type).toBe('heal');
    });

    it('M2 spreads lower heal to multiple wounded without same-target refill', () => {
      const cleric = makeFromClass('sp_cleric', MODULES.clericM2, {
        id: 'cleric',
        battleX: 80,
        atk: 100,
      });
      const a = mockUnit('a', 200, { hp: 20, maxHp: 100 });
      const b = mockUnit('b', 220, { hp: 30, maxHp: 100 });
      const c = mockUnit('c', 240, { hp: 40, maxHp: 100 });
      const full = mockUnit('full', 260, { hp: 100, maxHp: 100 });
      const multi = resolveModuleEffect(MODULES.clericM2, 'heal', cleric, [
        cleric,
        a,
        b,
        c,
        full,
      ]);
      const ids = multi?.waves[0]?.targets.map((t) => t.unit.id) ?? [];
      expect(ids).toContain('a');
      expect(ids).toContain('b');
      expect(ids).not.toContain('full');
      expect(new Set(ids).size).toBe(ids.length);

      const onlyOne = resolveModuleEffect(MODULES.clericM2, 'heal', cleric, [
        cleric,
        a,
        full,
      ]);
      expect(onlyOne?.waves[0]?.targets).toHaveLength(1);

      const m1Amt = resolveHealAmount(
        cleric,
        a,
        primaryEffect(MODULES.clericM1, 'heal').effect.amount!,
        gameData.skillRegistry.passives,
      );
      const m2Amt = resolveHealAmount(
        cleric,
        a,
        primaryEffect(MODULES.clericM2, 'heal').effect.amount!,
        gameData.skillRegistry.passives,
      );
      expect(m1Amt).toBeGreaterThan(m2Amt);
    });
  });

  describe('結界師 M1/M2', () => {
    it('M1 grants thick barrier to danger ally; signal 0 no-op; no heal/DR', () => {
      const weaver = makeFromClass('sp_wardweaver', MODULES.wardM1, {
        id: 'weaver',
        battleX: 80,
        atk: 100,
        formationRow: 'back',
        barrierHp: 80,
      });
      const danger = mockUnit('danger', 200, {
        hp: 40,
        maxHp: 100,
        barrierHp: 0,
        formationRow: 'front',
      });
      const safe = mockUnit('safe', 220, {
        hp: 100,
        maxHp: 100,
        barrierHp: 0,
      });
      const enemy = mockUnit('enemy', 400, { isEnemy: true });
      const allies = [weaver, danger, safe];
      const enemies = [enemy];
      const targeting = buildDangerTargetingRuntime(allies, enemies, gameData, {
        battleSec: 0,
        pendingHits: [makePendingHit(enemy.id, danger.id)],
        resolveCurrentAttackTarget: resolveAttackTargets(
          [...allies, ...enemies],
          { [enemy.id]: danger.id },
        ),
      });
      const hit = resolveModuleEffect(
        MODULES.wardM1,
        'barrier',
        weaver,
        allies,
        enemies,
        targeting,
      );
      expect(hit?.waves[0]?.targets.map((t) => t.unit.id)).toEqual(['danger']);

      const quiet = buildDangerTargetingRuntime(
        [weaver, safe],
        [],
        gameData,
        {
          battleSec: 0,
          pendingHits: [],
          resolveCurrentAttackTarget: () => null,
        },
      );
      expect(
        resolveModuleEffect(
          MODULES.wardM1,
          'barrier',
          weaver,
          [weaver, safe],
          [],
          quiet,
        ),
      ).toBeNull();

      const { effect } = primaryEffect(MODULES.wardM1, 'barrier');
      expect(effect.type === 'barrier' || effect.type === 'buff').toBe(true);
    });

    it('M2 selects barrier-short allies without refill; thinner than M1', () => {
      const weaver = makeFromClass('sp_wardweaver', MODULES.wardM2, {
        id: 'weaver',
        battleX: 80,
        atk: 100,
      });
      const low = mockUnit('low', 200, { barrierHp: 0 });
      const mid = mockUnit('mid', 220, { barrierHp: 10 });
      const high = mockUnit('high', 240, { barrierHp: 80 });
      const multi = resolveModuleEffect(MODULES.wardM2, 'barrier', weaver, [
        weaver,
        low,
        mid,
        high,
      ]);
      const ids = multi?.waves[0]?.targets.map((t) => t.unit.id) ?? [];
      expect(ids).toContain('low');
      expect(ids).not.toContain('high');
      expect(new Set(ids).size).toBe(ids.length);

      const m1Amt = resolveResourceAmount(
        weaver,
        low,
        primaryEffect(MODULES.wardM1, 'barrier').effect.amount!,
        gameData.skillRegistry.passives,
      );
      const m2Amt = resolveResourceAmount(
        weaver,
        low,
        primaryEffect(MODULES.wardM2, 'barrier').effect.amount!,
        gameData.skillRegistry.passives,
      );
      expect(m1Amt).toBeGreaterThan(m2Amt);
    });
  });

  describe('支援 no-op / approach fallback', () => {
    it('cleric / wardweaver do not chase enemies when support has no target', () => {
      const cleric = makeFromClass('sp_cleric', MODULES.clericM1, {
        id: 'cleric',
        battleX: 80,
        hp: 100,
        maxHp: 100,
        formationRow: 'back',
        barrierHp: 80,
      });
      const weaver = makeFromClass('sp_wardweaver', MODULES.wardM2, {
        id: 'weaver',
        battleX: 70,
        formationRow: 'back',
        barrierHp: 80,
      });
      const fullAlly = mockUnit('full', 120, {
        hp: 100,
        maxHp: 100,
        barrierHp: 80,
      });
      const enemy = mockUnit('enemy', 400, { isEnemy: true });

      expect(isAllyHealBasicAttack(cleric, gameData)).toBe(true);
      expect(isAllyBarrierBasicAttack(weaver, gameData)).toBe(true);
      expect(
        shouldSkipEngagedAutoApproach(
          weaver,
          [cleric, weaver, fullAlly],
          [enemy],
          gameData,
        ),
      ).toBe(true);

      expect(
        resolveModuleEffect(MODULES.clericM1, 'heal', cleric, [
          cleric,
          fullAlly,
        ]),
      ).toBeNull();
      expect(
        resolveModuleEffect(MODULES.wardM2, 'barrier', weaver, [
          weaver,
          fullAlly,
        ]),
      ).toBeNull();

      // no-op does not rewrite basic into enemy damage
      expect(primaryEffect(MODULES.clericM1, 'heal').effect.type).toBe('heal');
      expect(
        primaryEffect(MODULES.wardM1, 'barrier').effect.type === 'barrier' ||
          primaryEffect(MODULES.wardM1, 'barrier').effect.type === 'buff',
      ).toBe(true);
    });

    it('paladin stance modules advance cooldown without enemy damage fallback', () => {
      const selection = new PartyCombatModuleSelection();
      selection.setSelectedCombatModuleId(0, MODULES.paladinM1);
      const engine = createEngine(selection, [mockMember('df_paladin')]);
      const paladin = makeFromClass('df_paladin', MODULES.paladinM1, {
        id: 'paladin',
        battleX: 100,
      });
      const enemy = makeFromClass(
        'at_swordsman',
        'at_swordsman_mod_single_slash',
        {
          id: 'enemy',
          isEnemy: true,
          hp: 500,
          maxHp: 500,
          battleX: 200,
        },
      );
      const beforeEnemyHp = enemy.hp;
      const basic = paladin.cooldowns.find((cd) => cd.slotKind === 'basic')!;
      basic.remaining = 0;
      setEngineUnits(engine, [paladin], [enemy]);
      runUnitSkills(engine, [paladin]);
      expect(enemy.hp).toBe(beforeEnemyHp);
      expect(basic.remaining).toBeGreaterThan(0);
    });
  });

  describe('後衛 targeting (range bypass)', () => {
    it('cleric and wardweaver can select distant backline allies', () => {
      const cleric = makeFromClass('sp_cleric', MODULES.clericM1, {
        id: 'cleric',
        battleX: 80,
      });
      const farBack = mockUnit('far_back', 80 + CONFIGURABLE_RANGE_PX_MAX - 10, {
        hp: 10,
        maxHp: 100,
        formationRow: 'back',
      });
      const nearFull = mockUnit('near_full', 110, { hp: 100, maxHp: 100 });
      expect(
        resolveModuleEffect(MODULES.clericM1, 'heal', cleric, [
          cleric,
          farBack,
          nearFull,
        ])?.waves[0]?.targets[0]?.unit.id,
      ).toBe('far_back');

      const weaver = makeFromClass('sp_wardweaver', MODULES.wardM2, {
        id: 'weaver',
        battleX: 80,
        barrierHp: 80,
      });
      const farLowBarrier = mockUnit(
        'far_barrier',
        80 + CONFIGURABLE_RANGE_PX_MAX - 10,
        { barrierHp: 0, formationRow: 'back' },
      );
      expect(
        resolveModuleEffect(MODULES.wardM2, 'barrier', weaver, [
          weaver,
          farLowBarrier,
        ])?.waves[0]?.targets[0]?.unit.id,
      ).toBe('far_barrier');
    });
  });

  describe('Wave間 Module 切替 (Operation API)', () => {
    it('Wave prep module change recreates allies with new module only; clears prior Survival state', () => {
      const party = survivalParty();
      const selection = new PartyCombatModuleSelection();
      setSelection(selection, {
        guardian: MODULES.guardianM1,
        paladin: MODULES.paladinM1,
        cleric: MODULES.clericM1,
        ward: MODULES.wardM1,
      });
      const op = OperationState.begin({
        stageId: 'survival_integration',
        party,
        moduleSelection: selection,
      });
      expect(op).not.toBeNull();

      const wave1 = createAllies(op!.getCombatModuleSelection(), party);
      for (const unit of wave1) {
        unit.build.learnedPassiveIds = [];
      }
      const guardian = wave1[SLOT.guardian]!;
      const paladin = wave1[SLOT.paladin]!;
      const front = makeFromClass(
        'at_swordsman',
        'at_swordsman_mod_single_slash',
        { id: 'front_extra', formationRow: 'front', battleX: 130 },
      );
      syncIronGuardianModuleStatusEffects(
        guardian,
        gameData.combatModuleRegistry,
      );
      expect(getDamageTakenMultiplier(guardian, 'physical')).toBeCloseTo(
        0.85,
        5,
      );
      syncDfPaladinCombatModuleEffects(
        [paladin, front],
        [],
        gameData.combatModuleRegistry,
        undefined,
      );
      expect(hasDfPaladinM1ProtectionFrom(front, paladin.id)).toBe(true);

      // simulate mid-wave state that must not carry
      guardian.hp = 50;
      guardian.barrierHp = 40;
      wave1[SLOT.ward]!.barrierHp = 55;

      op!.beginWavePrepEditing();
      expect(
        op!.trySetCombatModuleForSlot(
          SLOT.guardian,
          MODULES.guardianM2,
          gameData,
        ),
      ).toBe(true);
      expect(
        op!.trySetCombatModuleForSlot(
          SLOT.paladin,
          MODULES.paladinM2,
          gameData,
        ),
      ).toBe(true);
      expect(
        op!.trySetCombatModuleForSlot(SLOT.cleric, MODULES.clericM2, gameData),
      ).toBe(true);
      expect(
        op!.trySetCombatModuleForSlot(SLOT.ward, MODULES.wardM2, gameData),
      ).toBe(true);
      op!.endWavePrepEditing();

      clearDfPaladinM2RuntimeState();
      const wave2 = createAllies(op!.getCombatModuleSelection(), party);
      expect(basicSkillId(wave2[SLOT.guardian]!)).toBe(MODULES.guardianM2);
      expect(basicSkillId(wave2[SLOT.paladin]!)).toBe(MODULES.paladinM2);
      expect(basicSkillId(wave2[SLOT.cleric]!)).toBe(MODULES.clericM2);
      expect(basicSkillId(wave2[SLOT.ward]!)).toBe(MODULES.wardM2);

      // fresh combatants: HP/Barrier reset; M1 DR status not carried
      expect(wave2[SLOT.guardian]!.hp).toBe(wave2[SLOT.guardian]!.maxHp);
      expect(wave2[SLOT.guardian]!.barrierHp).toBe(0);
      expect(wave2[SLOT.ward]!.barrierHp).toBe(0);
      syncIronGuardianModuleStatusEffects(
        wave2[SLOT.guardian]!,
        gameData.combatModuleRegistry,
      );
      expect(
        getDamageTakenMultiplier(wave2[SLOT.guardian]!, 'physical'),
      ).toBeCloseTo(1, 5);

      const wave2Front = makeFromClass(
        'at_swordsman',
        'at_swordsman_mod_single_slash',
        { id: 'front_w2', formationRow: 'front', battleX: 130 },
      );
      syncDfPaladinCombatModuleEffects(
        [wave2[SLOT.paladin]!, wave2Front],
        [],
        gameData.combatModuleRegistry,
        undefined,
      );
      expect(
        hasDfPaladinM1ProtectionFrom(wave2Front, wave2[SLOT.paladin]!.id),
      ).toBe(false);
    });
  });

  describe('敵味方対称', () => {
    it('enemy Survival modules use actor-side allies and selectedCombatModuleId', () => {
      const stage: StageDef = {
        id: 'survival_enemy_symmetry',
        displayName: 'Survival enemy symmetry',
        recommendedLevel: 10,
        enemyGroups: [
          {
            classId: 'df_guardian',
            count: 1,
            selectedCombatModuleId: MODULES.guardianM2,
          },
          {
            classId: 'df_paladin',
            count: 1,
            selectedCombatModuleId: MODULES.paladinM1,
          },
          {
            classId: 'sp_cleric',
            count: 1,
            selectedCombatModuleId: MODULES.clericM2,
          },
          {
            classId: 'sp_wardweaver',
            count: 1,
            selectedCombatModuleId: MODULES.wardM2,
          },
        ],
        waves: [{ enemies: [] }],
      };
      const specs = expandEnemyGroups(stage);
      const enemies = specs.map((spec) =>
        createEnemyFromClassGroup(
          spec,
          gameData.classRegistry[spec.classId]!,
          gameData,
          levelCurves,
        ),
      );
      expect(basicSkillId(enemies[0]!)).toBe(MODULES.guardianM2);
      expect(basicSkillId(enemies[1]!)).toBe(MODULES.paladinM1);
      expect(basicSkillId(enemies[2]!)).toBe(MODULES.clericM2);
      expect(basicSkillId(enemies[3]!)).toBe(MODULES.wardM2);

      const enemyCleric = enemies[2]!;
      enemyCleric.battleX = 500;
      const woundedEnemy = makeFromClass(
        'at_swordsman',
        'at_swordsman_mod_single_slash',
        {
          id: 'enemy_wounded',
          isEnemy: true,
          hp: 20,
          maxHp: 100,
          battleX: 480,
        },
      );
      const fullEnemy = makeFromClass(
        'at_swordsman',
        'at_swordsman_mod_single_slash',
        {
          id: 'enemy_full',
          isEnemy: true,
          hp: 100,
          maxHp: 100,
          battleX: 460,
        },
      );
      // actor-side allies for enemies are the enemies array (players = [])
      const heal = resolveModuleEffect(
        MODULES.clericM2,
        'heal',
        enemyCleric,
        [],
        [enemyCleric, woundedEnemy, fullEnemy],
      );
      expect(heal?.waves[0]?.targets.map((t) => t.unit.id)).toEqual([
        'enemy_wounded',
      ]);

      const enemyPaladin = enemies[1]!;
      enemyPaladin.id = 'enemy_paladin';
      enemyPaladin.formationRow = 'front';
      const enemyFront = makeFromClass(
        'at_swordsman',
        'at_swordsman_mod_single_slash',
        {
          id: 'enemy_front',
          isEnemy: true,
          formationRow: 'front',
          battleX: 520,
        },
      );
      syncDfPaladinCombatModuleEffects(
        [],
        [enemyPaladin, enemyFront],
        gameData.combatModuleRegistry,
        undefined,
      );
      expect(
        hasDfPaladinM1ProtectionFrom(enemyFront, 'enemy_paladin'),
      ).toBe(true);
    });
  });

  describe('shared targeting non-interference', () => {
    it('danger vs barrier stat, heal no-refill vs damage multiLock default', () => {
      const wardM1 = gameData.combatModuleRegistry[MODULES.wardM1]!;
      const wardM2 = gameData.combatModuleRegistry[MODULES.wardM2]!;
      const clericM2 = gameData.combatModuleRegistry[MODULES.clericM2]!;
      expect(effectTarget(MODULES.wardM1)?.kind).toBe('danger');
      expect(effectTarget(MODULES.wardM2)).toMatchObject({
        kind: 'stat',
        stat: 'barrier',
      });
      expect(wardM1.action.targetShape).toBe('single');
      expect(wardM2.action.effectRange?.refillSameTargetOnShortfall).toBe(
        false,
      );
      expect(clericM2.action.effectRange?.refillSameTargetOnShortfall).toBe(
        false,
      );

      // damage multiLock default still re-hits on shortfall
      const attacker = mockUnit('atk', 100);
      const only = mockUnit('only', 200, { isEnemy: true, hp: 500, maxHp: 500 });
      const damageRes = resolveEffectResolution(
        {
          type: 'damage',
          damageType: 'physical',
          target: { kind: 'distance', side: 'enemy', order: 'nearest' },
          targetShape: 'multiLock',
          hitCount: 3,
          amount: { kind: 'atkBased', atkScale: 1 },
        } as SkillEffectDef,
        attacker,
        [attacker],
        [only],
        gameData,
        Math.random,
      );
      expect(damageRes?.waves[0]?.targets).toHaveLength(3);
      expect(
        damageRes?.waves[0]?.targets.every((t) => t.unit.id === 'only'),
      ).toBe(true);

      // heal no-refill does not re-hit
      const healer = makeFromClass('sp_cleric', MODULES.clericM2, {
        id: 'healer',
      });
      const oneWounded = mockUnit('w', 180, { hp: 20, maxHp: 100 });
      const healRes = resolveModuleEffect(MODULES.clericM2, 'heal', healer, [
        healer,
        oneWounded,
      ]);
      expect(healRes?.waves[0]?.targets).toHaveLength(1);
    });
  });

  describe('production GameData validation', () => {
    it('validates production classes / stages / all combat modules', () => {
      expect(() =>
        parseAndValidateGameDataJson({
          classes: classesJson,
          enemies: enemiesJson,
          parties: partiesJson,
          stages: stagesJson,
          skills: loadSkillsRoot(),
          combatModules: Object.values(combatModuleFiles).flat(),
          operationPassiveCatalog: operationPassiveCatalogJson,
      problemSeriesCatalog: problemSeriesCatalogJson,
        }),
      ).not.toThrow();

      for (const classId of SURVIVAL_CLASS_IDS) {
        const pool = gameData.classRegistry[classId]?.combatModuleIds ?? [];
        expect(pool).toHaveLength(2);
        for (const moduleId of pool) {
          const module = gameData.combatModuleRegistry[moduleId];
          expect(module?.classId).toBe(classId);
        }
      }
    });
  });

  describe('editor round-trip', () => {
    it('load/save preserves Survival module fields without mutating production files', () => {
      const modules = Object.values(gameData.combatModuleRegistry);
      let draft = combatModulesDraftFromModules(modules);
      expect(validateCombatModulesDraftForSave(draft)).toBeNull();

      const touchIds = [
        MODULES.guardianM1,
        MODULES.guardianM2,
        MODULES.paladinM1,
        MODULES.paladinM2,
        MODULES.clericM1,
        MODULES.clericM2,
        MODULES.wardM1,
        MODULES.wardM2,
      ];
      for (const id of touchIds) {
        const source = findCombatModuleDraft(draft, id)!;
        const cloned = structuredClone(source);
        draft = upsertCombatModuleDraft(draft, cloned);
      }

      const normalized = normalizeCombatModulesDraftForSave(draft);
      expect(validateCombatModulesDraftForSave(normalized)).toBeNull();
      const files = combatModuleFilesFromDraft(normalized);
      const flat = files.flatMap((file) => file.modules);

      const guardianM1 = flat.find((m) => m.id === MODULES.guardianM1)!;
      expect(guardianM1.runtimeEffect).toEqual({
        kind: 'physicalDamageTakenReduction',
        takenMultiplier: 0.85,
      });
      const guardianM2 = flat.find((m) => m.id === MODULES.guardianM2)!;
      expect(guardianM2.runtimeEffect).toEqual({
        kind: 'healOnEnemyAttackHpHit',
        flatAmount: 20,
      });
      const paladinM1 = flat.find((m) => m.id === MODULES.paladinM1)!;
      expect(paladinM1.runtimeEffect?.kind).toBe('protectFrontlineAllies');
      const paladinM2 = flat.find((m) => m.id === MODULES.paladinM2)!;
      expect(paladinM2.runtimeEffect?.kind).toBe('protectDangerTarget');
      expect(paladinM2.action.effect[0]?.target?.kind).toBe('self');
      const clericM2 = flat.find((m) => m.id === MODULES.clericM2)!;
      expect(clericM2.action.effect[0]?.type).toBe('heal');
      expect(clericM2.action.effectRange?.refillSameTargetOnShortfall).toBe(
        false,
      );
      const wardM1 = flat.find((m) => m.id === MODULES.wardM1)!;
      expect(wardM1.action.effect[0]?.target?.kind).toBe('danger');
      const wardM2 = flat.find((m) => m.id === MODULES.wardM2)!;
      expect(wardM2.action.effect[0]?.target).toMatchObject({
        kind: 'stat',
        stat: 'barrier',
      });
      expect(wardM2.action.effectRange?.refillSameTargetOnShortfall).toBe(
        false,
      );

      // re-parse via validate; Survival modules remain deep-equal to production registry
      expect(() =>
        parseAndValidateGameDataJson({
          classes: classesJson,
          enemies: enemiesJson,
          parties: partiesJson,
          stages: stagesJson,
          skills: loadSkillsRoot(),
          combatModules: flat,
          operationPassiveCatalog: operationPassiveCatalogJson,
      problemSeriesCatalog: problemSeriesCatalogJson,
        }),
      ).not.toThrow();
      for (const id of touchIds) {
        expect(flat.find((m) => m.id === id)).toEqual(
          gameData.combatModuleRegistry[id],
        );
      }
    });
  });

  describe('description contrast', () => {
    it('each Survival module description contrasts M1/M2 without forbidden phrases', () => {
      const pairs: Array<[string, string, RegExp, RegExp]> = [
        [
          MODULES.guardianM1,
          MODULES.guardianM2,
          /物理/,
          /回復|Hit|不屈/,
        ],
        [
          MODULES.paladinM1,
          MODULES.paladinM2,
          /前線|魔法/,
          /危険|全属性/,
        ],
        [
          MODULES.clericM1,
          MODULES.clericM2,
          /1体|単体|緊急/,
          /複数|分散/,
        ],
        [
          MODULES.wardM1,
          MODULES.wardM2,
          /危険|重点|1体/,
          /複数|分散|薄い|不足/,
        ],
      ];
      for (const [m1Id, m2Id, m1Pat, m2Pat] of pairs) {
        const m1 = gameData.combatModuleRegistry[m1Id]!;
        const m2 = gameData.combatModuleRegistry[m2Id]!;
        expect(m1.displayName).toBeTruthy();
        expect(m2.displayName).toBeTruthy();
        expect(m1.displayName).not.toBe(m2.displayName);
        expect(m1.description).toMatch(m1Pat);
        expect(m2.description).toMatch(m2Pat);
        for (const text of [m1.description, m2.description]) {
          for (const fragment of FORBIDDEN_DESCRIPTION_FRAGMENTS) {
            expect(text.includes(fragment)).toBe(false);
          }
        }
      }
    });
  });
});
