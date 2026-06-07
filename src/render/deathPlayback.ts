import { ANIM_DEFS } from "./SpriteRegistry.ts";

const HOLD_DURATION_MS = 500;
const FADE_DURATION_MS = 400;

interface DeathPlaybackState {
  elapsedMs: number;
  /** true: 倒れ完了後も最終コマのまま残す（味方） */
  persist: boolean;
}

/** death アニメの再生時間（SpriteAnimator / ANIM_DEFS と同期） */
export function deathAnimDurationMs(): number {
  const def = ANIM_DEFS.death;
  return (def.frames / def.fps) * 1000;
}

function totalEnemyPlaybackMs(): number {
  return deathAnimDurationMs() + HOLD_DURATION_MS + FADE_DURATION_MS;
}

/**
 * 死亡演出のライフサイクル（表示継続・フェード・リスポーン時クリア）。
 * 見た目（回転プレースホルダー / スプライトシート）は別モジュールが担当。
 */
export class DeathPlaybackManager {
  private readonly playbacks = new Map<string, DeathPlaybackState>();

  trigger(combatantId: string, options?: { persist?: boolean }): void {
    this.playbacks.set(combatantId, {
      elapsedMs: 0,
      persist: options?.persist ?? false,
    });
  }

  tick(deltaMs: number): void {
    for (const [id, state] of this.playbacks) {
      state.elapsedMs += deltaMs;
      if (!state.persist && state.elapsedMs >= totalEnemyPlaybackMs()) {
        this.playbacks.delete(id);
      }
    }
  }

  shouldShow(combatantId: string): boolean {
    return this.playbacks.has(combatantId);
  }

  isActive(combatantId: string): boolean {
    return this.playbacks.has(combatantId);
  }

  clear(combatantId: string): void {
    this.playbacks.delete(combatantId);
  }

  getAlpha(combatantId: string): number {
    const state = this.playbacks.get(combatantId);
    if (!state) return 1;
    if (state.persist) return 1;

    const fadeStart = deathAnimDurationMs() + HOLD_DURATION_MS;
    if (state.elapsedMs <= fadeStart) return 1;

    const fadeElapsed = state.elapsedMs - fadeStart;
    return Math.max(0, 1 - fadeElapsed / FADE_DURATION_MS);
  }
}
