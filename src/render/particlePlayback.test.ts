import { describe, expect, it } from 'vitest';
import {
  isParticleDefActive,
  resolveParticlePlaybackSec,
  resolveParticleSpawnOptions,
} from './particlePlayback.ts';

describe('particlePlayback', () => {
  it('resolves heal_holy_light defaults from preset registry', () => {
    expect(
      resolveParticleSpawnOptions({ preset: 'heal_holy_light' }),
    ).toEqual({
      presetId: 'heal_holy_light',
      count: 12,
      durationSec: 0.8,
      tint: '#ffe066',
    });
  });

  it('applies JSON overrides', () => {
    expect(
      resolveParticleSpawnOptions({
        preset: 'heal_holy_light',
        count: 20,
        durationSec: 1.2,
        tint: '#aabbcc',
      }),
    ).toEqual({
      presetId: 'heal_holy_light',
      count: 20,
      durationSec: 1.2,
      tint: '#aabbcc',
    });
  });

  it('treats disabled particles as inactive', () => {
    expect(
      isParticleDefActive({ preset: 'heal_holy_light', enabled: false }),
    ).toBe(false);
    expect(resolveParticlePlaybackSec({ preset: 'heal_holy_light', enabled: false })).toBe(0);
  });

  it('rejects unknown preset ids', () => {
    expect(isParticleDefActive({ preset: 'not_a_preset' })).toBe(false);
  });
});
