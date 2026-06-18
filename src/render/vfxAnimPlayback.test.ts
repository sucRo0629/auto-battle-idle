import { afterEach, describe, expect, it } from 'vitest';
import {
  __registerVfxAnimForTest,
  __resetVfxAnimsForTest,
} from './vfxAnimRegistry.ts';
import {
  resolveVfxAnimPlayback,
  resolveVfxPlacement,
  resolveVfxPlaybackSec,
} from './vfxAnimPlayback.ts';

function mockImage(width: number): HTMLImageElement {
  return { width, height: 64 } as HTMLImageElement;
}

describe('vfxAnimPlayback', () => {
  afterEach(() => {
    __resetVfxAnimsForTest();
  });

  it('resolves default placement by kind', () => {
    expect(resolveVfxPlacement({}, 'main')).toEqual({
      anchor: 'footActor',
      layer: 'front',
    });
    expect(resolveVfxPlacement({}, 'hit')).toEqual({
      anchor: 'footTarget',
      layer: 'front',
    });
  });

  it('keeps explicit placement from vfx def', () => {
    expect(
      resolveVfxPlacement(
        { placement: { anchor: 'between', layer: 'behind', offsetX: 4 } },
        'main',
      ),
    ).toEqual({ anchor: 'between', layer: 'behind', offsetX: 4 });
  });

  it('resolves linear playback sec from registered strip (64px cells)', () => {
    __registerVfxAnimForTest('test_vfx', mockImage(192));
    expect(resolveVfxPlaybackSec({}, 'test_vfx')).toBe(0.375);
    expect(resolveVfxAnimPlayback('test_vfx', { animStartFrame: 1 })).toEqual({
      startFrame: 1,
      stripFrameCount: 3,
      playbackFrameCount: 2,
      phased: null,
      totalPlaybackSec: 0.25,
    });
  });
});
