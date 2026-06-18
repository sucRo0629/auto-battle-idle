import { describe, expect, it } from 'vitest';
import {
  MAX_PARTICLE_EMITTERS,
  ParticlePlaybackManager,
} from './ParticlePlaybackManager.ts';
import { getParticlePresetDef } from './particlePresets.ts';

describe('ParticlePlaybackManager', () => {
  it('spawns heal_holy_light and removes after duration', () => {
    const manager = new ParticlePlaybackManager();
    const preset = getParticlePresetDef('heal_holy_light');
    manager.spawn(
      'heal-1',
      { x: 100, y: 200 },
      'front',
      { preset: 'heal_holy_light', durationSec: 0.2, count: 8, tint: '#ffe066' },
      preset,
    );
    expect(manager.has('heal-1')).toBe(true);

    manager.tick(250);
    expect(manager.has('heal-1')).toBe(false);
  });

  it('ignores inactive particle defs', () => {
    const manager = new ParticlePlaybackManager();
    const preset = getParticlePresetDef('heal_holy_light');
    manager.spawn(
      'x',
      { x: 0, y: 0 },
      'front',
      { preset: 'not_a_preset' },
      preset,
    );
    expect(manager.has('x')).toBe(false);
  });

  it('remove() drops an emitter immediately', () => {
    const manager = new ParticlePlaybackManager();
    const preset = getParticlePresetDef('heal_holy_light');
    manager.spawn(
      'heal-1',
      { x: 0, y: 0 },
      'front',
      { preset: 'heal_holy_light' },
      preset,
    );
    manager.remove('heal-1');
    expect(manager.has('heal-1')).toBe(false);
  });

  it('caps simultaneous emitters', () => {
    const manager = new ParticlePlaybackManager();
    const preset = getParticlePresetDef('heal_holy_light');
    for (let i = 0; i < MAX_PARTICLE_EMITTERS + 5; i += 1) {
      manager.spawn(
        `e-${i}`,
        { x: 0, y: 0 },
        'front',
        { preset: 'heal_holy_light' },
        preset,
      );
    }
    let active = 0;
    for (let i = 0; i < MAX_PARTICLE_EMITTERS + 5; i += 1) {
      if (manager.has(`e-${i}`)) active += 1;
    }
    expect(active).toBe(MAX_PARTICLE_EMITTERS);
  });
});
