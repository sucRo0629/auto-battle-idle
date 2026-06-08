import { describe, expect, it } from 'vitest';
import type { CombatantState, DamageSkillEffect } from '../types.ts';
import { applyPowerStep } from './powerStep.ts';
import { battleDistance, isWithinSkillRange } from './rangeUtils.ts';
import {
  resolveEffectAnchor,
  resolveEffectResolution,
  resolveEffectTargets,
} from './targeting.ts';

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
    attackRange?: 'melee' | 'ranged';
    rangePx?: number;
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
    classId: opts.isEnemy ? 'test_enemy' : 'attacker_jutsushi',
    formationRow: 'back',
    traits: {
      attackRange: opts.attackRange ?? 'ranged',
      ...(opts.rangePx !== undefined
        ? { rangePx: opts.rangePx }
        : (opts.attackRange ?? 'ranged') === 'ranged'
          ? { rangePx: 120 }
          : {}),
    },
    build: {
      learnedPassiveIds: [],
      learnedActiveIds: [],
      equippedActiveSlots: [],
    },
    cooldowns: [],
    statusEffects: [],
    barrierHp: 0,
    spriteKey: 'placeholder',
    iconKey: 'placeholder',
    isEnemy: opts.isEnemy ?? false,
    battleX,
    visualX: battleX,
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
  const actor = mockUnit('ally', 200);
  const enemyNear = mockUnit('e1', 100, { isEnemy: true, hp: 80 });
  const enemyMid = mockUnit('e2', 140, { isEnemy: true, hp: 50 });
  const enemyFar = mockUnit('e3', 180, { isEnemy: true, hp: 30 });
  const enemies = [enemyNear, enemyMid, enemyFar];
  const allies = [actor];

  it('aoe: hits units within radius of frontEnemy anchor', () => {
    const targets = resolveEffectTargets(
      { targetShape: 'aoe', aoeRadiusPx: 60 },
      'frontEnemy',
      actor,
      allies,
      enemies,
    );
    const ids = targets.map((t) => t.id);
    expect(ids).toContain('e3');
    expect(ids).toContain('e2');
    expect(ids).not.toContain('e1');
  });

  it('frontEnemy picks maximum battleX among in-range', () => {
    const targets = resolveEffectTargets(
      { targetShape: 'single' },
      'frontEnemy',
      actor,
      allies,
      enemies,
    );
    expect(targets[0]?.id).toBe('e3');
  });

  it('excludes enemies outside skill range', () => {
    const targets = resolveEffectTargets(
      { targetShape: 'single', range: 95 },
      'lowestHpEnemy',
      actor,
      allies,
      enemies,
    );
    expect(targets.map((t) => t.id)).toEqual(['e3']);
  });

  it('melee range 0 requires contact', () => {
    const ally = mockUnit('ally', 100, { attackRange: 'melee', rangePx: undefined });
    const enemy = mockUnit('e1', 100, { isEnemy: true, attackRange: 'melee' });
    expect(isWithinSkillRange(ally, enemy, 0)).toBe(true);
    const farEnemy = mockUnit('e2', 90, { isEnemy: true, attackRange: 'melee' });
    expect(isWithinSkillRange(ally, farEnemy, 0)).toBe(false);
  });

  it('farthestEnemy picks minimum battleX among in-range', () => {
    const targets = resolveEffectTargets(
      { targetShape: 'single' },
      'farthestEnemy',
      actor,
      allies,
      enemies,
    );
    expect(targets[0]?.id).toBe('e1');
  });

  it('multiLock: distributes hits across ordered pool', () => {
    const targets = resolveEffectTargets(
      { targetShape: 'multiLock', hitCount: 3 },
      'frontEnemy',
      actor,
      allies,
      enemies,
    );
    expect(targets).toHaveLength(3);
    expect(targets.map((t) => t.id)).toEqual(['e3', 'e2', 'e1']);
  });

  it('multiLock: round-robin repeats when hits exceed pool size', () => {
    const targets = resolveEffectTargets(
      { targetShape: 'multiLock', hitCount: 3 },
      'lowestHpEnemy',
      actor,
      allies,
      [enemyMid, enemyFar],
    );
    expect(targets.map((t) => t.id)).toEqual(['e3', 'e2', 'e3']);
  });

  it('multiLock: single enemy receives hitCount hits on same id', () => {
    const loneEnemy = [mockUnit('solo', 100, { isEnemy: true })];
    const targets = resolveEffectTargets(
      { targetShape: 'multiLock', hitCount: 3 },
      'frontEnemy',
      actor,
      allies,
      loneEnemy,
    );
    expect(targets).toHaveLength(3);
    expect(targets.every((t) => t.id === 'solo')).toBe(true);
  });

  it('chain: jumps to nearby enemies', () => {
    const resolution = resolveEffectResolution(
      {
        targetShape: 'chain',
        chainCount: 3,
        chainMaxDistancePx: 60,
        type: 'damage',
        targetRule: 'lowestHpEnemy',
        damageType: 'magic',
        powerMultiplier: 1,
      },
      'lowestHpEnemy',
      actor,
      allies,
      enemies,
    );
    const ids = resolution?.waves.map((w) => w.targets[0]?.unit.id);
    expect(ids).toEqual(['e3', 'e2', 'e1']);
  });

  it('pierce: orders front to back', () => {
    const effect: DamageSkillEffect = {
      targetShape: 'pierce',
      type: 'damage',
      targetRule: 'frontEnemy',
      damageType: 'physical',
      powerMultiplier: 1,
    };
    const resolution = resolveEffectResolution(
      effect,
      'frontEnemy',
      actor,
      allies,
      enemies,
    );
    const ids = resolution?.waves[0]?.targets.map((t) => t.unit.id);
    expect(ids).toEqual(['e3', 'e2', 'e1']);
  });

  it('scatter: uses deterministic random', () => {
    const resolution = resolveEffectResolution(
      {
        targetShape: 'scatter',
        scatterRadiusPx: 70,
        scatterHitCount: 2,
        scatterDurationSec: 1,
        scatterSpreadRate: 0,
        type: 'damage',
        targetRule: 'frontEnemy',
        damageType: 'magic',
        powerMultiplier: 1,
      },
      'frontEnemy',
      actor,
      allies,
      enemies,
      () => 0.5,
    );
    expect(resolution?.spreadDurationSec).toBe(1);
    expect(resolution?.waves).toHaveLength(2);
  });

  it('closestAlly for ally actor picks nearest ally by battleX', () => {
    const actor = mockUnit('actor', 150);
    const allyNear = mockUnit('near', 120);
    const allyFar = mockUnit('far', 240);
    const anchor = resolveEffectAnchor(
      { type: 'move', targetRule: 'closestAlly', moveDurationSec: 0.2 },
      'closestAlly',
      actor,
      [actor, allyNear, allyFar],
      [],
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
      { targetShape: 'aoe', aoeRadiusPx: 50 },
      'mostDamagedAlly',
      healer,
      party,
      enemies,
    );
    const ids = targets.map((t) => t.id);
    expect(ids).toContain('ally-a');
    expect(ids).toContain('ally-b');
    expect(ids).not.toContain('ally-c');
  });
});
