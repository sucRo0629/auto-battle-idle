/** 隊形・地面・当たりの占有サイズ（px） */
export const SPRITE_LAYOUT_SIZE = 32;

/** スプライトシート 1 コマのデフォルトサイズ（px）。layout より大きくてよい */
export const SPRITE_SHEET_CELL_SIZE = 48;

/** spriteKey ごとのシートコマサイズ上書き */
const SHEET_CELL_OVERRIDES: Readonly<Record<string, number>> = {};

export function getSheetCellSize(spriteKey: string): number {
  return SHEET_CELL_OVERRIDES[spriteKey] ?? SPRITE_SHEET_CELL_SIZE;
}

/** シート描画で layout 箱より上にはみ出す最大 px */
export function spriteSheetMaxOverflowTop(): number {
  const sizes = [SPRITE_SHEET_CELL_SIZE, ...Object.values(SHEET_CELL_OVERRIDES)];
  const maxCell = Math.max(...sizes);
  return Math.max(0, maxCell - SPRITE_LAYOUT_SIZE);
}
