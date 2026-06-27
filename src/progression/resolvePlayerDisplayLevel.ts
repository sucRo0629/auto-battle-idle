import type { PartySlotState } from "../battle/types.ts";

/**
 * 編成画面ヘッダー等に表示するプレイヤーレベル。
 * Phase 11 では playerProgress.level / resolveEffectiveLevel へ差し替える。
 */
export function resolvePlayerDisplayLevel(
  party: readonly (PartySlotState | null)[]
): number {
  let max = 0;
  for (const member of party) {
    if (member && member.progress.level > max) {
      max = member.progress.level;
    }
  }
  return max > 0 ? max : 1;
}
