import { afterEach, describe, expect, it } from 'vitest';
import {
  __registerSkillAnimForTest,
  __resetSkillAnimsForTest,
  getSkillAnimFrameCount,
  resolveSkillAnimKey,
} from './skillAnimRegistry.ts';

function mockImage(width: number): HTMLImageElement {
  return { width, height: 48 } as HTMLImageElement;
}

describe('skillAnimRegistry', () => {
  afterEach(() => {
    __resetSkillAnimsForTest();
  });

  it('resolves effect-index key before skill fallback', () => {
    __registerSkillAnimForTest('at_assassin_active_1_0', mockImage(96));
    __registerSkillAnimForTest('at_assassin_active_1', mockImage(48));

    expect(resolveSkillAnimKey('at_assassin_active_1', 0)).toBe(
      'at_assassin_active_1_0',
    );
    expect(resolveSkillAnimKey('at_assassin_active_1', 1)).toBe(
      'at_assassin_active_1',
    );
  });

  it('derives frame count from png width', () => {
    __registerSkillAnimForTest('sp_cleric_active_1', mockImage(144));
    expect(getSkillAnimFrameCount('sp_cleric_active_1')).toBe(3);
  });
});
