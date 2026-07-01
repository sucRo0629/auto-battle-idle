import { describe, expect, it } from 'vitest';
import type { DamageSkillEffect, PassiveSkillDef } from '../types.ts';
import { resolvePassiveBuffTargets } from '../passiveBuffBridge.ts';
import { resolvePassiveDebuffTargets } from '../passiveDebuffBridge.ts';
import {
  resolveEffectAnchor,
  resolveEffectResolution,
  resolveEffectTargetSpec,
  resolveEffectTargets,
} from './targeting.ts';
import { damageEffect, mockTargetingGameData, mockUnit } from './targeting.fixtures.ts';

describe('targetRuleOverride apply scope', () => {
  const gameData = mockTargetingGameData(120);
  const actor = mockUnit('actor', 200);
  const enemyHighHp = mockUnit('e-high', 260, { isEnemy: true, hp: 80 });
  const enemyLowHp = mockUnit('e-low', 300, { isEnemy: true, hp: 20 });
  const enemies = [enemyHighHp, enemyLowHp];

  const enemyLowestHpPassive: PassiveSkillDef = {
    id: 'passive_target_lowest_hp',
    name: '薄命狩り',
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

  it('enemy actor override picks farthest player ally', () => {
    const enemyActor = mockUnit('e1', 400, { isEnemy: true });
    const front = mockUnit('front', 350);
    const back = mockUnit('back', 200);
    const farthestPassive: PassiveSkillDef = {
      id: 'passive_farthest',
      name: '狙撃',
      effect: 'targetRuleOverride',
      targetRuleOverrideApplyTo: 'enemy',
      targetRuleOverride: {
        kind: 'distance',
        side: 'enemy',
        order: 'farthest',
      },
    };
    const resolution = resolveEffectResolution(
      {
        type: 'damage',
        target: { kind: 'distance', side: 'enemy', order: 'nearest' },
        amount: { kind: 'atkBased', atkScale: 1 },
        range: 400,
      },
      enemyActor,
      [front, back],
      [enemyActor],
      gameData,
      Math.random,
      [farthestPassive],
    );
    expect(resolution?.waves[0]?.targets[0]?.unit.id).toBe('back');
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
    expect(resolution?.waves[0]?.targets[0]?.unit.id).toBe('e-low');
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

  it('selfOrigin aoe enemy targets exclude caster and hit the front enemy', () => {
    const caster = mockUnit('caster', 200);
    const enemyNear = mockUnit('enemy-near', 230, { isEnemy: true });
    const enemyFar = mockUnit('enemy-far', 320, { isEnemy: true });
    const enemiesInFront = [enemyNear, enemyFar];

    const targets = resolveEffectTargets(
      {
        type: 'damage',
        damageType: 'physical',
        amount: { kind: 'atkBased', atkScale: 1 },
        target: {
          kind: 'distance',
          side: 'enemy',
          order: 'selfOrigin',
        },
        targetShape: 'aoe',
        aoeRadiusPx: 50,
      } as SkillEffectDef,
      caster,
      [caster],
      enemiesInFront,
      gameData,
    );
    const ids = targets.map((t) => t.id);
    expect(ids).not.toContain('caster');
    expect(ids).toContain('enemy-near');
    expect(ids).not.toContain('enemy-far');
  });

  it('active and passive ally selfOrigin aoe resolve the same targets', () => {
    const caster = mockUnit('caster', 200);
    const allyNear = mockUnit('ally-near', 230);
    const allyFar = mockUnit('ally-far', 320);
    const party = [caster, allyNear, allyFar];

    const activeTargets = resolveEffectTargets(
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
    const passiveTargets = resolvePassiveBuffTargets(
      caster,
      {
        id: 'passive_ally_self_origin',
        name: '味方自身起点',
        effect: 'buff',
        buffSubKind: 'stat',
        buffTargetRule: {
          kind: 'distance',
          side: 'ally',
          order: 'selfOrigin',
        },
        buffTargetShape: 'aoe',
        buffAoeRadiusPx: 50,
        buffStat: 'atk',
        buffMultiplier: 1.2,
        buffDurationSec: 5,
      },
      party,
      enemies,
      gameData,
    );
    expect(passiveTargets.map((t) => t.id).sort()).toEqual(
      activeTargets.map((t) => t.id).sort(),
    );
    expect(activeTargets.map((t) => t.id)).toContain('caster');
  });

  it('active and passive enemy selfOrigin aoe resolve the same targets', () => {
    const caster = mockUnit('caster', 200);
    const enemyNear = mockUnit('enemy-near', 230, { isEnemy: true });
    const enemyFar = mockUnit('enemy-far', 320, { isEnemy: true });
    const enemiesInFront = [enemyNear, enemyFar];

    const activeTargets = resolveEffectTargets(
      {
        type: 'damage',
        damageType: 'physical',
        amount: { kind: 'atkBased', atkScale: 1 },
        target: {
          kind: 'distance',
          side: 'enemy',
          order: 'selfOrigin',
        },
        targetShape: 'aoe',
        aoeRadiusPx: 50,
      } as SkillEffectDef,
      caster,
      [caster],
      enemiesInFront,
      gameData,
    );
    const passiveTargets = resolvePassiveDebuffTargets(
      caster,
      {
        id: 'passive_enemy_self_origin',
        name: '敵自身起点',
        effect: 'debuff',
        debuffSubKind: 'stat',
        debuffTargetRule: {
          kind: 'distance',
          side: 'enemy',
          order: 'selfOrigin',
        },
        debuffTargetShape: 'aoe',
        debuffAoeRadiusPx: 50,
        debuffStat: 'atk',
        debuffMultiplier: 0.8,
        debuffDurationSec: 5,
      },
      [caster],
      enemiesInFront,
      gameData,
    );
    expect(passiveTargets.map((t) => t.id).sort()).toEqual(
      activeTargets.map((t) => t.id).sort(),
    );
    expect(activeTargets.map((t) => t.id)).not.toContain('caster');
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
