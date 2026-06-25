import { describe, expect, it } from 'vitest';
import {
  mergeFrontBlockAuraPassives,
  syncFrontBlockAuras,
} from './frontBlockAura.ts';
import type { CombatantState, PassiveSkillDef } from './types.ts';

function mockAlly(
  overrides: Partial<CombatantState> & { id: string },
): CombatantState {
  return {
    name: overrides.id,
    hp: 100,
    maxHp: 100,
    barrierHp: 0,
    atk: 10,
    def: 10,
    reg: 0,
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
    spriteKey: 'placeholder',
    iconKey: 'placeholder',
    isEnemy: false,
    battleX: 100,
    visualX: 100,
    corpseVisible: true,
    ...overrides,
  };
}

const p1: PassiveSkillDef = {
  id: 'df_paladin_passive_1',
  name: '護身手',
  effect: 'frontBlockAura',
  chance: 0.1,
};

const p3: PassiveSkillDef = {
  id: 'df_paladin_passive_3',
  name: '真言加護',
  effect: 'frontBlockAura',
  chance: 0.05,
  frontBlockAuraMagicBlock: true,
};

const passives: Record<string, PassiveSkillDef> = {
  df_paladin_passive_1: p1,
  df_paladin_passive_3: p3,
};

describe('frontBlockAura', () => {
  it('merges P1 only to 0.10 physical block', () => {
    expect(mergeFrontBlockAuraPassives([p1])).toEqual({
      blockChance: 0.1,
      blocksMagic: false,
    });
  });

  it('merges P1 + P3 to 0.15 with magic block', () => {
    expect(mergeFrontBlockAuraPassives([p1, p3])).toEqual({
      blockChance: 0.15,
      blocksMagic: true,
    });
  });

  it('applies block overlay to front row allies only', () => {
    const paladin = mockAlly({
      id: 'paladin',
      build: {
        learnedPassiveIds: ['df_paladin_passive_1'],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const frontWarrior = mockAlly({
      id: 'warrior',
      role: 'attacker',
      formationRow: 'front',
      battleX: 120,
    });
    const backCleric = mockAlly({
      id: 'cleric',
      role: 'supporter',
      formationRow: 'back',
      battleX: 80,
    });

    syncFrontBlockAuras([paladin, frontWarrior, backCleric], passives);

    expect(
      frontWarrior.statusEffects.some(
        (fx) => fx.overlay === 'block' && fx.blockChance === 0.1,
      ),
    ).toBe(true);
    expect(
      backCleric.statusEffects.some((fx) => fx.overlay === 'block'),
    ).toBe(false);
  });

  it('sets blocksMagic on overlay when P3 is learned', () => {
    const paladin = mockAlly({
      id: 'paladin',
      build: {
        learnedPassiveIds: ['df_paladin_passive_1', 'df_paladin_passive_3'],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const frontWarrior = mockAlly({
      id: 'warrior',
      role: 'attacker',
      formationRow: 'front',
    });

    syncFrontBlockAuras([paladin, frontWarrior], passives);

    const blockFx = frontWarrior.statusEffects.find((fx) => fx.overlay === 'block');
    expect(blockFx?.blockChance).toBe(0.15);
    expect(blockFx?.blocksMagic).toBe(true);
  });
});
