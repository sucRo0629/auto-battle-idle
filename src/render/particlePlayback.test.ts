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
          delaySec: 0.15,
          tint: '#aabbcc',
        },
        preset,
      ),
    ).toEqual({
      count: 20,
      durationSec: 1.2,
      delaySec: 0.15,
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
    expect(resolved.count).toBe(4);
    expect(resolved.durationSec).toBe(0.75);
    expect(resolved.delaySec).toBe(0);
    expect(resolved.tint).toBe('#5ce88a');
    expect(resolved.preset.kind).toBe('composite');
    expect(resolved.preset.ring).toMatchObject({
      startRadius: 4,
      endRadius: 30,
      ringStartSec: 0,
      ringEndSec: 0.35,
      fadeSec: 0.06,
      lineWidth: 1.5,
    });
    expect(resolved.preset.particles).toMatchObject({
      shape: 'cross',
      vyMin: -54,
      vyMax: -28,
      vxSpread: 0.08,
      spawnXSpread: 11,
      spawnYMin: -2,
      spawnYMax: 4,
      lifeMinSec: 0.42,
      lifeMaxSec: 0.7,
      sizeMin: 4,
      sizeMax: 6,
    });
  });

  it('resolves spark_burst defaults from preset registry', () => {
    const resolved = resolveParticleSpawnOptions({ preset: 'spark_burst' });
    expect(resolved.presetId).toBe('spark_burst');
    expect(resolved.count).toBe(8);
    expect(resolved.durationSec).toBe(0.32);
    expect(resolved.tint).toBe('#fff4c2');
    expect(resolved.preset.kind).toBe('particles');
    expect(resolved.preset.particles).toMatchObject({
      shape: 'dot',
      vyMin: -52,
      vyMax: -26,
      vxSpread: 0.12,
      spawnXSpread: 6,
      spawnYMin: -2,
      spawnYMax: 3,
      lifeMinSec: 0.2,
      lifeMaxSec: 0.4,
      sizeMin: 1.4,
      sizeMax: 2.6,
    });
  });

  it('applies JSON overrides', () => {
    expect(
      resolveParticleSpawnOptions({
        preset: 'heal_holy_light',
        count: 20,
        durationSec: 1.2,
        delaySec: 0.2,
        tint: '#aabbcc',
      }),
    ).toMatchObject({
      presetId: 'heal_holy_light',
      count: 20,
      durationSec: 1.2,
      delaySec: 0.2,
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
    expect(resolveParticlePlaybackSec({ preset: 'heal_holy_light' })).toBe(0.75);
    expect(
      resolveParticlePlaybackSec({
        preset: 'heal_holy_light',
        durationSec: 1.5,
        delaySec: 0.25,
      }),
    ).toBe(1.75);
  });
});
