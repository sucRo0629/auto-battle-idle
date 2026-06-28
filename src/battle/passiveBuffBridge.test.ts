import { describe, expect, it } from 'vitest';
import {
  applyBuffEffectToPassive,
  passiveBuffToEffectDef,
  resolvePassiveBuffTargets,
} from './passiveBuffBridge.ts';
import { syncBuffAuras } from './passiveEffects.ts';
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
    role: 'supporter',
    classId: 'test',
    formationRow: 'back',
    traits: { rangePx: 40, damageType: 'physical', basicAttackVfx: { enabled: true } },
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
    corpseVisible: true,
    ...overrides,
  };
}

describe('passiveBuffBridge', () => {
  it('maps passive buff fields to active effect shape', () => {
    const passive: PassiveSkillDef = {
      id: 'aura',
      name: 'Aura',
      effect: 'buff',
      buffTargetRule: { kind: 'all', side: 'ally' },
      buffTargetShape: 'aoe',
      buffRange: 100,
      buffAoeRadiusPx: 60,
      buffStat: 'def',
      buffMultiplier: 1.2,
    };
    const effect = passiveBuffToEffectDef(passive);
    expect(effect.type).toBe('buff');
    expect(effect.targetShape).toBe('aoe');
    expect(effect.range).toBe(100);
    expect(effect.aoeRadiusPx).toBe(60);

    applyBuffEffectToPassive(passive, {
      ...effect,
      range: 80,
      targetShape: 'single',
    });
    expect(passive.buffRange).toBe(80);
    expect(passive.buffTargetShape).toBe('single');
    expect(passive.buffAoeRadiusPx).toBeUndefined();
  });

  it('resolvePassiveBuffTargets respects range for ally buff aura', () => {
    const source = mockUnit({
      id: 'src',
      battleX: 100,
      build: {
        learnedPassiveIds: ['aura'],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const nearAlly = mockUnit({ id: 'near', battleX: 120 });
    const farAlly = mockUnit({ id: 'far', battleX: 300 });
    const passives: Record<string, PassiveSkillDef> = {
      aura: {
        id: 'aura',
        name: 'Aura',
        effect: 'buff',
        buffTargetRule: { kind: 'distance', side: 'ally', order: 'nearest' },
        buffTargetShape: 'single',
        buffRange: 50,
        buffStat: 'def',
        buffMultiplier: 1.2,
      },
    };
    const gameData = mockTargetingGameData();
    const targets = resolvePassiveBuffTargets(
      source,
      passives.aura,
      [source, nearAlly, farAlly],
      [],
      gameData,
    );
    expect(targets.length).toBeGreaterThan(0);
    expect(targets.every((unit) => unit.id !== 'far')).toBe(true);

    syncBuffAuras([source, nearAlly, farAlly], [], passives, gameData);
    expect(nearAlly.statusEffects.some((effect) => effect.stat === 'def')).toBe(
      true,
    );
    expect(farAlly.statusEffects.some((effect) => effect.stat === 'def')).toBe(
      false,
    );
  });

  it('syncBuffAuras re-evaluates selfOrigin aoe targets after movement', () => {
    const source = mockUnit({
      id: 'src',
      battleX: 100,
      build: {
        learnedPassiveIds: ['aura'],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const nearAlly = mockUnit({ id: 'near', battleX: 118 });
    const farAlly = mockUnit({ id: 'far', battleX: 180 });
    const passives: Record<string, PassiveSkillDef> = {
      aura: {
        id: 'aura',
        name: 'Aura',
        effect: 'buff',
        buffTargetRule: { kind: 'distance', side: 'ally', order: 'selfOrigin' },
        buffTargetShape: 'aoe',
        buffRange: 120,
        buffAoeRadiusPx: 20,
        buffStat: 'def',
        buffMultiplier: 1.2,
      },
    };
    const gameData = mockTargetingGameData();

    syncBuffAuras([source, nearAlly, farAlly], [], passives, gameData);
    expect(source.statusEffects.some((effect) => effect.stat === 'def')).toBe(
      true,
    );
    expect(nearAlly.statusEffects.some((effect) => effect.stat === 'def')).toBe(
      true,
    );
    expect(farAlly.statusEffects.some((effect) => effect.stat === 'def')).toBe(
      false,
    );

    source.battleX = 160;
    syncBuffAuras([source, nearAlly, farAlly], [], passives, gameData);
    expect(nearAlly.statusEffects.some((effect) => effect.stat === 'def')).toBe(
      false,
    );
    expect(farAlly.statusEffects.some((effect) => effect.stat === 'def')).toBe(
      true,
    );
  });

  it('at_lancer_passive_2 anchors aoe on the lancer instead of the nearest ally', () => {
    const source = mockUnit({
      id: 'lancer',
      battleX: 100,
      build: {
        learnedPassiveIds: ['at_lancer_passive_2'],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const nearAlly = mockUnit({ id: 'near', battleX: 118 });
    const midAlly = mockUnit({ id: 'mid', battleX: 140 });
    const farAlly = mockUnit({ id: 'far', battleX: 180 });
    const passives: Record<string, PassiveSkillDef> = {
      at_lancer_passive_2: {
        id: 'at_lancer_passive_2',
        name: '槍術士の援護',
        effect: 'buff',
        buffTargetRule: { kind: 'distance', side: 'ally', order: 'selfOrigin' },
        buffTargetShape: 'aoe',
        buffRange: 100,
        buffAoeRadiusPx: 25,
        buffStat: 'def',
        buffMultiplier: 1.15,
      },
    };
    const gameData = mockTargetingGameData();

    const initialTargets = resolvePassiveBuffTargets(
      source,
      passives.at_lancer_passive_2,
      [source, nearAlly, midAlly, farAlly],
      [],
      gameData,
    );
    expect(initialTargets.map((unit) => unit.id).sort()).toEqual(['lancer', 'near']);

    syncBuffAuras([source, nearAlly, midAlly, farAlly], [], passives, gameData);
    expect(source.statusEffects.some((effect) => effect.stat === 'def')).toBe(
      true,
    );
    expect(nearAlly.statusEffects.some((effect) => effect.stat === 'def')).toBe(
      true,
    );
    expect(midAlly.statusEffects.some((effect) => effect.stat === 'def')).toBe(
      false,
    );
    expect(farAlly.statusEffects.some((effect) => effect.stat === 'def')).toBe(
      false,
    );

    source.battleX = 150;
    syncBuffAuras([source, nearAlly, midAlly, farAlly], [], passives, gameData);
    expect(nearAlly.statusEffects.some((effect) => effect.stat === 'def')).toBe(
      false,
    );
    expect(midAlly.statusEffects.some((effect) => effect.stat === 'def')).toBe(
      true,
    );
    expect(farAlly.statusEffects.some((effect) => effect.stat === 'def')).toBe(
      false,
    );
  });
});
