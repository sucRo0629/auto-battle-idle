import { afterEach, describe, expect, it } from 'vitest';
import {
  __registerVfxAnimForTest,
  __resetVfxAnimsForTest,
  getVfxAnimFrameCount,
  resolveVfxAnimKey,
} from './vfxAnimRegistry.ts';

function mockImage(width: number): HTMLImageElement {
  return { width, height: 64 } as HTMLImageElement;
}

describe('vfxAnimRegistry', () => {
  afterEach(() => {
    __resetVfxAnimsForTest();
  });

  it('resolves effect-index key before skill fallback (main)', () => {
    __registerVfxAnimForTest('at_assassin_active_1_0_vfx', mockImage(128));
    __registerVfxAnimForTest('at_assassin_active_1_vfx', mockImage(64));

    expect(resolveVfxAnimKey('at_assassin_active_1', 0, 'main')).toBe(
      'at_assassin_active_1_0_vfx',
    );
    expect(resolveVfxAnimKey('at_assassin_active_1', 1, 'main')).toBe(
      'at_assassin_active_1_vfx',
    );
  });

  it('resolves hit suffix keys', () => {
    __registerVfxAnimForTest('sp_cleric_active_1_0_vfx_hit', mockImage(192));
    __registerVfxAnimForTest('sp_cleric_active_1_vfx_hit', mockImage(64));

    expect(resolveVfxAnimKey('sp_cleric_active_1', 0, 'hit')).toBe(
      'sp_cleric_active_1_0_vfx_hit',
    );
    expect(resolveVfxAnimKey('sp_cleric_active_1', 1, 'hit')).toBe(
      'sp_cleric_active_1_vfx_hit',
    );
  });

  it('resolves basic attack vfx via skillId fallback', () => {
    __registerVfxAnimForTest('df_guardian_basic_attack_vfx', mockImage(256));

    expect(resolveVfxAnimKey('df_guardian_basic_attack', 0, 'main')).toBe(
      'df_guardian_basic_attack_vfx',
    );
  });

  it('derives frame count from png width (64px cells)', () => {
    __registerVfxAnimForTest('at_ranger_basic_attack_vfx', mockImage(320));
    expect(getVfxAnimFrameCount('at_ranger_basic_attack_vfx')).toBe(5);
  });
});
