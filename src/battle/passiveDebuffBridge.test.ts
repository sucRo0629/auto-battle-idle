import { describe, expect, it } from 'vitest';
import {
  applyDebuffEffectToPassive,
  passiveDebuffToEffectDef,
  resolvePassiveDebuffTargets,
} from './passiveDebuffBridge.ts';
import { syncDebuffAuras } from './passiveEffects.ts';
import type { CombatantState, PassiveSkillDef } from './types.ts';
import { mockTargetingGameData } from './testFixtures.ts';

function mockUnit(
  overrides: Partial<CombatantState> & { id: string; battleX: number },
): CombatantState {
  return {
    name: overrides.id,
    hp: 100,
    maxHp: 100,
    barrierHp: 0,
    atk: 20,
    def: 5,
    reg: 0,
    isAlive: true,
    role: 'attacker',
    classId: 'test',
    formationRow: 'front',
    traits: { rangePx: 40, damageType: 'physical', basicAttackVfx: { preset: 'slash' } },
    build: {
      learnedPassiveIds: [],
      learnedActiveIds: [],
      equippedActiveSlots: [],
    },
    cooldowns: [],
    statusEffects: [],
    spriteKey: 'placeholder',
    iconKey: 'placeholder',
    isEnemy: overrides.isEnemy ?? false,
    battleX: overrides.battleX,
    visualX: overrides.battleX,
    corpseVisible: true,
    ...overrides,
  };
}

describe('passiveDebuffBridge', () => {
  it('maps passive debuff fields to active effect shape', () => {
    const passive: PassiveSkillDef = {
      id: 'aura',
      name: 'Aura',
      effect: 'debuff',
      debuffTargetRule: { kind: 'distance', side: 'enemy', order: 'nearest' },
      debuffTargetShape: 'aoe',
      debuffRange: 80,
      debuffAoeRadiusPx: 50,
      debuffStat: 'atk',
      debuffMultiplier: 0.8,
    };
    const effect = passiveDebuffToEffectDef(passive);
    expect(effect.type).toBe('debuff');
    expect(effect.targetShape).toBe('aoe');
    expect(effect.range).toBe(80);
    expect(effect.aoeRadiusPx).toBe(50);

    applyDebuffEffectToPassive(passive, {
      ...effect,
      range: 120,
      targetShape: 'single',
    });
    expect(passive.debuffRange).toBe(120);
    expect(passive.debuffTargetShape).toBe('single');
    expect(passive.debuffAoeRadiusPx).toBeUndefined();
  });

  it('resolvePassiveDebuffTargets respects range and aoe shape', () => {
    const source = mockUnit({
      id: 'src',
      battleX: 100,
      build: {
        learnedPassiveIds: ['aura'],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const near = mockUnit({ id: 'near', battleX: 130, isEnemy: true });
    const far = mockUnit({ id: 'far', battleX: 250, isEnemy: true });
    const passives: Record<string, PassiveSkillDef> = {
      aura: {
        id: 'aura',
        name: 'Aura',
        effect: 'debuff',
        debuffTargetRule: { kind: 'distance', side: 'enemy', order: 'nearest' },
        debuffTargetShape: 'aoe',
        debuffRange: 80,
        debuffAoeRadiusPx: 100,
        debuffStat: 'atk',
        debuffMultiplier: 0.8,
      },
    };
    const gameData = mockTargetingGameData();
    const targets = resolvePassiveDebuffTargets(
      source,
      passives.aura,
      [source],
      [near, far],
      gameData,
    );
    expect(targets.map((unit) => unit.id)).toEqual(['near']);

    syncDebuffAuras([source], [near, far], passives, gameData);
    expect(near.statusEffects.some((effect) => effect.kind === 'debuff')).toBe(true);
    expect(far.statusEffects.some((effect) => effect.kind === 'debuff')).toBe(false);
  });

  it('syncDebuffAuras re-evaluates selfOrigin pierce targets after movement', () => {
    const source = mockUnit({
      id: 'src',
      battleX: 100,
      build: {
        learnedPassiveIds: ['aura'],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const near = mockUnit({ id: 'near', battleX: 120, isEnemy: true });
    const far = mockUnit({ id: 'far', battleX: 170, isEnemy: true });
    const passives: Record<string, PassiveSkillDef> = {
      aura: {
        id: 'aura',
        name: 'Aura',
        effect: 'debuff',
        debuffTargetRule: { kind: 'distance', side: 'enemy', order: 'selfOrigin' },
        debuffTargetShape: 'pierce',
        debuffRange: 30,
        debuffStat: 'atk',
        debuffMultiplier: 0.8,
      },
    };
    const gameData = mockTargetingGameData();

    syncDebuffAuras([source], [near, far], passives, gameData);
    expect(near.statusEffects.some((effect) => effect.kind === 'debuff')).toBe(
      true,
    );
    expect(far.statusEffects.some((effect) => effect.kind === 'debuff')).toBe(
      false,
    );

    source.battleX = 150;
    source.visualX = 150;
    syncDebuffAuras([source], [near, far], passives, gameData);
    expect(near.statusEffects.some((effect) => effect.kind === 'debuff')).toBe(
      false,
    );
    expect(far.statusEffects.some((effect) => effect.kind === 'debuff')).toBe(
      true,
    );
  });

  it('at_lancer_passive_1 picks the in-range enemy before and after re-evaluation', () => {
    const source = mockUnit({
      id: 'lancer',
      battleX: 100,
      build: {
        learnedPassiveIds: ['at_lancer_passive_1'],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const enemyNear = mockUnit({ id: 'enemy-near', battleX: 175, isEnemy: true });
    const enemyFar = mockUnit({ id: 'enemy-far', battleX: 132, isEnemy: true });
    const passives: Record<string, PassiveSkillDef> = {
      at_lancer_passive_1: {
        id: 'at_lancer_passive_1',
        name: '槍術士の印',
        effect: 'debuff',
        debuffTargetRule: { kind: 'distance', side: 'enemy', order: 'nearest' },
        debuffTargetShape: 'aoe',
        debuffRange: 100,
        debuffAoeRadiusPx: 12,
        debuffStat: 'atk',
        debuffMultiplier: 0.8,
      },
    };
    const gameData = mockTargetingGameData();

    const initialTargets = resolvePassiveDebuffTargets(
      source,
      passives.at_lancer_passive_1,
      [source],
      [enemyNear, enemyFar],
      gameData,
    );
    expect(initialTargets.map((unit) => unit.id)).toEqual(['enemy-near']);

    syncDebuffAuras([source], [enemyNear, enemyFar], passives, gameData);
    expect(enemyNear.statusEffects.some((effect) => effect.kind === 'debuff')).toBe(
      true,
    );
    expect(enemyFar.statusEffects.some((effect) => effect.kind === 'debuff')).toBe(
      false,
    );

    enemyNear.battleX = 122;
    enemyNear.visualX = 122;
    enemyFar.battleX = 170;
    enemyFar.visualX = 170;

    syncDebuffAuras([source], [enemyNear, enemyFar], passives, gameData);
    expect(enemyNear.statusEffects.some((effect) => effect.kind === 'debuff')).toBe(
      false,
    );
    expect(enemyFar.statusEffects.some((effect) => effect.kind === 'debuff')).toBe(
      true,
    );
  });
});
