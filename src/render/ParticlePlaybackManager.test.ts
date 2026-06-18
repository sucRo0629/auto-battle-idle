import { describe, expect, it } from 'vitest';
import { ParticlePlaybackManager } from './ParticlePlaybackManager.ts';

describe('ParticlePlaybackManager', () => {
  it('spawns heal_holy_light and removes after duration', () => {
    const manager = new ParticlePlaybackManager();
    manager.spawn(
      'heal-1',
      'heal_holy_light',
      { x: 100, y: 200 },
      { durationSec: 0.2, count: 8, tint: '#ffe066' },
      'front',
    );
    expect(manager.has('heal-1')).toBe(true);

    manager.tick(250);
    expect(manager.has('heal-1')).toBe(false);
  });

  it('ignores unknown preset ids', () => {
    const manager = new ParticlePlaybackManager();
    manager.spawn('x', 'unknown_preset', { x: 0, y: 0 });
    expect(manager.has('x')).toBe(false);
  });

  it('remove() drops an emitter immediately', () => {
    const manager = new ParticlePlaybackManager();
    manager.spawn('heal-1', 'heal_holy_light', { x: 0, y: 0 });
    manager.remove('heal-1');
    expect(manager.has('heal-1')).toBe(false);
  });
});
