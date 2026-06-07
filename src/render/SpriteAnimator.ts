import { ANIM_DEFS, type AnimState } from './SpriteRegistry.ts';

export interface AnimatorState {
  anim: AnimState;
  frame: number;
  elapsed: number;
  finished: boolean;
}

export class SpriteAnimator {
  private readonly states = new Map<string, AnimatorState>();

  getState(combatantId: string): AnimatorState {
    let state = this.states.get(combatantId);
    if (!state) {
      state = { anim: 'idle', frame: 0, elapsed: 0, finished: false };
      this.states.set(combatantId, state);
    }
    return state;
  }

  setAnim(combatantId: string, anim: AnimState): void {
    const state = this.getState(combatantId);
    if (state.anim === anim && anim === 'idle') return;
    state.anim = anim;
    state.frame = 0;
    state.elapsed = 0;
    state.finished = false;
  }

  tick(combatantId: string, deltaMs: number): void {
    const state = this.getState(combatantId);
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
}
