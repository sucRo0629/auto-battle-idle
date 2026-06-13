import { describe, expect, it } from 'vitest';
import { engagedMinBodyGap } from '../battleConstants.ts';
import type { SkillEffectDef } from '../types.ts';
import { getAttackablePool, isWithinSkillRange } from './rangeUtils.ts';
import {
  resolveEffectAnchor,
  resolveEffectResolution,
  resolveEffectTargets,
} from './targeting.ts';
import { damageEffect, mockTargetingGameData, mockUnit } from './targeting.fixtures.ts';

describe('resolveEffectTargets', () => {
  const gameData = mockTargetingGameData(50);
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
    const targets = resolveEffectTargets(damageEffect({ targetShape: 'single', range: 101 }, 'lowestHpEnemy'), actor, allies, enemies, gameData);
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
        { targetShape: 'multiLock', hitCount: 3, range: fullSkillRange },
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

  it('multiLock ally hp ratio: ignores full-HP allies', () => {
    const caster = mockUnit('caster', 200);
    const damaged = mockUnit('damaged', 180, { hp: 40, maxHp: 100 });
    const healthy = mockUnit('healthy', 220, { hp: 100, maxHp: 100 });
    const party = [caster, damaged, healthy];

    const targets = resolveEffectTargets(
      {
        type: 'buff',
        buffSubKind: 'barrier',
        target: { kind: 'stat', side: 'ally', stat: 'hp', order: 'ratio' },
        targetShape: 'multiLock',
        hitCount: 2,
        amount: { kind: 'flat', flatAmount: 10 },
      } as SkillEffectDef,
      caster,
      party,
      [],
      gameData,
    );
    expect(targets).toHaveLength(2);
    expect(targets.every((t) => t.id === 'damaged')).toBe(true);
  });

  it('multiLock ally hp ratio: no targets when every ally is full HP', () => {
    const caster = mockUnit('caster', 200);
    const healthy1 = mockUnit('h1', 180, { hp: 100, maxHp: 100 });
    const healthy2 = mockUnit('h2', 220, { hp: 100, maxHp: 100 });

    const targets = resolveEffectTargets(
      {
        type: 'buff',
        buffSubKind: 'barrier',
        target: { kind: 'stat', side: 'ally', stat: 'hp', order: 'ratio' },
        targetShape: 'multiLock',
        hitCount: 2,
        amount: { kind: 'flat', flatAmount: 10 },
      } as SkillEffectDef,
      caster,
      [caster, healthy1, healthy2],
      [],
      gameData,
    );
    expect(targets).toHaveLength(0);
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
    expect(ids?.every((id, i) => i === 0 || id !== ids[i - 1])).toBe(true);
    expect(resolution?.spreadDurationSec).toBeCloseTo(0.95);
    expect(resolution?.waves).toHaveLength(3);
  });

  it('chain: allows revisiting after all others were hit', () => {
    const chainActor = mockUnit('ally', 50);
    const chainEnemies = [
      mockUnit('eA', 100, { isEnemy: true, hp: 10 }),
      mockUnit('eB', 140, { isEnemy: true, hp: 50 }),
      mockUnit('eC', 180, { isEnemy: true, hp: 50 }),
    ];
    const resolution = resolveEffectResolution(
      {
        targetShape: 'chain',
        chainCount: 4,
        chainMaxDistancePx: 60,
        range: fullSkillRange,
        type: 'damage',
        target: { kind: 'stat', side: 'enemy', stat: 'hp', order: 'lowest' },
        damageType: 'magic',
        amount: { kind: 'atkBased', atkScale: 1 },
      },
      chainActor,
      [chainActor],
      chainEnemies,
      gameData,
    );
    const ids = resolution?.waves.map((w) => w.targets[0]?.unit.id);
    expect(ids).toEqual(['eA', 'eB', 'eC', 'eB']);
    expect(new Set(ids).size).toBeLessThan(ids!.length);
  });

  it('chain: prefers unhit targets in range over revisits', () => {
    const chainActor = mockUnit('ally', 50);
    const chainEnemies = [
      mockUnit('eA', 100, { isEnemy: true, hp: 50 }),
      mockUnit('eB', 140, { isEnemy: true, hp: 50 }),
      mockUnit('eC', 180, { isEnemy: true, hp: 50 }),
    ];
    const resolution = resolveEffectResolution(
      {
        targetShape: 'chain',
        chainCount: 3,
        chainMaxDistancePx: 80,
        range: fullSkillRange,
        type: 'damage',
        target: { kind: 'distance', side: 'enemy', order: 'nearest' },
        damageType: 'magic',
        amount: { kind: 'atkBased', atkScale: 1 },
      },
      chainActor,
      [chainActor],
      chainEnemies,
      gameData,
    );
    const ids = resolution?.waves.map((w) => w.targets[0]?.unit.id);
    // 至近 = 最前線（最大 battleX）。range 120 では eC が届かず eB 起点となり B→A→C になる
    expect(ids).toEqual(['eB', 'eA', 'eC']);
  });

  it('chain: never picks the same target on consecutive hops', () => {
    const resolution = resolveEffectResolution(
      {
        targetShape: 'chain',
        chainCount: 5,
        chainMaxDistancePx: 60,
        range: fullSkillRange,
        type: 'damage',
        target: { kind: 'stat', side: 'enemy', stat: 'hp', order: 'lowest' },
        damageType: 'magic',
        amount: { kind: 'atkBased', atkScale: 1 },
      },
      actor,
      allies,
      enemies,
      gameData,
    );
    const chainIds = resolution?.waves.map((w) => w.targets[0]?.unit.id) ?? [];
    expect(
      chainIds.every((id, i) => i === 0 || id !== chainIds[i - 1]),
    ).toBe(true);
  });

  it('chain: stops early when only the current target is in range', () => {
    const loneEnemy = [mockUnit('e1', 100, { isEnemy: true, hp: 50 })];
    const resolution = resolveEffectResolution(
      {
        targetShape: 'chain',
        chainCount: 4,
        chainMaxDistancePx: 60,
        range: fullSkillRange,
        type: 'damage',
        target: { kind: 'distance', side: 'enemy', order: 'nearest' },
        damageType: 'magic',
        amount: { kind: 'atkBased', atkScale: 1 },
      },
      actor,
      allies,
      loneEnemy,
      gameData,
    );
    expect(resolution?.waves).toHaveLength(1);
    expect(resolution?.waves[0]?.targets[0]?.unit.id).toBe('e1');
  });

  it('chain: uses explicit chainDurationSec when set', () => {
    const resolution = resolveEffectResolution(
      {
        targetShape: 'chain',
        chainCount: 3,
        chainMaxDistancePx: 60,
        chainDurationSec: 0.9,
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
    expect(resolution?.spreadDurationSec).toBe(0.9);
    expect(resolution?.waves).toHaveLength(3);
  });

  it('chain: single target has no spread', () => {
    const loneEnemy = [mockUnit('e1', 200, { isEnemy: true, hp: 50 })];
    const resolution = resolveEffectResolution(
      {
        targetShape: 'chain',
        chainCount: 3,
        chainMaxDistancePx: 60,
        range: fullSkillRange,
        type: 'damage',
        target: { kind: "distance", side: "enemy", order: "nearest" },
        damageType: 'magic',
        amount: { kind: 'atkBased', atkScale: 1 },
      },
      actor,
      allies,
      loneEnemy,
      gameData,
    );
    expect(resolution?.spreadDurationSec).toBeUndefined();
    expect(resolution?.waves).toHaveLength(1);
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

  it('move nearest enemy anchor uses actor distance not formation depth', () => {
    const actor = mockUnit('lancer', 100);
    const front = mockUnit('near', 240, { isEnemy: true });
    const rear = mockUnit('far', 360, { isEnemy: true });
    const anchor = resolveEffectAnchor(
      {
        type: 'move',
        moveMode: 'toAnchor',
        moveDurationSec: 0.25,
        anchorOffsetPx: -32,
        target: { kind: 'distance', side: 'enemy', order: 'nearest' },
      },
      actor,
      [actor],
      [front, rear],
      gameData,
    );
    expect(anchor?.id).toBe('near');
  });

  it('selfOrigin anchor resolves to actor for aoe and pierce', () => {
    const caster = mockUnit('caster', 200);
    const enemyNear = mockUnit('enemy-near', 230, { isEnemy: true });
    const aoeAnchor = resolveEffectAnchor(
      {
        type: 'damage',
        targetShape: 'aoe',
        aoeRadiusPx: 50,
        target: { kind: 'distance', side: 'enemy', order: 'selfOrigin' },
        damageType: 'physical',
        amount: { kind: 'atkBased', atkScale: 1 },
      } as SkillEffectDef,
      caster,
      [caster],
      [enemyNear],
      gameData,
    );
    const pierceAnchor = resolveEffectAnchor(
      {
        type: 'damage',
        targetShape: 'pierce',
        target: { kind: 'distance', side: 'enemy', order: 'selfOrigin' },
        damageType: 'physical',
        amount: { kind: 'atkBased', atkScale: 1 },
      } as SkillEffectDef,
      caster,
      [caster],
      [enemyNear],
      gameData,
    );
    expect(aoeAnchor?.id).toBe('caster');
    expect(pierceAnchor?.id).toBe('caster');
  });

  it('pierce selfOrigin after lunge stop hits front enemy not actor', () => {
    const gap = engagedMinBodyGap();
    const contact = 240;
    const range = 70;
    const actor = mockUnit('lancer', contact - gap - range, { rangePx: range });
    const front = mockUnit('near', contact, { isEnemy: true, hp: 9999999, maxHp: 9999999 });
    const effect: DamageSkillEffect = {
      targetShape: 'pierce',
      type: 'damage',
      target: { kind: 'distance', side: 'enemy', order: 'selfOrigin' },
      damageType: 'physical',
      amount: { kind: 'atkBased', atkScale: 1.1 },
    };
    const resolution = resolveEffectResolution(
      effect,
      actor,
      [actor],
      [front],
      gameData,
    );
    const ids = resolution?.waves[0]?.targets.map((t) => t.unit.id);
    expect(ids).toEqual(['near']);
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
