const LUNGE_DURATION_MS = 220;

interface LungeState {
  elapsedMs: number;
  direction: 1 | -1;
  distancePx: number;
}

export interface BasicAttackLungeHint {
  sourceX: number;
  targetX: number;
  facingSign?: number;
  isEnemy?: boolean;
}

/** 敵との画面上距離に関わらず、常に同じ突進幅を使う。 */
export function resolveBasicAttackLungeDistancePx(maxDistancePx: number): number {
  return maxDistancePx;
}

export function resolveBasicAttackLungeDirection(
  hint: BasicAttackLungeHint,
): 1 | -1 {
  const deltaX = hint.targetX - hint.sourceX;
  if (Math.abs(deltaX) >= 1) {
    return deltaX > 0 ? 1 : -1;
  }
  if (hint.facingSign !== undefined && hint.facingSign !== 0) {
    return hint.facingSign > 0 ? 1 : -1;
  }
  return hint.isEnemy ? -1 : 1;
}

/**
 * スキル body 未設定時の確認用プレースホルダー（敵方向へ一瞬突進して戻る）。
 * death の回転プレースホルダーと同様、演出アセットが無いときの目視フィードバック用。
 */
export class BasicAttackLungePlayback {
  private readonly lunges = new Map<string, LungeState>();

  trigger(combatantId: string, direction: 1 | -1, distancePx: number): void {
    if (distancePx <= 0) return;
    this.lunges.set(combatantId, {
      elapsedMs: 0,
      direction,
      distancePx,
    });
  }

  tick(deltaMs: number): void {
    for (const [id, state] of this.lunges) {
      state.elapsedMs += deltaMs;
      if (state.elapsedMs >= LUNGE_DURATION_MS) {
        this.lunges.delete(id);
      }
    }
  }

  clear(combatantId: string): void {
    this.lunges.delete(combatantId);
  }

  getOffsetX(combatantId: string): number {
    const state = this.lunges.get(combatantId);
    if (!state) return 0;
    const progress = Math.min(state.elapsedMs / LUNGE_DURATION_MS, 1);
    const bump = Math.sin(progress * Math.PI);
    return state.direction * state.distancePx * bump;
  }
}
