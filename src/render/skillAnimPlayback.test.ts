import { afterEach, describe, expect, it } from 'vitest';
import {
  __registerSkillAnimForTest,
  __resetSkillAnimsForTest,
} from './skillAnimRegistry.ts';
import {
  getSkillAnimIntroSec,
  getSkillAnimOutroSec,
  getSkillAnimPlaybackFrameCount,
  getSkillAnimPhasedTotalSec,
  isPhasedSkillAnim,
  normalizeAnimStartFrame,
  resolveSkillAnimPhaseConfig,
  resolveSkillAnimPlayback,
  resolveSkillBodyPlaybackSec,
  resolveEffectApplyDelaySec,
  resolveSkillBodyAnimFields,
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

  it('resolves linear playback from registered strip (64px cells)', () => {
    __registerSkillAnimForTest('test_skill', mockImage(256));
    expect(resolveSkillAnimPlayback('test_skill')).toEqual({
      startFrame: 0,
      stripFrameCount: 4,
      playbackFrameCount: 4,
      phased: null,
      totalPlaybackSec: 0.5,
    });
    expect(resolveSkillAnimPlayback('test_skill', { animStartFrame: 1 })).toEqual({
      startFrame: 1,
      stripFrameCount: 4,
      playbackFrameCount: 3,
      phased: null,
      totalPlaybackSec: 0.375,
    });
  });

  it('detects phased config when animLoopFrame is set', () => {
    expect(isPhasedSkillAnim({})).toBe(false);
    expect(isPhasedSkillAnim({ animLoopFrame: 2 })).toBe(true);
  });

  it('resolves phased config with defaults for intro end and outro start', () => {
    __registerSkillAnimForTest('phased_skill', mockImage(384));
    const phased = resolveSkillAnimPhaseConfig('phased_skill', {
      animStartFrame: 1,
      animLoopFrame: 3,
      holdSec: 2,
    });
    expect(phased).toEqual({
      startFrame: 1,
      introEndFrame: 3,
      loopFrame: 3,
      loopEndFrame: 3,
      outroStartFrame: 4,
      stripFrameCount: 6,
      holdSec: 2,
    });
    expect(getSkillAnimIntroSec(phased!)).toBeCloseTo(0.25);
    expect(getSkillAnimOutroSec(phased!)).toBeCloseTo(0.125);
    expect(getSkillAnimPhasedTotalSec(phased!)).toBeCloseTo(2.375);
  });

  it('resolves explicit intro/outro frame boundaries', () => {
    __registerSkillAnimForTest('phased_skill', mockImage(384));
    const phased = resolveSkillAnimPhaseConfig('phased_skill', {
      animStartFrame: 1,
      animIntroEndFrame: 2,
      animLoopFrame: 2,
      animOutroStartFrame: 3,
      holdSec: 1,
    });
    expect(phased).toEqual({
      startFrame: 1,
      introEndFrame: 2,
      loopFrame: 2,
      loopEndFrame: 2,
      outroStartFrame: 3,
      stripFrameCount: 6,
      holdSec: 1,
    });
  });

  it('resolves intro and loop on separate frame ranges', () => {
    __registerSkillAnimForTest('phased_skill', mockImage(448));
    const phased = resolveSkillAnimPhaseConfig('phased_skill', {
      animStartFrame: 1,
      animIntroEndFrame: 2,
      animLoopFrame: 3,
      animLoopEndFrame: 5,
      animOutroStartFrame: 6,
      holdSec: 1,
    });
    expect(phased).toEqual({
      startFrame: 1,
      introEndFrame: 2,
      loopFrame: 3,
      loopEndFrame: 5,
      outroStartFrame: 6,
      stripFrameCount: 7,
      holdSec: 1,
    });
  });

  it('resolves loop end frame and defaults outro after loop range', () => {
    __registerSkillAnimForTest('phased_skill', mockImage(384));
    const phased = resolveSkillAnimPhaseConfig('phased_skill', {
      animStartFrame: 1,
      animLoopFrame: 2,
      animLoopEndFrame: 4,
      holdSec: 1,
    });
    expect(phased).toEqual({
      startFrame: 1,
      introEndFrame: 2,
      loopFrame: 2,
      loopEndFrame: 4,
      outroStartFrame: 5,
      stripFrameCount: 6,
      holdSec: 1,
    });
  });

  it('resolves apply delay from strip frame offset', () => {
    __registerSkillAnimForTest('hit_skill', mockImage(256));
    expect(
      resolveEffectApplyDelaySec('hit_skill', 0, {
        animStartFrame: 1,
        applyFrame: 3,
      }),
    ).toBe(0.25);
    expect(
      resolveEffectApplyDelaySec('hit_skill', 0, { applyFrame: 2 }),
    ).toBe(0.25);
    expect(resolveEffectApplyDelaySec('hit_skill', 0, {})).toBe(0);
  });

  it('resolves body playback sec from useDuration hold', () => {
    __registerSkillAnimForTest('phased_body', mockImage(384));
    expect(
      resolveSkillBodyPlaybackSec(
        'phased_body',
        0,
        {
          animStartFrame: 1,
          animLoopFrame: 3,
        },
        { useDurationSec: 1.2 },
      ),
    ).toBeCloseTo(1.575);
  });

  it('falls back to the effect that owns body anim fields', () => {
    const skill = {
      id: 'multi_effect',
      name: 'Multi',
      trigger: { kind: 'time', value: 1 },
      effect: [
        {
          type: 'buff',
          target: { kind: 'self' },
          animLoopFrame: 2,
          animIntroEndFrame: 1,
        },
        {
          type: 'buff',
          target: { kind: 'self' },
        },
      ],
    } as const;

    expect(resolveSkillBodyAnimFields(skill, 0).animLoopFrame).toBe(2);
    expect(resolveSkillBodyAnimFields(skill, 1).animLoopFrame).toBe(2);
  });
});
