import { describe, expect, it } from 'vitest';
import {
  MAX_PARTICLE_EMITTERS,
  ParticlePlaybackManager,
} from './ParticlePlaybackManager.ts';
import { getParticlePresetDef } from './particlePresets.ts';

describe('ParticlePlaybackManager', () => {
  it('spawns heal_normal and removes after duration', () => {
    const manager = new ParticlePlaybackManager();
    const preset = getParticlePresetDef('heal_normal');
    manager.spawn(
      'heal-1',
      { x: 100, y: 200 },
      'front',
      { preset: 'heal_normal', durationSec: 0.2, count: 8, tint: '#ffe066' },
      preset,
    );
    expect(manager.has('heal-1')).toBe(true);

    manager.tick(250);
    expect(manager.has('heal-1')).toBe(false);
  });

  it('waits for delaySec before advancing particles', () => {
    const manager = new ParticlePlaybackManager();
    const preset = getParticlePresetDef('heal_normal');
    manager.spawn(
      'heal-delay',
      { x: 100, y: 200 },
      'front',
      { preset: 'heal_normal', delaySec: 0.2, durationSec: 0.3 },
      preset,
    );

    const emitter = (
      manager as unknown as {
        emitters: Map<string, { elapsedSec: number; particles: { lifeSec: number }[] }>;
      }
    ).emitters.get('heal-delay');
    expect(emitter?.elapsedSec).toBe(-0.2);

    manager.tick(100);
    expect(emitter?.elapsedSec).toBeCloseTo(-0.1, 6);
    expect(emitter?.particles[0]?.lifeSec ?? 0).toBe(0);

    manager.tick(150);
    expect(emitter?.elapsedSec).toBeCloseTo(0.05, 6);
    expect(emitter?.particles[0]?.lifeSec ?? 0).toBeGreaterThan(0);
  });

  it('ignores inactive particle defs', () => {
    const manager = new ParticlePlaybackManager();
    const preset = getParticlePresetDef('heal_normal');
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
    const preset = getParticlePresetDef('heal_normal');
    manager.spawn(
      'heal-1',
      { x: 0, y: 0 },
      'front',
      { preset: 'heal_normal' },
      preset,
    );
    manager.remove('heal-1');
    expect(manager.has('heal-1')).toBe(false);
  });

  it('caps simultaneous emitters', () => {
    const manager = new ParticlePlaybackManager();
    const preset = getParticlePresetDef('heal_normal');
    for (let i = 0; i < MAX_PARTICLE_EMITTERS + 5; i += 1) {
      manager.spawn(
        `e-${i}`,
        { x: 0, y: 0 },
        'front',
        { preset: 'heal_normal' },
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
