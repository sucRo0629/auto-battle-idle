import type { CombatantState, GameData } from '../battle/types.ts';
import { resolveMaxEffectiveRangePx } from '../battle/combatPosition.ts';
import {
  SPRITE_LAYOUT_SIZE,
  spriteSheetMaxOverflowTop,
} from './spriteLayout.ts';

export {
  ALLY_FORMATION_BACK_DEPTH,
  ALLY_ROW_SPACING,
  APPROACH_SPEED,
  BATTLE_ENEMY_MARCH_VISIBLE_MAX_X,
  BATTLE_ENEMY_MARCH_VISIBLE_MIN_X,
  BATTLE_ENEMY_VISIBLE_MAX_X,
  CANVAS_W,
  ENGAGED_VISUAL_TUNING,
  PLAYER_FORMATION_DEPTH,
  PLAYER_ROW_SPACING,
  ROW_X,
  SCROLL_SPEED,
  SPRITE_GAP,
  SPRITE_WIDTH,
  engagedFrontLineGap,
  engagedMinBodyGap,
  engagedStandoffGap,
  enemyRangedRearGap,
  resolveEnemyMarchEngageGap,
} from '../battle/battleConstants.ts';

export {
  type AllyPlacementInput,
  type AllyPositionOptions,
  type CompensatedFormationResetState,
  type EngagedLayoutAllyInput,
  type EngagedLayoutContext,
  type EngagedLayoutEnemyInput,
  type EngagedLayoutResult,
  type FormationRestoreAnchors,
  type FormationRestoreGroups,
  type FormationRestorePhase,
  type FormationRestoreUnit,
  type PlayerPlacementInput,
  type PlayerPositionOptions,
  type StaggeredFormationRestoreState,
  applyStaggeredFormationMarchRestore,
  approachAllyVisualX,
  approachEnemyVisualX,
  approachPlayerVisualX,
  approachVisualX,
  clampAllyVisualDepth,
  clampEngagedEnemyGroupOnScreen,
  clampPlayerVisualDepth,
  computeAllyPositions,
  computeEngagedAllyLaneOffsets,
  computeEngagedAllyTargets,
  computeEngagedEnemyPositions,
  computeEnemyStopX,
  computePlayerPositions,
  computeRangedEnemyVisualX,
  FORMATION_RESTORE_SPACING_EPSILON,
  getFormationRestoreGroups,
  getLeadingAllyFormationRow,
  getLeadingAllyFront,
  getLeadingPlayerFormationRow,
  getLeadingPlayerFront,
  isBackRowOnlyFormation,
  isFormationScreenLayoutRestored,
  isFormationSpacingRestored,
  isLeadColumnSpacingRestored,
  moveTowardX,
  resolveEngagedContactVisualX,
  resolveEngagedLayout,
  resolveEngagedVisualTargets,
  resolveFormationRestoreAnchors,
  resolveFormationScreenTargets,
  resolveLayoutTargets,
  resolveMoveVisualX,
  resolveOverlaps,
  separateEngagedSprites,
  snapFormationScreenLayout,
  tickCompensatedFormationReset,
} from '../battle/battleLayout.ts';

/** @deprecated engagedMinBodyGap */
export { engagedMinBodyGap as engagedMinLeftEdgeGap } from '../battle/battleConstants.ts';

export const ENEMY_VISIBLE_MIN_X = -32;

/** 草タイル描画帯の高さ（HUD に隠れる前提で最小化） */
export const GRASS_BAND_H = 12;
/** @deprecated GRASS_BAND_H と同義（旧 HUD 込み下端余白） */
export const BATTLE_GROUND_MARGIN = GRASS_BAND_H;
const BASE_BATTLE_TOP_PAD = 43;
export const BATTLE_TOP_PAD =
  BASE_BATTLE_TOP_PAD + spriteSheetMaxOverflowTop();
export const STATUS_BADGE_H = 8;
export const STATUS_BADGE_GAP = 2;

export interface VisualCombatant {
  visualX: number;
  isAlive: boolean;
  rangePx: number;
}

/** 戦闘フィールドのみのキャンバス高さ（HUD 領域は含まない） */
export function battleCanvasHeight(spriteScale: number): number {
  return BATTLE_TOP_PAD + SPRITE_LAYOUT_SIZE * spriteScale + GRASS_BAND_H;
}

export function groundLineY(canvasHeight: number): number {
  return canvasHeight - GRASS_BAND_H;
}

export function groundY(canvasHeight: number, scale: number): number {
  return groundLineY(canvasHeight) - SPRITE_LAYOUT_SIZE * scale;
}

export function toVisualCombatant(
  unit: CombatantState,
  gameData: GameData,
): VisualCombatant {
  return {
    visualX: unit.battleX,
    isAlive: unit.isAlive,
    rangePx: resolveMaxEffectiveRangePx(unit, gameData),
  };
}
