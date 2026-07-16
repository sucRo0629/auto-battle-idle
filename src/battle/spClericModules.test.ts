import { describe, expect, it, beforeEach } from 'vitest';
import { applyHealToTarget, resolveHealAmount } from './combatMath.ts';
import { loadGameData } from './data/loadGameData.ts';
import { synthesizeCombatModuleSkill } from './data/synthesizeCombatModuleSkill.ts';
import { createAllyFromMember, resetEntityIdCounter } from './entities.ts';
import { loadLevelCurves } from '../progression/levelGrowth.ts';
import levelCurvesJson from '../../data/levelCurves.json';
import { initializeSkillCooldowns } from './skillTrigger.ts';
import {
  evaluateHealWithholdReason,
  resolveEffectResolution,
} from './skills/targeting.ts';
import { mergeEffectWithSkillTargeting } from './skills/skillSharedTargeting.ts';
import { mockUnit } from './skills/targeting.fixtures.ts';
import { CONFIGURABLE_RANGE_PX_MAX } from './rangeLimits.ts';
import type { CombatantState, CombatModuleDef, SkillEffectDef } from './types.ts';
import { parseAndValidateGameDataJson } from './data/validateGameData.ts';
import classesJson from '../../data/classes.json';
import enemiesJson from '../../data/enemies.json';
import partiesJson from '../../data/parties.json';
import stagesJson from '../../data/stages.json';
import operationPassiveCatalogJson from '../../data/operation-passive-catalog.json';

const gameData = loadGameData();
const levelCurves = loadLevelCurves(levelCurvesJson);

const M1_ID = 'sp_cleric_mod_single_mend';
const M2_ID = 'sp_cleric_mod_party_mend';

function mockMember(classId: string) {
  return {
    classId,
    build: {
      learnedPassiveIds: [] as string[],
      learnedActiveIds: [] as string[],
      equippedActiveSlots: [] as string[],
    },
    progress: { level: 10, exp: 0 },
  };
}

function makeCleric(
  moduleId: string,
  partial: Partial<CombatantState> = {},
): CombatantState {
  const preset = gameData.classRegistry.sp_cleric!;
  const cleric = createAllyFromMember(
    mockMember('sp_cleric'),
    preset,
    levelCurves,
    gameData,
    moduleId,
  );
  const basicCd = cleric.cooldowns.find((cd) => cd.slotKind === 'basic');
  if (basicCd) basicCd.skillId = moduleId;
  initializeSkillCooldowns(cleric, gameData.skillRegistry.actives);
  return {
    ...cleric,
    id: partial.id ?? 'cleric',
    isEnemy: partial.isEnemy ?? false,
    battleX: partial.battleX ?? 80,
    formationRow: partial.formationRow ?? 'back',
    barrierHp: 0,
    ...partial,
  };
}

function moduleSkill(moduleId: string) {
  const module = gameData.combatModuleRegistry[moduleId];
  expect(module).toBeDefined();
  return synthesizeCombatModuleSkill(module!);
}

function healEffect(moduleId: string): {
  skill: ReturnType<typeof moduleSkill>;
  effect: SkillEffectDef;
} {
  const skill = moduleSkill(moduleId);
  const raw = skill.effect.find((entry) => entry.type === 'heal');
  expect(raw?.type).toBe('heal');
  return { skill, effect: mergeEffectWithSkillTargeting(skill, raw!) };
}

function resolveModuleHeal(
  moduleId: string,
  actor: CombatantState,
  allies: CombatantState[],
  enemies: CombatantState[] = [],
) {
  const { skill, effect } = healEffect(moduleId);
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

describe('sp_cleric CombatModule data (R12g-d3)', () => {
  beforeEach(() => {
    resetEntityIdCounter();
  });

  it('parses M1/M2 module shape from CombatModule data', () => {
    const m1 = gameData.combatModuleRegistry[M1_ID]!;
    const m2 = gameData.combatModuleRegistry[M2_ID]!;
    expect(m1.classId).toBe('sp_cleric');
    expect(m2.classId).toBe('sp_cleric');
    expect(m1.displayName).toContain('緊急');
    expect(m2.displayName).toContain('分散');
    expect(m1.description).not.toMatch(/Barrier|バリア/);
    expect(m2.description).not.toMatch(/Barrier|バリア/);
    expect(m2.description).toMatch(/一律回復ではない/);
    expect(m1.description).toMatch(/HP割合/);
    expect(m2.description).toMatch(/複数/);

    expect(m1.action.effect[0]?.type).toBe('heal');
    expect(m2.action.effect[0]?.type).toBe('heal');
    expect(m1.action.targetShape ?? 'single').toBe('single');
    expect(m2.action.targetShape).toBe('multiLock');
    expect(m2.action.hitCount).toBeGreaterThanOrEqual(2);
    expect(m2.action.effectRange?.refillSameTargetOnShortfall).toBe(false);
    expect(m1.action.effect.every((e) => e.type === 'heal')).toBe(true);
    expect(m2.action.effect.every((e) => e.type === 'heal')).toBe(true);
    expect(m1.runtimeEffect).toBeUndefined();
    expect(m2.runtimeEffect).toBeUndefined();

    const cls = gameData.classRegistry.sp_cleric!;
    expect(cls.combatModuleIds).toEqual([M1_ID, M2_ID]);
  });

  it('M1 selects lowest HP-ratio damaged ally only', () => {
    const cleric = makeCleric(M1_ID, { battleX: 100 });
    const low = mockUnit('low', 400, { hp: 20, maxHp: 100 });
    const mid = mockUnit('mid', 200, { hp: 50, maxHp: 100 });
    const full = mockUnit('full', 300, { hp: 100, maxHp: 100 });
    const resolution = resolveModuleHeal(M1_ID, cleric, [cleric, low, mid, full]);
    expect(resolution?.waves[0]?.targets.map((t) => t.unit.id)).toEqual(['low']);
  });

  it('M1 withholds when all allies are full HP (no-op, no self fallback)', () => {
    const { skill, effect } = healEffect(M1_ID);
    const cleric = makeCleric(M1_ID, { hp: 100, maxHp: 100, battleX: 100 });
    const full = mockUnit('full', 300, { hp: 100, maxHp: 100 });
    expect(
      evaluateHealWithholdReason(
        effect,
        cleric,
        [cleric, full],
        [],
        gameData,
        undefined,
        skill,
      ),
    ).toBe('all_full_hp');
    expect(resolveModuleHeal(M1_ID, cleric, [cleric, full])).toBeNull();
  });

  it('M1 does not exclude distant backline by distance', () => {
    const cleric = makeCleric(M1_ID, { battleX: 80 });
    const farBack = mockUnit('far_back', 80 + CONFIGURABLE_RANGE_PX_MAX - 10, {
      hp: 10,
      maxHp: 100,
      formationRow: 'back',
    });
    const nearFull = mockUnit('near_full', 120, { hp: 100, maxHp: 100 });
    const resolution = resolveModuleHeal(M1_ID, cleric, [
      cleric,
      farBack,
      nearFull,
    ]);
    expect(resolution?.waves[0]?.targets[0]?.unit.id).toBe('far_back');
  });

  it('M1 heal amount per target is higher than M2', () => {
    const m1 = healEffect(M1_ID).effect;
    const m2 = healEffect(M2_ID).effect;
    const healer = makeCleric(M1_ID, { atk: 100 });
    const target = mockUnit('t', 200, { hp: 10, maxHp: 500 });
    const m1Amt = resolveHealAmount(
      healer,
      target,
      m1.amount!,
      gameData.skillRegistry.passives,
    );
    const m2Amt = resolveHealAmount(
      healer,
      target,
      m2.amount!,
      gameData.skillRegistry.passives,
    );
    expect(m1Amt).toBeGreaterThan(m2Amt);
    expect(m1Amt).toBeGreaterThan(0);
    expect(m2Amt).toBeGreaterThan(0);
  });

  it('M1 heal clamps to maxHp and does not create Barrier', () => {
    const { effect } = healEffect(M1_ID);
    const healer = makeCleric(M1_ID, { atk: 200 });
    const target = mockUnit('t', 200, { hp: 90, maxHp: 100, barrierHp: 0 });
    const amount = resolveHealAmount(
      healer,
      target,
      effect.amount!,
      gameData.skillRegistry.passives,
    );
    const applied = applyHealToTarget(target, amount);
    expect(applied).toBe(10);
    expect(target.hp).toBe(100);
    expect(target.barrierHp).toBe(0);
  });

  it('M2 selects multiple damaged allies by HP ratio without re-hit', () => {
    const cleric = makeCleric(M2_ID, { battleX: 100 });
    const a = mockUnit('a', 400, { hp: 10, maxHp: 100 });
    const b = mockUnit('b', 300, { hp: 40, maxHp: 100 });
    const c = mockUnit('c', 200, { hp: 70, maxHp: 100 });
    const full = mockUnit('full', 150, { hp: 100, maxHp: 100 });
    const resolution = resolveModuleHeal(M2_ID, cleric, [
      cleric,
      a,
      b,
      c,
      full,
    ]);
    const ids = resolution?.waves[0]?.targets.map((t) => t.unit.id) ?? [];
    expect(ids).toEqual(['a', 'b', 'c']);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain('full');
  });

  it('M2 with only one wounded heals that one once (no same-target refill)', () => {
    const cleric = makeCleric(M2_ID, { battleX: 100 });
    const wounded = mockUnit('wounded', 300, { hp: 20, maxHp: 100 });
    const full = mockUnit('full', 200, { hp: 100, maxHp: 100 });
    const resolution = resolveModuleHeal(M2_ID, cleric, [
      cleric,
      wounded,
      full,
    ]);
    expect(resolution?.waves[0]?.targets.map((t) => t.unit.id)).toEqual([
      'wounded',
    ]);
  });

  it('M2 withholds when all full HP', () => {
    const cleric = makeCleric(M2_ID, { hp: 100, maxHp: 100 });
    const full = mockUnit('full', 200, { hp: 100, maxHp: 100 });
    expect(resolveModuleHeal(M2_ID, cleric, [cleric, full])).toBeNull();
  });

  it('M2 does not exclude distant backline by distance', () => {
    const cleric = makeCleric(M2_ID, { battleX: 80 });
    const far = mockUnit('far', 80 + CONFIGURABLE_RANGE_PX_MAX - 20, {
      hp: 15,
      maxHp: 100,
      formationRow: 'back',
    });
    const near = mockUnit('near', 140, { hp: 40, maxHp: 100 });
    const resolution = resolveModuleHeal(M2_ID, cleric, [cleric, far, near]);
    const ids = resolution?.waves[0]?.targets.map((t) => t.unit.id) ?? [];
    expect(ids).toContain('far');
    expect(ids).toContain('near');
  });

  it('M1 selected: M2 skill does not resolve as basic (module exclusivity)', () => {
    const cleric = makeCleric(M1_ID);
    const basicCd = cleric.cooldowns.find((cd) => cd.slotKind === 'basic');
    expect(basicCd?.skillId).toBe(M1_ID);
    expect(basicCd?.skillId).not.toBe(M2_ID);
  });

  it('M2 selected: M1 skill does not resolve as basic', () => {
    const cleric = makeCleric(M2_ID);
    const basicCd = cleric.cooldowns.find((cd) => cd.slotKind === 'basic');
    expect(basicCd?.skillId).toBe(M2_ID);
    expect(basicCd?.skillId).not.toBe(M1_ID);
  });

  it('enemy M1 mirrors ally targeting (actor-side allies)', () => {
    const enemyCleric = makeCleric(M1_ID, {
      id: 'enemy_cleric',
      isEnemy: true,
      battleX: 900,
    });
    const low = mockUnit('e_low', 700, {
      hp: 20,
      maxHp: 100,
      isEnemy: true,
    });
    const full = mockUnit('e_full', 800, {
      hp: 100,
      maxHp: 100,
      isEnemy: true,
    });
    const resolution = resolveModuleHeal(
      M1_ID,
      enemyCleric,
      [],
      [enemyCleric, low, full],
    );
    expect(resolution?.waves[0]?.targets[0]?.unit.id).toBe('e_low');
  });

  it('enemy M2 selects multiple wounded on enemy side without re-hit', () => {
    const enemyCleric = makeCleric(M2_ID, {
      id: 'enemy_cleric',
      isEnemy: true,
      battleX: 900,
    });
    const a = mockUnit('e_a', 700, { hp: 10, maxHp: 100, isEnemy: true });
    const b = mockUnit('e_b', 750, { hp: 40, maxHp: 100, isEnemy: true });
    const resolution = resolveModuleHeal(
      M2_ID,
      enemyCleric,
      [],
      [enemyCleric, a, b],
    );
    expect(resolution?.waves[0]?.targets.map((t) => t.unit.id)).toEqual([
      'e_a',
      'e_b',
    ]);
  });

  it('heal modules do not target enemies for damage', () => {
    const { effect } = healEffect(M1_ID);
    const cleric = makeCleric(M1_ID);
    const ally = mockUnit('ally', 200, { hp: 50, maxHp: 100 });
    const foe = mockUnit('foe', 400, { hp: 50, maxHp: 100, isEnemy: true });
    const resolution = resolveModuleHeal(M1_ID, cleric, [cleric, ally], [foe]);
    expect(resolution?.waves[0]?.targets[0]?.unit.id).toBe('ally');
    expect(effect.type).toBe('heal');
  });
});

describe('sp_cleric CombatModule validation (R12g-d3)', () => {
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

  it('rejects heal amount 0 / negative / NaN on cleric modules', () => {
    for (const atkScale of [0, -1, Number.NaN]) {
      const combatModules = structuredClone(loadMergedCombatModules());
      const m1 = combatModules.find((m) => m.id === M1_ID)!;
      m1.action.effect[0] = {
        ...m1.action.effect[0]!,
        type: 'heal',
        amount: { kind: 'atkBased', atkScale },
      };
      expect(() =>
        parseAndValidateGameDataJson(bundleWithModules(combatModules)),
      ).toThrow(/atkScale/);
    }
  });

  it('rejects damage effect mixed into cleric heal module', () => {
    const combatModules = structuredClone(loadMergedCombatModules());
    const m1 = combatModules.find((m) => m.id === M1_ID)!;
    m1.action.effect.push({
      type: 'damage',
      damageType: 'magic',
      target: { kind: 'distance', side: 'enemy', order: 'nearest' },
      amount: { kind: 'atkBased', atkScale: 1 },
    } as CombatModuleDef['action']['effect'][number]);
    expect(() =>
      parseAndValidateGameDataJson(bundleWithModules(combatModules)),
    ).toThrow(/heal effects only/);
  });

  it('rejects barrier effect mixed into cleric heal module', () => {
    const combatModules = structuredClone(loadMergedCombatModules());
    const m1 = combatModules.find((m) => m.id === M1_ID)!;
    m1.action.effect.push({
      type: 'barrier',
      target: { kind: 'stat', side: 'ally', stat: 'hp', order: 'ratio' },
      amount: { kind: 'atkBased', atkScale: 1 },
    } as CombatModuleDef['action']['effect'][number]);
    expect(() =>
      parseAndValidateGameDataJson(bundleWithModules(combatModules)),
    ).toThrow(/heal effects only/);
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

  it('M2 requires hitCount >= 2 and refillSameTargetOnShortfall false in shipped data', () => {
    const m2 = gameData.combatModuleRegistry[M2_ID]!;
    expect(m2.action.hitCount ?? 0).toBeGreaterThanOrEqual(2);
    expect(m2.action.effectRange?.refillSameTargetOnShortfall).toBe(false);
  });
});

describe('multiLock refillSameTargetOnShortfall wiring', () => {
  it('default / true still re-hits same target on shortfall', () => {
    const healer = mockUnit('healer', 200);
    const wounded = mockUnit('wounded', 180, { hp: 20, maxHp: 100 });
    const healthy = mockUnit('healthy', 160);
    const resolution = resolveEffectResolution(
      {
        type: 'heal',
        target: { kind: 'stat', side: 'ally', stat: 'hp', order: 'ratio' },
        targetShape: 'multiLock',
        hitCount: 2,
        amount: { kind: 'atkBased', atkScale: 1 },
        effectRange: {
          form: 'single',
          applyMode: 'instant',
          hitCount: 2,
          refillSameTargetOnShortfall: true,
        },
      },
      healer,
      [healer, wounded, healthy],
      [],
      gameData,
    );
    expect(resolution?.waves[0]?.targets.map((hit) => hit.unit.id)).toEqual([
      'wounded',
      'wounded',
    ]);
  });

  it('false does not re-hit same target on shortfall', () => {
    const healer = mockUnit('healer', 200);
    const wounded = mockUnit('wounded', 180, { hp: 20, maxHp: 100 });
    const healthy = mockUnit('healthy', 160);
    const resolution = resolveEffectResolution(
      {
        type: 'heal',
        target: { kind: 'stat', side: 'ally', stat: 'hp', order: 'ratio' },
        targetShape: 'multiLock',
        hitCount: 2,
        amount: { kind: 'atkBased', atkScale: 1 },
        effectRange: {
          form: 'single',
          applyMode: 'instant',
          hitCount: 2,
          refillSameTargetOnShortfall: false,
        },
      },
      healer,
      [healer, wounded, healthy],
      [],
      gameData,
    );
    expect(resolution?.waves[0]?.targets.map((hit) => hit.unit.id)).toEqual([
      'wounded',
    ]);
  });
});
