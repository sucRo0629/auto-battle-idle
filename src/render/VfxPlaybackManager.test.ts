import { afterEach, describe, expect, it } from 'vitest';
import {
  __registerVfxAnimForTest,
  __resetVfxAnimsForTest,
} from './vfxAnimRegistry.ts';
import { VfxPlaybackManager } from './VfxPlaybackManager.ts';

function mockImage(width: number): HTMLImageElement {
  return { width, height: 64 } as HTMLImageElement;
}

const FRAME_MS = 1000 / 8;

describe('VfxPlaybackManager', () => {
  afterEach(() => {
    __resetVfxAnimsForTest();
  });

  it('plays a strip to completion then removes the instance', () => {
    __registerVfxAnimForTest('test_vfx', mockImage(192));
    const manager = new VfxPlaybackManager();

    manager.spawn('vfx-1', 'test_vfx', { x: 10, y: 20 }, {}, 'front');
    expect(manager.getFrame('vfx-1')).toBe(0);

    manager.tick(FRAME_MS);
    expect(manager.getFrame('vfx-1')).toBe(1);

    manager.tick(FRAME_MS);
    expect(manager.getFrame('vfx-1')).toBe(2);

    manager.tick(FRAME_MS);
    expect(manager.has('vfx-1')).toBe(false);
  });

  it('keeps multiple instances independent on the same tick', () => {
    __registerVfxAnimForTest('test_vfx', mockImage(192));
    const manager = new VfxPlaybackManager();

    manager.spawn('a', 'test_vfx', { x: 0, y: 0 }, {}, 'front');
    manager.spawn(
      'b',
      'test_vfx',
      { x: 50, y: 0 },
      { animStartFrame: 1 },
      'front',
    );

    manager.tick(FRAME_MS);
    expect(manager.getFrame('a')).toBe(1);
    expect(manager.getFrame('b')).toBe(2);

    manager.tick(FRAME_MS * 2);
    expect(manager.has('a')).toBe(false);
    expect(manager.has('b')).toBe(false);
  });

  it('remove() drops an instance immediately', () => {
    __registerVfxAnimForTest('test_vfx', mockImage(128));
    const manager = new VfxPlaybackManager();
    manager.spawn('vfx-1', 'test_vfx', { x: 0, y: 0 });
    manager.remove('vfx-1');
    expect(manager.has('vfx-1')).toBe(false);
  });
});
