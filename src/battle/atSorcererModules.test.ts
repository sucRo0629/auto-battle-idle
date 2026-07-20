/**
 * R12g-e4 — 魔術師 M1/M2 CombatModule。
 * 既存 chain を再利用。multiLock / 種火 Passive は対象外。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { resolveDamage } from './combatMath.ts';
import { resolveEffectResolution } from './skills/targeting.ts';
import { mergeEffectWithSkillTargeting } from './skills/skillSharedTargeting.ts';
import { mockUnit } from './skills/targeting.fixtures.ts';
import { loadGameData } from './data/loadGameData.ts';
import { synthesizeCombatModuleSkill } from './data/synthesizeCombatModuleSkill.ts';
import {
  createAllyFromMember,
  createAlliesFromPartyState,
  createEnemyFromClassGroup,
  resetEntityIdCounter,
} from './entities.ts';
import { loadLevelCurves } from '../progression/levelGrowth.ts';
import levelCurvesJson from '../../data/levelCurves.json';
import { initializeSkillCooldowns } from './skillTrigger.ts';
import { parseAndValidateGameDataJson } from './data/validateGameData.ts';
import classesJson from '../../data/classes.json';
import enemiesJson from '../../data/enemies.json';
import partiesJson from '../../data/parties.json';
import stagesJson from '../../data/stages.json';
import operationPassiveCatalogJson from '../../data/operation-passive-catalog.json';
import problemSeriesCatalogJson from '../../data/problem-series-catalog.json';
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
import { PartyCombatModuleSelection } from './partyCombatModuleSelection.ts';
import { OperationState } from '../game/OperationState.ts';
import type { CombatModuleDef, CombatantState, SkillEffectDef } from './types.ts';

const gameData = loadGameData();
const levelCurves = loadLevelCurves(levelCurvesJson);

const M1_ID = 'at_sorcerer_mod_focus';
const M2_ID = 'at_sorcerer_mod_chain';
const OLD_M1_ID = 'at_sorcerer_mod_single_bolt';
const OLD_M2_ID = 'at_sorcerer_mod_twin_bolt';

function mockMember(level = 10) {
  return {
    classId: 'at_sorcerer',
    build: {
      learnedPassiveIds: [] as string[],
      learnedActiveIds: [] as string[],
      equippedActiveSlots: [] as string[],
    },
    progress: { level, exp: 0 },
  };
}

function makeSorcerer(
  moduleId: string,
  partial: Partial<CombatantState> = {},
): CombatantState {
  const preset = gameData.classRegistry.at_sorcerer!;
  const unit = createAllyFromMember(
    mockMember(),
    preset,
    levelCurves,
    gameData,
    moduleId,
  );
  const basicCd = unit.cooldowns.find((cd) => cd.slotKind === 'basic');
  if (basicCd) basicCd.skillId = moduleId;
  initializeSkillCooldowns(unit, gameData.skillRegistry.actives);
  return {
    ...unit,
    id: partial.id ?? 'sorcerer',
    isEnemy: partial.isEnemy ?? false,
    battleX: partial.battleX ?? 80,
    formationRow: partial.formationRow ?? 'back',
    atk: partial.atk ?? unit.atk,
    ...partial,
  };
}

function moduleSkill(moduleId: string) {
  const module = gameData.combatModuleRegistry[moduleId];
  expect(module).toBeDefined();
  return synthesizeCombatModuleSkill(module!);
}

type DamageEffectDef = Extract<SkillEffectDef, { type: 'damage' }>;

function damageEffect(moduleId: string): {
  skill: ReturnType<typeof moduleSkill>;
  effect: DamageEffectDef;
} {
  const skill = moduleSkill(moduleId);
  const raw = skill.effect.find(
    (entry): entry is DamageEffectDef => entry.type === 'damage',
  );
  expect(raw).toBeDefined();
  if (!raw) {
    throw new Error(`expected damage effect on ${moduleId}`);
  }
  const effect = mergeEffectWithSkillTargeting(skill, raw);
  expect(effect.type).toBe('damage');
  if (effect.type !== 'damage') {
    throw new Error(`expected merged damage effect on ${moduleId}`);
  }
  return { skill, effect };
}

function resolveModuleDamage(
  moduleId: string,
  actor: CombatantState,
  allies: CombatantState[],
  enemies: CombatantState[],
) {
  const { skill, effect } = damageEffect(moduleId);
  return resolveEffectResolution(
    effect,
    actor,
    allies,
    enemies,
    gameData,
    Math.random,
    [],
    skill.effect,
    undefined,
    skill,
  );
}

function loadSkillsRoot() {
  const passives = import.meta.glob('../../data/skills/passives/*.json', {
    eager: true,
    import: 'default',
  }) as Record<string, unknown>;
  const actives = import.meta.glob('../../data/skills/actives/*.json', {
    eager: true,
    import: 'default',
  }) as Record<string, unknown>;
  return {
    passives: Object.values(passives).flat(),
    actives: Object.values(actives).flat(),
  };
}

const combatModuleFiles = import.meta.glob<CombatModuleDef[]>(
  '../../data/combat-modules/*.json',
  { eager: true, import: 'default' },
);

function loadMergedCombatModules(): CombatModuleDef[] {
  return Object.values(combatModuleFiles).flat();
}

describe('at_sorcerer CombatModule runtime (R12g-e4)', () => {
  beforeEach(() => {
    resetEntityIdCounter();
  });

  it('production class Module order is M1→M2 formal IDs', () => {
    const cls = gameData.classRegistry.at_sorcerer!;
    expect(cls.combatModuleIds).toEqual([M1_ID, M2_ID]);
    expect(gameData.combatModuleRegistry[OLD_M1_ID]).toBeUndefined();
    expect(gameData.combatModuleRegistry[OLD_M2_ID]).toBeUndefined();
  });

  it('M1 and M2 both use targetShape chain (not multiLock)', () => {
    for (const moduleId of [M1_ID, M2_ID]) {
      const module = gameData.combatModuleRegistry[moduleId]!;
      expect(module.action.targetShape).toBe('chain');
      expect(module.action.targetShape).not.toBe('multiLock');
      expect(module.action.attackMethod).toBe('ranged');
      expect(damageEffect(moduleId).effect.damageType).toBe('magic');
      expect(damageEffect(moduleId).effect.target).toEqual({
        kind: 'distance',
        side: 'enemy',
        order: 'nearest',
      });
    }
    expect(gameData.combatModuleRegistry[M1_ID]!.action.chainCount).toBe(1);
    expect(gameData.combatModuleRegistry[M2_ID]!.action.chainCount).toBe(2);
  });

  it('M1 chainCount 1 hits only the nearest enemy', () => {
    const sorcerer = makeSorcerer(M1_ID, { battleX: 80 });
    const near = mockUnit('near', 150, { isEnemy: true, def: 0, res: 0 });
    const mid = mockUnit('mid', 200, { isEnemy: true, def: 0, res: 0 });
    const resolution = resolveModuleDamage(
      M1_ID,
      sorcerer,
      [sorcerer],
      [near, mid],
    );
    const ids = resolution?.waves.map((w) => w.targets[0]?.unit.id);
    expect(ids).toEqual(['near']);
    expect(resolution?.waves).toHaveLength(1);
  });

  it('M2 chains to another target within 80px', () => {
    const sorcerer = makeSorcerer(M2_ID, { battleX: 80 });
    const near = mockUnit('near', 150, { isEnemy: true, def: 0, res: 0 });
    const hop = mockUnit('hop', 220, { isEnemy: true, def: 0, res: 0 }); // 70px
    const resolution = resolveModuleDamage(
      M2_ID,
      sorcerer,
      [sorcerer],
      [near, hop],
    );
    const ids = resolution?.waves.map((w) => w.targets[0]?.unit.id);
    expect(ids).toEqual(['near', 'hop']);
    expect(gameData.combatModuleRegistry[M2_ID]!.action.chainCount).toBe(2);
  });

  it('M2 ends on primary when only out-of-range candidates remain', () => {
    const sorcerer = makeSorcerer(M2_ID, { battleX: 80 });
    const near = mockUnit('near', 150, { isEnemy: true, def: 0, res: 0 });
    const far = mockUnit('far', 250, { isEnemy: true, def: 0, res: 0 }); // 100px
    const resolution = resolveModuleDamage(
      M2_ID,
      sorcerer,
      [sorcerer],
      [near, far],
    );
    const ids = resolution?.waves.map((w) => w.targets[0]?.unit.id);
    expect(ids).toEqual(['near']);
  });

  it('M2 primary scale 0.65 and hop scale 0.52', () => {
    const sorcerer = makeSorcerer(M2_ID, { battleX: 80, atk: 100 });
    const near = mockUnit('near', 150, {
      isEnemy: true,
      def: 0,
      res: 0,
      hp: 500,
      maxHp: 500,
    });
    const hop = mockUnit('hop', 220, {
      isEnemy: true,
      def: 0,
      res: 0,
      hp: 500,
      maxHp: 500,
    });
    const resolution = resolveModuleDamage(
      M2_ID,
      sorcerer,
      [sorcerer],
      [near, hop],
    );
    expect(resolution?.waves).toHaveLength(2);
    // chain embeds atkScale into powerMultiplierOverride; hop0=base, hop1=base×0.8
    expect(resolution?.waves[0]?.targets[0]?.powerMultiplierOverride).toBe(0.65);
    expect(resolution?.waves[1]?.targets[0]?.powerMultiplierOverride).toBeCloseTo(
      0.52,
      5,
    );

    const { effect } = damageEffect(M2_ID);
    expect(effect.type).toBe('damage');
    if (effect.type !== 'damage') return;
    expect(effect.amount).toEqual({ kind: 'atkBased', atkScale: 0.65 });

    const primary = resolveDamage(sorcerer, near, effect, {}, {
      atkScaleOverride: 0.65,
    });
    const hopDamage = resolveDamage(sorcerer, hop, effect, {}, {
      atkScaleOverride: 0.52,
    });
    expect(primary).toBeCloseTo(65, 5);
    expect(hopDamage).toBeCloseTo(52, 5);
  });

  it('M1 single-target damage exceeds M2 primary damage', () => {
    const actor = makeSorcerer(M1_ID, { battleX: 80, atk: 100 });
    const target = mockUnit('t', 150, {
      isEnemy: true,
      def: 0,
      res: 0,
      hp: 500,
      maxHp: 500,
    });
    const m1Effect = damageEffect(M1_ID).effect;
    const m2Effect = damageEffect(M2_ID).effect;
    expect(m1Effect.type).toBe('damage');
    expect(m2Effect.type).toBe('damage');
    if (m1Effect.type !== 'damage' || m2Effect.type !== 'damage') return;
    const m1 = resolveDamage(actor, target, m1Effect, {});
    const m2Primary = resolveDamage(actor, target, m2Effect, {}, {
      atkScaleOverride: 0.65,
    });
    expect(m1).toBeGreaterThan(m2Primary);
  });

  it('ally and enemy sorcerers resolve the same chain hops', () => {
    const ally = makeSorcerer(M2_ID, { id: 'ally_s', battleX: 80 });
    const enemyCaster = makeSorcerer(M2_ID, {
      id: 'enemy_s',
      isEnemy: true,
      battleX: 320,
    });
    const eNear = mockUnit('e_near', 150, { isEnemy: true });
    const eHop = mockUnit('e_hop', 220, { isEnemy: true });
    const aNear = mockUnit('a_near', 250, { isEnemy: false });
    const aHop = mockUnit('a_hop', 180, { isEnemy: false });

    const allyIds = resolveModuleDamage(M2_ID, ally, [ally], [eNear, eHop])
      ?.waves.map((w) => w.targets[0]?.unit.id);
    const enemyIds = resolveModuleDamage(
      M2_ID,
      enemyCaster,
      [aNear, aHop],
      [enemyCaster],
    )?.waves.map((w) => w.targets[0]?.unit.id);

    expect(allyIds).toEqual(['e_near', 'e_hop']);
    expect(enemyIds).toEqual(['a_near', 'a_hop']);
  });

  it('Module selection and Wave prep keep formal IDs', () => {
    const party = [mockMember()];
    const selection = new PartyCombatModuleSelection();
    selection.setSelectedCombatModuleId(0, M1_ID);
    const op = OperationState.begin({
      source: { kind: 'fixedStage', stageId: 'sorcerer_module_switch' },
      party,
      moduleSelection: selection,
    });
    expect(op).not.toBeNull();

    const wave1 = createAlliesFromPartyState(
      gameData,
      party,
      levelCurves,
      (slot) => op!.getCombatModuleSelection().getSelectedCombatModuleId(slot),
    );
    expect(wave1[0]!.cooldowns.find((cd) => cd.slotKind === 'basic')?.skillId).toBe(
      M1_ID,
    );

    op!.beginWavePrepEditing();
    expect(op!.trySetCombatModuleForSlot(0, M2_ID, gameData)).toBe(true);
    op!.endWavePrepEditing();

    const wave2 = createAlliesFromPartyState(
      gameData,
      party,
      levelCurves,
      (slot) => op!.getCombatModuleSelection().getSelectedCombatModuleId(slot),
    );
    expect(wave2[0]!.cooldowns.find((cd) => cd.slotKind === 'basic')?.skillId).toBe(
      M2_ID,
    );
    expect(gameData.combatModuleRegistry[M2_ID]!.action.targetShape).toBe('chain');
  });

  it('enemy selectedCombatModuleId uses the same formal M1/M2', () => {
    const preset = gameData.classRegistry.at_sorcerer!;
    const enemyM1 = createEnemyFromClassGroup(
      {
        classId: 'at_sorcerer',
        level: 10,
        selectedCombatModuleId: M1_ID,
        groupIndex: 0,
        indexInGroup: 0,
        groupCount: 1,
        spawnUnitKey: 'g0_i0',
      },
      preset,
      gameData,
      levelCurves,
    );
    const enemyM2 = createEnemyFromClassGroup(
      {
        classId: 'at_sorcerer',
        level: 10,
        selectedCombatModuleId: M2_ID,
        groupIndex: 0,
        indexInGroup: 0,
        groupCount: 1,
        spawnUnitKey: 'g0_i1',
      },
      preset,
      gameData,
      levelCurves,
    );
    expect(enemyM1.cooldowns.find((cd) => cd.slotKind === 'basic')?.skillId).toBe(
      M1_ID,
    );
    expect(enemyM2.cooldowns.find((cd) => cd.slotKind === 'basic')?.skillId).toBe(
      M2_ID,
    );
  });
});

describe('at_sorcerer CombatModule validation (R12g-e4)', () => {
  function bundleWithModules(combatModules: CombatModuleDef[]) {
    return {
      classes: classesJson,
      enemies: enemiesJson,
      parties: partiesJson,
      stages: stagesJson,
      skills: loadSkillsRoot(),
      combatModules,
      operationPassiveCatalog: operationPassiveCatalogJson,
      problemSeriesCatalog: problemSeriesCatalogJson,
    };
  }

  it('production GameData validates with sorcerer modules', () => {
    expect(() =>
      parseAndValidateGameDataJson(bundleWithModules(loadMergedCombatModules())),
    ).not.toThrow();
  });

  it('rejects multiLock reshape on sorcerer modules', () => {
    const combatModules = structuredClone(loadMergedCombatModules());
    const m2 = combatModules.find((m) => m.id === M2_ID)!;
    m2.action.targetShape = 'multiLock';
    m2.action.hitCount = 2;
    m2.action.chainCount = undefined;
    m2.action.chainMaxDistancePx = undefined;
    m2.action.chainPowerStepMultiplier = undefined;
    m2.action.chainPowerStepMode = undefined;
    m2.action.effectRange = {
      form: 'single',
      applyMode: 'instant',
      hitCount: 2,
      refillSameTargetOnShortfall: true,
    };
    expect(() =>
      parseAndValidateGameDataJson(bundleWithModules(combatModules)),
    ).toThrow(/targetShape chain/);
  });

  it('rejects wrong chainCount on M1/M2', () => {
    const combatModules = structuredClone(loadMergedCombatModules());
    const m1 = combatModules.find((m) => m.id === M1_ID)!;
    m1.action.chainCount = 2;
    expect(() =>
      parseAndValidateGameDataJson(bundleWithModules(combatModules)),
    ).toThrow(/M1 must use chainCount 1/);

    const combatModules2 = structuredClone(loadMergedCombatModules());
    const m2 = combatModules2.find((m) => m.id === M2_ID)!;
    m2.action.chainCount = 1;
    expect(() =>
      parseAndValidateGameDataJson(bundleWithModules(combatModules2)),
    ).toThrow(/M2 must use chainCount 2/);
  });

  it('does not interfere with ranger module validation', () => {
    const combatModules = structuredClone(loadMergedCombatModules());
    const rangerM2 = combatModules.find((m) => m.id === 'at_ranger_mod_core_split')!;
    rangerM2.action.effectRange = {
      form: 'single',
      applyMode: 'instant',
      hitCount: 3,
      refillSameTargetOnShortfall: true,
    };
    expect(() =>
      parseAndValidateGameDataJson(bundleWithModules(combatModules)),
    ).toThrow(/refillSameTargetOnShortfall false/);
  });

  it('editor round-trip preserves chain fields', () => {
    let draft = combatModulesDraftFromModules(loadMergedCombatModules());
    const m2 = findCombatModuleDraft(draft, M2_ID)!;
    draft = upsertCombatModuleDraft(draft, {
      ...m2,
      description: `${m2.description} editor-touch`,
    });
    const normalized = normalizeCombatModulesDraftForSave(draft);
    expect(() => validateCombatModulesDraftForSave(normalized)).not.toThrow();
    const files = combatModuleFilesFromDraft(normalized);
    const sorcererFile = files.find((file) =>
      file.modules.some((module) => module.id === M1_ID),
    );
    expect(sorcererFile).toBeDefined();
    const roundTripped = sorcererFile!.modules.find((m) => m.id === M2_ID)!;
    expect(roundTripped.action.targetShape).toBe('chain');
    expect(roundTripped.action.chainCount).toBe(2);
    expect(roundTripped.action.chainMaxDistancePx).toBe(80);
    expect(roundTripped.action.chainPowerStepMultiplier).toBe(0.8);
    expect(roundTripped.action.chainPowerStepMode).toBe('multiply');
    expect(roundTripped.action.attackMethod).toBe('ranged');
    const firstEffect = roundTripped.action.effect[0];
    expect(firstEffect?.type).toBe('damage');
    if (firstEffect?.type !== 'damage') {
      throw new Error('expected round-tripped M2 primary effect to be damage');
    }
    expect(firstEffect.target).toEqual({
      kind: 'distance',
      side: 'enemy',
      order: 'nearest',
    });
  });

  it('production modules and this suite do not retain old placeholder IDs', () => {
    const json = JSON.stringify(loadMergedCombatModules());
    expect(json).not.toContain(OLD_M1_ID);
    expect(json).not.toContain(OLD_M2_ID);
    expect(gameData.classRegistry.at_sorcerer!.combatModuleIds).not.toContain(
      OLD_M1_ID,
    );
    expect(gameData.classRegistry.at_sorcerer!.combatModuleIds).not.toContain(
      OLD_M2_ID,
    );
  });
});
