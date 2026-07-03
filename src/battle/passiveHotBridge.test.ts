import { describe, expect, it } from 'vitest';
import {
  applyHotEffectToPassive,
  passiveHotToEffectDef,
  resolvePassiveAuraHotTargets,
} from './passiveHotBridge.ts';
import { syncHotAuras } from './passiveEffects.ts';
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

describe('passiveHotBridge', () => {
  it('maps passive hot fields to active effect shape', () => {
    const passive: PassiveSkillDef = {
      id: 'aura',
      name: 'Aura',
      effect: 'heal',
      healSubKind: 'hot',
      hotTargetRule: { kind: 'all', side: 'ally' },
      hotTargetShape: 'aoe',
      hotRange: 100,
      hotAoeRadiusPx: 60,
      hotAmount: { kind: 'flat', flatAmount: 5 },
    };
    const effect = passiveHotToEffectDef(passive);
    expect(effect.type).toBe('heal');
    expect(effect.healSubKind).toBe('hot');
    expect(effect.targetShape).toBe('aoe');
    expect(effect.range).toBe(100);
    expect(effect.aoeRadiusPx).toBe(60);

    applyHotEffectToPassive(passive, {
      ...effect,
      range: 80,
      targetShape: 'single',
    });
    expect(passive.hotRange).toBe(80);
    expect(passive.hotTargetShape).toBe('single');
    expect(passive.hotAoeRadiusPx).toBeUndefined();
  });

  it('resolvePassiveHotTargets respects range for ally hot aura', () => {
    const source = mockUnit({
      id: 'src',
      battleX: 100,
      build: {
        learnedPassiveIds: ['aura'],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const nearAlly = mockUnit({ id: 'near', battleX: 120, hp: 80 });
    const farAlly = mockUnit({ id: 'far', battleX: 300, hp: 80 });
    const passives: Record<string, PassiveSkillDef> = {
      aura: {
        id: 'aura',
        name: 'Aura',
        effect: 'heal',
        healSubKind: 'hot',
        hotTargetRule: { kind: 'distance', side: 'ally', order: 'nearest' },
        hotTargetShape: 'single',
        hotRange: 50,
        hotAmount: { kind: 'flat', flatAmount: 3 },
      },
    };
    const gameData = mockTargetingGameData();
    const targets = resolvePassiveAuraHotTargets(
      source,
      passives.aura,
      [source, nearAlly, farAlly],
      [],
    );
    expect(targets.length).toBeGreaterThan(0);
    expect(targets.every((unit) => unit.id !== 'far')).toBe(true);

    syncHotAuras([source, nearAlly, farAlly], [], passives, gameData);
    expect(nearAlly.statusEffects.some((effect) => effect.overlay === 'hot')).toBe(
      true,
    );
    expect(farAlly.statusEffects.some((effect) => effect.overlay === 'hot')).toBe(
      false,
    );
  });
});
