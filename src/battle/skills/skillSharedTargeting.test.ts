import { describe, expect, it } from 'vitest';
import { readActiveFile } from '../data/skillsJsonFs.ts';
import {
  computeTargetingLockKey,
  effectInheritsSkillSharedTargeting,
  ensureSharedTargetingLock,
  mergeEffectWithSkillTargeting,
} from './skillSharedTargeting.ts';
import {
  extractResolutionHitUnits,
  resolveEffectResolution,
  resolveEffectTargets,
} from './targeting.ts';
import type { ActiveSkillDef, CombatantState, SkillEffectDef } from '../types.ts';

function mockUnit(
  overrides: Partial<CombatantState> & { id: string },
): CombatantState {
  return {
    name: overrides.id,
    hp: 100,
    maxHp: 100,
    barrierHp: 0,
    atk: 15,
    def: 22,
    reg: 10,
    isAlive: true,
    role: 'defender',
    classId: 'df_paladin',
    formationRow: 'front',
    traits: { rangePx: 30, damageType: 'physical', basicAttackVfx: { enabled: true } },
    build: {
      learnedPassiveIds: [],
      learnedActiveIds: [],
      equippedActiveSlots: [],
    },
    cooldowns: [],
    statusEffects: [],
    spriteKey: 'df_paladin',
    iconKey: 'df_paladin',
    isEnemy: false,
    battleX: 100,
    visualX: 100,
    corpseVisible: true,
    ...overrides,
  };
}

const gameData = {
  skillRegistry: { passives: {}, actives: {} },
} as never;

function damageEffect(
  extra: Partial<SkillEffectDef>,
  target: SkillEffectDef['target'],
): SkillEffectDef {
  return {
    type: 'damage',
    target: target ?? { kind: 'distance', side: 'enemy', order: 'nearest' },
    amount: { kind: 'atkBased', atkScale: 1 },
    ...extra,
  } as SkillEffectDef;
}

describe('skill shared targeting', () => {
  it('mergeEffectWithSkillTargeting inherits omitted effect fields from skill', () => {
    const skill: ActiveSkillDef = {
      id: 'test',
      name: 'test',
      trigger: { kind: 'time', value: 5 },
      target: { kind: 'distance', side: 'ally', order: 'selfOrigin' },
      targetShape: 'aoe',
      aoeRadiusPx: 50,
      effect: [
        {
          type: 'buff',
          buffSubKind: 'stat',
          buffStat: 'reg',
          buffFlatBonus: 5,
          buffDurationSec: 3,
        },
      ],
    };
    const merged = mergeEffectWithSkillTargeting(skill, skill.effect[0]!);
    expect(merged.target).toEqual(skill.target);
    expect(merged.targetShape).toBe('aoe');
    expect(merged.aoeRadiusPx).toBe(50);
  });

  it('applies all inherited effects to the same unit set (障身法型)', () => {
    const actives = readActiveFile('df_paladin');
    const active2 = actives.find((a) => a.id === 'df_paladin_active_2')!;
    const paladin = mockUnit({ id: 'paladin', battleX: 100 });
    const nearAlly = mockUnit({
      id: 'near',
      role: 'attacker',
      formationRow: 'front',
      battleX: 120,
    });
    const farAlly = mockUnit({
      id: 'far',
      role: 'supporter',
      formationRow: 'back',
      battleX: 160,
    });
    const allies = [paladin, nearAlly, farAlly];

    const sharedLocks = new Map<string, import('../types.ts').SkillEffectResolution>();
    const hitSets = active2.effect.map((effectDef) => {
      ensureSharedTargetingLock(
        active2,
        effectDef,
        () =>
          resolveEffectResolution(
            effectDef,
            paladin,
            allies,
            [],
            gameData,
            Math.random,
            [],
            active2.effect,
            undefined,
            active2,
          ),
        sharedLocks,
      );
      const resolution = resolveEffectResolution(
        effectDef,
        paladin,
        allies,
        [],
        gameData,
        Math.random,
        [],
        active2.effect,
        undefined,
        active2,
        sharedLocks,
      );
      return extractResolutionHitUnits(resolution!).map((u) => u.id).sort();
    });

    expect(hitSets[0]).toEqual(['near', 'paladin']);
    expect(hitSets[1]).toEqual(hitSets[0]);
    expect(hitSets[2]).toEqual(hitSets[0]);
    expect(sharedLocks.size).toBe(1);
  });

  it('override effect with explicit target resolves independently', () => {
    const skill: ActiveSkillDef = {
      id: 'mixed',
      name: 'mixed',
      trigger: { kind: 'time', value: 5 },
      target: { kind: 'distance', side: 'ally', order: 'selfOrigin' },
      targetShape: 'aoe',
      aoeRadiusPx: 50,
      effect: [
        {
          type: 'buff',
          buffSubKind: 'stat',
          buffStat: 'reg',
          buffFlatBonus: 5,
          buffDurationSec: 3,
        },
        {
          type: 'damage',
          target: { kind: 'distance', side: 'enemy', order: 'nearest' },
          targetShape: 'single',
          amount: { kind: 'atkBased', atkScale: 1 },
        },
      ],
    };
    expect(effectInheritsSkillSharedTargeting(skill, skill.effect[0]!)).toBe(true);
    expect(effectInheritsSkillSharedTargeting(skill, skill.effect[1]!)).toBe(false);
    expect(computeTargetingLockKey(skill, skill.effect[0]!)).not.toBeNull();
    expect(computeTargetingLockKey(skill, skill.effect[1]!)).toBeNull();
  });

  it('backward compat: skill without shared target keeps per-effect resolution', () => {
    const actor = mockUnit({ id: 'actor', battleX: 100 });
    const enemyFront = mockUnit({
      id: 'front',
      isEnemy: true,
      battleX: 180,
    });
    const enemyBack = mockUnit({
      id: 'back',
      isEnemy: true,
      battleX: 110,
    });
    const enemies = [enemyFront, enemyBack];
    const nearestEffect = damageEffect({ targetShape: 'single', range: 100 }, {
      kind: 'distance',
      side: 'enemy',
      order: 'nearest',
    });
    const farthestEffect = damageEffect({ targetShape: 'single', range: 100 }, {
      kind: 'distance',
      side: 'enemy',
      order: 'farthest',
    });

    const first = resolveEffectTargets(
      nearestEffect,
      actor,
      [actor],
      enemies,
      gameData,
    );
    const second = resolveEffectTargets(
      farthestEffect,
      actor,
      [actor],
      enemies,
      gameData,
    );
    expect(first.map((u) => u.id)).toEqual(['front']);
    expect(second.map((u) => u.id)).toEqual(['back']);
  });
});
