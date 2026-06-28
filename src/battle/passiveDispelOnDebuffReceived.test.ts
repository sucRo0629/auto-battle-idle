import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  handlePassiveDispelOnDebuffReceived,
  resetPassiveDispelTriggerLimits,
} from './passiveEffects.ts';
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
      learnedPassiveIds: ['cleanse'],
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

function cleansePassive(
  overrides: Partial<PassiveSkillDef> = {},
): PassiveSkillDef {
  return {
    id: 'cleanse',
    name: 'Cleanse',
    effect: 'periodicDispel',
    periodicTrigger: 'onDebuffReceived',
    dispelTargetRule: { kind: 'self' },
    dispelCount: 0,
    ...overrides,
  };
}

describe('passiveDispel onDebuffReceived', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('dispels on debuff received when chance succeeds and consumes trigger limit', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);

    const holder = mockUnit({ id: 'holder', battleX: 100 });
    holder.statusEffects.push({ ...atkDebuff });
    const passives = { cleanse: cleansePassive({ dispelTriggerLimit: 1 }) };
    const gameData = mockTargetingGameData();

    resetPassiveDispelTriggerLimits([holder], passives);
    handlePassiveDispelOnDebuffReceived(
      holder,
      [holder],
      [],
      passives,
      gameData,
    );

    expect(holder.statusEffects.some((effect) => effect.stat === 'atk')).toBe(
      false,
    );
    expect(holder.passiveDispelRemainingTriggers?.cleanse).toBe(0);
  });

  it('does not consume trigger limit when chance fails', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);

    const holder = mockUnit({ id: 'holder', battleX: 100 });
    holder.statusEffects.push({ ...atkDebuff });
    const passives = {
      cleanse: cleansePassive({ chance: 0.5, dispelTriggerLimit: 1 }),
    };
    const gameData = mockTargetingGameData();

    resetPassiveDispelTriggerLimits([holder], passives);
    handlePassiveDispelOnDebuffReceived(
      holder,
      [holder],
      [],
      passives,
      gameData,
    );

    expect(holder.statusEffects.some((effect) => effect.stat === 'atk')).toBe(
      true,
    );
    expect(holder.passiveDispelRemainingTriggers?.cleanse).toBe(1);
  });

  it('allows another attempt on the next debuff application after chance failure', () => {
    const randomSpy = vi
      .spyOn(Math, 'random')
      .mockReturnValueOnce(0.99)
      .mockReturnValueOnce(0);

    const holder = mockUnit({ id: 'holder', battleX: 100 });
    holder.statusEffects.push({ ...atkDebuff });
    const passives = {
      cleanse: cleansePassive({ chance: 0.5, dispelTriggerLimit: 1 }),
    };
    const gameData = mockTargetingGameData();

    resetPassiveDispelTriggerLimits([holder], passives);
    handlePassiveDispelOnDebuffReceived(
      holder,
      [holder],
      [],
      passives,
      gameData,
    );
    holder.statusEffects.push({ ...atkDebuff, id: 'debuff_atk_2' });
    handlePassiveDispelOnDebuffReceived(
      holder,
      [holder],
      [],
      passives,
      gameData,
    );

    expect(randomSpy).toHaveBeenCalledTimes(2);
    expect(holder.statusEffects.some((effect) => effect.stat === 'atk')).toBe(
      false,
    );
    expect(holder.passiveDispelRemainingTriggers?.cleanse).toBe(0);
  });

  it('skips when debuff target is outside dispel effect targets', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);

    const holder = mockUnit({ id: 'holder', battleX: 100 });
    const ally = mockUnit({ id: 'ally', battleX: 300, learnedPassiveIds: [] });
    ally.build.learnedPassiveIds = [];
    ally.statusEffects.push({ ...atkDebuff, id: 'debuff_ally' });
    const passives = {
      cleanse: cleansePassive({
        dispelTargetRule: { kind: 'distance', side: 'ally', order: 'nearest' },
        dispelTargetShape: 'single',
        dispelRange: 50,
      }),
    };
    const gameData = mockTargetingGameData();

    resetPassiveDispelTriggerLimits([holder, ally], passives);
    handlePassiveDispelOnDebuffReceived(
      ally,
      [holder, ally],
      [],
      passives,
      gameData,
    );

    expect(ally.statusEffects.some((effect) => effect.stat === 'atk')).toBe(
      true,
    );
  });

  it('resets trigger limit at wave start', () => {
    const holder = mockUnit({ id: 'holder', battleX: 100 });
    holder.passiveDispelRemainingTriggers = { cleanse: 0 };
    const passives = { cleanse: cleansePassive({ dispelTriggerLimit: 2 }) };

    resetPassiveDispelTriggerLimits([holder], passives);

    expect(holder.passiveDispelRemainingTriggers?.cleanse).toBe(2);
  });
});
