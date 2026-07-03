import { describe, expect, it } from 'vitest';
import {
  mergeFrontBlockAuraPassives,
  syncFrontBlockAuras,
} from './frontBlockAura.ts';
import { collectStatusEffectBadgeDisplays } from './statusEffectDisplay.ts';
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
    res: 0,
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

  it('applies block overlay to the aura source and allies within radius', () => {
    const paladin = mockAlly({
      id: 'paladin',
      battleX: 200,
      build: {
        learnedPassiveIds: ['df_paladin_passive_1'],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const nearbyWarrior = mockAlly({
      id: 'warrior',
      role: 'attacker',
      formationRow: 'back',
      battleX: 230,
    });
    const farCleric = mockAlly({
      id: 'cleric',
      role: 'supporter',
      formationRow: 'back',
      battleX: 80,
    });

    syncFrontBlockAuras([paladin, nearbyWarrior, farCleric], passives);

    expect(
      paladin.statusEffects.some(
        (fx) => fx.overlay === 'block' && fx.blockChance === 0.1,
      ),
    ).toBe(true);
    expect(
      nearbyWarrior.statusEffects.some(
        (fx) => fx.overlay === 'block' && fx.blockChance === 0.1,
      ),
    ).toBe(true);
    expect(
      farCleric.statusEffects.some((fx) => fx.overlay === 'block'),
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

  it('shows front block aura as a passive block badge', () => {
    const paladin = mockAlly({
      id: 'paladin',
      build: {
        learnedPassiveIds: ['df_paladin_passive_1'],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });

    syncFrontBlockAuras([paladin], passives);

    const badges = collectStatusEffectBadgeDisplays(
      paladin.statusEffects,
      { baseMaxHp: 100, atk: 10, def: 10, res: 0 },
    );

    expect(badges).toHaveLength(1);
    expect(badges[0]?.category).toBe('block');
    expect(badges[0]?.isPassive).toBe(true);
    expect(paladin.statusEffects[0]?.id).toBe(
      'passive_buff_aura_paladin_frontBlockAura_paladin',
    );
  });

  it('strips legacy front_block_aura_ effect ids on resync', () => {
    const paladin = mockAlly({
      id: 'paladin',
      statusEffects: [
        {
          id: 'front_block_aura_paladin_paladin',
          kind: 'buff',
          overlay: 'block',
          blockChance: 0.1,
          multiplier: 1,
          durationSec: 99999,
          remainingSec: 99999,
        },
      ],
      build: {
        learnedPassiveIds: ['df_paladin_passive_1'],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });

    syncFrontBlockAuras([paladin], passives);

    expect(
      paladin.statusEffects.some((fx) => fx.id.startsWith('front_block_aura_')),
    ).toBe(false);
    expect(paladin.statusEffects[0]?.id).toBe(
      'passive_buff_aura_paladin_frontBlockAura_paladin',
    );
  });
});
