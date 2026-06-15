import { afterEach, describe, expect, it } from 'vitest';
import {
  __registerSkillAnimForTest,
  __resetSkillAnimsForTest,
} from './skillAnimRegistry.ts';
import {
  getSkillAnimPlaybackFrameCount,
  normalizeAnimStartFrame,
  resolveSkillAnimPlayback,
} from './skillAnimPlayback.ts';

function mockImage(width: number): HTMLImageElement {
  return { width, height: 48 } as HTMLImageElement;
}

describe('skillAnimPlayback', () => {
  afterEach(() => {
    __resetSkillAnimsForTest();
  });

  it('normalizes animStartFrame within strip bounds', () => {
    expect(normalizeAnimStartFrame(undefined, 4)).toBe(0);
    expect(normalizeAnimStartFrame(1, 4)).toBe(1);
    expect(normalizeAnimStartFrame(99, 4)).toBe(3);
    expect(normalizeAnimStartFrame(-1, 4)).toBe(0);
  });

  it('counts playback frames from startFrame to strip end', () => {
    expect(getSkillAnimPlaybackFrameCount(4, 0)).toBe(4);
    expect(getSkillAnimPlaybackFrameCount(4, 1)).toBe(3);
    expect(getSkillAnimPlaybackFrameCount(1, 0)).toBe(1);
  });

  it('resolves playback from registered strip (64px cells)', () => {
    __registerSkillAnimForTest('test_skill', mockImage(256));
    expect(resolveSkillAnimPlayback('test_skill')).toEqual({
      startFrame: 0,
      stripFrameCount: 4,
      playbackFrameCount: 4,
    });
    expect(resolveSkillAnimPlayback('test_skill', 1)).toEqual({
      startFrame: 1,
      stripFrameCount: 4,
      playbackFrameCount: 3,
    });
  });
});
