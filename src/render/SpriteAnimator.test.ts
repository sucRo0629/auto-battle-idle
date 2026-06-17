import { afterEach, describe, expect, it } from 'vitest';
import {
  __registerSkillAnimForTest,
  __resetSkillAnimsForTest,
} from './skillAnimRegistry.ts';
import { SpriteAnimator } from './SpriteAnimator.ts';

function mockImage(width: number): HTMLImageElement {
  return { width, height: 48 } as HTMLImageElement;
}

const FRAME_MS = 1000 / 8;

describe('SpriteAnimator phased skill anim', () => {
  afterEach(() => {
    __resetSkillAnimsForTest();
  });

  it('plays intro, holds loop frame, then outro', () => {
    __registerSkillAnimForTest('cast_skill', mockImage(384));
    const animator = new SpriteAnimator();
    animator.setSkillAnim('actor', 'cast_skill', {
      animStartFrame: 1,
      animIntroEndFrame: 3,
      animLoopFrame: 3,
      animOutroStartFrame: 4,
      holdSec: 1,
    });

    let state = animator.getState('actor');
    expect(state.skillAnimPhase).toBe('intro');
    expect(state.skillAnimFrame).toBe(1);

    animator.tick('actor', FRAME_MS);
    state = animator.getState('actor');
    expect(state.skillAnimFrame).toBe(2);

    animator.tick('actor', FRAME_MS);
    state = animator.getState('actor');
    expect(state.skillAnimFrame).toBe(3);

    animator.tick('actor', FRAME_MS);
    state = animator.getState('actor');
    expect(state.skillAnimPhase).toBe('loop');
    expect(state.skillAnimFrame).toBe(3);

    animator.tick('actor', 500);
    state = animator.getState('actor');
    expect(state.skillAnimPhase).toBe('loop');
    expect(state.skillAnimFrame).toBe(3);

    animator.tick('actor', 600);
    state = animator.getState('actor');
    expect(state.skillAnimPhase).toBe('outro');
    expect(state.skillAnimFrame).toBe(4);

    animator.tick('actor', FRAME_MS);
    state = animator.getState('actor');
    expect(state.skillAnimFrame).toBe(5);

    animator.tick('actor', FRAME_MS);
    state = animator.getState('actor');
    expect(state.skillAnimFinished).toBe(true);
    expect(state.skillAnimKey).toBeNull();
    expect(state.anim).toBe('idle');
  });

  it('skips hold when holdSec is zero', () => {
    __registerSkillAnimForTest('cast_skill', mockImage(384));
    const animator = new SpriteAnimator();
    animator.setSkillAnim('actor', 'cast_skill', {
      animStartFrame: 1,
      animLoopFrame: 2,
      holdSec: 0,
    });

    animator.tick('actor', FRAME_MS);
    animator.tick('actor', FRAME_MS);
    const state = animator.getState('actor');
    expect(state.skillAnimPhase).toBe('outro');
    expect(state.skillAnimFrame).toBe(3);
  });

  it('cycles loop start through loop end during hold', () => {
    __registerSkillAnimForTest('cast_skill', mockImage(384));
    const animator = new SpriteAnimator();
    animator.setSkillAnim('actor', 'cast_skill', {
      animStartFrame: 1,
      animIntroEndFrame: 2,
      animLoopFrame: 2,
      animLoopEndFrame: 3,
      animOutroStartFrame: 4,
      holdSec: 1,
    });

    animator.tick('actor', FRAME_MS);
    let state = animator.getState('actor');
    expect(state.skillAnimPhase).toBe('intro');
    expect(state.skillAnimFrame).toBe(2);

    animator.tick('actor', FRAME_MS);
    state = animator.getState('actor');
    expect(state.skillAnimPhase).toBe('loop');
    expect(state.skillAnimFrame).toBe(2);

    animator.tick('actor', FRAME_MS);
    state = animator.getState('actor');
    expect(state.skillAnimPhase).toBe('loop');
    expect(state.skillAnimFrame).toBe(3);

    animator.tick('actor', FRAME_MS);
    state = animator.getState('actor');
    expect(state.skillAnimPhase).toBe('loop');
    expect(state.skillAnimFrame).toBe(2);

    animator.tick('actor', 1000);
    state = animator.getState('actor');
    expect(state.skillAnimPhase).toBe('outro');
    expect(state.skillAnimFrame).toBe(4);
  });

  it('keeps linear playback when animLoopFrame is omitted', () => {
    __registerSkillAnimForTest('linear_skill', mockImage(256));
    const animator = new SpriteAnimator();
    animator.setSkillAnim('actor', 'linear_skill', { animStartFrame: 0 });

    animator.tick('actor', FRAME_MS * 4);
    const state = animator.getState('actor');
    expect(state.skillAnimFinished).toBe(true);
    expect(state.skillAnimFrame).toBe(3);
  });
});
