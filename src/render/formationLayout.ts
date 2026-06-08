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
/** 地面ライン下: 地面演出 + パーティ HUD（クラス名 + アイコン行） */
export const BATTLE_GROUND_MARGIN = 50;
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
 * - frontLineStandoffPx: 敵味方の最前列 gap を px 直指定（0 = frontLineClearancePx 使用）
 * - frontLineClearancePx: 敵味方 gap 自動時の clearance（bodyClearancePx とは独立）
 * - bodyClearancePx: 味方同士のすき間のみ
 * - enemyBodyClearancePx: 敵同士のすき間のみ（0 = frontLineClearancePx と同値）
 * - meleeAdvanceGapPx: 味方前列の寄せ先 gap 上書き
 * - leadingRowAdvanceT: 隊列→standoff への寄せ率（0=隊列, 1=完全接近）
 * - engageVisualMoveSpeed: 接敵後 visualX が目標へ寄る速度（px/s）
 */
export const ENGAGED_VISUAL_TUNING = {
  frontLineStandoffPx: 0,
  frontLineClearancePx: -20,
  bodyClearancePx: -20,
  enemyBodyClearancePx: 0,
  meleeAdvanceGapPx: 0,
  leadingRowAdvanceT: 0.8,
  engageVisualMoveSpeed: 100,
} as const;

/** @deprecated ENGAGED_VISUAL_TUNING.bodyClearancePx を参照 */
export const ENGAGED_BODY_CLEARANCE_PX = ENGAGED_VISUAL_TUNING.bodyClearancePx;

/** 味方同士の左端 gap */
export function engagedMinLeftEdgeGap(): number {
  return SPRITE_WIDTH + ENGAGED_VISUAL_TUNING.bodyClearancePx;
}

/** 敵最前列↔味方最前列の左端 gap（ビジュアル standoff） */
export function engagedFrontLineStandoffGap(): number {
  const tuned = ENGAGED_VISUAL_TUNING.frontLineStandoffPx;
  if (tuned > 0) return tuned;
  return SPRITE_WIDTH + ENGAGED_VISUAL_TUNING.frontLineClearancePx;
}

/** 敵同士の左端 gap */
export function engagedEnemyMinLeftEdgeGap(): number {
  const enemyClearance = ENGAGED_VISUAL_TUNING.enemyBodyClearancePx;
  const clearance =
    enemyClearance !== 0
      ? enemyClearance
      : ENGAGED_VISUAL_TUNING.frontLineClearancePx;
  return SPRITE_WIDTH + clearance;
}

/** 近接ユニットが敵側へ寄るときの左端 gap */
export function engagedMeleeAdvanceGap(rangePx: number): number {
  const standoff = engagedFrontLineStandoffGap();
  const tuned = ENGAGED_VISUAL_TUNING.meleeAdvanceGapPx;
  return Math.max(rangePx, tuned > 0 ? tuned : standoff);
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

/** 後列 visualX が前衛より敵側へ出ないよう clamp（battleX 非連動の standoff 移動用） */
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
  for (const ally of living) {
    const rowIndex = ROW_ORDER.indexOf(ally.formationRow);
    if (rowIndex <= leadingIndex) continue;
    const minX = leadingMinX + rowDepthOffset(leadingRow, ally.formationRow);
    if (ally.visualX < minX) {
      ally.visualX = minX;
    }
  }
}

function livingAllies(allies: AllyPlacementInput[]): AllyPlacementInput[] {
  return allies.filter((ally) => ally.isAlive);
}

function rowDepthOffset(from: FormationRow, to: FormationRow): number {
  return ROW_X[to] - ROW_X[from];
}

/** 接敵時: 最前線の生存列を敵方向へ（体同士が重ならない standoff） */
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

/** 接敵中: 同一陣営のスプライト重なり解消 */
export function separateEngagedSprites(
  units: Array<{ id: string; visualX: number; isAlive: boolean }>
): Map<string, number> {
  return separateSpritesByGap(units, engagedMinLeftEdgeGap());
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
 * 接敵中: 前線接敵点からの固定レーン（隊列と standoff のブレンド）
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
  return separateSpritesByGapLeft(units, engagedEnemyMinLeftEdgeGap());
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
  const gap = engagedEnemyMinLeftEdgeGap();
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
  const gap = engagedEnemyMinLeftEdgeGap();
  const positions = new Map<string, number>();
  living.forEach((enemy, slot) => {
    positions.set(enemy.id, frontLineTargetX - slot * gap);
  });
  return positions;
}

/** 味方 X 配置。非戦闘時は重なり解消、接敵時は standoff まで詰める */
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
  referenceBackRowAllyX?: number
): number {
  const depth =
    referenceBackRowAllyX !== undefined
      ? referenceBackRowAllyX - targetAllyX
      : ALLY_FORMATION_BACK_DEPTH;
  return targetAllyX - Math.max(depth, ALLY_FORMATION_BACK_DEPTH);
}

/** 接敵中: 前線接敵点 + 固定レーンから味方 visualX（重なり解消のみ） */
export function resolveStableAllyEngagedVisuals(
  allies: Array<{
    id: string;
    formationRow: FormationRow;
    isAlive: boolean;
    engagedVisualLaneX?: number;
  }>,
  contactVisualX: number
): Map<string, number> {
  const ideals = allies
    .filter((ally) => ally.isAlive)
    .map((ally) => ({
      id: ally.id,
      visualX:
        ally.formationRow === "back"
          ? ROW_X.back
          : contactVisualX + (ally.engagedVisualLaneX ?? 0),
      isAlive: true as const,
    }));
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

/** move 効果の目標 visualX（anchor 基準・standoff 維持） */
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
