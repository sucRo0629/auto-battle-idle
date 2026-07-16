/**
 * R12g-e1 — 剣術士 M1/M2 CombatModule データ再設計。
 * DEF 無視は class passive（at_swordsman_passive_1）所有。Module 差は対象数と damage 量。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { resolveDamage } from './combatMath.ts';
import { loadGameData } from './data/loadGameData.ts';
import { synthesizeCombatModuleSkill } from './data/synthesizeCombatModuleSkill.ts';
import { createAllyFromMember, resetEntityIdCounter } from './entities.ts';
import { loadLevelCurves } from '../progression/levelGrowth.ts';
import levelCurvesJson from '../../data/levelCurves.json';
import { initializeSkillCooldowns } from './skillTrigger.ts';
import { resolveEffectResolution } from './skills/targeting.ts';
import { mergeEffectWithSkillTargeting } from './skills/skillSharedTargeting.ts';
import { mockUnit } from './skills/targeting.fixtures.ts';
import { shouldSkipEngagedAutoApproach } from './resolveApproachBattleX.ts';
import { parseAndValidateGameDataJson } from './data/validateGameData.ts';
import classesJson from '../../data/classes.json';
import enemiesJson from '../../data/enemies.json';
import partiesJson from '../../data/parties.json';
import stagesJson from '../../data/stages.json';
import operationPassiveCatalogJson from '../../data/operation-passive-catalog.json';
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
import type {
  CombatModuleDef,
  CombatantState,
  SkillEffectDef,
} from './types.ts';

const gameData = loadGameData();
const levelCurves = loadLevelCurves(levelCurvesJson);

const M1_ID = 'at_swordsman_mod_single_slash';
const M2_ID = 'at_swordsman_mod_pierce_slash';
const DEF_IGNORE_PASSIVE_ID = 'at_swordsman_passive_1';

function mockMember(classId: string) {
  return {
    classId,
    build: {
      learnedPassiveIds: [DEF_IGNORE_PASSIVE_ID] as string[],
      learnedActiveIds: [] as string[],
      equippedActiveSlots: [] as string[],
    },
    progress: { level: 10, exp: 0 },
  };
}

function makeSwordsman(
  moduleId: string,
  partial: Partial<CombatantState> = {},
): CombatantState {
  const preset = gameData.classRegistry.at_swordsman!;
  const unit = createAllyFromMember(
    mockMember('at_swordsman'),
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
    id: partial.id ?? 'swordsman',
    isEnemy: partial.isEnemy ?? false,
    battleX: partial.battleX ?? 80,
    formationRow: partial.formationRow ?? 'front',
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

describe('at_swordsman CombatModule data (R12g-e1)', () => {
  beforeEach(() => {
    resetEntityIdCounter();
  });

  it('parses M1/M2 module shape from CombatModule data', () => {
    const m1 = gameData.combatModuleRegistry[M1_ID]!;
    const m2 = gameData.combatModuleRegistry[M2_ID]!;
    expect(m1.classId).toBe('at_swordsman');
    expect(m2.classId).toBe('at_swordsman');
    expect(m1.displayName).toContain('正面集中');
    expect(m2.displayName).toContain('前線分担');
    expect(m1.description).toMatch(/防御力が高い敵1体/);
    expect(m1.description).toMatch(/無視/);
    expect(m2.description).toMatch(/複数/);
    expect(m2.description).toMatch(/正面集中より低い/);
    expect(m2.description).toMatch(/再命中しない/);
    expect(m1.description).not.toMatch(/Barrier|バリア|低HP|後衛|execution|吸収|反撃|全体/);
    expect(m2.description).not.toMatch(/Barrier|バリア|低HP|後衛|execution|吸収|反撃|全体/);

    expect(m1.action.effect[0]?.type).toBe('damage');
    expect(m2.action.effect[0]?.type).toBe('damage');
    expect(m1.action.targetShape ?? 'single').toBe('single');
    expect(m2.action.targetShape).toBe('multiLock');
    expect(m2.action.hitCount).toBeGreaterThanOrEqual(2);
    expect(m2.action.effectRange?.refillSameTargetOnShortfall).toBe(false);
    expect(m1.action.attackMethod).toBe('melee');
    expect(m2.action.attackMethod).toBe('melee');
    expect(m1.action.targetShape).not.toBe('pierce');
    expect(m2.action.targetShape).not.toBe('pierce');
    expect(m1.runtimeEffect).toBeUndefined();
    expect(m2.runtimeEffect).toBeUndefined();

    const cls = gameData.classRegistry.at_swordsman!;
    expect(cls.combatModuleIds).toEqual([M1_ID, M2_ID]);
  });

  it('M1 selects highest DEF enemy only', () => {
    const swordsman = makeSwordsman(M1_ID, { battleX: 100 });
    const highDef = mockUnit('high_def', 110, { def: 80, hp: 200, maxHp: 200 });
    const lowDef = mockUnit('low_def', 115, { def: 5, hp: 50, maxHp: 200 });
    const midDef = mockUnit('mid_def', 120, { def: 40, hp: 100, maxHp: 200 });
    const resolution = resolveModuleDamage(
      M1_ID,
      swordsman,
      [swordsman],
      [highDef, lowDef, midDef],
    );
    expect(resolution?.waves[0]?.targets.map((t) => t.unit.id)).toEqual([
      'high_def',
    ]);
  });

  it('M1 does not retarget to lowest HP when DEF differs', () => {
    const swordsman = makeSwordsman(M1_ID, { battleX: 100 });
    const highDefFull = mockUnit('high_def', 110, {
      def: 90,
      hp: 200,
      maxHp: 200,
    });
    const lowHpLowDef = mockUnit('low_hp', 115, {
      def: 1,
      hp: 5,
      maxHp: 200,
    });
    const resolution = resolveModuleDamage(
      M1_ID,
      swordsman,
      [swordsman],
      [highDefFull, lowHpLowDef],
    );
    expect(resolution?.waves[0]?.targets[0]?.unit.id).toBe('high_def');
  });

  it('M1 deals higher per-target damage than M2', () => {
    const m1 = damageEffect(M1_ID).effect;
    const m2 = damageEffect(M2_ID).effect;
    const attacker = makeSwordsman(M1_ID, { atk: 100 });
    const target = mockUnit('t', 140, { def: 0, hp: 500, maxHp: 500 });
    const m1Dmg = resolveDamage(attacker, target, m1 as never, {});
    const m2Dmg = resolveDamage(attacker, target, m2 as never, {});
    expect(m1Dmg).toBeGreaterThan(m2Dmg);
    expect(m1Dmg).toBeGreaterThan(0);
    expect(m2Dmg).toBeGreaterThan(0);
  });

  it('DEF ignore is owned by class passive and applies through combatMath', () => {
    const passive = gameData.skillRegistry.passives[DEF_IGNORE_PASSIVE_ID]!;
    expect(passive.effect).toBe('defenseIgnore');
    expect(passive.defenseIgnore?.def).toEqual({
      mode: 'percent',
      amount: 0.15,
    });
    expect(damageEffect(M1_ID).effect.defenseIgnore).toBeUndefined();
    expect(damageEffect(M2_ID).effect.defenseIgnore).toBeUndefined();

    const attacker = makeSwordsman(M1_ID, { atk: 100 });
    expect(attacker.build.learnedPassiveIds).toContain(DEF_IGNORE_PASSIVE_ID);
    const target = mockUnit('armored', 110, { def: 80, hp: 500, maxHp: 500 });
    const baseEffect = {
      type: 'damage' as const,
      target: {
        kind: 'stat' as const,
        side: 'enemy' as const,
        stat: 'def' as const,
        order: 'highest' as const,
      },
      damageType: 'physical' as const,
      amount: { kind: 'flat' as const, flatAmount: 100 },
    };
    const passives = { [DEF_IGNORE_PASSIVE_ID]: passive };
    const withIgnore = resolveDamage(attacker, target, baseEffect, passives);
    const without = resolveDamage(
      { ...attacker, build: { ...attacker.build, learnedPassiveIds: [] } },
      target,
      baseEffect,
      passives,
    );
    expect(withIgnore).toBeGreaterThan(without);
    expect(withIgnore).toBeGreaterThan(1);
  });

  it('M1 is single-target only (not multiLock)', () => {
    const swordsman = makeSwordsman(M1_ID, { battleX: 100 });
    const a = mockUnit('a', 110, { def: 80 });
    const b = mockUnit('b', 115, { def: 70 });
    const resolution = resolveModuleDamage(M1_ID, swordsman, [swordsman], [a, b]);
    expect(resolution?.waves[0]?.targets).toHaveLength(1);
  });

  it('M2 selects multiple highest-DEF enemies without same-target refill', () => {
    const swordsman = makeSwordsman(M2_ID, { battleX: 100 });
    const a = mockUnit('a', 105, { def: 90 });
    const b = mockUnit('b', 110, { def: 80 });
    const c = mockUnit('c', 115, { def: 70 });
    const d = mockUnit('d', 120, { def: 10 });
    const resolution = resolveModuleDamage(
      M2_ID,
      swordsman,
      [swordsman],
      [a, b, c, d],
    );
    const ids = resolution?.waves[0]?.targets.map((t) => t.unit.id) ?? [];
    expect(ids).toEqual(['a', 'b', 'c']);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('M2 with one candidate hits once (no M1-equivalent multi re-hit)', () => {
    const swordsman = makeSwordsman(M2_ID, { battleX: 100 });
    const only = mockUnit('only', 110, { def: 50 });
    const resolution = resolveModuleDamage(
      M2_ID,
      swordsman,
      [swordsman],
      [only],
    );
    expect(resolution?.waves[0]?.targets.map((t) => t.unit.id)).toEqual([
      'only',
    ]);
  });

  it('M2 hitCount comes from CombatModule data', () => {
    const m2 = gameData.combatModuleRegistry[M2_ID]!;
    expect(m2.action.hitCount).toBe(3);
    expect(m2.action.effectRange?.hitCount).toBe(3);
  });

  it('M2 is multiLock not pierce/splash/chain', () => {
    const m2 = gameData.combatModuleRegistry[M2_ID]!;
    expect(m2.action.targetShape).toBe('multiLock');
    expect(m2.action.targetShape).not.toBe('pierce');
    expect(m2.action.targetShape).not.toBe('chain');
    expect(m2.action.targetShape).not.toBe('aoe');
  });

  it('M1 selected: basic skill is M1 only', () => {
    const unit = makeSwordsman(M1_ID);
    const basicCd = unit.cooldowns.find((cd) => cd.slotKind === 'basic');
    expect(basicCd?.skillId).toBe(M1_ID);
    expect(basicCd?.skillId).not.toBe(M2_ID);
  });

  it('M2 selected: basic skill is M2 only', () => {
    const unit = makeSwordsman(M2_ID);
    const basicCd = unit.cooldowns.find((cd) => cd.slotKind === 'basic');
    expect(basicCd?.skillId).toBe(M2_ID);
    expect(basicCd?.skillId).not.toBe(M1_ID);
  });

  it('enemy M1 mirrors ally DEF-highest targeting (actor-side enemies)', () => {
    const enemy = makeSwordsman(M1_ID, {
      id: 'enemy_sw',
      isEnemy: true,
      battleX: 200,
    });
    const high = mockUnit('p_high', 185, {
      def: 80,
      isEnemy: false,
    });
    const low = mockUnit('p_low', 190, { def: 5, isEnemy: false });
    const resolution = resolveModuleDamage(
      M1_ID,
      enemy,
      [high, low],
      [enemy],
    );
    expect(resolution?.waves[0]?.targets[0]?.unit.id).toBe('p_high');
  });

  it('enemy M2 selects multiple ally high-DEF without re-hit', () => {
    const enemy = makeSwordsman(M2_ID, {
      id: 'enemy_sw',
      isEnemy: true,
      battleX: 200,
    });
    const a = mockUnit('p_a', 180, { def: 90, isEnemy: false });
    const b = mockUnit('p_b', 185, { def: 70, isEnemy: false });
    const resolution = resolveModuleDamage(M2_ID, enemy, [a, b], [enemy]);
    expect(resolution?.waves[0]?.targets.map((t) => t.unit.id)).toEqual([
      'p_a',
      'p_b',
    ]);
  });

  it('melee modules approach out-of-range DEF target (do not skip engaged auto-approach)', () => {
    const swordsman = makeSwordsman(M1_ID, { battleX: 80 });
    const far = mockUnit('far', 400, { def: 100 });
    expect(
      shouldSkipEngagedAutoApproach(
        swordsman,
        [swordsman],
        [far],
        gameData,
      ),
    ).toBe(false);
  });

  it('modules remain melee attackMethod', () => {
    expect(gameData.combatModuleRegistry[M1_ID]!.action.attackMethod).toBe(
      'melee',
    );
    expect(gameData.combatModuleRegistry[M2_ID]!.action.attackMethod).toBe(
      'melee',
    );
  });

  it('damage multiLock default refill still re-hits when refill is not forced false', () => {
    const actor = mockUnit('sorc', 100);
    const only = mockUnit('only', 140, { isEnemy: true });
    const resolution = resolveEffectResolution(
      {
        type: 'damage',
        damageType: 'magic',
        target: { kind: 'distance', side: 'enemy', order: 'nearest' },
        targetShape: 'multiLock',
        hitCount: 2,
        amount: { kind: 'atkBased', atkScale: 0.65 },
        effectRange: {
          form: 'single',
          applyMode: 'instant',
          hitCount: 2,
          refillSameTargetOnShortfall: true,
        },
      },
      actor,
      [actor],
      [only],
      gameData,
    );
    expect(resolution?.waves[0]?.targets.map((t) => t.unit.id)).toEqual([
      'only',
      'only',
    ]);
  });
});

describe('at_swordsman CombatModule validation (R12g-e1)', () => {
  function bundleWithModules(combatModules: CombatModuleDef[]) {
    return {
      classes: classesJson,
      enemies: enemiesJson,
      parties: partiesJson,
      stages: stagesJson,
      skills: loadSkillsRoot(),
      combatModules,
      operationPassiveCatalog: operationPassiveCatalogJson,
    };
  }

  it('rejects M1 when reshaped to multiLock', () => {
    const combatModules = structuredClone(loadMergedCombatModules());
    const m1 = combatModules.find((m) => m.id === M1_ID)!;
    m1.action.targetShape = 'multiLock';
    m1.action.hitCount = 3;
    m1.action.effectRange = {
      form: 'single',
      applyMode: 'instant',
      hitCount: 3,
      refillSameTargetOnShortfall: false,
    };
    expect(() =>
      parseAndValidateGameDataJson(bundleWithModules(combatModules)),
    ).toThrow(/M1 must be single-target/);
  });

  it('rejects damage amount 0 / negative / NaN', () => {
    for (const atkScale of [0, -1, Number.NaN]) {
      const combatModules = structuredClone(loadMergedCombatModules());
      const m1 = combatModules.find((m) => m.id === M1_ID)!;
      m1.action.effect[0] = {
        ...m1.action.effect[0]!,
        type: 'damage',
        amount: { kind: 'atkBased', atkScale },
      };
      expect(() =>
        parseAndValidateGameDataJson(bundleWithModules(combatModules)),
      ).toThrow(/atkScale/);
    }
  });

  it('rejects heal mixed into swordsman module', () => {
    const combatModules = structuredClone(loadMergedCombatModules());
    const m1 = combatModules.find((m) => m.id === M1_ID)!;
    m1.action.effect.push({
      type: 'heal',
      healSubKind: 'instant',
      target: { kind: 'stat', side: 'enemy', stat: 'def', order: 'highest' },
      amount: { kind: 'atkBased', atkScale: 1 },
    } as CombatModuleDef['action']['effect'][number]);
    expect(() =>
      parseAndValidateGameDataJson(bundleWithModules(combatModules)),
    ).toThrow(/damage effects only/);
  });

  it('rejects barrier mixed into swordsman module', () => {
    const combatModules = structuredClone(loadMergedCombatModules());
    const m1 = combatModules.find((m) => m.id === M1_ID)!;
    m1.action.effect.push({
      type: 'barrier',
      target: { kind: 'stat', side: 'enemy', stat: 'def', order: 'highest' },
      amount: { kind: 'atkBased', atkScale: 1 },
    } as CombatModuleDef['action']['effect'][number]);
    expect(() =>
      parseAndValidateGameDataJson(bundleWithModules(combatModules)),
    ).toThrow(/damage effects only/);
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

  it('rejects non-melee attackMethod', () => {
    const combatModules = structuredClone(loadMergedCombatModules());
    const m1 = combatModules.find((m) => m.id === M1_ID)!;
    m1.action.attackMethod = 'ranged';
    expect(() =>
      parseAndValidateGameDataJson(bundleWithModules(combatModules)),
    ).toThrow(/must remain melee/);
  });

  it('rejects target that is not enemy def highest', () => {
    const combatModules = structuredClone(loadMergedCombatModules());
    const m1 = combatModules.find((m) => m.id === M1_ID)!;
    m1.action.effect[0] = {
      ...m1.action.effect[0]!,
      target: { kind: 'distance', side: 'enemy', order: 'nearest' },
    };
    expect(() =>
      parseAndValidateGameDataJson(bundleWithModules(combatModules)),
    ).toThrow(/enemy def highest/);
  });

  it('production GameData validates swordsman modules', () => {
    expect(() =>
      parseAndValidateGameDataJson(bundleWithModules(loadMergedCombatModules())),
    ).not.toThrow();
  });

  it('editor round-trip preserves M1/M2 swordsman fields', () => {
    const modules = loadMergedCombatModules();
    let draft = combatModulesDraftFromModules(modules);
    const m2 = findCombatModuleDraft(draft, M2_ID)!;
    draft = upsertCombatModuleDraft(draft, {
      ...m2,
      description: `${m2.description} editor-touch`,
    });
    const normalized = normalizeCombatModulesDraftForSave(draft);
    expect(() => validateCombatModulesDraftForSave(normalized)).not.toThrow();
    const files = combatModuleFilesFromDraft(normalized);
    const swordsmanFile = files.find((file) =>
      file.modules.some((module) => module.id === M1_ID),
    );
    expect(swordsmanFile).toBeDefined();
    const roundM1 = swordsmanFile!.modules.find((m) => m.id === M1_ID)!;
    const roundM2 = swordsmanFile!.modules.find((m) => m.id === M2_ID)!;
    expect(roundM1.action.targetShape ?? 'single').toBe('single');
    expect(roundM1.action.effect[0]?.target).toMatchObject({
      kind: 'stat',
      side: 'enemy',
      stat: 'def',
      order: 'highest',
    });
    expect(roundM2.action.targetShape).toBe('multiLock');
    expect(roundM2.action.hitCount).toBe(3);
    expect(roundM2.action.effectRange?.refillSameTargetOnShortfall).toBe(false);
    expect(roundM2.action.attackMethod).toBe('melee');
  });
});
