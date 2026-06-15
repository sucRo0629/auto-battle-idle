import {
  ANIM_DEFS,
  SHARED_ANIM_FPS,
  type AnimState,
} from './SpriteRegistry.ts';
import { pickRandomAttackVariant } from './spriteSheetRegistry.ts';
import { getSkillAnimFrameCount } from './skillAnimRegistry.ts';
import { normalizeAnimStartFrame } from './skillAnimPlayback.ts';

export interface AnimatorState {
  anim: AnimState;
  frame: number;
  elapsed: number;
  finished: boolean;
  attackSheetKey: string;
  skillAnimKey: string | null;
  skillAnimStartFrame: number;
  skillAnimFrame: number;
  skillAnimElapsed: number;
  skillAnimFinished: boolean;
}

const TRANSIENT_ANIMS = new Set<AnimState>(['attack', 'death']);

export class SpriteAnimator {
  private readonly states = new Map<string, AnimatorState>();

  private createState(): AnimatorState {
    return {
      anim: 'idle',
      frame: 0,
      elapsed: 0,
      finished: false,
      attackSheetKey: 'attack',
      skillAnimKey: null,
      skillAnimStartFrame: 0,
      skillAnimFrame: 0,
      skillAnimElapsed: 0,
      skillAnimFinished: false,
    };
  }

  getState(combatantId: string): AnimatorState {
    let state = this.states.get(combatantId);
    if (!state) {
      state = this.createState();
      this.states.set(combatantId, state);
    }
    return state;
  }

  isSkillAnimActive(combatantId: string): boolean {
    const state = this.states.get(combatantId);
    return state != null && state.skillAnimKey !== null && !state.skillAnimFinished;
  }

  blocksAutoMove(combatantId: string): boolean {
    const state = this.getState(combatantId);
    if (this.isSkillAnimActive(combatantId)) return true;
    if (TRANSIENT_ANIMS.has(state.anim) && !state.finished) return true;
    return false;
  }

  setAnim(combatantId: string, anim: AnimState, spriteKey?: string): void {
    const state = this.getState(combatantId);
    if (state.anim === anim && anim === 'idle' && !state.skillAnimKey) return;

    state.anim = anim;
    state.frame = 0;
    state.elapsed = 0;
    state.finished = false;

    if (anim === 'attack' && spriteKey) {
      state.attackSheetKey = pickRandomAttackVariant(spriteKey);
    }
  }

  setSkillAnim(
    combatantId: string,
    skillAnimKey: string | null,
    animStartFrame = 0,
  ): void {
    const state = this.getState(combatantId);
    if (skillAnimKey === null) {
      state.skillAnimKey = null;
      state.skillAnimStartFrame = 0;
      state.skillAnimFrame = 0;
      state.skillAnimElapsed = 0;
      state.skillAnimFinished = false;
      return;
    }

    const stripFrames = getSkillAnimFrameCount(skillAnimKey);
    const startFrame = normalizeAnimStartFrame(animStartFrame, stripFrames);
    state.skillAnimKey = skillAnimKey;
    state.skillAnimStartFrame = startFrame;
    state.skillAnimFrame = startFrame;
    state.skillAnimElapsed = 0;
    state.skillAnimFinished = false;
  }

  tick(combatantId: string, deltaMs: number): void {
    const state = this.getState(combatantId);

    if (state.skillAnimKey && !state.skillAnimFinished) {
      this.tickSkillAnim(state, deltaMs);
      return;
    }

    const def = ANIM_DEFS[state.anim];
    state.elapsed += deltaMs / 1000;
    const frameDuration = 1 / def.fps;
    while (state.elapsed >= frameDuration) {
      state.elapsed -= frameDuration;
      state.frame += 1;
      if (state.frame >= def.frames) {
        if (def.loop) {
          state.frame = 0;
        } else {
          state.frame = def.frames - 1;
          state.finished = true;
          if (state.anim !== 'death') {
            state.anim = 'idle';
            state.frame = 0;
            state.elapsed = 0;
            state.finished = false;
          }
        }
      }
    }
  }

  private tickSkillAnim(state: AnimatorState, deltaMs: number): void {
    const frames = getSkillAnimFrameCount(state.skillAnimKey!);
    state.skillAnimElapsed += deltaMs / 1000;
    const frameDuration = 1 / SHARED_ANIM_FPS;

    while (state.skillAnimElapsed >= frameDuration) {
      state.skillAnimElapsed -= frameDuration;
      state.skillAnimFrame += 1;
      if (state.skillAnimFrame >= frames) {
        state.skillAnimFrame = frames - 1;
        state.skillAnimFinished = true;
        state.skillAnimKey = null;
        state.skillAnimElapsed = 0;
        if (state.anim !== 'death') {
          state.anim = 'idle';
          state.frame = 0;
          state.elapsed = 0;
          state.finished = false;
        }
        return;
      }
    }
  }
}
