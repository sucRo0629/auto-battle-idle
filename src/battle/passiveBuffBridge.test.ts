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
});
