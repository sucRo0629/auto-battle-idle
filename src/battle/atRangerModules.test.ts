/**
 * R12g-e3 — 弓術士 M1/M2 CombatModule。
 * 固定優先（遠隔攻撃役・支援役除外）は class passive 所有。Module は nearest fallback。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { resolveDamage } from './combatMath.ts';
import { getPassiveDefs } from './combatMath.ts';
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
import {
  resolvePlayerAttackTargetEnemy,
  resolveEnemyAttackTargetPlayer,
} from './resolveApproachBattleX.ts';
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
import { SkillExecutor } from './skills/SkillExecutor.ts';
import { SkillSequenceRunner } from './skills/skillSequence.ts';
import type {
  BattleEventListener,
  CombatModuleDef,
  CombatantState,
  SkillEffectDef,
} from './types.ts';

const gameData = loadGameData();
const levelCurves = loadLevelCurves(levelCurvesJson);

const M1_ID = 'at_ranger_mod_core_focus';
const M2_ID = 'at_ranger_mod_core_split';
const TARGET_PASSIVE_ID = 'at_ranger_passive_1';

function mockMember(level = 10) {
  return {
    classId: 'at_ranger',
    build: {
      learnedPassiveIds: [TARGET_PASSIVE_ID] as string[],
      learnedActiveIds: [] as string[],
      equippedActiveSlots: [] as string[],
    },
    progress: { level, exp: 0 },
  };
}

function withBasicSkill(
  unit: CombatantState,
  skillId: string,
): CombatantState {
  return {
    ...unit,
    cooldowns: [{ skillId, remaining: 0, slotKind: 'basic' }],
  };
}

function makeRanger(
  moduleId: string,
  partial: Partial<CombatantState> = {},
): CombatantState {
  const preset = gameData.classRegistry.at_ranger!;
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
    id: partial.id ?? 'ranger',
    isEnemy: partial.isEnemy ?? false,
    battleX: partial.battleX ?? 80,
    formationRow: partial.formationRow ?? 'back',
    ...partial,
  };
}

function moduleSkill(moduleId: string) {
  const module = gameData.combatModuleRegistry[moduleId];
  expect(module).toBeDefined();
  return synthesizeCombatModuleSkill(module!);
}

function damageEffect(moduleId: string): {
  skill: ReturnType<typeof moduleSkill>;
  effect: SkillEffectDef;
} {
  const skill = moduleSkill(moduleId);
  const raw = skill.effect.find((entry) => entry.type === 'damage');
  expect(raw?.type).toBe('damage');
  return { skill, effect: mergeEffectWithSkillTargeting(skill, raw!) };
}

function resolveModuleDamage(
  moduleId: string,
  actor: CombatantState,
  allies: CombatantState[],
  enemies: CombatantState[],
) {
  const { skill, effect } = damageEffect(moduleId);
  const passives = getPassiveDefs(actor, gameData.skillRegistry.passives);
  return resolveEffectResolution(
    effect,
    actor,
    allies,
    enemies,
    gameData,
    Math.random,
    passives,
    skill.effect,
    undefined,
    skill,
  );
}

function createSkillExecutor(
  allies: CombatantState[],
  enemies: CombatantState[],
) {
  const events: Parameters<BattleEventListener>[0][] = [];
  const runner = new SkillSequenceRunner();
  const executor = new SkillExecutor(gameData, (event) => events.push(event), {
    getSequenceRunner: () => runner,
    getBattleTimeSec: () => 0,
    getAllCombatants: () => [...allies, ...enemies],
  });
  return { executor, events, runner };
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

describe('at_ranger CombatModule runtime (R12g-e3)', () => {
  beforeEach(() => {
    resetEntityIdCounter();
  });

  it('class owns ranged-attacker priority via Lv0 passive; modules use nearest fallback', () => {
    const passive = gameData.skillRegistry.passives[TARGET_PASSIVE_ID]!;
    expect(passive.effect).toBe('targetRuleOverride');
    expect(passive.targetRuleOverride).toEqual({
      kind: 'attackType',
      ranged: true,
      excludeRoles: ['supporter'],
    });

    for (const moduleId of [M1_ID, M2_ID]) {
      const effect = damageEffect(moduleId).effect;
      expect(effect.target).toEqual({
        kind: 'distance',
        side: 'enemy',
        order: 'nearest',
      });
      expect(effect.target?.kind).not.toBe('attackType');
    }

    const cls = gameData.classRegistry.at_ranger!;
    expect(cls.combatModuleIds).toEqual([M1_ID, M2_ID]);
  });

  it('prefers ranged attacker over ranged supporter when both present', () => {
    const ranger = makeRanger(M1_ID, { battleX: 80 });
    const frontMelee = withBasicSkill(
      mockUnit('front', 200, { formationRow: 'front', def: 40 }),
      'at_swordsman_basic_attack',
    );
    const cleric = withBasicSkill(
      mockUnit('cleric', 280, {
        formationRow: 'back',
        rangePx: 200,
        role: 'supporter',
      }),
      'sp_cleric_mod_single_mend',
    );
    cleric.role = 'supporter';
    const core = withBasicSkill(
      mockUnit('core', 300, { formationRow: 'back', rangePx: 300 }),
      'at_sorcerer_mod_focus',
    );
    const resolution = resolveModuleDamage(
      M1_ID,
      ranger,
      [ranger],
      [frontMelee, cleric, core],
    );
    expect(resolution?.waves[0]?.targets.map((t) => t.unit.id)).toEqual([
      'core',
    ]);
  });

  it('does not prioritize cleric/wardweaver merely for being ranged', () => {
    const ranger = makeRanger(M1_ID, { battleX: 80 });
    const front = withBasicSkill(
      mockUnit('front', 200, { formationRow: 'front' }),
      'at_swordsman_basic_attack',
    );
    const cleric = withBasicSkill(
      mockUnit('cleric', 260, { formationRow: 'back', rangePx: 200 }),
      'sp_cleric_mod_single_mend',
    );
    cleric.role = 'supporter';
    const ward = withBasicSkill(
      mockUnit('ward', 270, { formationRow: 'back', rangePx: 200 }),
      'sp_wardweaver_mod_focus_barrier',
    );
    ward.role = 'supporter';
    const resolution = resolveModuleDamage(
      M1_ID,
      ranger,
      [ranger],
      [front, cleric, ward],
    );
    // no ranged attackers → fallback nearest among living
    expect(resolution?.waves[0]?.targets[0]?.unit.id).toBe('front');
  });

  it('uses deterministic frontmost tie-break among multiple ranged attackers', () => {
    const ranger = makeRanger(M1_ID, { battleX: 80 });
    const a = withBasicSkill(
      mockUnit('a', 250, { formationRow: 'back' }),
      'at_ranger_basic_attack',
    );
    const b = withBasicSkill(
      mockUnit('b', 280, { formationRow: 'back' }),
      'at_sorcerer_mod_focus',
    );
    const c = withBasicSkill(
      mockUnit('c', 310, { formationRow: 'back' }),
      'at_ranger_basic_attack',
    );
    const resolution = resolveModuleDamage(
      M1_ID,
      ranger,
      [ranger],
      [a, b, c],
    );
    // attackType pool sorts by max battleX (frontmost on enemy line)
    expect(resolution?.waves[0]?.targets[0]?.unit.id).toBe('c');
  });

  it('falls back to common nearest when no ranged attacker remains', () => {
    const ranger = makeRanger(M1_ID, { battleX: 80 });
    const near = withBasicSkill(
      mockUnit('near', 150, { formationRow: 'front' }),
      'at_swordsman_basic_attack',
    );
    const far = withBasicSkill(
      mockUnit('far', 220, { formationRow: 'front' }),
      'df_guardian_basic_attack',
    );
    const resolution = resolveModuleDamage(
      M1_ID,
      ranger,
      [ranger],
      [near, far],
    );
    expect(resolution?.waves[0]?.targets[0]?.unit.id).toBe('near');
  });

  it('M1 and M2 share the same class fixed-target passive', () => {
    const rangerM1 = makeRanger(M1_ID, { battleX: 80 });
    const rangerM2 = makeRanger(M2_ID, { battleX: 80 });
    const core = withBasicSkill(
      mockUnit('core', 300, { formationRow: 'back' }),
      'at_sorcerer_mod_focus',
    );
    const front = withBasicSkill(
      mockUnit('front', 200, { formationRow: 'front' }),
      'at_swordsman_basic_attack',
    );
    expect(
      resolveModuleDamage(M1_ID, rangerM1, [rangerM1], [front, core])?.waves[0]
        ?.targets[0]?.unit.id,
    ).toBe('core');
    expect(
      resolveModuleDamage(M2_ID, rangerM2, [rangerM2], [front, core])?.waves[0]
        ?.targets[0]?.unit.id,
    ).toBe('core');
  });

  it('ally and enemy rangers apply the same ranged-attacker priority', () => {
    const allyRanger = makeRanger(M1_ID, { id: 'ally_r', battleX: 100 });
    const enemyRanger = makeRanger(M1_ID, {
      id: 'enemy_r',
      isEnemy: true,
      battleX: 320,
    });
    const allyCore = withBasicSkill(
      mockUnit('ally_core', 90, {
        isEnemy: false,
        formationRow: 'back',
      }),
      'at_sorcerer_mod_focus',
    );
    const allyFront = withBasicSkill(
      mockUnit('ally_front', 140, { isEnemy: false, formationRow: 'front' }),
      'at_swordsman_basic_attack',
    );
    const enemyCore = withBasicSkill(
      mockUnit('enemy_core', 300, { formationRow: 'back' }),
      'at_sorcerer_mod_focus',
    );
    const enemyFront = withBasicSkill(
      mockUnit('enemy_front', 220, { formationRow: 'front' }),
      'at_swordsman_basic_attack',
    );

    expect(
      resolveModuleDamage(
        M1_ID,
        allyRanger,
        [allyRanger],
        [enemyFront, enemyCore],
      )?.waves[0]?.targets[0]?.unit.id,
    ).toBe('enemy_core');

    expect(
      resolveModuleDamage(
        M1_ID,
        enemyRanger,
        [allyFront, allyCore],
        [enemyRanger],
      )?.waves[0]?.targets[0]?.unit.id,
    ).toBe('ally_core');
  });

  it('M1 deals a single Hit to one ranged core and does not spread', () => {
    const ranger = makeRanger(M1_ID, { battleX: 80 });
    const core = withBasicSkill(
      mockUnit('core', 300, { formationRow: 'back' }),
      'at_sorcerer_mod_focus',
    );
    const other = withBasicSkill(
      mockUnit('other', 280, { formationRow: 'back' }),
      'at_ranger_basic_attack',
    );
    const front = withBasicSkill(
      mockUnit('front', 200, { formationRow: 'front' }),
      'at_swordsman_basic_attack',
    );
    const resolution = resolveModuleDamage(
      M1_ID,
      ranger,
      [ranger],
      [core, other, front],
    );
    expect(resolution?.waves[0]?.targets).toHaveLength(1);
    expect(resolution?.waves[0]?.targets[0]?.unit.id).toBe('core');
  });

  it('M1 has higher per-target damage than M2', () => {
    const m1 = damageEffect(M1_ID).effect;
    const m2 = damageEffect(M2_ID).effect;
    const attacker = makeRanger(M1_ID, { atk: 100 });
    const target = mockUnit('t', 200, { def: 0, hp: 500, maxHp: 500 });
    const m1Dmg = resolveDamage(attacker, target, m1 as never, {});
    const m2Dmg = resolveDamage(attacker, target, m2 as never, {});
    expect(m1Dmg).toBeGreaterThan(m2Dmg);
  });

  it('M1 does not rely on legacy active multi-hit or bonusBasicAttackOnHit', () => {
    const m1 = gameData.combatModuleRegistry[M1_ID]!;
    expect(m1.action.hitCount ?? 1).toBe(1);
    expect(m1.action.targetShape ?? 'single').toBe('single');
    for (const effect of m1.action.effect) {
      expect(effect.type).toBe('damage');
      expect((effect as { hitCount?: number }).hitCount ?? 1).toBe(1);
    }
    expect(m1.runtimeEffect).toBeUndefined();
  });

  it('M2 distributes Hits across multiple ranged attackers', () => {
    const ranger = makeRanger(M2_ID, { battleX: 80 });
    const a = withBasicSkill(
      mockUnit('a', 250, { formationRow: 'back' }),
      'at_ranger_basic_attack',
    );
    const b = withBasicSkill(
      mockUnit('b', 280, { formationRow: 'back' }),
      'at_sorcerer_mod_focus',
    );
    const c = withBasicSkill(
      mockUnit('c', 310, { formationRow: 'back' }),
      'at_ranger_basic_attack',
    );
    const front = withBasicSkill(
      mockUnit('front', 200, { formationRow: 'front' }),
      'at_swordsman_basic_attack',
    );
    const resolution = resolveModuleDamage(
      M2_ID,
      ranger,
      [ranger],
      [a, b, c, front],
    );
    const ids = resolution?.waves[0]?.targets.map((t) => t.unit.id) ?? [];
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
    expect(ids).not.toContain('front');
  });

  it('M2 does not refill same target when candidates are short', () => {
    const ranger = makeRanger(M2_ID, { battleX: 80 });
    const only = withBasicSkill(
      mockUnit('only', 300, { formationRow: 'back' }),
      'at_sorcerer_mod_focus',
    );
    const resolution = resolveModuleDamage(
      M2_ID,
      ranger,
      [ranger],
      [only],
    );
    expect(resolution?.waves[0]?.targets.map((t) => t.unit.id)).toEqual([
      'only',
    ]);
  });

  it('M2 does not fill shortfall with supporters', () => {
    const ranger = makeRanger(M2_ID, { battleX: 80 });
    const core = withBasicSkill(
      mockUnit('core', 300, { formationRow: 'back' }),
      'at_sorcerer_mod_focus',
    );
    const cleric = withBasicSkill(
      mockUnit('cleric', 280, { formationRow: 'back', rangePx: 200 }),
      'sp_cleric_mod_single_mend',
    );
    cleric.role = 'supporter';
    const resolution = resolveModuleDamage(
      M2_ID,
      ranger,
      [ranger],
      [core, cleric],
    );
    const ids = resolution?.waves[0]?.targets.map((t) => t.unit.id) ?? [];
    expect(ids).toEqual(['core']);
    expect(ids).not.toContain('cleric');
  });

  it('M1 and M2 are mutually exclusive on the basic slot', () => {
    expect(makeRanger(M1_ID).cooldowns.find((cd) => cd.slotKind === 'basic')?.skillId).toBe(
      M1_ID,
    );
    expect(makeRanger(M2_ID).cooldowns.find((cd) => cd.slotKind === 'basic')?.skillId).toBe(
      M2_ID,
    );
  });

  it('SkillExecutor applies selected module Hit shape', () => {
    const ranger = makeRanger(M2_ID, { battleX: 80, atk: 100 });
    const a = withBasicSkill(
      mockUnit('a', 250, { formationRow: 'back', def: 0, hp: 200, maxHp: 200 }),
      'at_ranger_basic_attack',
    );
    const b = withBasicSkill(
      mockUnit('b', 280, { formationRow: 'back', def: 0, hp: 200, maxHp: 200 }),
      'at_sorcerer_mod_focus',
    );
    const c = withBasicSkill(
      mockUnit('c', 310, { formationRow: 'back', def: 0, hp: 200, maxHp: 200 }),
      'at_ranger_basic_attack',
    );
    const allies = [ranger];
    const enemies = [a, b, c];
    const { executor, events } = createSkillExecutor(allies, enemies);
    const basicCd = ranger.cooldowns.find((cd) => cd.slotKind === 'basic')!;
    basicCd.remaining = 0;
    expect(executor.tryExecute(ranger, basicCd, allies, enemies)).toBe(true);
    const damageEvents = events.filter(
      (e) => e.type === 'skill' && e.effect === 'damage',
    );
    expect(damageEvents).toHaveLength(3);
    const targetIds = damageEvents.map((e) =>
      e.type === 'skill' ? e.targetId : '',
    );
    expect(new Set(targetIds).size).toBe(3);
  });

  it('party selected CombatModule is reflected in createAlliesFromPartyState', () => {
    const party = [mockMember()];
    const selection = new PartyCombatModuleSelection();
    selection.setSelectedCombatModuleId(0, M2_ID);
    const allies = createAlliesFromPartyState(
      gameData,
      party,
      levelCurves,
      (slot) => selection.getSelectedCombatModuleId(slot),
    );
    expect(allies[0]!.cooldowns.find((cd) => cd.slotKind === 'basic')?.skillId).toBe(
      M2_ID,
    );
  });

  it('Operation Wave prep switches M1↔M2 and changes Hit shape', () => {
    const party = [mockMember()];
    const selection = new PartyCombatModuleSelection();
    selection.setSelectedCombatModuleId(0, M1_ID);
    const op = OperationState.begin({
      source: { kind: 'fixedStage', stageId: 'ranger_module_switch' },
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
    expect(damageEffect(M1_ID).effect.targetShape ?? 'single').toBe('single');

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
    expect(gameData.combatModuleRegistry[M2_ID]!.action.targetShape).toBe(
      'multiLock',
    );
    expect(wave2[0]!.cooldowns.find((cd) => cd.slotKind === 'basic')?.skillId).not.toBe(
      M1_ID,
    );
  });

  it('enemy selectedCombatModuleId uses the same M1/M2 shapes', () => {
    const preset = gameData.classRegistry.at_ranger!;
    const enemyM1 = createEnemyFromClassGroup(
      {
        classId: 'at_ranger',
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
        classId: 'at_ranger',
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

  it('approach AttackTarget follows fixed priority for both modules', () => {
    const ranger = makeRanger(M1_ID, { battleX: 80 });
    const front = withBasicSkill(
      mockUnit('front', 200, { formationRow: 'front' }),
      'at_swordsman_basic_attack',
    );
    const core = withBasicSkill(
      mockUnit('core', 300, { formationRow: 'back' }),
      'at_sorcerer_mod_focus',
    );
    expect(
      resolvePlayerAttackTargetEnemy(
        ranger,
        [ranger],
        [front, core],
        gameData,
      )?.id,
    ).toBe('core');

    const rangerM2 = makeRanger(M2_ID, { battleX: 80 });
    expect(
      resolvePlayerAttackTargetEnemy(
        rangerM2,
        [rangerM2],
        [front, core],
        gameData,
      )?.id,
    ).toBe('core');
  });

  it('enemy ranger AttackTarget mirrors ally priority', () => {
    const enemy = makeRanger(M1_ID, {
      id: 'enemy_r',
      isEnemy: true,
      battleX: 320,
    });
    const allyCore = withBasicSkill(
      mockUnit('ally_core', 90, { isEnemy: false, formationRow: 'back' }),
      'at_sorcerer_mod_focus',
    );
    const allyFront = withBasicSkill(
      mockUnit('ally_front', 150, { isEnemy: false, formationRow: 'front' }),
      'at_swordsman_basic_attack',
    );
    expect(
      resolveEnemyAttackTargetPlayer(
        enemy,
        [allyFront, allyCore],
        [enemy],
        gameData,
      )?.id,
    ).toBe('ally_core');
  });
});

describe('at_ranger CombatModule validation (R12g-e3)', () => {
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

  it('production GameData validates with ranger modules', () => {
    expect(() =>
      parseAndValidateGameDataJson(bundleWithModules(loadMergedCombatModules())),
    ).not.toThrow();
  });

  it('rejects attackType priority embedded in module', () => {
    const combatModules = structuredClone(loadMergedCombatModules());
    const m1 = combatModules.find((m) => m.id === M1_ID)!;
    m1.action.effect[0] = {
      ...m1.action.effect[0]!,
      type: 'damage',
      target: { kind: 'attackType', ranged: true, excludeRoles: ['supporter'] },
    };
    expect(() =>
      parseAndValidateGameDataJson(bundleWithModules(combatModules)),
    ).toThrow(/must not embed attackType priority/);
  });

  it('rejects M2 without refillSameTargetOnShortfall false', () => {
    const combatModules = structuredClone(loadMergedCombatModules());
    const m2 = combatModules.find((m) => m.id === M2_ID)!;
    m2.action.effectRange = {
      form: 'single',
      applyMode: 'instant',
      hitCount: 3,
      refillSameTargetOnShortfall: true,
    };
    expect(() =>
      parseAndValidateGameDataJson(bundleWithModules(combatModules)),
    ).toThrow(/refillSameTargetOnShortfall false/);
  });

  it('rejects non-ranged / non-physical / heal on ranger modules', () => {
    const combatModules = structuredClone(loadMergedCombatModules());
    const m1 = combatModules.find((m) => m.id === M1_ID)!;
    m1.action.attackMethod = 'melee';
    expect(() =>
      parseAndValidateGameDataJson(bundleWithModules(combatModules)),
    ).toThrow(/must be ranged/);

    const combatModules2 = structuredClone(loadMergedCombatModules());
    const m1b = combatModules2.find((m) => m.id === M1_ID)!;
    m1b.action.effect[0] = {
      ...m1b.action.effect[0]!,
      type: 'damage',
      damageType: 'magic',
    };
    expect(() =>
      parseAndValidateGameDataJson(bundleWithModules(combatModules2)),
    ).toThrow(/physical damage/);

    const combatModules3 = structuredClone(loadMergedCombatModules());
    const m1c = combatModules3.find((m) => m.id === M1_ID)!;
    m1c.action.effect.push({
      type: 'heal',
      healSubKind: 'instant',
      target: { kind: 'distance', side: 'enemy', order: 'nearest' },
      amount: { kind: 'atkBased', atkScale: 1 },
    } as CombatModuleDef['action']['effect'][number]);
    expect(() =>
      parseAndValidateGameDataJson(bundleWithModules(combatModules3)),
    ).toThrow(/damage effects only/);
  });

  it('rejects M1 multiLock shape', () => {
    const combatModules = structuredClone(loadMergedCombatModules());
    const m1 = combatModules.find((m) => m.id === M1_ID)!;
    m1.action.targetShape = 'multiLock';
    m1.action.hitCount = 3;
    expect(() =>
      parseAndValidateGameDataJson(bundleWithModules(combatModules)),
    ).toThrow(/M1 must be single-target/);
  });

  it('editor round-trip preserves M1/M2 ranger fields', () => {
    let draft = combatModulesDraftFromModules(loadMergedCombatModules());
    const m2 = findCombatModuleDraft(draft, M2_ID)!;
    draft = upsertCombatModuleDraft(draft, {
      ...m2,
      description: `${m2.description} editor-touch`,
    });
    const normalized = normalizeCombatModulesDraftForSave(draft);
    expect(() => validateCombatModulesDraftForSave(normalized)).not.toThrow();
    const files = combatModuleFilesFromDraft(normalized);
    const rangerFile = files.find((file) =>
      file.modules.some((module) => module.id === M1_ID),
    );
    expect(rangerFile).toBeDefined();
    const roundTripped = rangerFile!.modules.find((m) => m.id === M2_ID)!;
    expect(roundTripped.action.targetShape).toBe('multiLock');
    expect(roundTripped.action.hitCount).toBe(3);
    expect(roundTripped.action.effectRange?.refillSameTargetOnShortfall).toBe(
      false,
    );
    expect(roundTripped.action.attackMethod).toBe('ranged');
    expect(roundTripped.action.effect[0]?.target).toEqual({
      kind: 'distance',
      side: 'enemy',
      order: 'nearest',
    });
  });
});
