import { describe, expect, it } from 'vitest';
import {
  isParticleDefActive,
  resolveParticlePlaybackSec,
  resolveParticleSpawnOptions,
} from './particlePlayback.ts';
import {
  mergeParticleDefWithPreset,
  resolveParticleSpawn,
} from './particlePresetResolve.ts';
import { getParticlePresetDef } from './particlePresets.ts';

describe('particlePresetResolve', () => {
  it('merges JSON overrides onto preset defaults', () => {
    const preset = getParticlePresetDef('heal_holy_light');
    expect(
      mergeParticleDefWithPreset(
        {
          preset: 'heal_holy_light',
          count: 20,
          durationSec: 1.2,
          tint: '#aabbcc',
        },
        preset,
      ),
    ).toEqual({
      count: 20,
      durationSec: 1.2,
      tint: '#aabbcc',
      preset,
    });
  });

  it('resolveParticleSpawn returns null for unknown presets', () => {
    expect(resolveParticleSpawn({ preset: 'not_a_preset' })).toBeNull();
  });
});

describe('particlePlayback', () => {
  it('resolves heal_holy_light defaults from preset registry', () => {
    const resolved = resolveParticleSpawnOptions({ preset: 'heal_holy_light' });
    expect(resolved.presetId).toBe('heal_holy_light');
    expect(resolved.count).toBe(12);
    expect(resolved.durationSec).toBe(0.8);
    expect(resolved.tint).toBe('#ffe066');
    expect(resolved.preset.kind).toBe('composite');
  });

  it('applies JSON overrides', () => {
    expect(
      resolveParticleSpawnOptions({
        preset: 'heal_holy_light',
        count: 20,
        durationSec: 1.2,
        tint: '#aabbcc',
      }),
    ).toMatchObject({
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
    expect(
      resolveParticlePlaybackSec({ preset: 'heal_holy_light', enabled: false }),
    ).toBe(0);
  });

  it('rejects unknown preset ids', () => {
    expect(isParticleDefActive({ preset: 'not_a_preset' })).toBe(false);
  });

  it('resolveParticlePlaybackSec uses merged duration for presentationLock', () => {
    expect(
      resolveParticlePlaybackSec({
        preset: 'heal_holy_light',
        durationSec: 1.5,
      }),
    ).toBe(1.5);
    expect(resolveParticlePlaybackSec({ preset: 'heal_holy_light' })).toBe(0.8);
  });
});
