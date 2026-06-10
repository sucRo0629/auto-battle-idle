import type {
  CombatantState,
  FormationRow,
  GameData,
  MoveSkillEffect,
  Role,
} from "../battle/types.ts";
import { resolveMaxEffectiveRangePx } from "../battle/combatPosition.ts";
import {
  SPRITE_LAYOUT_SIZE,
  spriteSheetMaxOverflowTop,
} from "./spriteLayout.ts";

export const ROW_X: Record<FormationRow, number> = {
  front: 240,
  middle: 298,
  back: 356,
};

/** 前衛列と後列の X 差（味方後列の視覚オフセット = 敵遠距離の視覚オフセット） */
export const ALLY_FORMATION_BACK_DEPTH = ROW_X.back - ROW_X.front;

export const ALLY_ROW_SPACING = 42;
export const SPRITE_WIDTH = SPRITE_LAYOUT_SIZE;
export const SPRITE_GAP = 38;
/**
 * 地面ライン下: 地面演出 + パーティ HUD（epithet + クラス名 + アイコン行）。
 * battle-view.css の --hud-bottom-margin / --hud-icon-size / --hud-header-font-size と同期。
 */
export const BATTLE_GROUND_MARGIN = 54;
/** スプライト上の最小余白（バッジ + HP バー + シートはみ出し分） */
const BASE_BATTLE_TOP_PAD = 43;
export const BATTLE_TOP_PAD = BASE_BATTLE_TOP_PAD + spriteSheetMaxOverflowTop();
/** ステータスバッジ 1 行の高さ（アイコン/矢印 8px） */
export const STATUS_BADGE_H = 8;
/** スプライト / HP バーとバッジ行の間隔 */
export const STATUS_BADGE_GAP = 2;
export const ENEMY_VISIBLE_MIN_X = -32;
/** 非戦闘時: 背景スクロール・敵進軍速度（px/秒） */
export const SCROLL_SPEED = 160;
/** 接敵後: 味方・敵の戦闘位置への接近速度（px/秒） */
export const APPROACH_SPEED = 200;

export interface AllyPlacementInput {
  id: string;
  role: Role;
  formationRow: FormationRow;
  rangePx: number;
  isAlive: boolean;
}

export interface AllyPositionOptions {
  engaged?: boolean;
  frontEnemyX?: number;
}

export interface VisualCombatant {
  visualX: number;
  isAlive: boolean;
  rangePx: number;
}

const ROW_ORDER: FormationRow[] = ["front", "middle", "back"];

const FRONT_ROW_ROLE_ORDER: Record<Role, number> = {
  defender: 0,
  attacker: 1,
  supporter: 2,
};

const BACK_ROW_ROLE_ORDER: Record<Role, number> = {
  supporter: 0,
  attacker: 1,
  defender: 2,
};

interface Placement {
  id: string;
  role: Role;
  formationRow: FormationRow;
  rangePx: number;
  x: number;
}

function rowRoleOrder(row: FormationRow, role: Role): number {
  if (row === "front") return FRONT_ROW_ROLE_ORDER[role];
  if (row === "back") return BACK_ROW_ROLE_ORDER[role];
  return FRONT_ROW_ROLE_ORDER[role];
}

function prefersLeftOnOverlap(row: FormationRow, role: Role): boolean {
  if (row === "front") return role === "defender";
  if (row === "back") return role === "supporter";
  return false;
}

/**
 * 接敵ビジュアル調整（仮スプライト用 — 差し替え後はここだけ触る）
 *
 * - bodyClearancePx: 同陣営内 clearance（味方同士・敵同士・敵味方自動 gap 共通）
 * - frontLineGapPx: 敵味方最前列 gap（0 = 自動: SPRITE_WIDTH + bodyClearancePx）
 * - leadingRowAdvanceT: 接敵時に前列が接敵距離へ寄る割合（0=隊列, 1=完全）
 * - engageMoveSpeedPxPerSec: 接敵後 visual 接近速度（px/s）
 */
export const ENGAGED_VISUAL_TUNING = {
  bodyClearancePx: -20,
  frontLineGapPx: 0,
  leadingRowAdvanceT: 0.8,
  engageMoveSpeedPxPerSec: 100,
} as const;

/** @deprecated ENGAGED_VISUAL_TUNING.bodyClearancePx を参照 */
export const ENGAGED_BODY_CLEARANCE_PX = ENGAGED_VISUAL_TUNING.bodyClearancePx;

/** 同陣営内の左端 gap（味方同士・敵同士） */
export function engagedMinLeftEdgeGap(): number {
  return SPRITE_WIDTH + ENGAGED_VISUAL_TUNING.bodyClearancePx;
}

/** 敵味方最前列同士の左端 gap（接敵距離） */
export function engagedFrontLineGap(): number {
  const tuned = ENGAGED_VISUAL_TUNING.frontLineGapPx;
  if (tuned > 0) return tuned;
  return engagedMinLeftEdgeGap();
}

/** @deprecated engagedFrontLineGap を使用 */
export function engagedFrontLineStandoffGap(): number {
  return engagedFrontLineGap();
}

/** 近接ユニットが敵側へ寄るときの左端 gap */
export function engagedMeleeAdvanceGap(rangePx: number): number {
  return Math.max(rangePx, engagedFrontLineGap());
}

/** 生存味方が後列のみか */
export function isBackRowOnlyFormation(allies: AllyPlacementInput[]): boolean {
  return getLeadingAllyFormationRow(allies.filter((ally) => ally.isAlive)) === "back";
}

export function engagedStandoffGap(
  allyRangePx: number,
  enemyRangePx: number
): number {
  return Math.max(Math.min(allyRangePx, enemyRangePx), engagedMinLeftEdgeGap());
}

/** 敵進軍が止まり接敵が始まる gap（味方接触点からの距離） */
export function resolveEnemyMarchEngageGap(
  allyRangePx: number,
  enemyRangePx: number
): number {
  if (enemyRangePx > 0) {
    return Math.max(enemyRangePx, engagedMinLeftEdgeGap());
  }
  return engagedStandoffGap(allyRangePx, enemyRangePx);
}

export function computeEngagedStandoffAnchors(
  frontAllyX: number,
  frontEnemyX: number,
  frontAllyRangePx: number,
  frontEnemyRangePx: number
): { anchorAllyX: number; anchorEnemyX: number } {
  const gap = engagedStandoffGap(frontAllyRangePx, frontEnemyRangePx);
  const mid = (frontAllyX + frontEnemyX) / 2;
  return {
    anchorAllyX: mid + gap / 2,
    anchorEnemyX: mid - gap / 2,
  };
}

/** 接敵中: 最前線が重なったら左右へ押し出す */
export function enforceEngagedStandoff(
  allies: Array<{ visualX: number; isAlive: boolean }>,
  enemies: Array<{ visualX: number; isAlive: boolean }>
): { allyDelta: number; enemyDelta: number } {
  const pair = getFrontLinePair(
    allies.map((u) => ({ ...u, rangePx: 0 })),
    enemies.map((u) => ({ ...u, rangePx: 0 }))
  );
  if (!pair) return { allyDelta: 0, enemyDelta: 0 };

  const deficit =
    engagedMinLeftEdgeGap() - (pair.ally.visualX - pair.enemy.visualX);
  if (deficit <= 0) return { allyDelta: 0, enemyDelta: 0 };

  const enemyShift = Math.floor(deficit / 2);
  const allyShift = deficit - enemyShift;
  return { allyDelta: allyShift, enemyDelta: -enemyShift };
}

function horizontalGap(allyX: number, enemyX: number): number {
  return allyX - enemyX;
}

export function isUnitInRange(
  allyX: number,
  enemyX: number,
  allyRangePx: number,
  enemyRangePx: number
): boolean {
  const gap = horizontalGap(allyX, enemyX);
  return gap <= allyRangePx || gap <= enemyRangePx;
}

/** 接敵判定用: 最前線の味方と最前線の敵 */
export function getFrontLinePair(
  allies: VisualCombatant[],
  enemies: VisualCombatant[]
): { ally: VisualCombatant; enemy: VisualCombatant } | null {
  const livingAllies = allies.filter((unit) => unit.isAlive);
  const livingEnemies = enemies.filter((unit) => unit.isAlive);
  if (livingAllies.length === 0 || livingEnemies.length === 0) return null;

  const ally = livingAllies.reduce((best, unit) =>
    unit.visualX < best.visualX ? unit : best
  );
  const enemy = livingEnemies.reduce((best, unit) =>
    unit.visualX > best.visualX ? unit : best
  );
  return { ally, enemy };
}

export function getFrontAllyX(allies: VisualCombatant[]): number | null {
  const living = allies.filter((unit) => unit.isAlive);
  if (living.length === 0) return null;
  return Math.min(...living.map((unit) => unit.visualX));
}

export function getFrontEnemyX(enemies: VisualCombatant[]): number | null {
  const living = enemies.filter((unit) => unit.isAlive);
  if (living.length === 0) return null;
  return Math.max(...living.map((unit) => unit.visualX));
}

/** 接敵判定: 最前線の味方と敵の実際の visualX */
export function isBattleEngaged(
  allies: VisualCombatant[],
  enemies: VisualCombatant[]
): boolean {
  const pair = getFrontLinePair(allies, enemies);
  if (!pair) return false;
  return isUnitInRange(
    pair.ally.visualX,
    pair.enemy.visualX,
    pair.ally.rangePx,
    pair.enemy.rangePx
  );
}

/** 非戦闘時: 敵を右へ進軍（背景スクロールと同速） */
export function marchEnemiesRight(
  enemies: Array<{ id: string; visualX: number; isAlive: boolean }>,
  deltaX: number
): Map<string, number> {
  const positions = new Map<string, number>();
  for (const enemy of enemies) {
    positions.set(
      enemy.id,
      enemy.isAlive ? enemy.visualX + deltaX : enemy.visualX
    );
  }
  return positions;
}

function resolvePairOverlap(
  left: Placement,
  right: Placement,
  minXForRight: number
): void {
  const sameRow =
    left.formationRow === right.formationRow ? left.formationRow : null;

  if (
    sameRow &&
    prefersLeftOnOverlap(sameRow, right.role) &&
    !prefersLeftOnOverlap(sameRow, left.role)
  ) {
    const swapX = left.x;
    left.x = minXForRight;
    right.x = swapX;
    return;
  }

  right.x = minXForRight;
}

function resolveOverlaps(
  placements: Placement[],
  minGap: number = SPRITE_GAP
): void {
  for (let pass = 0; pass < placements.length; pass++) {
    let moved = false;
    placements.sort((a, b) => a.x - b.x);
    for (let i = 1; i < placements.length; i++) {
      const left = placements[i - 1];
      const right = placements[i];
      const minX = left.x + minGap;
      if (right.x < minX) {
        resolvePairOverlap(left, right, minX);
        moved = true;
      }
    }
    if (!moved) break;
  }

  placements.sort((a, b) => a.x - b.x);
  for (let i = 1; i < placements.length; i++) {
    const minX = placements[i - 1].x + minGap;
    if (placements[i].x < minX) {
      placements[i].x = minX;
    }
  }
}

/** 生存味方のうち最も前の列（front → middle → back） */
export function getLeadingAllyFormationRow(
  allies: AllyPlacementInput[]
): FormationRow | null {
  const living = allies.filter((ally) => ally.isAlive);
  for (const row of ROW_ORDER) {
    if (living.some((ally) => ally.formationRow === row)) {
      return row;
    }
  }
  return null;
}

/** 接敵中: 最前生存列のうち最も敵側（visualX 最小）の位置と射程 */
export function getLeadingAllyFront(
  allies: Array<AllyPlacementInput & { visualX: number }>
): { visualX: number; rangePx: number } | null {
  const living = allies.filter((ally) => ally.isAlive);
  if (living.length === 0) return null;
  const leadingRow = getLeadingAllyFormationRow(living);
  if (leadingRow === null) return null;
  const rowUnits = living.filter((ally) => ally.formationRow === leadingRow);
  let front = rowUnits[0]!;
  for (const unit of rowUnits) {
    if (unit.visualX < front.visualX) front = unit;
  }
  return { visualX: front.visualX, rangePx: front.rangePx };
}

/** 後列 visualX が前衛より敵側へ出ないよう clamp（接敵距離ベースの visual 移動用） */
export function clampAllyVisualDepth(allies: CombatantState[]): void {
  const living = allies.filter((ally) => ally.isAlive);
  if (living.length === 0) return;
  const leadingRow = getLeadingAllyFormationRow(
    living.map((ally) => ({
      id: ally.id,
      role: ally.role,
      formationRow: ally.formationRow,
      rangePx: 0,
      isAlive: true,
    }))
  );
  if (leadingRow === null) return;
  const leadingMinX = Math.min(
    ...living
      .filter((ally) => ally.formationRow === leadingRow)
      .map((ally) => ally.visualX)
  );
  const leadingIndex = ROW_ORDER.indexOf(leadingRow);
  const rowGap = engagedMinLeftEdgeGap();

  for (const row of ROW_ORDER.slice(leadingIndex + 1)) {
    const rowUnits = living
      .filter((ally) => ally.formationRow === row)
      .sort((a, b) => rowRoleOrder(row, a.role) - rowRoleOrder(row, b.role));
    const baseMinX = leadingMinX + rowDepthOffset(leadingRow, row);
    rowUnits.forEach((ally, slot) => {
      const minX = baseMinX + slot * rowGap;
      if (ally.visualX < minX) {
        ally.visualX = minX;
      }
    });
  }
}

function livingAllies(allies: AllyPlacementInput[]): AllyPlacementInput[] {
  return allies.filter((ally) => ally.isAlive);
}

function rowDepthOffset(from: FormationRow, to: FormationRow): number {
  return ROW_X[to] - ROW_X[from];
}

/** 接敵時: 最前線の生存列を敵方向へ（体同士が重ならない接敵距離） */
function compressLeadingRowTowardEnemy(
  placements: Placement[],
  leadingRow: FormationRow,
  frontEnemyX: number
): void {
  const leading = placements.filter((p) => p.formationRow === leadingRow);
  for (const placement of leading) {
    placement.x = frontEnemyX + engagedMeleeAdvanceGap(placement.rangePx);
  }
}

export interface EngagedEnemyTargetAlly {
  x: number;
  rangePx: number;
  /** 味方後列の visualX（弓士との距離を鏡像する） */
  referenceBackRowAllyX?: number;
}

/** 接敵時: 各敵を狙い味方基準で配置し、重なりだけ左へ広げる */
export function computeEngagedEnemyPositions(
  enemies: Array<{
    id: string;
    visualX: number;
    rangePx: number;
    isAlive: boolean;
  }>,
  targetAllyForEnemy: (enemyId: string) => EngagedEnemyTargetAlly | null
): Map<string, number> {
  const living = enemies.filter((enemy) => enemy.isAlive);
  if (living.length === 0) return new Map();

  const ideals = living.map((enemy) => {
    const target = targetAllyForEnemy(enemy.id);
    const visualX =
      target === null
        ? enemy.visualX
        : enemy.rangePx > 0
        ? computeRangedEnemyVisualX(target.x, target.referenceBackRowAllyX)
        : computeEnemyStopX(0, target.x, target.rangePx);
    return {
      id: enemy.id,
      visualX,
      isAlive: true as const,
    };
  });

  return separateSpritesByGapLeft(ideals, engagedMinLeftEdgeGap());
}

function separateSpritesByGap(
  units: Array<{ id: string; visualX: number; isAlive: boolean }>,
  minGap: number
): Map<string, number> {
  const living = units
    .filter((unit) => unit.isAlive)
    .sort((a, b) => a.visualX - b.visualX);
  const positions = new Map<string, number>();

  for (const unit of living) {
    positions.set(unit.id, unit.visualX);
  }

  for (let i = 1; i < living.length; i++) {
    const prev = living[i - 1];
    const cur = living[i];
    const minX = (positions.get(prev.id) ?? prev.visualX) + minGap;
    const curX = positions.get(cur.id) ?? cur.visualX;
    if (curX < minX) {
      positions.set(cur.id, minX);
    }
  }

  return positions;
}

/** 接敵中: 敵同士の重なりを左へ広げる（前衛より右に押し出さない） */
function separateEngagedEnemySpritesLeft(
  units: Array<{ id: string; visualX: number; isAlive: boolean }>,
): Map<string, number> {
  return separateSpritesByGapLeft(units, engagedMinLeftEdgeGap());
}

/** 接敵中: 同一陣営のスプライト重なり解消 */
export function separateEngagedSprites(
  units: Array<{ id: string; visualX: number; isAlive: boolean }>,
): Map<string, number> {
  return separateSpritesByGap(units, engagedMinLeftEdgeGap());
}

/** 接敵中: 敵グループを gap 維持したまま画面左端以上へまとめてシフト */
export function clampEngagedEnemyGroupOnScreen(
  enemies: Array<{ id: string; visualX: number; isAlive: boolean }>,
  combatCameraX: number,
  minScreenX = 0,
): Map<string, number> {
  const separated = separateEngagedSprites(enemies);
  if (separated.size === 0) return separated;

  let groupMinScreen = Infinity;
  for (const visualX of separated.values()) {
    groupMinScreen = Math.min(groupMinScreen, visualX + combatCameraX);
  }
  if (!Number.isFinite(groupMinScreen) || groupMinScreen >= minScreenX) {
    return separated;
  }
  const shift = minScreenX - groupMinScreen;
  const shifted = new Map<string, number>();
  for (const [id, visualX] of separated) {
    shifted.set(id, visualX + shift);
  }
  return shifted;
}

/** 非戦闘時: 左から出現する敵の重なりを左へ広げる */
export function separateEnemySprites(
  enemies: Array<{ id: string; visualX: number; isAlive: boolean }>
): Map<string, number> {
  return separateSpritesByGapLeft(enemies, SPRITE_GAP);
}

function separateSpritesByGapLeft(
  units: Array<{ id: string; visualX: number; isAlive: boolean }>,
  minGap: number
): Map<string, number> {
  const living = units
    .filter((unit) => unit.isAlive)
    .sort((a, b) => a.visualX - b.visualX);
  const positions = new Map<string, number>();

  for (const unit of living) {
    positions.set(unit.id, unit.visualX);
  }

  for (let i = living.length - 2; i >= 0; i--) {
    const right = living[i + 1];
    const cur = living[i];
    const maxX = (positions.get(right.id) ?? right.visualX) - minGap;
    const curX = positions.get(cur.id) ?? cur.visualX;
    if (curX > maxX) {
      positions.set(cur.id, maxX);
    }
  }

  return positions;
}

function buildEngagedPlacements(
  allies: AllyPlacementInput[],
  frontEnemyX: number
): Placement[] {
  const living = livingAllies(allies);
  const leadingRow = getLeadingAllyFormationRow(living);
  const placements = buildFormationPlacements(living);
  // 後列のみ生存時は ROW_X.back を維持（遠距離は動かず敵が右から接敵）
  if (leadingRow !== null && leadingRow !== "back") {
    compressLeadingRowTowardEnemy(placements, leadingRow, frontEnemyX);
  }
  resolveOverlaps(placements, engagedMinLeftEdgeGap());
  return placements;
}

function buildFormationPlacements(allies: AllyPlacementInput[]): Placement[] {
  const byRow = new Map<FormationRow, AllyPlacementInput[]>();
  for (const row of ROW_ORDER) {
    byRow.set(row, []);
  }
  for (const ally of allies) {
    byRow.get(ally.formationRow)!.push(ally);
  }
  for (const row of ROW_ORDER) {
    byRow
      .get(row)!
      .sort((a, b) => rowRoleOrder(row, a.role) - rowRoleOrder(row, b.role));
  }

  const rowSlot = new Map<FormationRow, number>();
  const placements: Placement[] = [];

  for (const row of ROW_ORDER) {
    for (const ally of byRow.get(row)!) {
      const slot = rowSlot.get(row) ?? 0;
      rowSlot.set(row, slot + 1);
      placements.push({
        id: ally.id,
        role: ally.role,
        formationRow: row,
        rangePx: ally.rangePx,
        x: ROW_X[row] + slot * ALLY_ROW_SPACING,
      });
    }
  }

  resolveOverlaps(placements);
  return placements;
}

/** 接敵中: 生存味方の描画 target（battle アンカー基準・visual 非依存） */
export function computeEngagedAllyVisualTargets(
  allies: AllyPlacementInput[],
  frontEnemyVisualX: number
): Map<string, number> {
  const placements = buildEngagedPlacements(allies, frontEnemyVisualX);
  return new Map(placements.map((p) => [p.id, p.x]));
}

/**
 * 接敵中: 前線接敵点からの固定レーン（隊列と接敵距離のブレンド）
 * advanceT は ENGAGED_VISUAL_TUNING.leadingRowAdvanceT を既定とする
 */
export function computeEngagedAllyLaneOffsets(
  allies: AllyPlacementInput[],
  frontEnemyVisualX: number,
  contactVisualX: number,
  advanceT: number = ENGAGED_VISUAL_TUNING.leadingRowAdvanceT
): Map<string, number> {
  const living = livingAllies(allies);
  const formation = buildFormationPlacements(living);
  const engaged = buildEngagedPlacements(living, frontEnemyVisualX);
  const formationMap = new Map(formation.map((p) => [p.id, p.x]));
  const engagedMap = new Map(engaged.map((p) => [p.id, p.x]));
  const lanes = new Map<string, number>();

  for (const ally of living) {
    if (ally.formationRow === "back") {
      lanes.set(ally.id, 0);
      continue;
    }
    const formX = formationMap.get(ally.id) ?? contactVisualX;
    const engagedX = engagedMap.get(ally.id) ?? formX;
    const blendedX = formX + (engagedX - formX) * advanceT;
    lanes.set(ally.id, blendedX - contactVisualX);
  }
  return lanes;
}

/** 接敵中: 近接敵 visualX（battleX + 固定オフセット、重なり解消のみ） */
export function resolveStableMeleeEnemyVisuals(
  enemies: Array<{ id: string; battleX: number; isAlive: boolean }>,
  battleVisualOffset: number
): Map<string, number> {
  const ideals = enemies
    .filter((enemy) => enemy.isAlive)
    .map((enemy) => ({
      id: enemy.id,
      visualX: enemy.battleX + battleVisualOffset,
      isAlive: true as const,
    }));
  return separateEngagedMeleeSprites(ideals);
}

/** 接敵中: 近接敵の理想 visualX から重なりだけ左へ広げる */
export function separateEngagedMeleeSprites(
  units: Array<{ id: string; visualX: number; isAlive: boolean }>
): Map<string, number> {
  return separateSpritesByGapLeft(units, engagedMinLeftEdgeGap());
}

/**
 * 接敵中: 固定スロットから近接敵 visualX（slot0=接敵時最前列を frontLineTargetX に配置）
 */
export function resolveEngagedMeleeEnemyVisuals(
  enemies: Array<{
    id: string;
    isAlive: boolean;
    engagedMeleeVisualSlot?: number;
  }>,
  frontLineTargetX: number,
): Map<string, number> {
  const gap = engagedMinLeftEdgeGap();
  const positions = new Map<string, number>();
  for (const enemy of enemies) {
    if (!enemy.isAlive) continue;
    const slot = enemy.engagedMeleeVisualSlot ?? 0;
    positions.set(enemy.id, frontLineTargetX - slot * gap);
  }
  return positions;
}

/**
 * 接敵中: 最前線敵を frontLineTargetX に置き、後方敵を enemyGap 刻みで左へ配置。
 * @deprecated 毎フレーム呼ぶと battleX 順が入れ替わる。resolveEngagedMeleeEnemyVisuals を使用。
 */
export function layoutEngagedMeleeEnemyVisuals(
  enemies: Array<{ id: string; battleX: number; isAlive: boolean }>,
  frontLineTargetX: number
): Map<string, number> {
  const living = enemies
    .filter((enemy) => enemy.isAlive)
    .sort((a, b) => b.battleX - a.battleX);
  const gap = engagedMinLeftEdgeGap();
  const positions = new Map<string, number>();
  living.forEach((enemy, slot) => {
    positions.set(enemy.id, frontLineTargetX - slot * gap);
  });
  return positions;
}

/** 味方 X 配置。非戦闘時は重なり解消、接敵時は接敵距離まで詰める */
export function computeAllyPositions(
  allies: AllyPlacementInput[],
  options: AllyPositionOptions = {}
): Map<string, number> {
  const placements =
    options.engaged && options.frontEnemyX !== undefined
      ? buildEngagedPlacements(allies, options.frontEnemyX)
      : buildFormationPlacements(allies);

  return new Map(placements.map((p) => [p.id, p.x]));
}

/** 戦闘後の段階的隊列復帰フェーズ */
export type FormationRestorePhase = "lead" | "trail" | "marching";

export const FORMATION_RESTORE_SPACING_EPSILON = 2;

export interface FormationRestoreUnit {
  id: string;
  role: Role;
  formationRow: FormationRow;
  isAlive: boolean;
  visualX: number;
}

export interface FormationRestoreGroups {
  leadIds: Set<string>;
  trailIds: Set<string>;
}

export interface FormationRestoreAnchors {
  leadFront: FormationRestoreUnit | null;
  leadBack: FormationRestoreUnit | null;
  trailFront: FormationRestoreUnit | null;
  trailBack: FormationRestoreUnit | null;
}

export interface StaggeredFormationRestoreState {
  phase: FormationRestorePhase;
  allies: FormationRestoreUnit[];
}

function formationSlotInRow(
  ally: Pick<AllyPlacementInput, "id" | "role" | "formationRow" | "isAlive">,
  rowAllies: Array<
    Pick<AllyPlacementInput, "id" | "role" | "formationRow" | "isAlive">
  >,
): number {
  const row = ally.formationRow;
  const sorted = rowAllies
    .filter((a) => a.formationRow === row && a.isAlive)
    .sort((a, b) => rowRoleOrder(row, a.role) - rowRoleOrder(row, b.role));
  return sorted.findIndex((a) => a.id === ally.id);
}

/** slot 0 = defender/supporter 列、slot 1+ = attacker 列 */
export function getFormationRestoreGroups(
  allies: Array<
    Pick<AllyPlacementInput, "id" | "role" | "formationRow" | "isAlive">
  >,
): FormationRestoreGroups {
  const living = allies.filter((ally) => ally.isAlive);
  const leadIds = new Set<string>();
  const trailIds = new Set<string>();

  for (const ally of living) {
    const slot = formationSlotInRow(ally, living);
    if (slot <= 0) {
      leadIds.add(ally.id);
    } else {
      trailIds.add(ally.id);
    }
  }

  return { leadIds, trailIds };
}

export function resolveFormationRestoreAnchors(
  allies: FormationRestoreUnit[],
): FormationRestoreAnchors {
  const living = allies.filter((ally) => ally.isAlive);
  let leadFront: FormationRestoreUnit | null = null;
  let leadBack: FormationRestoreUnit | null = null;
  let trailFront: FormationRestoreUnit | null = null;
  let trailBack: FormationRestoreUnit | null = null;

  for (const ally of living) {
    const slot = formationSlotInRow(ally, living);
    if (ally.formationRow === "front") {
      if (slot <= 0) leadFront = ally;
      else trailFront = ally;
    } else if (ally.formationRow === "back") {
      if (slot <= 0) leadBack = ally;
      else trailBack = ally;
    }
  }

  return { leadFront, leadBack, trailFront, trailBack };
}

export function isLeadColumnSpacingRestored(
  leadFrontX: number,
  leadBackX: number,
  epsilon: number = FORMATION_RESTORE_SPACING_EPSILON,
): boolean {
  return (
    Math.abs(leadBackX - leadFrontX - ALLY_FORMATION_BACK_DEPTH) <= epsilon
  );
}

/** slot0 前後 + slot1 同列間隔が隊列どおり */
export function isFormationSpacingRestored(
  allies: FormationRestoreUnit[],
  epsilon: number = FORMATION_RESTORE_SPACING_EPSILON,
): boolean {
  const living = allies.filter((ally) => ally.isAlive);
  if (living.length === 0) return true;

  const anchors = resolveFormationRestoreAnchors(living);
  const { trailIds } = getFormationRestoreGroups(living);

  if (anchors.leadFront && anchors.leadBack) {
    if (
      !isLeadColumnSpacingRestored(
        anchors.leadFront.visualX,
        anchors.leadBack.visualX,
        epsilon,
      )
    ) {
      return false;
    }
  }

  if (trailIds.size === 0) {
    return true;
  }

  if (anchors.leadFront && anchors.trailFront) {
    const gap = anchors.trailFront.visualX - anchors.leadFront.visualX;
    if (Math.abs(gap - ALLY_ROW_SPACING) > epsilon) return false;
  }

  if (anchors.leadBack && anchors.trailBack) {
    const gap = anchors.trailBack.visualX - anchors.leadBack.visualX;
    if (Math.abs(gap - ALLY_ROW_SPACING) > epsilon) return false;
  }

  return true;
}

/**
 * 戦闘後: 左進軍しつつ slot0 前後間隔 → slot1 同列間隔の順で隊列を広げる。
 * allies.visualX を直接更新し、次フェーズを返す。
 */
export function applyStaggeredFormationMarchRestore(
  state: StaggeredFormationRestoreState,
  deltaTime: number,
  spacingSpeed: number = APPROACH_SPEED,
): FormationRestorePhase {
  const living = state.allies.filter((ally) => ally.isAlive);
  if (living.length === 0) {
    return state.phase;
  }

  const marchStep = SCROLL_SPEED * deltaTime;
  const spacingStep = spacingSpeed * deltaTime;

  for (const ally of living) {
    ally.visualX -= marchStep;
  }

  const anchors = resolveFormationRestoreAnchors(living);
  let phase = state.phase;

  if (phase === "lead") {
    if (!anchors.leadFront || !anchors.leadBack) {
      phase = "trail";
    } else {
      const targetBackX =
        anchors.leadFront.visualX + ALLY_FORMATION_BACK_DEPTH;
      anchors.leadBack.visualX = approachAllyVisualX(
        anchors.leadBack.visualX,
        targetBackX,
        spacingStep,
      );
      if (
        isLeadColumnSpacingRestored(
          anchors.leadFront.visualX,
          anchors.leadBack.visualX,
        )
      ) {
        phase = "trail";
      }
    }
  }

  if (phase === "trail") {
    if (anchors.leadFront && anchors.trailFront) {
      const target = anchors.leadFront.visualX + ALLY_ROW_SPACING;
      anchors.trailFront.visualX = approachAllyVisualX(
        anchors.trailFront.visualX,
        target,
        spacingStep,
      );
    }
    if (anchors.leadBack && anchors.trailBack) {
      const target = anchors.leadBack.visualX + ALLY_ROW_SPACING;
      anchors.trailBack.visualX = approachAllyVisualX(
        anchors.trailBack.visualX,
        target,
        spacingStep,
      );
    }
    if (isFormationSpacingRestored(living)) {
      phase = "marching";
    }
  }

  state.phase = phase;
  return phase;
}

export interface CompensatedFormationResetState {
  phase: FormationRestorePhase;
  allies: FormationRestoreUnit[];
}

/** 非接敵時の screen 目標 X（ROW_X + slot 間隔） */
export function resolveFormationScreenTargets(
  allies: Array<
    Pick<AllyPlacementInput, "id" | "role" | "formationRow" | "isAlive">
  >,
): Map<string, number> {
  const living = allies.filter((ally) => ally.isAlive);
  return computeAllyPositions(
    living.map((ally) => ({
      id: ally.id,
      role: ally.role,
      formationRow: ally.formationRow,
      rangePx: 0,
      isAlive: true as const,
    })),
    { engaged: false },
  );
}

function isLeadScreenLayoutRestored(
  allies: FormationRestoreUnit[],
  combatCameraX: number,
  targets: Map<string, number>,
  epsilon: number = FORMATION_RESTORE_SPACING_EPSILON,
): boolean {
  const { leadIds } = getFormationRestoreGroups(allies);
  for (const ally of allies) {
    if (!ally.isAlive || !leadIds.has(ally.id)) continue;
    const target = targets.get(ally.id);
    if (target === undefined) continue;
    const screenX = ally.visualX + combatCameraX;
    if (Math.abs(screenX - target) > epsilon) return false;
  }
  return true;
}

/** 各味方の screen X が初期隊列位置と一致しているか */
export function isFormationScreenLayoutRestored(
  allies: FormationRestoreUnit[],
  combatCameraX: number,
  epsilon: number = FORMATION_RESTORE_SPACING_EPSILON,
): boolean {
  const living = allies.filter((ally) => ally.isAlive);
  if (living.length === 0) return true;

  const targets = resolveFormationScreenTargets(living);
  for (const ally of living) {
    const target = targets.get(ally.id);
    if (target === undefined) continue;
    const screenX = ally.visualX + combatCameraX;
    if (Math.abs(screenX - target) > epsilon) return false;
  }
  return true;
}

/** 完了時: visualX を ROW_X 基準へ、combatCameraX を 0 に正規化 */
export function snapFormationScreenLayout(
  allies: FormationRestoreUnit[],
): void {
  const living = allies.filter((ally) => ally.isAlive);
  const targets = resolveFormationScreenTargets(living);
  for (const ally of living) {
    const target = targets.get(ally.id);
    if (target !== undefined) {
      ally.visualX = target;
    }
  }
}

/**
 * Wave 間: 左進軍 + カメラ右移補正しつつ screen 絶対位置へ隊列を戻す。
 * allies.visualX を直接更新し、更新後の combatCameraX と phase を返す。
 */
export function tickCompensatedFormationReset(
  state: CompensatedFormationResetState,
  combatCameraX: number,
  deltaTime: number,
  spacingSpeed: number = APPROACH_SPEED,
): { phase: FormationRestorePhase; combatCameraX: number } {
  const living = state.allies.filter((ally) => ally.isAlive);
  if (living.length === 0) {
    return { phase: state.phase, combatCameraX };
  }

  const marchStep = SCROLL_SPEED * deltaTime;
  const spacingStep = spacingSpeed * deltaTime;
  const targets = resolveFormationScreenTargets(living);
  const { leadIds, trailIds } = getFormationRestoreGroups(living);

  for (const ally of living) {
    ally.visualX -= marchStep;
  }
  let camera = combatCameraX + marchStep;

  const correctAllyTowardScreenTarget = (ally: FormationRestoreUnit): void => {
    const targetScreen = targets.get(ally.id);
    if (targetScreen === undefined) return;
    const screenX = ally.visualX + camera;
    if (screenX <= targetScreen + FORMATION_RESTORE_SPACING_EPSILON) return;
    const targetVisual = targetScreen - camera;
    ally.visualX = approachAllyVisualX(ally.visualX, targetVisual, spacingStep);
  };

  let phase = state.phase;

  if (phase === "lead") {
    for (const ally of living) {
      if (leadIds.has(ally.id)) {
        correctAllyTowardScreenTarget(ally);
      }
    }
    if (isLeadScreenLayoutRestored(living, camera, targets)) {
      phase = "trail";
    }
  }

  if (phase === "trail") {
    for (const ally of living) {
      if (leadIds.has(ally.id) || trailIds.has(ally.id)) {
        correctAllyTowardScreenTarget(ally);
      }
    }
    if (isFormationScreenLayoutRestored(living, camera)) {
      phase = "marching";
    }
  }

  let maxLeftDeficit = 0;
  for (const ally of living) {
    const targetScreen = targets.get(ally.id);
    if (targetScreen === undefined) continue;
    const screenX = ally.visualX + camera;
    const deficit = targetScreen - screenX;
    if (deficit > maxLeftDeficit) {
      maxLeftDeficit = deficit;
    }
  }
  if (maxLeftDeficit > FORMATION_RESTORE_SPACING_EPSILON) {
    camera += Math.min(spacingStep, maxLeftDeficit);
  }

  state.phase = phase;
  return { phase, combatCameraX: camera };
}

export function computeEnemyStopX(
  enemyRangePx: number,
  targetAllyX: number,
  targetAllyRangePx: number
): number {
  if (enemyRangePx > 0) {
    return targetAllyX - Math.max(enemyRangePx, engagedMinLeftEdgeGap());
  }
  const gap = engagedStandoffGap(targetAllyRangePx, enemyRangePx);
  return targetAllyX - gap;
}

/** 遠距離敵の視覚 X: 狙い味方から味方後列と同じ距離だけ離す */
export function computeRangedEnemyVisualX(
  targetAllyX: number,
  referenceBackRowAllyX?: number,
): number {
  const depth =
    referenceBackRowAllyX !== undefined
      ? referenceBackRowAllyX - targetAllyX
      : ALLY_FORMATION_BACK_DEPTH;
  return targetAllyX - Math.max(depth, ALLY_FORMATION_BACK_DEPTH);
}

export interface EngagedLayoutAllyInput extends AllyPlacementInput {
  visualX: number;
  battleX: number;
  /** 接敵開始 or 前列交代時に固定したレーン（未設定時は毎フレーム再計算） */
  engagedVisualLaneX?: number;
}

export interface EngagedLayoutEnemyInput {
  id: string;
  isAlive: boolean;
  rangePx: number;
  battleX: number;
  engagedMeleeVisualSlot?: number;
}

export interface EngagedLayoutContext {
  allies: EngagedLayoutAllyInput[];
  enemies: EngagedLayoutEnemyInput[];
  allyContactBattleX: number | null;
  battleVisualOffset: number;
  frontEnemyVisualAnchor: number | null;
  resolveRangedTargetVisualX: (enemyId: string) => number | null;
}

export interface EngagedLayoutResult {
  allyVisualX: Map<string, number>;
  enemyVisualX: Map<string, number>;
  frontLineVisualX: number;
}

/** 接敵中の前線 visual 基準点（後列のみ生存時は leadingFront.visualX） */
export function resolveEngagedContactVisualX(
  allies: EngagedLayoutAllyInput[],
  allyContactBattleX: number | null,
  battleVisualOffset: number,
): number | null {
  const living = allies.filter((ally) => ally.isAlive);
  if (living.length === 0) return null;

  if (isBackRowOnlyFormation(living)) {
    const front = getLeadingAllyFront(living);
    return front?.visualX ?? ROW_X.back;
  }

  if (allyContactBattleX === null) return null;
  return allyContactBattleX + battleVisualOffset;
}

/**
 * 接敵中: 全ユニットの目標 visualX を一括算出（BattleEngine は補間のみ担当）
 */
export function resolveEngagedLayout(
  ctx: EngagedLayoutContext,
): EngagedLayoutResult | null {
  const living = ctx.allies.filter((ally) => ally.isAlive);
  if (living.length === 0) return null;

  const frontLineVisualX = resolveEngagedContactVisualX(
    ctx.allies,
    ctx.allyContactBattleX,
    ctx.battleVisualOffset,
  );
  if (frontLineVisualX === null) return null;

  const backRowOnly = isBackRowOnlyFormation(living);
  const hasFrozenLanes = living
    .filter((ally) => ally.formationRow !== "back")
    .every((ally) => ally.engagedVisualLaneX !== undefined);
  const lanes =
    !backRowOnly && ctx.frontEnemyVisualAnchor !== null
      ? hasFrozenLanes
        ? new Map(
            living.map((ally) => [ally.id, ally.engagedVisualLaneX ?? 0]),
          )
        : computeEngagedAllyLaneOffsets(
            living,
            ctx.frontEnemyVisualAnchor,
            frontLineVisualX,
          )
      : new Map<string, number>();

  const allyVisualX = resolveStableAllyEngagedVisuals(
    living.map((ally) => ({
      id: ally.id,
      formationRow: ally.formationRow,
      rangePx: ally.rangePx,
      battleX: ally.battleX,
      isAlive: true as const,
      engagedVisualLaneX: lanes.get(ally.id) ?? 0,
    })),
    frontLineVisualX,
    ctx.battleVisualOffset,
  );

  const frontLineGap = engagedFrontLineGap();
  const enemyFrontTargetX = frontLineVisualX - frontLineGap;
  const meleePositions = resolveEngagedMeleeEnemyVisuals(
    ctx.enemies,
    enemyFrontTargetX,
  );

  const backRowAlly = living.find((ally) => ally.formationRow === "back");
  const referenceBackRowAllyX =
    !backRowOnly && backRowAlly
      ? allyVisualX.get(backRowAlly.id)
      : undefined;

  const enemyVisualX = new Map<string, number>();
  for (const enemy of ctx.enemies) {
    if (!enemy.isAlive) continue;
    if (enemy.rangePx > 0) {
      const targetX = ctx.resolveRangedTargetVisualX(enemy.id);
      if (targetX === null) continue;
      enemyVisualX.set(
        enemy.id,
        backRowOnly
          ? targetX - frontLineGap
          : computeRangedEnemyVisualX(
              frontLineVisualX,
              referenceBackRowAllyX,
            ),
      );
      continue;
    }
    const meleeX = meleePositions.get(enemy.id);
    if (meleeX !== undefined) {
      enemyVisualX.set(enemy.id, meleeX);
    }
  }

  let maxMeleeVisualX = Number.NEGATIVE_INFINITY;
  for (const enemy of ctx.enemies) {
    if (!enemy.isAlive || enemy.rangePx > 0) continue;
    const meleeX = enemyVisualX.get(enemy.id);
    if (meleeX !== undefined) {
      maxMeleeVisualX = Math.max(maxMeleeVisualX, meleeX);
    }
  }
  if (Number.isFinite(maxMeleeVisualX)) {
    const rangedRearCap = maxMeleeVisualX - engagedMinLeftEdgeGap();
    for (const enemy of ctx.enemies) {
      if (!enemy.isAlive || enemy.rangePx <= 0) continue;
      const ideal = enemyVisualX.get(enemy.id);
      if (ideal === undefined) continue;
      enemyVisualX.set(enemy.id, Math.min(ideal, rangedRearCap));
    }
  }

  const separatedEnemies = separateEngagedEnemySpritesLeft(
    [...enemyVisualX.entries()].map(([id, visualX]) => ({
      id,
      visualX,
      isAlive: true as const,
    })),
  );
  for (const [id, visualX] of separatedEnemies) {
    enemyVisualX.set(id, visualX);
  }

  return { allyVisualX, enemyVisualX, frontLineVisualX };
}

/** 接敵中: 前線接敵点 + 固定レーンから味方 visualX（重なり解消のみ） */
export function resolveStableAllyEngagedVisuals(
  allies: Array<{
    id: string;
    formationRow: FormationRow;
    rangePx: number;
    battleX: number;
    isAlive: boolean;
    engagedVisualLaneX?: number;
  }>,
  contactVisualX: number,
  battleVisualOffset: number,
): Map<string, number> {
  const ideals = allies
    .filter((ally) => ally.isAlive)
    .map((ally) => {
      let visualX: number;
      if (ally.formationRow === "back" && ally.rangePx > 0) {
        visualX = ally.battleX + battleVisualOffset;
      } else if (ally.formationRow === "back") {
        visualX = ROW_X.back;
      } else {
        visualX = contactVisualX + (ally.engagedVisualLaneX ?? 0);
      }
      return { id: ally.id, visualX, isAlive: true as const };
    });
  return separateEngagedSprites(ideals);
}

/** 接敵中: battleX 基準線 + 固定レーンから敵 visualX（重なり解消のみ） */
export function resolveStableEnemyEngagedVisuals(
  enemies: Array<{
    id: string;
    rangePx: number;
    isAlive: boolean;
    engagedVisualLaneX?: number;
  }>,
  meleeLineAnchorX: number | null,
  resolveRangedAnchorX: (enemyId: string) => number | null
): Map<string, number> {
  const ideals = enemies
    .filter((enemy) => enemy.isAlive)
    .map((enemy) => {
      let visualX: number;
      if (enemy.rangePx > 0) {
        const anchorX = resolveRangedAnchorX(enemy.id);
        visualX =
          anchorX !== null
            ? anchorX - ALLY_FORMATION_BACK_DEPTH
            : (meleeLineAnchorX ?? 0) + (enemy.engagedVisualLaneX ?? 0);
      } else if (meleeLineAnchorX !== null) {
        visualX = meleeLineAnchorX + (enemy.engagedVisualLaneX ?? 0);
      } else {
        visualX = enemy.engagedVisualLaneX ?? 0;
      }
      return { id: enemy.id, visualX, isAlive: true as const };
    });
  return separateSpritesByGapLeft(ideals, engagedMinLeftEdgeGap());
}

/** move 効果の目標 visualX（anchor 基準・接敵距離維持） */
export function resolveMoveVisualX(
  actor: CombatantState,
  anchor: CombatantState,
  effect: MoveSkillEffect,
  gameData: GameData
): number {
  const mode = effect.moveMode ?? "engage";
  if (mode === "toAnchor") {
    return anchor.visualX;
  }

  const actorRangePx = resolveMaxEffectiveRangePx(actor, gameData);

  if (mode === "behindTarget") {
    const offset = effect.behindOffsetPx ?? 0;
    return actor.isEnemy ? anchor.visualX + offset : anchor.visualX - offset;
  }

  const anchorRangePx = resolveMaxEffectiveRangePx(anchor, gameData);
  if (actor.isEnemy) {
    if (actorRangePx > 0) {
      return computeRangedEnemyVisualX(anchor.visualX);
    }
    return computeEnemyStopX(actorRangePx, anchor.visualX, anchorRangePx);
  }
  const gap = Math.max(actorRangePx, engagedMinLeftEdgeGap());
  return anchor.visualX + gap;
}

/** 現在位置を目標へ最大 maxDelta だけ近づける */
export function moveTowardX(
  current: number,
  target: number,
  maxDelta: number
): number {
  if (maxDelta <= 0) return current;
  const delta = target - current;
  if (Math.abs(delta) <= maxDelta) return target;
  return current + Math.sign(delta) * maxDelta;
}

/** 接敵中: 味方 visualX は敵方向（左 / 減少）へだけ接近（battleX と同様） */
export function approachAllyVisualX(
  current: number,
  target: number,
  maxDelta: number
): number {
  if (target >= current) return current;
  return moveTowardX(current, target, maxDelta);
}

/** 接敵中: 敵 visualX は味方方向（右 / 増加）へだけ接近 */
export function approachEnemyVisualX(
  current: number,
  target: number,
  maxDelta: number
): number {
  if (target <= current) return current;
  return moveTowardX(current, target, maxDelta);
}

/** 接敵中の味方・敵の目標 X（即時適用しない） */
export function computeEngagedAllyTargets(
  allies: AllyPlacementInput[],
  frontEnemyX: number
): Map<string, number> {
  return computeAllyPositions(allies, {
    engaged: true,
    frontEnemyX,
  });
}

export interface EngagedEnemyVisualInput {
  id: string;
  visualX: number;
  rangePx: number;
  isAlive: boolean;
}

export interface EngagedVisualTargetsResult {
  allyTargets: Map<string, number>;
  enemyTargets: Map<string, number>;
  frontLineTargetX: number;
  frontLineRangePx: number;
}

/**
 * 接敵中: 味方配置 target と敵 stop を同一 buildEngagedPlacements から解決。
 * 敵 stop は frontLineTargetX（配置 target）基準 — 現在 visualX ではない。
 */
export interface EngagedEnemyTargetRef {
  allyId: string;
  rangePx: number;
}

export function resolveEngagedVisualTargets(
  livingAllies: Array<AllyPlacementInput & { visualX: number }>,
  enemies: EngagedEnemyVisualInput[],
  frontEnemyVisualX: number,
  frontEnemyRangePx: number,
  resolveEnemyTargetRef: (enemyId: string) => EngagedEnemyTargetRef | null
): EngagedVisualTargetsResult | null {
  const living = livingAllies.filter((ally) => ally.isAlive);
  if (living.length === 0) return null;

  const leadingRow = getLeadingAllyFormationRow(living);
  if (leadingRow === null) return null;

  const placements = buildEngagedPlacements(living, frontEnemyVisualX);
  const allyTargets = new Map(placements.map((p) => [p.id, p.x]));

  const leadingPlacements = placements.filter(
    (p) => p.formationRow === leadingRow
  );
  if (leadingPlacements.length === 0) return null;

  let frontLine = leadingPlacements[0]!;
  for (const placement of leadingPlacements) {
    if (placement.x < frontLine.x) frontLine = placement;
  }

  const backRowAlly = living.find((ally) => ally.formationRow === "back");
  const referenceBackRowAllyX = backRowAlly
    ? allyTargets.get(backRowAlly.id)
    : undefined;

  const enemyTargets = computeEngagedEnemyPositions(enemies, (enemyId) => {
    const ref = resolveEnemyTargetRef(enemyId);
    if (ref === null) return null;
    const enemy = enemies.find((unit) => unit.id === enemyId);
    if (!enemy) return null;
    if (enemy.rangePx > 0) {
      const targetAllyX = allyTargets.get(ref.allyId);
      if (targetAllyX === undefined) return null;
      return {
        x: targetAllyX,
        rangePx: ref.rangePx,
        referenceBackRowAllyX,
      };
    }
    return {
      x: frontLine.x,
      rangePx: frontLine.rangePx,
      referenceBackRowAllyX,
    };
  });

  return {
    allyTargets,
    enemyTargets,
    frontLineTargetX: frontLine.x,
    frontLineRangePx: frontLine.rangePx,
  };
}

export function battleCanvasHeight(spriteScale: number): number {
  return BATTLE_TOP_PAD + SPRITE_WIDTH * spriteScale + BATTLE_GROUND_MARGIN;
}

export function groundY(canvasHeight: number, scale: number): number {
  return canvasHeight - BATTLE_GROUND_MARGIN - SPRITE_WIDTH * scale;
}

export function toVisualCombatant(
  unit: CombatantState,
  gameData: GameData
): VisualCombatant {
  return {
    visualX: unit.visualX,
    isAlive: unit.isAlive,
    rangePx: resolveMaxEffectiveRangePx(unit, gameData),
  };
}
