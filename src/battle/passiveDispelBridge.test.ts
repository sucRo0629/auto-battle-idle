import { describe, expect, it } from 'vitest';
import {
  applyDispelEffectToPassive,
  passiveDispelToEffectDef,
  resolvePassiveDispelTargets,
} from './passiveDispelBridge.ts';
import { applyPassiveDispelFromPassive } from './passiveEffects.ts';
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
    res: 0,
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

const atkDebuff = {
  id: 'debuff_atk',
  kind: 'debuff' as const,
  stat: 'atk' as const,
  multiplier: 0.8,
  durationSec: 5,
  remainingSec: 5,
};

describe('passiveDispelBridge', () => {
  it('maps passive dispel fields to active effect shape', () => {
    const passive: PassiveSkillDef = {
      id: 'cleanse',
      name: 'Cleanse',
      effect: 'periodicDispel',
      dispelTargetRule: { kind: 'all', side: 'ally' },
      dispelTargetShape: 'aoe',
      dispelRange: 100,
      dispelAoeRadiusPx: 60,
      dispelCount: 1,
    };
    const effect = passiveDispelToEffectDef(passive);
    expect(effect.type).toBe('dispel');
    expect(effect.targetShape).toBe('aoe');
    expect(effect.range).toBe(100);
    expect(effect.aoeRadiusPx).toBe(60);

    applyDispelEffectToPassive(passive, {
      ...effect,
      range: 80,
      targetShape: 'single',
    });
    expect(passive.dispelRange).toBe(80);
    expect(passive.dispelTargetShape).toBe('single');
    expect(passive.dispelAoeRadiusPx).toBeUndefined();
  });

  it('resolvePassiveDispelTargets respects range and dispels in range only', () => {
    const source = mockUnit({
      id: 'src',
      battleX: 100,
      build: {
        learnedPassiveIds: ['cleanse'],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const nearAlly = mockUnit({
      id: 'near',
      battleX: 120,
      statusEffects: [{ ...atkDebuff }],
    });
    const farAlly = mockUnit({
      id: 'far',
      battleX: 300,
      statusEffects: [{ ...atkDebuff, id: 'debuff_far' }],
    });
    const passive: PassiveSkillDef = {
      id: 'cleanse',
      name: 'Cleanse',
      effect: 'periodicDispel',
      periodicTrigger: 'waveStart',
      dispelTargetRule: { kind: 'distance', side: 'ally', order: 'nearest' },
      dispelTargetShape: 'single',
      dispelRange: 50,
      dispelCount: 0,
    };
    const gameData = mockTargetingGameData();
    const targets = resolvePassiveDispelTargets(
      source,
      passive,
      [source, nearAlly, farAlly],
      [],
      gameData,
    );
    expect(targets.length).toBeGreaterThan(0);
    expect(targets.every((unit) => unit.id !== 'far')).toBe(true);

    applyPassiveDispelFromPassive(
      source,
      passive,
      [source, nearAlly, farAlly],
      [],
      gameData,
    );
    expect(nearAlly.statusEffects.some((effect) => effect.stat === 'atk')).toBe(
      false,
    );
    expect(farAlly.statusEffects.some((effect) => effect.stat === 'atk')).toBe(
      true,
    );
  });
});
