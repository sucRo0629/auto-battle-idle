/** 次セグメント表示後、前セグメントが残るフェードアウト時間 */
export const CHAIN_LIGHTNING_FADE_OUT_MS = 320;

/** トラベル完了後にフル輝度を保つ progress 閾値（0〜1） */
export const CHAIN_LIGHTNING_FADE_HOLD_UNTIL = 0.78;

export function chainLightningFadeAlpha(
  progress: number,
  fadeOutElapsedMs?: number,
): number {
  if (fadeOutElapsedMs !== undefined) {
    const t = fadeOutElapsedMs / CHAIN_LIGHTNING_FADE_OUT_MS;
    return Math.max(0, 1 - t * t);
  }
  if (progress <= CHAIN_LIGHTNING_FADE_HOLD_UNTIL) return 1;
  const t =
    (progress - CHAIN_LIGHTNING_FADE_HOLD_UNTIL) /
    (1 - CHAIN_LIGHTNING_FADE_HOLD_UNTIL);
  return 1 - t * t;
}

export function chainSegmentFadeAlpha(
  elapsedMs: number,
  durationMs: number,
  fadeOutElapsedMs?: number,
): number {
  if (fadeOutElapsedMs !== undefined) {
    return chainLightningFadeAlpha(1, fadeOutElapsedMs);
  }
  return chainLightningFadeAlpha(elapsedMs / durationMs, undefined);
}
