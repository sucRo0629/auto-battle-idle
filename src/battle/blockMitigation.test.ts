import { describe, expect, it, vi } from 'vitest';
import type { CombatantState, PassiveSkillDef } from './types.ts';
import {
  applyBlockToPhysicalDamage,
  applyBlockToMagicDamage,
  computeBlockMitigationRatio,
  getBlockChance,
  getMagicBlockChance,
  MAGIC_BLOCK_MITIGATION_RATIO,
} from './blockMitigation.ts';

function mockUnit(
  overrides: Partial<CombatantState> & { id: string },
): CombatantState {
  return {
    name: overrides.id,
    hp: 50,
    maxHp: 100,
    barrierHp: 0,
    atk: 20,
    def: 5,
    reg: 0,
    isAlive: true,
    role: 'defender',
    classId: 'test',
    formationRow: 'front',
    traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { enabled: true } },
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
    battleX: 0,
    visualX: 0,
    corpseVisible: true,
    ...overrides,
  };
}

const passives: Record<string, PassiveSkillDef> = {};

describe('blockMitigation', () => {
  it('computeBlockMitigationRatio uses 0.25 + atk/100 capped at 1', () => {
    expect(computeBlockMitigationRatio(mockUnit({ id: 'a', atk: 0 }))).toBe(0.25);
    expect(computeBlockMitigationRatio(mockUnit({ id: 'b', atk: 50 }))).toBe(0.75);
    expect(computeBlockMitigationRatio(mockUnit({ id: 'c', atk: 100 }))).toBe(1);
    expect(computeBlockMitigationRatio(mockUnit({ id: 'd', atk: 200 }))).toBe(1);
  });

  it('getBlockChance sums block status effects capped at 1', () => {
    const unit = mockUnit({
      id: 'u',
      statusEffects: [
        {
          id: 'passive',
          kind: 'buff',
          overlay: 'block',
          blockChance: 0.15,
          multiplier: 1,
          durationSec: 99999,
          remainingSec: 99999,
        },
        {
          id: 'temp',
          kind: 'buff',
          overlay: 'block',
          blockChance: 0.5,
          multiplier: 1,
          durationSec: 5,
          remainingSec: 5,
        },
        {
          id: 'extra',
          kind: 'buff',
          overlay: 'block',
          blockChance: 0.3,
          multiplier: 1,
          durationSec: 5,
          remainingSec: 5,
        },
      ],
    });
    expect(getBlockChance(unit, passives)).toBe(0.95);
  });

  it('getBlockChance ignores expired block status', () => {
    const unit = mockUnit({
      id: 'u',
      statusEffects: [
        {
          id: 'expired',
          kind: 'buff',
          overlay: 'block',
          blockChance: 0.5,
          multiplier: 1,
          durationSec: 5,
          remainingSec: 0,
        },
      ],
    });
    expect(getBlockChance(unit, passives)).toBe(0);
  });

  it('applyBlockToPhysicalDamage reduces damage on successful roll', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const defender = mockUnit({
      id: 'd',
      atk: 100,
      statusEffects: [
        {
          id: 'block',
          kind: 'buff',
          overlay: 'block',
          blockChance: 0.15,
          multiplier: 1,
          durationSec: 99999,
          remainingSec: 99999,
        },
      ],
    });
    const result = applyBlockToPhysicalDamage(defender, 80, passives);
    expect(result.didBlock).toBe(true);
    expect(result.blockedAmount).toBe(80);
    expect(result.finalDamage).toBe(0);
    vi.restoreAllMocks();
  });

  it('applyBlockToPhysicalDamage leaves damage unchanged when roll fails', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const defender = mockUnit({
      id: 'd',
      statusEffects: [
        {
          id: 'block',
          kind: 'buff',
          overlay: 'block',
          blockChance: 0.15,
          multiplier: 1,
          durationSec: 99999,
          remainingSec: 99999,
        },
      ],
    });
    const result = applyBlockToPhysicalDamage(defender, 80, passives);
    expect(result.didBlock).toBe(false);
    expect(result.finalDamage).toBe(80);
    vi.restoreAllMocks();
  });

  it('applyBlockToMagicDamage uses fixed 15% mitigation independent of ATK', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const lowAtk = mockUnit({
      id: 'low',
      atk: 10,
      statusEffects: [
        {
          id: 'magic-block',
          kind: 'buff',
          overlay: 'block',
          blockChance: 0.15,
          blocksMagic: true,
          multiplier: 1,
          durationSec: 99999,
          remainingSec: 99999,
        },
      ],
    });
    const highAtk = mockUnit({
      id: 'high',
      atk: 200,
      statusEffects: [...lowAtk.statusEffects],
    });

    const lowResult = applyBlockToMagicDamage(lowAtk, 100);
    const highResult = applyBlockToMagicDamage(highAtk, 100);
    expect(lowResult.didBlock).toBe(true);
    expect(highResult.didBlock).toBe(true);
    expect(lowResult.blockedAmount).toBe(
      Math.floor(100 * MAGIC_BLOCK_MITIGATION_RATIO),
    );
    expect(highResult.blockedAmount).toBe(lowResult.blockedAmount);
    expect(getMagicBlockChance(lowAtk)).toBe(0.15);
    vi.restoreAllMocks();
  });
});
