export type BattleHoverHighlightSource = "hud" | "field";

/** UI-only link between HUD slots and field sprites (not combat targeting). */
export interface BattleHoverHighlightState {
  unitId: string | null;
  /** Field sprites to dim-highlight. Group hover may list multiple ids. */
  highlightUnitIds: readonly string[];
  source: BattleHoverHighlightSource | null;
}

export function createEmptyHoverHighlight(): BattleHoverHighlightState {
  return { unitId: null, highlightUnitIds: [], source: null };
}

export function isSameHoverHighlight(
  a: BattleHoverHighlightState,
  b: BattleHoverHighlightState,
): boolean {
  if (a.unitId !== b.unitId || a.source !== b.source) return false;
  if (a.highlightUnitIds.length !== b.highlightUnitIds.length) return false;
  return a.highlightUnitIds.every((id, index) => id === b.highlightUnitIds[index]);
}

export function resolveHoverHighlightUnitIds(
  state: BattleHoverHighlightState,
): readonly string[] {
  if (state.highlightUnitIds.length > 0) return state.highlightUnitIds;
  return state.unitId ? [state.unitId] : [];
}
