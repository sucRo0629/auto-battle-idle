import { describe, expect, it } from 'vitest';
import type {
  CombatantState,
  DamageSkillEffect,
  GameData,
  PassiveSkillDef,
  SkillEffectDef,
  TargetRule,
} from '../types.ts';
import { normalizeTarget } from './targetSpec.ts';
import { applyPowerStep } from './powerStep.ts';
import {
  battleDistance,
  getAttackablePool,
  isWithinSkillRange,
} from './rangeUtils.ts';
import { engagedMinBodyGap } from '../battleConstants.ts';
import {
  resolveEffectAnchor,
  resolveEffectResolution,
  resolveEffectTargetSpec,
  resolveEffectTargets,
} from './targeting.ts';

const BASIC_SKILL_ID = 'test_basic_attack';

function damageEffect(
  fields: Record<string, unknown>,
  rule: TargetRule,
): SkillEffectDef {
  return {
    type: 'damage',
    damageType: 'physical',
    amount: { kind: 'atkBased', atkScale: 1 },
    target: normalizeTarget(rule),
    ...fields,
  } as SkillEffectDef;
}

function mockGameData(basicRange = 50): GameData {
  return {
    classOrder: [],
    classRegistry: {},
    skillRegistry: {
      passives: {},
      actives: {
        [BASIC_SKILL_ID]: {
          id: BASIC_SKILL_ID,
          name: 'basic',
          trigger: { kind: 'time', value: 2 },
          effect: [
            {
              target: { kind: "distance", side: "enemy", order: "nearest" },
              type: 'damage',
              damageType: 'physical',
              amount: { kind: 'atkBased', atkScale: 1 },
              range: basicRange,
            },
          ],
        },
      },
    },
    enemyRegistry: {},
    stages: [],
    parties: {},
  };
}

function mockUnit(
  id: string,
  battleX: number,
  opts: {
    hp?: number;
    maxHp?: number;
    isEnemy?: boolean;
    atk?: number;
    def?: number;
    reg?: number;
    rangePx?: number;
    formationRow?: CombatantState['formationRow'];
  } = {},
): CombatantState {
  const maxHp = opts.maxHp ?? 100;
  const hp = opts.hp ?? maxHp;
  return {
    id,
    name: id,
    hp,
    maxHp,
    atk: opts.atk ?? 10,
    def: opts.def ?? 5,
    reg: opts.reg ?? 0,
    isAlive: hp > 0,
    role: opts.isEnemy ? 'attacker' : 'attacker',
    classId: opts.isEnemy ? 'test_enemy' : 'at_sorcerer',
    formationRow: opts.formationRow ?? 'back',
    traits: {
      rangePx: opts.rangePx ?? 55,
      damageType: 'physical',
      basicAttackVfx: { preset: 'arrow', arc: true },
    },
    build: {
      learnedPassiveIds: [],
      learnedActiveIds: [],
      equippedActiveSlots: [],
    },
    cooldowns: [
      { skillId: BASIC_SKILL_ID, remaining: 0, slotKind: 'basic' },
    ],
    statusEffects: [],
    barrierHp: 0,
    spriteKey: 'placeholder',
    iconKey: 'placeholder',
    isEnemy: opts.isEnemy ?? false,
    battleX,
    visualX: battleX,
    corpseVisible: true,
  };
}

describe('rangeUtils', () => {
  it('measures ally-to-enemy distance', () => {
    const ally = mockUnit('ally', 200);
    const enemy = mockUnit('e1', 100, { isEnemy: true });
    expect(battleDistance(ally, enemy)).toBe(100);
    expect(isWithinSkillRange(ally, enemy, 120)).toBe(true);
    expect(isWithinSkillRange(ally, enemy, 80)).toBe(false);
  });
});

describe('applyPowerStep', () => {
  it('multiplies per hit index', () => {
    expect(applyPowerStep(1, 2, { stepMultiplier: 0.5, stepMode: 'multiply' })).toBe(
      0.25,
    );
  });
});

describe('resolveEffectTargets', () => {
  const gameData = mockGameData(50);
  const actor = mockUnit('ally', 200);
  const enemyNear = mockUnit('e1', 100, { isEnemy: true, hp: 80 });
  const enemyMid = mockUnit('e2', 140, { isEnemy: true, hp: 50 });
  const enemyFar = mockUnit('e3', 180, { isEnemy: true, hp: 30 });
  const enemies = [enemyNear, enemyMid, enemyFar];
  const allies = [actor];
  /** Default ranged range (50px) only reaches e3; use this for multi-target tests. */
  const fullSkillRange = 120;

  it('aoe: hits units within radius of frontEnemy anchor', () => {
    const targets = resolveEffectTargets(damageEffect({ targetShape: 'aoe', aoeRadiusPx: 60, range: fullSkillRange }, 'frontEnemy'), actor, allies, enemies, gameData);
    const ids = targets.map((t) => t.id);
    expect(ids).toContain('e3');
    expect(ids).toContain('e2');
    expect(ids).not.toContain('e1');
  });

  it('allEnemies hits every living enemy regardless of range', () => {
    const targets = resolveEffectTargets(damageEffect({ targetShape: 'single', range: 10 }, 'allEnemies'), actor, allies, enemies, gameData);
    expect(targets.map((t) => t.id).sort()).toEqual(['e1', 'e2', 'e3']);
  });

  it('allAllies hits every living ally regardless of range', () => {
    const ally2 = mockUnit('ally2', 50);
    const targets = resolveEffectTargets(damageEffect({ targetShape: 'single', range: 10 }, 'allAllies'), actor, [actor, ally2], enemies, gameData);
    expect(targets.map((t) => t.id).sort()).toEqual(['ally', 'ally2']);
  });

  it('frontEnemy picks maximum battleX among in-range', () => {
    const targets = resolveEffectTargets(damageEffect({ targetShape: 'single' }, 'frontEnemy'), actor, allies, enemies, gameData);
    expect(targets[0]?.id).toBe('e3');
  });

  it('excludes enemies outside skill range', () => {
    const targets = resolveEffectTargets(damageEffect({ targetShape: 'single', range: 95 }, 'lowestHpEnemy'), actor, allies, enemies, gameData);
    expect(targets.map((t) => t.id)).toEqual(['e3']);
  });

  it('melee range 0 requires contact', () => {
    const ally = mockUnit('ally', 100, { rangePx: 0 });
    const enemy = mockUnit('e1', 100, { isEnemy: true, rangePx: 0 });
    expect(isWithinSkillRange(ally, enemy, 0)).toBe(true);
    const farEnemy = mockUnit('e2', 90, { isEnemy: true, rangePx: 0 });
    expect(isWithinSkillRange(ally, farEnemy, 0)).toBe(false);
  });

  it('melee units at engage standoff gap can target each other', () => {
    const standoff = engagedMinBodyGap();
    const paladin = mockUnit('paladin', 250, { rangePx: 0, formationRow: 'front' });
    const enemy = mockUnit('e1', 250 + standoff, {
      isEnemy: true,
      rangePx: 0,
    });
    const spec = {
      kind: 'distance' as const,
      side: 'enemy' as const,
      order: 'nearest' as const,
    };
    expect(getAttackablePool(spec, paladin, [paladin], [enemy], 0)).toHaveLength(1);
    expect(getAttackablePool(spec, enemy, [paladin], [enemy], 0)).toHaveLength(1);
  });

  it('farthestEnemy picks minimum battleX among in-range', () => {
    const targets = resolveEffectTargets(damageEffect({ targetShape: 'single', range: fullSkillRange }, 'farthestEnemy'), actor, allies, enemies, gameData);
    expect(targets[0]?.id).toBe('e1');
  });

  it('multiLock: distributes hits across ordered pool', () => {
    const targets = resolveEffectTargets(damageEffect({ targetShape: 'multiLock', hitCount: 3, range: fullSkillRange }, 'frontEnemy'), actor, allies, enemies, gameData);
    expect(targets).toHaveLength(3);
    expect(targets.map((t) => t.id)).toEqual(['e3', 'e2', 'e1']);
  });

  it('multiLock: round-robin repeats when hits exceed pool size', () => {
    const targets = resolveEffectTargets(
      damageEffect(
        { targetShape: 'multiLock', hitCount: 3, range: 70 },
        'lowestHpEnemy',
      ),
      actor,
      allies,
      [enemyMid, enemyFar],
      gameData,
    );
    expect(targets.map((t) => t.id)).toEqual(['e3', 'e2', 'e3']);
  });

  it('multiLock: single enemy receives hitCount hits on same id', () => {
    const loneEnemy = [mockUnit('solo', 100, { isEnemy: true })];
    const targets = resolveEffectTargets(
      damageEffect(
        { targetShape: 'multiLock', hitCount: 3, range: fullSkillRange },
        'frontEnemy',
      ),
      actor,
      allies,
      loneEnemy,
      gameData,
    );
    expect(targets).toHaveLength(3);
    expect(targets.every((t) => t.id === 'solo')).toBe(true);
  });

  it('single: repeated hits on same target with duration', () => {
    const resolution = resolveEffectResolution(
      {
        targetShape: 'single',
        hitCount: 3,
        hitDurationSec: 1.5,
        range: fullSkillRange,
        type: 'damage',
        target: { kind: "distance", side: "enemy", order: "nearest" },
        damageType: 'physical',
        amount: { kind: 'atkBased', atkScale: 1 },
      },
      actor,
      allies,
      enemies,
      gameData,
    );
    expect(resolution?.spreadDurationSec).toBe(1.5);
    expect(resolution?.waves).toHaveLength(3);
    expect(
      resolution?.waves.every((wave) => wave.targets[0]?.unit.id === 'e3'),
    ).toBe(true);
  });

  it('aoe: repeated hits use same target snapshot', () => {
    const resolution = resolveEffectResolution(
      {
        targetShape: 'aoe',
        aoeRadiusPx: 60,
        hitCount: 2,
        hitDurationSec: 0.8,
        range: fullSkillRange,
        type: 'damage',
        target: { kind: "distance", side: "enemy", order: "nearest" },
        damageType: 'magic',
        amount: { kind: 'atkBased', atkScale: 1 },
      },
      actor,
      allies,
      enemies,
      gameData,
    );
    expect(resolution?.spreadDurationSec).toBe(0.8);
    expect(resolution?.waves).toHaveLength(2);
    const wave0Ids = resolution?.waves[0]?.targets.map((t) => t.unit.id).sort();
    const wave1Ids = resolution?.waves[1]?.targets.map((t) => t.unit.id).sort();
    expect(wave0Ids).toEqual(wave1Ids);
    expect(wave0Ids).toEqual(['e2', 'e3']);
  });

  it('chain: jumps to nearby enemies', () => {
    const resolution = resolveEffectResolution(
      {
        targetShape: 'chain',
        chainCount: 3,
        chainMaxDistancePx: 60,
        range: fullSkillRange,
        type: 'damage',
        target: { kind: "stat", side: "enemy", stat: "hp", order: "lowest" },
        damageType: 'magic',
        amount: { kind: 'atkBased', atkScale: 1 },
      },
      actor,
      allies,
      enemies,
      gameData,
    );
    const ids = resolution?.waves.map((w) => w.targets[0]?.unit.id);
    expect(ids).toEqual(['e3', 'e2', 'e1']);
  });

  it('pierce: orders front to back for ally attacking forward (+X)', () => {
    const forwardActor = mockUnit('ally', 100);
    const front = mockUnit('e1', 130, { isEnemy: true, hp: 80 });
    const mid = mockUnit('e2', 160, { isEnemy: true, hp: 50 });
    const back = mockUnit('e3', 190, { isEnemy: true, hp: 30 });
    const forwardEnemies = [front, mid, back];
    const effect: DamageSkillEffect = {
      targetShape: 'pierce',
      range: fullSkillRange,
      type: 'damage',
      target: { kind: "distance", side: "enemy", order: "nearest" },
      damageType: 'physical',
      amount: { kind: 'atkBased', atkScale: 1 },
    };
    const resolution = resolveEffectResolution(
      effect,
      forwardActor,
      [forwardActor],
      forwardEnemies,
      gameData,
    );
    const ids = resolution?.waves[0]?.targets.map((t) => t.unit.id);
    expect(ids).toEqual(['e1', 'e2', 'e3']);
  });

  it('pierce: hits contact enemy from melee standoff stop position', () => {
    const gap = engagedMinBodyGap();
    const contact = 130;
    const range = 50;
    const actor = mockUnit('lancer', contact - gap - range, { rangePx: range });
    const front = mockUnit('e1', contact, { isEnemy: true, hp: 80 });
    const effect: DamageSkillEffect = {
      targetShape: 'pierce',
      type: 'damage',
      target: { kind: 'distance', side: 'enemy', order: 'nearest' },
      damageType: 'physical',
      amount: { kind: 'atkBased', atkScale: 1 },
    };
    const resolution = resolveEffectResolution(
      effect,
      actor,
      [actor],
      [front],
      gameData,
    );
    const ids = resolution?.waves[0]?.targets.map((t) => t.unit.id);
    expect(ids).toEqual(['e1']);
  });

  it('pierce: orders front to back for enemy attacking backward (-X)', () => {
    const enemyActor = mockUnit('enemy', 200, { isEnemy: true });
    const playerFront = mockUnit('p1', 180);
    const playerMid = mockUnit('p2', 140);
    const playerBack = mockUnit('p3', 100);
    const effect: DamageSkillEffect = {
      targetShape: 'pierce',
      range: fullSkillRange,
      type: 'damage',
      target: { kind: "distance", side: "enemy", order: "nearest" },
      damageType: 'physical',
      amount: { kind: 'atkBased', atkScale: 1 },
    };
    const resolution = resolveEffectResolution(
      effect,
      enemyActor,
      [playerFront, playerMid, playerBack],
      [enemyActor],
      gameData,
    );
    const ids = resolution?.waves[0]?.targets.map((t) => t.unit.id);
    expect(ids).toEqual(['p1', 'p2', 'p3']);
  });

  it('scatter: uses deterministic random', () => {
    const resolution = resolveEffectResolution(
      {
        targetShape: 'scatter',
        scatterRadiusPx: 70,
        scatterHitCount: 2,
        scatterDurationSec: 1,
        scatterSpreadRate: 0,
        range: fullSkillRange,
        type: 'damage',
        target: { kind: 'distance', side: 'enemy', order: 'nearest' },
        damageType: 'magic',
        amount: { kind: 'atkBased', atkScale: 1 },
      },
      actor,
      allies,
      enemies,
      gameData,
      () => 0.5,
    );
    expect(resolution?.spreadDurationSec).toBe(1);
    expect(resolution?.waves).toHaveLength(2);
  });

  it('scatter: spread radius and hit radius are independent', () => {
    let call = 0;
    const rand = () => (call++ === 0 ? 0 : 1);
    const resolution = resolveEffectResolution(
      {
        targetShape: 'scatter',
        scatterSpreadRadiusPx: 100,
        scatterRadiusPx: 30,
        scatterHitCount: 2,
        scatterDurationSec: 1,
        scatterSpreadRate: 1,
        range: fullSkillRange,
        type: 'damage',
        target: { kind: 'distance', side: 'enemy', order: 'nearest' },
        damageType: 'magic',
        amount: { kind: 'atkBased', atkScale: 1 },
      },
      actor,
      allies,
      enemies,
      gameData,
      rand,
    );
    const wave0Ids = resolution?.waves[0]?.targets.map((t) => t.unit.id);
    expect(wave0Ids).toEqual(['e1']);
    expect(resolution?.waves[1]?.targets).toHaveLength(0);
  });

  it('closestAlly for ally actor picks nearest ally by battleX', () => {
    const actor = mockUnit('actor', 150);
    const allyNear = mockUnit('near', 120);
    const allyFar = mockUnit('far', 240);
    const anchor = resolveEffectAnchor(
      {
        type: 'move',
        target: { kind: 'distance', side: 'ally', order: 'nearest' },
        moveDurationSec: 0.2,
      },
      actor,
      [actor, allyNear, allyFar],
      [],
      gameData,
    );
    expect(anchor?.id).toBe('near');
  });

  it('toAnchor ally move ignores enemy-scoped targetRuleOverride', () => {
    const actor = mockUnit('actor', 150);
    const allyNear = mockUnit('near', 120);
    const enemy = mockUnit('enemy', 280, { isEnemy: true });
    const dataWithPassive: GameData = {
      ...gameData,
      skillRegistry: {
        ...gameData.skillRegistry,
        passives: {
          passive_target_lowest_hp: {
            id: 'passive_target_lowest_hp',
            name: '仕留めの眼',
            effect: 'targetRuleOverride',
            targetRuleOverride: {
              kind: 'stat',
              side: 'enemy',
              stat: 'hp',
              order: 'lowest',
            },
          },
        },
      },
    };
    const anchor = resolveEffectAnchor(
      {
        type: 'move',
        moveMode: 'toAnchor',
        target: { kind: 'distance', side: 'ally', order: 'nearest' },
        moveDurationSec: 0.2,
      },
      actor,
      [actor, allyNear],
      [enemy],
      dataWithPassive,
      [dataWithPassive.skillRegistry.passives.passive_target_lowest_hp],
    );
    expect(anchor?.id).toBe('near');
  });

  it('aoe heal: mostDamagedAlly anchor plus radius on allies', () => {
    const healer = mockUnit('healer', 180);
    const allyDamaged = mockUnit('ally-a', 200, { hp: 40, maxHp: 100 });
    const allyNear = mockUnit('ally-b', 230, { hp: 90, maxHp: 100 });
    const allyFar = mockUnit('ally-c', 320, { hp: 90, maxHp: 100 });
    const party = [healer, allyDamaged, allyNear, allyFar];

    const targets = resolveEffectTargets(
      {
        type: 'heal',
        target: { kind: 'stat', side: 'ally', stat: 'hp', order: 'ratio' },
        amount: { kind: 'atkBased', atkScale: 1 },
        targetShape: 'aoe',
        aoeRadiusPx: 50,
      } as SkillEffectDef,
      healer,
      party,
      enemies,
      gameData,
    );
    const ids = targets.map((t) => t.id);
    expect(ids).toContain('ally-a');
    expect(ids).toContain('ally-b');
    expect(ids).not.toContain('ally-c');
  });

  it('debuffedEnemy filters pool by targetDebuffFilter', () => {
    const ally = mockUnit('ally', 200);
    const debuffed = mockUnit('deb', 250, { isEnemy: true });
    debuffed.statusEffects.push({
      id: 'def',
      kind: 'debuff',
      stat: 'def',
      multiplier: 0.8,
      durationSec: 5,
      remainingSec: 5,
    });
    const clean = mockUnit('clean', 280, { isEnemy: true });
    const effect: SkillEffectDef = {
      type: 'damage',
      target: { kind: 'status', side: 'enemy', debuffTags: ['def'] },
      targetDebuffFilter: ['def'],
      damageType: 'physical',
      amount: { kind: 'flat', flatAmount: 10 },
    };
    const anchor = resolveEffectAnchor(
      effect,
      ally,
      [ally],
      [debuffed, clean],
      gameData,
    );
    expect(anchor?.id).toBe('deb');
  });
});

describe('heal / hot withhold when no damaged allies', () => {
  const gameData = mockGameData(200);
  const ratioAllyTarget = {
    kind: 'stat',
    side: 'ally',
    stat: 'hp',
    order: 'ratio',
  } as const;

  it('withholds heal when all allies are at max HP', () => {
    const healer = mockUnit('healer', 200);
    const ally = mockUnit('ally', 180);
    const party = [healer, ally];

    const resolution = resolveEffectResolution(
      {
        type: 'heal',
        target: ratioAllyTarget,
        amount: { kind: 'atkBased', atkScale: 1 },
      },
      healer,
      party,
      [],
      gameData,
    );
    expect(resolution).toBeNull();
  });

  it('withholds hot when all allies are at max HP', () => {
    const healer = mockUnit('healer', 200);
    const ally = mockUnit('ally', 180);
    const party = [healer, ally];

    const resolution = resolveEffectResolution(
      {
        type: 'heal',
        healSubKind: 'hot',
        target: ratioAllyTarget,
        amount: { kind: 'atkBased', atkScale: 0.2 },
        durationSec: 5,
      },
      healer,
      party,
      [],
      gameData,
    );
    expect(resolution).toBeNull();
  });

  it('resolves heal when a damaged ally is in range', () => {
    const healer = mockUnit('healer', 200);
    const damaged = mockUnit('ally-damaged', 180, { hp: 40, maxHp: 100 });
    const healthy = mockUnit('ally-healthy', 160);
    const party = [healer, damaged, healthy];

    const resolution = resolveEffectResolution(
      {
        type: 'heal',
        target: ratioAllyTarget,
        amount: { kind: 'atkBased', atkScale: 1 },
      },
      healer,
      party,
      [],
      gameData,
    );
    expect(resolution?.waves[0]?.targets[0]?.unit.id).toBe('ally-damaged');
  });

  it('resolves hot when a damaged ally is in range', () => {
    const healer = mockUnit('healer', 200);
    const damaged = mockUnit('ally-damaged', 180, { hp: 40, maxHp: 100 });
    const party = [healer, damaged];

    const resolution = resolveEffectResolution(
      {
        type: 'heal',
        healSubKind: 'hot',
        target: ratioAllyTarget,
        amount: { kind: 'atkBased', atkScale: 0.2 },
        durationSec: 5,
      },
      healer,
      party,
      [],
      gameData,
    );
    expect(resolution?.waves[0]?.targets[0]?.unit.id).toBe('ally-damaged');
  });

  it('resolves heal at full HP when the skill also grants barrier', () => {
    const healer = mockUnit('healer', 200);
    const ally = mockUnit('ally', 180);
    const party = [healer, ally];
    const skillEffects = [
      {
        type: 'buff',
        buffSubKind: 'barrier',
        target: { kind: 'all', side: 'ally' },
        amount: { kind: 'flat', flatAmount: 20 },
      },
      {
        type: 'heal',
        target: ratioAllyTarget,
        amount: { kind: 'atkBased', atkScale: 1 },
      },
    ] as SkillEffectDef[];

    const resolution = resolveEffectResolution(
      skillEffects[1]!,
      healer,
      party,
      [],
      gameData,
      Math.random,
      undefined,
      skillEffects,
    );
    expect(resolution).not.toBeNull();
    expect(resolution?.waves[0]?.targets[0]?.unit.isAlive).toBe(true);
  });
});

describe('targetRuleOverride apply scope', () => {
  const gameData = mockGameData(120);
  const actor = mockUnit('actor', 200);
  const enemyHighHp = mockUnit('e-high', 180, { isEnemy: true, hp: 80 });
  const enemyLowHp = mockUnit('e-low', 140, { isEnemy: true, hp: 20 });
  const enemies = [enemyHighHp, enemyLowHp];

  const enemyLowestHpPassive: PassiveSkillDef = {
    id: 'passive_target_lowest_hp',
    name: '手負い狩り',
    effect: 'targetRuleOverride',
    targetRuleOverrideApplyTo: 'enemy',
    targetRuleOverride: {
      kind: 'stat',
      side: 'enemy',
      stat: 'hp',
      order: 'lowest',
    },
  };

  it('enemy scope overrides enemy-facing damage to lowest HP', () => {
    const resolution = resolveEffectResolution(
      damageEffect({ range: 120 }, 'frontEnemy'),
      actor,
      [actor],
      enemies,
      gameData,
      Math.random,
      [enemyLowestHpPassive],
    );
    expect(resolution?.waves[0]?.targets[0]?.unit.id).toBe('e-low');
  });

  it('ally-scoped override does not apply to enemy-facing damage', () => {
    const allyScopePassive: PassiveSkillDef = {
      ...enemyLowestHpPassive,
      targetRuleOverrideApplyTo: 'ally',
      targetRuleOverride: {
        kind: 'stat',
        side: 'ally',
        stat: 'hp',
        order: 'ratio',
      },
    };
    const resolution = resolveEffectResolution(
      damageEffect({ range: 120 }, 'frontEnemy'),
      actor,
      [actor],
      enemies,
      gameData,
      Math.random,
      [allyScopePassive],
    );
    expect(resolution?.waves[0]?.targets[0]?.unit.id).toBe('e-high');
  });

  it('self-target buff ignores enemy-scoped override', () => {
    const spec = resolveEffectTargetSpec(
      {
        type: 'buff',
        buffSubKind: 'evasion',
        chance: 1,
        buffDurationSec: 2,
        target: { kind: 'self' },
      },
      actor,
      [actor],
      enemies,
      [enemyLowestHpPassive],
    );
    expect(spec).toEqual({ kind: 'self' });
  });

  it('ally scope overrides ally-facing heal target', () => {
    const healer = mockUnit('healer', 200);
    const allyDamaged = mockUnit('ally-damaged', 180, { hp: 25, maxHp: 100 });
    const allyHealthy = mockUnit('ally-healthy', 220, { hp: 95, maxHp: 100 });
    const allyScopePassive: PassiveSkillDef = {
      id: 'passive_heal_lowest',
      name: '要援護',
      effect: 'targetRuleOverride',
      targetRuleOverrideApplyTo: 'ally',
      targetRuleOverride: {
        kind: 'stat',
        side: 'ally',
        stat: 'hp',
        order: 'ratio',
      },
    };
    const resolution = resolveEffectResolution(
      {
        type: 'heal',
        target: { kind: 'distance', side: 'ally', order: 'nearest' },
        amount: { kind: 'atkBased', atkScale: 1 },
      },
      healer,
      [healer, allyDamaged, allyHealthy],
      enemies,
      gameData,
      Math.random,
      [allyScopePassive],
    );
    expect(resolution?.waves[0]?.targets[0]?.unit.id).toBe('ally-damaged');
  });

  it('ally scope overrides toAnchor return move anchor', () => {
    const allyNear = mockUnit('near', 170, { hp: 90, maxHp: 100 });
    const allyDamaged = mockUnit('damaged', 250, { hp: 15, maxHp: 100 });
    const allyScopePassive: PassiveSkillDef = {
      id: 'passive_return_damaged',
      name: '要援護帰還',
      effect: 'targetRuleOverride',
      targetRuleOverrideApplyTo: 'ally',
      targetRuleOverride: {
        kind: 'stat',
        side: 'ally',
        stat: 'hp',
        order: 'ratio',
      },
    };
    const anchor = resolveEffectAnchor(
      {
        type: 'move',
        moveMode: 'toAnchor',
        target: { kind: 'distance', side: 'ally', order: 'nearest' },
        moveDurationSec: 0.2,
      },
      actor,
      [actor, allyNear, allyDamaged],
      enemies,
      gameData,
      [allyScopePassive],
    );
    expect(anchor?.id).toBe('damaged');
  });

  it('selfOrigin aoe buff: hits allies within radius of actor', () => {
    const caster = mockUnit('caster', 200);
    const allyNear = mockUnit('ally-near', 230);
    const allyFar = mockUnit('ally-far', 320);
    const party = [caster, allyNear, allyFar];

    const targets = resolveEffectTargets(
      {
        type: 'buff',
        buffSubKind: 'stat',
        buffStat: 'atk',
        buffMultiplier: 1.2,
        buffDurationSec: 5,
        target: {
          kind: 'distance',
          side: 'ally',
          order: 'selfOrigin',
          includeSelf: true,
        },
        targetShape: 'aoe',
        aoeRadiusPx: 50,
      } as SkillEffectDef,
      caster,
      party,
      enemies,
      gameData,
    );
    const ids = targets.map((t) => t.id);
    expect(ids).toContain('caster');
    expect(ids).toContain('ally-near');
    expect(ids).not.toContain('ally-far');
  });

  it('selfOrigin aoe: excludes caster when includeSelf is false', () => {
    const caster = mockUnit('caster', 200);
    const allyNear = mockUnit('ally-near', 230);
    const party = [caster, allyNear];

    const targets = resolveEffectTargets(
      {
        type: 'buff',
        buffSubKind: 'stat',
        buffStat: 'atk',
        buffMultiplier: 1.2,
        buffDurationSec: 5,
        target: {
          kind: 'distance',
          side: 'ally',
          order: 'selfOrigin',
        },
        targetShape: 'aoe',
        aoeRadiusPx: 50,
      } as SkillEffectDef,
      caster,
      party,
      enemies,
      gameData,
    );
    const ids = targets.map((t) => t.id);
    expect(ids).not.toContain('caster');
    expect(ids).toContain('ally-near');
  });

  it('pierce: excludes enemies beyond forward range segment', () => {
    const actor = mockUnit('ally', 100, { rangePx: 80 });
    const inRange = mockUnit('e1', 150, { isEnemy: true });
    const outOfRange = mockUnit('e2', 220, { isEnemy: true });
    const effect: DamageSkillEffect = {
      targetShape: 'pierce',
      range: 80,
      type: 'damage',
      target: { kind: 'distance', side: 'enemy', order: 'selfOrigin' },
      damageType: 'physical',
      amount: { kind: 'atkBased', atkScale: 1 },
    };
    const resolution = resolveEffectResolution(
      effect,
      actor,
      [actor],
      [inRange, outOfRange],
      gameData,
    );
    const ids = resolution?.waves[0]?.targets.map((t) => t.unit.id);
    expect(ids).toEqual(['e1']);
  });

  it('pierce: excludes units behind actor', () => {
    const actor = mockUnit('ally', 200, { rangePx: 120 });
    const behind = mockUnit('e-behind', 150, { isEnemy: true });
    const front = mockUnit('e-front', 250, { isEnemy: true });
    const effect: DamageSkillEffect = {
      targetShape: 'pierce',
      range: 120,
      type: 'damage',
      target: { kind: 'distance', side: 'enemy', order: 'selfOrigin' },
      damageType: 'physical',
      amount: { kind: 'atkBased', atkScale: 1 },
    };
    const resolution = resolveEffectResolution(
      effect,
      actor,
      [actor],
      [behind, front],
      gameData,
    );
    const ids = resolution?.waves[0]?.targets.map((t) => t.unit.id);
    expect(ids).toEqual(['e-front']);
  });
});
