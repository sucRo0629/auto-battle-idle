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

  it('resolves heal_major defaults from preset registry', () => {
    const resolved = resolveParticleSpawnOptions({ preset: 'heal_major' });
    expect(resolved.presetId).toBe('heal_major');
    expect(resolved.count).toBe(8);
    expect(resolved.durationSec).toBe(1.1);
    expect(resolved.delaySec).toBe(0);
    expect(resolved.tint).toBe('#7dffaa');
    expect(resolved.preset.kind).toBe('composite');
    expect(resolved.preset.ring).toMatchObject({
      startRadius: 6,
      endRadius: 32,
      ringStartSec: 0,
      ringEndSec: 0.55,
      fadeSec: 0.08,
      lineWidth: 2,
    });
    expect(resolved.preset.particles).toMatchObject({
      shape: 'cross',
      vyMin: -58,
      vyMax: -30,
      vxSpread: 0.08,
      spawnXSpread: 14,
      spawnYMin: -3,
      spawnYMax: 5,
      lifeMinSec: 0.5,
      lifeMaxSec: 0.85,
      sizeMin: 7,
      sizeMax: 14,
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

  it('resolves heal_cast defaults from preset registry', () => {
    const resolved = resolveParticleSpawnOptions({ preset: 'heal_cast' });
    expect(resolved.presetId).toBe('heal_cast');
    expect(resolved.count).toBe(3);
    expect(resolved.durationSec).toBe(0.65);
    expect(resolved.delaySec).toBe(0);
    expect(resolved.tint).toBe('#5ce88a');
    expect(resolved.preset.kind).toBe('composite');
    expect(resolved.preset.ring).toMatchObject({
      startRadius: 3,
      endRadius: 24,
      ringStartSec: 0,
      ringEndSec: 0.45,
      fadeSec: 0.07,
      lineWidth: 1.8,
    });
    expect(resolved.preset.particles).toMatchObject({
      shape: 'cross',
      vyMin: -48,
      vyMax: -24,
      vxSpread: 0.08,
      spawnXSpread: 6,
      spawnYMin: -4,
      spawnYMax: 0,
      lifeMinSec: 0.35,
      lifeMaxSec: 0.55,
      sizeMin: 4,
      sizeMax: 7,
    });
  });

  it('resolves heal_area defaults from preset registry', () => {
    const resolved = resolveParticleSpawnOptions({ preset: 'heal_area' });
    expect(resolved.presetId).toBe('heal_area');
    expect(resolved.count).toBe(7);
    expect(resolved.durationSec).toBe(0.85);
    expect(resolved.delaySec).toBe(0);
    expect(resolved.tint).toBe('#5ce88a');
    expect(resolved.preset.kind).toBe('composite');
    expect(resolved.preset.ring).toMatchObject({
      startRadius: 5,
      endRadius: 30,
      ringStartSec: 0,
      ringEndSec: 0.4,
      fadeSec: 0.07,
      lineWidth: 2,
    });
    expect(resolved.preset.particles).toMatchObject({
      shape: 'cross',
      vyMin: -50,
      vyMax: -26,
      vxSpread: 0.08,
      spawnXSpread: 20,
      spawnYMin: -4,
      spawnYMax: 2,
      lifeMinSec: 0.4,
      lifeMaxSec: 0.65,
      sizeMin: 5,
      sizeMax: 9,
    });
  });

  it('resolves heal_party defaults from preset registry', () => {
    const resolved = resolveParticleSpawnOptions({ preset: 'heal_party' });
    expect(resolved.presetId).toBe('heal_party');
    expect(resolved.count).toBe(10);
    expect(resolved.durationSec).toBe(1.0);
    expect(resolved.delaySec).toBe(0);
    expect(resolved.tint).toBe('#62eb95');
    expect(resolved.preset.kind).toBe('composite');
    expect(resolved.preset.ring).toMatchObject({
      startRadius: 6,
      endRadius: 38,
      ringStartSec: 0,
      ringEndSec: 0.5,
      fadeSec: 0.08,
      lineWidth: 2.2,
    });
    expect(resolved.preset.particles).toMatchObject({
      shape: 'cross',
      vyMin: -52,
      vyMax: -28,
      vxSpread: 0.08,
      spawnXSpread: 26,
      spawnYMin: -5,
      spawnYMax: 3,
      lifeMinSec: 0.45,
      lifeMaxSec: 0.75,
      sizeMin: 5,
      sizeMax: 10,
    });
  });




  it('resolves heal_major_party defaults from preset registry', () => {
    const resolved = resolveParticleSpawnOptions({ preset: 'heal_major_party' });
    expect(resolved.presetId).toBe('heal_major_party');
    expect(resolved.count).toBe(14);
    expect(resolved.durationSec).toBe(1.25);
    expect(resolved.delaySec).toBe(0);
    expect(resolved.tint).toBe('#8affb8');
    expect(resolved.preset.kind).toBe('composite');
    expect(resolved.preset.ring).toMatchObject({
      startRadius: 8,
      endRadius: 44,
      ringStartSec: 0,
      ringEndSec: 0.6,
      fadeSec: 0.1,
      lineWidth: 2.5,
    });
    expect(resolved.preset.particles).toMatchObject({
      shape: 'cross',
      vyMin: -60,
      vyMax: -32,
      vxSpread: 0.08,
      spawnXSpread: 30,
      spawnYMin: -6,
      spawnYMax: 4,
      lifeMinSec: 0.5,
      lifeMaxSec: 0.9,
      sizeMin: 6,
      sizeMax: 12,
    });
  });

  it('resolves heal_major_party defaults from preset registry', () => {
    const resolved = resolveParticleSpawnOptions({ preset: 'heal_major_party' });
    expect(resolved.presetId).toBe('heal_major_party');
    expect(resolved.count).toBe(14);
    expect(resolved.durationSec).toBe(1.25);
    expect(resolved.delaySec).toBe(0);
    expect(resolved.tint).toBe('#8affb8');
    expect(resolved.preset.kind).toBe('composite');
    expect(resolved.preset.ring).toMatchObject({
      startRadius: 8,
      endRadius: 44,
      ringStartSec: 0,
      ringEndSec: 0.6,
      fadeSec: 0.1,
      lineWidth: 2.5,
    });
    expect(resolved.preset.particles).toMatchObject({
      shape: 'cross',
      vyMin: -60,
      vyMax: -32,
      vxSpread: 0.08,
      spawnXSpread: 30,
      spawnYMin: -6,
      spawnYMax: 4,
      lifeMinSec: 0.5,
      lifeMaxSec: 0.9,
      sizeMin: 6,
      sizeMax: 12,
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
