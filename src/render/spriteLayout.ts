/** 隊形・地面・当たりの占有サイズ（px） */
export const SPRITE_LAYOUT_SIZE = 32;

/** スプライトシート 1 コマのデフォルトサイズ（px）。layout より大きくてよい */
export const SPRITE_SHEET_CELL_SIZE = 48;

/** attack シートのみ 1 コマ横幅（高さは SPRITE_SHEET_CELL_SIZE） */
export const ATTACK_SHEET_CELL_WIDTH = 64;

/** スキル strip 1 コマ（通常攻撃 + 全 active 共通） */
export const SKILL_ANIM_CELL_WIDTH = 64;
export const SKILL_ANIM_CELL_HEIGHT = 48;

/** spriteKey ごとのシートコマサイズ上書き */
const SHEET_CELL_OVERRIDES: Readonly<Record<string, number>> = {};

export type SheetAnimKind = 'idle' | 'attack' | 'move' | 'death';

export function getSheetCellWidth(spriteKey: string, anim?: SheetAnimKind): number {
  if (anim === 'attack') return ATTACK_SHEET_CELL_WIDTH;
  return SHEET_CELL_OVERRIDES[spriteKey] ?? SPRITE_SHEET_CELL_SIZE;
}

export function getSheetCellHeight(spriteKey: string): number {
  return SHEET_CELL_OVERRIDES[spriteKey] ?? SPRITE_SHEET_CELL_SIZE;
}

/** 描画バッファ等に使うコマの最大辺 */
export function getSheetCellSize(spriteKey: string, anim?: SheetAnimKind): number {
  return Math.max(getSheetCellWidth(spriteKey, anim), getSheetCellHeight(spriteKey));
}

/** シート描画で layout 箱より上にはみ出す最大 px */
export function spriteSheetMaxOverflowTop(): number {
  const sizes = [
    SPRITE_SHEET_CELL_SIZE,
    ATTACK_SHEET_CELL_WIDTH,
    SKILL_ANIM_CELL_HEIGHT,
    ...Object.values(SHEET_CELL_OVERRIDES),
  ];
  const maxCell = Math.max(...sizes);
  return Math.max(0, maxCell - SPRITE_LAYOUT_SIZE);
}
