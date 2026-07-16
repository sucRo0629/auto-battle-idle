import { describe, expect, it, beforeEach } from 'vitest';
import {
  applyBarrierToTarget,
  resolveResourceAmount,
} from './combatMath.ts';
import { loadGameData } from './data/loadGameData.ts';
import { synthesizeCombatModuleSkill } from './data/synthesizeCombatModuleSkill.ts';
import { createAllyFromMember, resetEntityIdCounter } from './entities.ts';
import { loadLevelCurves } from '../progression/levelGrowth.ts';
import levelCurvesJson from '../../data/levelCurves.json';
import { initializeSkillCooldowns } from './skillTrigger.ts';
import {
  buildDangerTargetingRuntime,
  resolveEffectResolution,
} from './skills/targeting.ts';
import { mergeEffectWithSkillTargeting } from './skills/skillSharedTargeting.ts';
import { mockUnit } from './skills/targeting.fixtures.ts';
import { CONFIGURABLE_RANGE_PX_MAX } from './rangeLimits.ts';
import type {
  CombatantState,
  CombatModuleDef,
  PendingSkillHit,
  SkillEffectDef,
} from './types.ts';
import { parseAndValidateGameDataJson } from './data/validateGameData.ts';
import classesJson from '../../data/classes.json';
import enemiesJson from '../../data/enemies.json';
import partiesJson from '../../data/parties.json';
import stagesJson from '../../data/stages.json';
import operationPassiveCatalogJson from '../../data/operation-passive-catalog.json';
import { isAllyBarrierBasicAttack } from './allyHealBasicAttack.ts';
import { shouldSkipEngagedAutoApproach } from './resolveApproachBattleX.ts';

const gameData = loadGameData();
const levelCurves = loadLevelCurves(levelCurvesJson);

const M1_ID = 'sp_wardweaver_mod_focus_barrier';
const M2_ID = 'sp_wardweaver_mod_spread_barrier';

const damageEffect = {
  type: 'damage',
  target: { kind: 'distance', side: 'enemy', order: 'nearest' },
  damageType: 'physical',
  amount: { kind: 'atkBased', atkScale: 1 },
} as SkillEffectDef;

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

function makeWardweaver(
  moduleId: string,
  partial: Partial<CombatantState> = {},
): CombatantState {
  const preset = gameData.classRegistry.sp_wardweaver!;
  const unit = createAllyFromMember(
    mockMember('sp_wardweaver'),
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
    id: partial.id ?? 'wardweaver',
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

function barrierEffect(moduleId: string): {
  skill: ReturnType<typeof moduleSkill>;
  effect: SkillEffectDef;
} {
  const skill = moduleSkill(moduleId);
  const raw = skill.effect.find(
    (entry) =>
      entry.type === 'barrier' ||
      (entry.type === 'buff' && entry.buffSubKind === 'barrier'),
  );
  expect(raw).toBeDefined();
  return { skill, effect: mergeEffectWithSkillTargeting(skill, raw!) };
}

function makePendingHit(
  partial: Partial<PendingSkillHit> &
    Pick<PendingSkillHit, 'actorId' | 'targets'>,
): PendingSkillHit {
  return {
    applyAtBattleSec: 1,
    skillId: 'test_skill',
    skillName: 'test',
    effectDef: damageEffect,
    effectIndex: 0,
    slotKind: 'basic',
    hitIndex: 0,
    ...partial,
  };
}

function resolveTargets(
  units: CombatantState[],
  mapping: Record<string, string | null>,
) {
  const byId = new Map(units.map((unit) => [unit.id, unit]));
  return (attacker: CombatantState): CombatantState | null => {
    const targetId = mapping[attacker.id];
    return targetId ? byId.get(targetId) ?? null : null;
  };
}

function resolveModuleBarrier(
  moduleId: string,
  actor: CombatantState,
  allies: CombatantState[],
  enemies: CombatantState[] = [],
  options: {
    pendingHits?: PendingSkillHit[];
    resolveCurrentAttackTarget?: (attacker: CombatantState) => CombatantState | null;
  } = {},
) {
  const { skill, effect } = barrierEffect(moduleId);
  const targetingRuntime = buildDangerTargetingRuntime(
    allies,
    enemies,
    gameData,
    {
      battleSec: 0,
      pendingHits: options.pendingHits ?? [],
      resolveCurrentAttackTarget: options.resolveCurrentAttackTarget,
    },
  );
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

describe('sp_wardweaver CombatModule data (R12g-d4)', () => {
  beforeEach(() => {
    resetEntityIdCounter();
  });

  it('parses M1/M2 module shape from CombatModule data', () => {
    const m1 = gameData.combatModuleRegistry[M1_ID]!;
    const m2 = gameData.combatModuleRegistry[M2_ID]!;
    expect(m1.classId).toBe('sp_wardweaver');
    expect(m2.classId).toBe('sp_wardweaver');
    expect(m1.displayName).toContain('重点');
    expect(m2.displayName).toContain('分散');
    expect(m1.description).toMatch(/危険|厚いBarrier|重点/);
    expect(m2.description).toMatch(/薄い|複数|分散/);
    expect(m1.description).not.toMatch(/HP回復|消費後回復|damage.?reduc|Wave開始/i);
    expect(m2.description).not.toMatch(/HP回復|消費後回復|damage.?reduc|Wave開始/i);
    expect(m2.description).toMatch(/一律Barrierではない/);

    const m1Effect = m1.action.effect[0]!;
    const m2Effect = m2.action.effect[0]!;
    expect(
      m1Effect.type === 'barrier' ||
        (m1Effect.type === 'buff' && m1Effect.buffSubKind === 'barrier'),
    ).toBe(true);
    expect(
      m2Effect.type === 'barrier' ||
        (m2Effect.type === 'buff' && m2Effect.buffSubKind === 'barrier'),
    ).toBe(true);
    expect(m1.action.targetShape ?? 'single').toBe('single');
    expect(m2.action.targetShape).toBe('multiLock');
    expect(m2.action.hitCount).toBeGreaterThanOrEqual(2);
    expect(m2.action.effectRange?.refillSameTargetOnShortfall).toBe(false);
    expect(m1.runtimeEffect).toBeUndefined();
    expect(m2.runtimeEffect).toBeUndefined();

    const cls = gameData.classRegistry.sp_wardweaver!;
    expect(cls.combatModuleIds).toEqual([M1_ID, M2_ID]);
  });

  it('M1 selects danger ally target once', () => {
    const weaver = makeWardweaver(M1_ID, { battleX: 100 });
    const safe = mockUnit('safe', 200, { hp: 100, maxHp: 100 });
    const danger = mockUnit('danger', 400, { hp: 100, maxHp: 100 });
    const enemy = mockUnit('enemy', 600, {
      isEnemy: true,
      hp: 100,
      maxHp: 100,
    });
    const pending = [
      makePendingHit({
        actorId: enemy.id,
        applyAtBattleSec: 0.2,
    targets: [{ targetId: danger.id }],
      }),
      makePendingHit({
        actorId: enemy.id,
        applyAtBattleSec: 0.3,
    targets: [{ targetId: danger.id }],
      }),
    ];
    const resolution = resolveModuleBarrier(
      M1_ID,
      weaver,
      [weaver, safe, danger],
      [enemy],
      {
        pendingHits: pending,
        resolveCurrentAttackTarget: resolveTargets(
          [weaver, safe, danger, enemy],
          { [enemy.id]: danger.id },
        ),
      },
    );
    expect(resolution?.waves[0]?.targets.map((t) => t.unit.id)).toEqual([
      'danger',
    ]);
  });

  it('M1 is no-op when danger signal is 0', () => {
    const weaver = makeWardweaver(M1_ID, { battleX: 100 });
    const ally = mockUnit('ally', 300, { hp: 10, maxHp: 100 });
    const resolution = resolveModuleBarrier(M1_ID, weaver, [weaver, ally], [], {
      resolveCurrentAttackTarget: () => null,
    });
    expect(resolution).toBeNull();
  });

  it('M1 can select distant backline danger target', () => {
    const weaver = makeWardweaver(M1_ID, { battleX: 80 });
    const farBack = mockUnit('far_back', 80 + CONFIGURABLE_RANGE_PX_MAX - 10, {
      hp: 100,
      maxHp: 100,
      formationRow: 'back',
    });
    const enemy = mockUnit('enemy', 900, { isEnemy: true });
    const pending = [
      makePendingHit({
        actorId: enemy.id,
        applyAtBattleSec: 0.1,
        targets: [{ targetId: farBack.id }],
      }),
    ];
    const resolution = resolveModuleBarrier(
      M1_ID,
      weaver,
      [weaver, farBack],
      [enemy],
      {
        pendingHits: pending,
        resolveCurrentAttackTarget: resolveTargets(
          [weaver, farBack, enemy],
          { [enemy.id]: farBack.id },
        ),
      },
    );
    expect(resolution?.waves[0]?.targets[0]?.unit.id).toBe('far_back');
  });

  it('M1 Barrier amount per target is higher than M2', () => {
    const m1 = barrierEffect(M1_ID).effect;
    const m2 = barrierEffect(M2_ID).effect;
    const actor = makeWardweaver(M1_ID, { atk: 100 });
    const target = mockUnit('t', 200, { hp: 100, maxHp: 100, barrierHp: 0 });
    const m1Amt = resolveResourceAmount(
      actor,
      target,
      m1.amount!,
      gameData.skillRegistry.passives,
    );
    const m2Amt = resolveResourceAmount(
      actor,
      target,
      m2.amount!,
      gameData.skillRegistry.passives,
    );
    expect(m1Amt).toBeGreaterThan(m2Amt);
    expect(m1Amt).toBeGreaterThan(0);
    expect(m2Amt).toBeGreaterThan(0);
  });

  it('Barrier grant does not change HP', () => {
    const target = mockUnit('t', 200, { hp: 40, maxHp: 100, barrierHp: 0 });
    const hpBefore = target.hp;
    applyBarrierToTarget(target, 50, true);
    expect(target.hp).toBe(hpBefore);
    expect(target.barrierHp).toBe(50);
  });

  it('M2 selects multiple barrier-short allies without re-hit', () => {
    const weaver = makeWardweaver(M2_ID, {
      battleX: 100,
      barrierHp: 40,
      hp: 100,
      maxHp: 100,
    });
    const a = mockUnit('a', 400, { barrierHp: 0, hp: 100, maxHp: 100 });
    const b = mockUnit('b', 300, { barrierHp: 5, hp: 100, maxHp: 100 });
    const c = mockUnit('c', 200, { barrierHp: 10, hp: 100, maxHp: 100 });
    const enough = mockUnit('enough', 150, {
      barrierHp: 40,
      hp: 100,
      maxHp: 100,
    });
    const resolution = resolveModuleBarrier(M2_ID, weaver, [
      weaver,
      a,
      b,
      c,
      enough,
    ]);
    const ids = resolution?.waves[0]?.targets.map((t) => t.unit.id) ?? [];
    expect(ids).toEqual(['a', 'b', 'c']);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain('enough');
    expect(ids).not.toContain('wardweaver');
  });

  it('M2 with only one shortfall target hits once (no same-target refill)', () => {
    const weaver = makeWardweaver(M2_ID, {
      battleX: 100,
      barrierHp: 40,
      hp: 100,
      maxHp: 100,
    });
    const short = mockUnit('short', 300, { barrierHp: 0, hp: 100, maxHp: 100 });
    const enough = mockUnit('enough', 200, {
      barrierHp: 50,
      hp: 100,
      maxHp: 100,
    });
    const resolution = resolveModuleBarrier(M2_ID, weaver, [
      weaver,
      short,
      enough,
    ]);
    expect(resolution?.waves[0]?.targets.map((t) => t.unit.id)).toEqual([
      'short',
    ]);
  });

  it('M2 is no-op when all allies have sufficient Barrier', () => {
    const weaver = makeWardweaver(M2_ID, {
      barrierHp: 40,
      hp: 100,
      maxHp: 100,
    });
    const enough = mockUnit('enough', 200, {
      barrierHp: 40,
      hp: 100,
      maxHp: 100,
    });
    expect(resolveModuleBarrier(M2_ID, weaver, [weaver, enough])).toBeNull();
  });

  it('M2 does not exclude distant backline by distance', () => {
    const weaver = makeWardweaver(M2_ID, { battleX: 80 });
    const far = mockUnit('far', 80 + CONFIGURABLE_RANGE_PX_MAX - 20, {
      barrierHp: 0,
      hp: 100,
      maxHp: 100,
      formationRow: 'back',
    });
    const near = mockUnit('near', 140, {
      barrierHp: 5,
      hp: 100,
      maxHp: 100,
    });
    const resolution = resolveModuleBarrier(M2_ID, weaver, [weaver, far, near]);
    const ids = resolution?.waves[0]?.targets.map((t) => t.unit.id) ?? [];
    expect(ids).toContain('far');
    expect(ids).toContain('near');
  });

  it('M1 selected: M2 skill does not resolve as basic', () => {
    const weaver = makeWardweaver(M1_ID);
    const basicCd = weaver.cooldowns.find((cd) => cd.slotKind === 'basic');
    expect(basicCd?.skillId).toBe(M1_ID);
    expect(basicCd?.skillId).not.toBe(M2_ID);
  });

  it('M2 selected: M1 skill does not resolve as basic', () => {
    const weaver = makeWardweaver(M2_ID);
    const basicCd = weaver.cooldowns.find((cd) => cd.slotKind === 'basic');
    expect(basicCd?.skillId).toBe(M2_ID);
    expect(basicCd?.skillId).not.toBe(M1_ID);
  });

  it('enemy wardweaver uses the same module data (ally-from-actor)', () => {
    const enemyWeaver = makeWardweaver(M2_ID, {
      id: 'enemy_weaver',
      isEnemy: true,
      battleX: 700,
    });
    const e1 = mockUnit('e1', 650, {
      isEnemy: true,
      barrierHp: 0,
      hp: 100,
      maxHp: 100,
    });
    const e2 = mockUnit('e2', 620, {
      isEnemy: true,
      barrierHp: 8,
      hp: 100,
      maxHp: 100,
    });
    const players = [mockUnit('p1', 100, { hp: 100, maxHp: 100 })];
    const resolution = resolveModuleBarrier(
      M2_ID,
      enemyWeaver,
      players,
      [enemyWeaver, e1, e2],
    );
    const ids = resolution?.waves[0]?.targets.map((t) => t.unit.id) ?? [];
    expect(ids).toContain('e1');
    expect(ids).toContain('e2');
    expect(ids).not.toContain('p1');
  });

  it('barrier module skips enemy approach chase', () => {
    const weaver = makeWardweaver(M1_ID, { battleX: 80 });
    expect(isAllyBarrierBasicAttack(weaver, gameData)).toBe(true);
    const enemy = mockUnit('enemy', 500, { isEnemy: true });
    expect(
      shouldSkipEngagedAutoApproach(weaver, [weaver], [enemy], gameData),
    ).toBe(true);
  });

  it('validate rejects heal-mixed wardweaver module', () => {
    const modules = loadMergedCombatModules().map((module) =>
      structuredClone(module),
    );
    const target = modules.find((module) => module.id === M1_ID)!;
    target.action.effect = [
      {
        target: {
          kind: 'danger',
          side: 'ally',
          maxTargets: 1,
          windowSec: 2,
        },
        type: 'heal',
        healSubKind: 'instant',
        amount: { kind: 'atkBased', atkScale: 1 },
      },
    ];
    expect(() =>
      parseAndValidateGameDataJson({
        classes: classesJson,
        skills: loadSkillsRoot(),
        combatModules: modules,
        enemies: enemiesJson,
        stages: stagesJson,
        parties: partiesJson,
        operationPassiveCatalog: operationPassiveCatalogJson,
      }),
    ).toThrow(/barrier effects only|heal/);
  });

  it('validate rejects M2 without requireBelow', () => {
    const modules = loadMergedCombatModules().map((module) =>
      structuredClone(module),
    );
    const target = modules.find((module) => module.id === M2_ID)!;
    const effect = target.action.effect[0]!;
    if (effect.target && effect.target.kind === 'stat') {
      delete effect.target.requireBelow;
    }
    expect(() =>
      parseAndValidateGameDataJson({
        classes: classesJson,
        skills: loadSkillsRoot(),
        combatModules: modules,
        enemies: enemiesJson,
        stages: stagesJson,
        parties: partiesJson,
        operationPassiveCatalog: operationPassiveCatalogJson,
      }),
    ).toThrow(/requireBelow/);
  });

  it('production bundle validates with wardweaver modules', () => {
    expect(() =>
      parseAndValidateGameDataJson({
        classes: classesJson,
        skills: loadSkillsRoot(),
        combatModules: loadMergedCombatModules(),
        enemies: enemiesJson,
        stages: stagesJson,
        parties: partiesJson,
        operationPassiveCatalog: operationPassiveCatalogJson,
      }),
    ).not.toThrow();
  });
});
