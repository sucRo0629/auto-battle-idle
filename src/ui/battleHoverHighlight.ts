export type BattleHoverHighlightSource = "hud" | "field";

/** UI-only link between HUD slots and field sprites (not combat targeting). */
export interface BattleHoverHighlightState {
  unitId: string | null;
  source: BattleHoverHighlightSource | null;
}

export function createEmptyHoverHighlight(): BattleHoverHighlightState {
  return { unitId: null, source: null };
}

export function isSameHoverHighlight(
  a: BattleHoverHighlightState,
  b: BattleHoverHighlightState,
): boolean {
  return a.unitId === b.unitId && a.source === b.source;
}
