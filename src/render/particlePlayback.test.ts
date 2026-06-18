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
    const preset = getParticlePresetDef('heal_normal');
    expect(
      mergeParticleDefWithPreset(
        {
          preset: 'heal_normal',
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
  it('resolves heal_normal defaults from preset registry', () => {
    const resolved = resolveParticleSpawnOptions({ preset: 'heal_normal' });
    expect(resolved.presetId).toBe('heal_normal');
    expect(resolved.count).toBe(4);
    expect(resolved.durationSec).toBe(0.75);
    expect(resolved.delaySec).toBe(0);
    expect(resolved.tint).toBe('#5ce88a');
    expect(resolved.preset.kind).toBe('composite');
    expect(resolved.preset.ring).toMatchObject({
      startRadius: 4,
      endRadius: 20,
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
      sizeMin: 5,
      sizeMax: 10,
    });
  });

  it('resolves heal_minor defaults from preset registry', () => {
    const resolved = resolveParticleSpawnOptions({ preset: 'heal_minor' });
    expect(resolved.presetId).toBe('heal_minor');
    expect(resolved.count).toBe(2);
    expect(resolved.durationSec).toBe(0.4);
    expect(resolved.delaySec).toBe(0);
    expect(resolved.tint).toBe('#72f0a0');
    expect(resolved.preset.kind).toBe('particles');
    expect(resolved.preset.ring).toBeUndefined();
    expect(resolved.preset.particles).toMatchObject({
      shape: 'cross',
      vyMin: -38,
      vyMax: -20,
      vxSpread: 0.06,
      spawnXSpread: 5,
      spawnYMin: -2,
      spawnYMax: 3,
      lifeMinSec: 0.28,
      lifeMaxSec: 0.42,
      sizeMin: 3,
      sizeMax: 5,
    });
  });

  it('resolves heal_minor defaults from preset registry', () => {
    const resolved = resolveParticleSpawnOptions({ preset: 'heal_minor' });
    expect(resolved.presetId).toBe('heal_minor');
    expect(resolved.count).toBe(2);
    expect(resolved.durationSec).toBe(0.4);
    expect(resolved.delaySec).toBe(0);
    expect(resolved.tint).toBe('#72f0a0');
    expect(resolved.preset.kind).toBe('particles');
    expect(resolved.preset.ring).toBeUndefined();
    expect(resolved.preset.particles).toMatchObject({
      shape: 'cross',
      vyMin: -38,
      vyMax: -20,
      vxSpread: 0.06,
      spawnXSpread: 5,
      spawnYMin: -2,
      spawnYMax: 3,
      lifeMinSec: 0.28,
      lifeMaxSec: 0.42,
      sizeMin: 3,
      sizeMax: 5,
    });
  });

  it('applies JSON overrides', () => {
    expect(
      resolveParticleSpawnOptions({
        preset: 'heal_normal',
        count: 20,
        durationSec: 1.2,
        delaySec: 0.2,
        tint: '#aabbcc',
      }),
    ).toMatchObject({
      presetId: 'heal_normal',
      count: 20,
      durationSec: 1.2,
      delaySec: 0.2,
      tint: '#aabbcc',
    });
  });

  it('treats disabled particles as inactive', () => {
    expect(
      isParticleDefActive({ preset: 'heal_normal', enabled: false }),
    ).toBe(false);
    expect(
      resolveParticlePlaybackSec({ preset: 'heal_normal', enabled: false }),
    ).toBe(0);
  });

  it('rejects unknown preset ids', () => {
    expect(isParticleDefActive({ preset: 'not_a_preset' })).toBe(false);
  });

  it('resolveParticlePlaybackSec uses merged duration for presentationLock', () => {
    expect(
      resolveParticlePlaybackSec({
        preset: 'heal_normal',
        durationSec: 1.5,
      }),
    ).toBe(1.5);
    expect(resolveParticlePlaybackSec({ preset: 'heal_normal' })).toBe(0.75);
    expect(
      resolveParticlePlaybackSec({
        preset: 'heal_normal',
        durationSec: 1.5,
        delaySec: 0.25,
      }),
    ).toBe(1.75);
  });
});
