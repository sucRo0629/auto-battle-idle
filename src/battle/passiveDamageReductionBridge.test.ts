import { describe, expect, it } from 'vitest';
import {
  applyDamageReductionEffectToPassive,
  passiveDamageReductionToEffectDef,
  resolvePassiveDamageReductionTargets,
} from './passiveDamageReductionBridge.ts';
import { syncDamageReductionAuras } from './passiveEffects.ts';
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
    role: 'tank',
    classId: 'test',
    formationRow: 'front',
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

describe('passiveDamageReductionBridge', () => {
  it('maps passive damageReduction fields to active effect shape', () => {
    const passive: PassiveSkillDef = {
      id: 'guard',
      name: 'Guard',
      effect: 'damageReduction',
      damageReductionPercent: 0.25,
      damageReductionTargetRule: { kind: 'all', side: 'ally' },
      damageReductionTargetShape: 'aoe',
      damageReductionRange: 100,
      damageReductionAoeRadiusPx: 60,
    };
    const effect = passiveDamageReductionToEffectDef(passive);
    expect(effect.type).toBe('buff');
    expect(effect.buffStat).toBe('damageTaken');
    expect(effect.targetShape).toBe('aoe');
    expect(effect.range).toBe(100);
    expect(effect.aoeRadiusPx).toBe(60);

    applyDamageReductionEffectToPassive(passive, {
      ...effect,
      range: 80,
      targetShape: 'single',
    });
    expect(passive.damageReductionRange).toBe(80);
    expect(passive.damageReductionTargetShape).toBe('single');
    expect(passive.damageReductionAoeRadiusPx).toBeUndefined();
  });

  it('resolvePassiveDamageReductionTargets respects range for ally aura', () => {
    const source = mockUnit({
      id: 'src',
      battleX: 100,
      build: {
        learnedPassiveIds: ['guard'],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const nearAlly = mockUnit({ id: 'near', battleX: 120 });
    const farAlly = mockUnit({ id: 'far', battleX: 300 });
    const passives: Record<string, PassiveSkillDef> = {
      guard: {
        id: 'guard',
        name: 'Guard',
        effect: 'damageReduction',
        damageReductionPercent: 0.2,
        damageReductionTargetRule: { kind: 'distance', side: 'ally', order: 'nearest' },
        damageReductionTargetShape: 'single',
        damageReductionRange: 50,
      },
    };
    const gameData = mockTargetingGameData();
    const targets = resolvePassiveDamageReductionTargets(
      source,
      passives.guard,
      [source, nearAlly, farAlly],
      [],
      gameData,
    );
    expect(targets.length).toBeGreaterThan(0);
    expect(targets.every((unit) => unit.id !== 'far')).toBe(true);

    syncDamageReductionAuras([source, nearAlly, farAlly], [], passives, gameData);
    expect(
      nearAlly.statusEffects.some((effect) => effect.stat === 'damageTaken'),
    ).toBe(true);
    expect(
      farAlly.statusEffects.some((effect) => effect.stat === 'damageTaken'),
    ).toBe(false);
  });
});
