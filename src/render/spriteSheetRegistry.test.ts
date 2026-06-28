import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  __registerAttackVariantForTest,
  __resetSpriteSheetsForTest,
  getAttackVariantKeys,
  pickRandomAttackVariant,
} from './spriteSheetRegistry.ts';

function mockImage(width: number): HTMLImageElement {
  return { width, height: 48 } as HTMLImageElement;
}

describe('spriteSheetRegistry attack variants', () => {
  afterEach(() => {
    __resetSpriteSheetsForTest();
    vi.restoreAllMocks();
  });

  it('collects attack and attack_N variant keys sorted', () => {
    __registerAttackVariantForTest('at_swordsman', 'attack_3', mockImage(192));
    __registerAttackVariantForTest('at_swordsman', 'attack', mockImage(192));
    __registerAttackVariantForTest('at_swordsman', 'attack_2', mockImage(192));

    expect(getAttackVariantKeys('at_swordsman')).toEqual([
      'attack',
      'attack_2',
      'attack_3',
    ]);
  });

  it('returns single variant without randomness', () => {
    __registerAttackVariantForTest('at_swordsman', 'attack', mockImage(192));
    vi.spyOn(Math, 'random').mockReturnValue(0.99);

    expect(pickRandomAttackVariant('at_swordsman')).toBe('attack');
  });

  it('randomly picks among multiple variants', () => {
    __registerAttackVariantForTest('at_swordsman', 'attack', mockImage(192));
    __registerAttackVariantForTest('at_swordsman', 'attack_2', mockImage(192));

    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(pickRandomAttackVariant('at_swordsman')).toBe('attack');

    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    expect(pickRandomAttackVariant('at_swordsman')).toBe('attack_2');
  });
});
