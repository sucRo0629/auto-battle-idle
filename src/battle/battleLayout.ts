import type {
  CombatantState,
  FormationRow,
  GameData,
  MoveSkillEffect,
  Role,
} from './types.ts';
import {
  resolveFormationRangePx,
  resolveMaxEffectiveRangePx,
} from './combatPosition.ts';
import {
  APPROACH_SPEED,
  CANVAS_W,
  ENGAGED_VISUAL_TUNING,
  PLAYER_FORMATION_DEPTH,
  PLAYER_ROW_SPACING,
  PLAYER_VISUAL_MIN_GAP,
  ROW_X,
  SCROLL_SPEED,
  SPRITE_GAP,
  SPRITE_WIDTH,
  engagedFrontLineGap,
  engagedMinBodyGap,
  engagedStandoffGap,
  enemyRangedRearGap,
} from './battleConstants.ts';

export interface PlayerPlacementInput {
  id: string;
  role: Role;
  formationRow: FormationRow;
  rangePx: number;
  isAlive: boolean;
}

/** @deprecated PlayerPlacementInput */
export type AllyPlacementInput = PlayerPlacementInput;

export interface PlayerPositionOptions {
  engaged?: boolean;
  frontEnemyX?: number;
}

/** @deprecated PlayerPositionOptions */
export type AllyPositionOptions = PlayerPositionOptions;

const ROW_ORDER: FormationRow[] = ['front', 'middle', 'back'];

/** Front row: lower order = left/rear; defender is most forward (right). */
const FRONT_ROW_ROLE_ORDER: Record<Role, number> = {
  attacker: 0,
  defender: 1,
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
  if (row === 'front') return FRONT_ROW_ROLE_ORDER[role];
  if (row === 'back') return BACK_ROW_ROLE_ORDER[role];
  return FRONT_ROW_ROLE_ORDER[role];
}

/** 同一列内: 射程が短いほど前方（右）、長いほど後方（左）。同射程は role 順 */
function compareFormationSlot(
  row: FormationRow,
  a: PlayerPlacementInput,
  b: PlayerPlacementInput,
): number {
  if (a.rangePx !== b.rangePx) {
    return b.rangePx - a.rangePx;
  }
  const roleDelta = rowRoleOrder(row, a.role) - rowRoleOrder(row, b.role);
  if (roleDelta !== 0) return roleDelta;
  return a.id.localeCompare(b.id);
}

function sortPlayersInFormationRow(
  row: FormationRow,
  players: PlayerPlacementInput[],
): PlayerPlacementInput[] {
  return [...players].sort((a, b) => compareFormationSlot(row, a, b));
}

function prefersLeftOnOverlap(row: FormationRow, role: Role): boolean {
  if (row === 'front') return role === 'attacker';
  if (row === 'back') return role === 'supporter';
  return false;
}

function livingPlayers(players: PlayerPlacementInput[]): PlayerPlacementInput[] {
  return players.filter((p) => p.isAlive);
}

function rowDepthOffset(from: FormationRow, to: FormationRow): number {
  return ROW_X[to] - ROW_X[from];
}

function resolvePairOverlap(
  left: Placement,
  right: Placement,
  minXForRight: number,
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

export function resolveOverlaps(
  placements: Placement[],
  minGap: number = PLAYER_VISUAL_MIN_GAP,
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

export function getLeadingPlayerFormationRow(
  players: PlayerPlacementInput[],
): FormationRow | null {
  const living = players.filter((p) => p.isAlive);
  for (const row of ROW_ORDER) {
    if (living.some((p) => p.formationRow === row)) {
      return row;
    }
  }
  return null;
}

/** @deprecated getLeadingPlayerFormationRow */
export const getLeadingAllyFormationRow = getLeadingPlayerFormationRow;

export function isBackRowOnlyFormation(
  players: PlayerPlacementInput[],
): boolean {
  return (
    getLeadingPlayerFormationRow(players.filter((p) => p.isAlive)) === 'back'
  );
}

export function getFrontEnemyVisualX(
  enemies: Array<{ visualX: number; isAlive: boolean }>,
): number | null {
  const living = enemies.filter((e) => e.isAlive);
  if (living.length === 0) return null;
  return Math.min(...living.map((e) => e.visualX));
}

/** @deprecated getFrontEnemyVisualX */
export const getFrontEnemyX = getFrontEnemyVisualX;

export function getFrontPlayerVisualX(
  players: Array<{ visualX: number; isAlive: boolean }>,
): number | null {
  const living = players.filter((p) => p.isAlive);
  if (living.length === 0) return null;
  return Math.max(...living.map((p) => p.visualX));
}

export function getLeadingPlayerFront(
  players: Array<PlayerPlacementInput & { visualX: number }>,
): { visualX: number; rangePx: number } | null {
  const living = players.filter((p) => p.isAlive);
  if (living.length === 0) return null;
  const leadingRow = getLeadingPlayerFormationRow(living);
  if (leadingRow === null) return null;
  const rowUnits = living.filter((p) => p.formationRow === leadingRow);
  let front = rowUnits[0]!;
  for (const unit of rowUnits) {
    if (unit.visualX > front.visualX) front = unit;
  }
  return { visualX: front.visualX, rangePx: front.rangePx };
}

/** @deprecated getLeadingPlayerFront */
export const getLeadingAllyFront = getLeadingPlayerFront;

function buildFormationPlacements(
  players: PlayerPlacementInput[],
): Placement[] {
  const byRow = new Map<FormationRow, PlayerPlacementInput[]>();
  for (const row of ROW_ORDER) {
    byRow.set(row, []);
  }
  for (const player of players) {
    byRow.get(player.formationRow)!.push(player);
  }
  for (const row of ROW_ORDER) {
    byRow.set(row, sortPlayersInFormationRow(row, byRow.get(row)!));
  }

  const rowSlot = new Map<FormationRow, number>();
  const placements: Placement[] = [];

  for (const row of ROW_ORDER) {
    for (const player of byRow.get(row)!) {
      const slot = rowSlot.get(row) ?? 0;
      rowSlot.set(row, slot + 1);
      placements.push({
        id: player.id,
        role: player.role,
        formationRow: row,
        rangePx: player.rangePx,
        x: ROW_X[row] + slot * PLAYER_ROW_SPACING,
      });
    }
  }
  return placements;
}

/** 接敵時: 前列を接敵アンカーへブレンド（compress は使わない） */
function buildEngagedPlacements(
  players: PlayerPlacementInput[],
  frontEnemyVisualX: number,
  contactVisualX: number,
): Placement[] {
  const living = livingPlayers(players);
  const leadingRow = getLeadingPlayerFormationRow(living);
  const placements = buildFormationPlacements(living);
  if (leadingRow === null || leadingRow === 'back') {
    resolveOverlaps(placements, PLAYER_VISUAL_MIN_GAP);
    return placements;
  }

  const advanceT = ENGAGED_VISUAL_TUNING.leadingRowAdvanceT;
  const frontLineGap = engagedFrontLineGap();
  const engageAnchorX = frontEnemyVisualX - frontLineGap;

  for (const placement of placements) {
    if (placement.formationRow !== leadingRow) continue;
    const formOffset = placement.x - ROW_X[leadingRow];
    const engagedX = engageAnchorX + formOffset;
    placement.x = placement.x + (engagedX - placement.x) * advanceT;
  }

  resolveOverlaps(placements, PLAYER_VISUAL_MIN_GAP);
  return placements;
}

export function computePlayerPositions(
  players: PlayerPlacementInput[],
  options: PlayerPositionOptions = {},
): Map<string, number> {
  const placements =
    options.engaged && options.frontEnemyX !== undefined
      ? buildEngagedPlacements(
          players,
          options.frontEnemyX,
          options.frontEnemyX,
        )
      : buildFormationPlacements(players);

  if (options.engaged && options.frontEnemyX !== undefined) {
    resolveOverlaps(placements, PLAYER_VISUAL_MIN_GAP);
  }
  return new Map(placements.map((p) => [p.id, p.x]));
}

/** @deprecated computePlayerPositions */
export const computeAllyPositions = computePlayerPositions;

export function computeEngagedPlayerLaneOffsets(
  players: PlayerPlacementInput[],
  frontEnemyVisualX: number,
  contactVisualX: number,
  advanceT: number = ENGAGED_VISUAL_TUNING.leadingRowAdvanceT,
): Map<string, number> {
  const living = livingPlayers(players);
  const formation = buildFormationPlacements(living);
  const engaged = buildEngagedPlacements(
    living,
    frontEnemyVisualX,
    contactVisualX,
  );
  const formationMap = new Map(formation.map((p) => [p.id, p.x]));
  const engagedMap = new Map(engaged.map((p) => [p.id, p.x]));
  const lanes = new Map<string, number>();

  const leadingRow = getLeadingPlayerFormationRow(living);
  let formationAnchorX =
    leadingRow !== null ? ROW_X[leadingRow] : contactVisualX;
  if (leadingRow !== null) {
    const leadingFormXs = living
      .filter((p) => p.formationRow === leadingRow)
      .map((p) => formationMap.get(p.id) ?? ROW_X[leadingRow]);
    if (leadingFormXs.length > 0) {
      formationAnchorX = Math.max(...leadingFormXs);
    }
  }

  for (const player of living) {
    const formX = formationMap.get(player.id) ?? contactVisualX;
    if (player.formationRow === leadingRow) {
      const engagedX = engagedMap.get(player.id) ?? formX;
      const blendedX = formX + (engagedX - formX) * advanceT;
      lanes.set(player.id, blendedX - contactVisualX);
      continue;
    }
    lanes.set(player.id, formX - formationAnchorX);
  }
  return lanes;
}

/** @deprecated computeEngagedPlayerLaneOffsets */
export const computeEngagedAllyLaneOffsets = computeEngagedPlayerLaneOffsets;

function separateSpritesByGap(
  units: Array<{ id: string; visualX: number; isAlive: boolean }>,
  minGap: number,
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

function separateSpritesByGapRight(
  units: Array<{ id: string; visualX: number; isAlive: boolean }>,
  minGap: number,
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

export function separateEngagedSprites(
  units: Array<{ id: string; visualX: number; isAlive: boolean }>,
): Map<string, number> {
  return separateSpritesByGap(units, engagedMinBodyGap());
}

function resolveEngagedMeleeEnemyVisuals(
  enemies: EngagedLayoutEnemyInput[],
  frontLineTargetX: number,
): Map<string, number> {
  const melee = enemies
    .filter((e) => e.isAlive && e.rangePx <= 0)
    .sort((a, b) => a.battleX - b.battleX);
  const gap = engagedMinBodyGap();
  const positions = new Map<string, number>();
  melee.forEach((enemy, slot) => {
    const slotIndex = enemy.engagedMeleeVisualSlot ?? slot;
    positions.set(enemy.id, frontLineTargetX + slotIndex * gap);
  });
  return positions;
}

export function computeEnemyStopX(
  enemyRangePx: number,
  targetPlayerX: number,
  targetPlayerRangePx: number,
): number {
  if (enemyRangePx > 0) {
    return targetPlayerX + Math.max(enemyRangePx, engagedMinBodyGap());
  }
  const gap = engagedStandoffGap(targetPlayerRangePx, enemyRangePx);
  return targetPlayerX + gap;
}

export function computeRangedEnemyVisualX(
  targetPlayerX: number,
  referenceBackRowPlayerX?: number,
): number {
  const depth =
    referenceBackRowPlayerX !== undefined
      ? targetPlayerX - referenceBackRowPlayerX
      : -PLAYER_FORMATION_DEPTH;
  return targetPlayerX + Math.max(Math.abs(depth), Math.abs(PLAYER_FORMATION_DEPTH));
}

export interface EngagedLayoutPlayerInput extends PlayerPlacementInput {
  visualX: number;
  battleX: number;
  engagedVisualLaneX?: number;
}

/** @deprecated EngagedLayoutPlayerInput */
export type EngagedLayoutAllyInput = EngagedLayoutPlayerInput;

export interface EngagedLayoutEnemyInput {
  id: string;
  isAlive: boolean;
  rangePx: number;
  battleX: number;
  engagedMeleeVisualSlot?: number;
}

export interface EngagedLayoutContext {
  players?: EngagedLayoutPlayerInput[];
  /** @deprecated players を使用 */
  allies?: EngagedLayoutPlayerInput[];
  enemies: EngagedLayoutEnemyInput[];
  playerContactBattleX?: number | null;
  /** @deprecated playerContactBattleX */
  allyContactBattleX?: number | null;
  battleVisualOffset: number;
  frontEnemyVisualAnchor: number | null;
  resolveRangedTargetVisualX: (enemyId: string) => number | null;
}

export interface EngagedLayoutResult {
  playerVisualX: Map<string, number>;
  /** @deprecated playerVisualX */
  allyVisualX: Map<string, number>;
  enemyVisualX: Map<string, number>;
  frontLineVisualX: number;
}

function layoutPlayers(ctx: EngagedLayoutContext): EngagedLayoutPlayerInput[] {
  return ctx.players ?? ctx.allies ?? [];
}

function layoutPlayerContact(ctx: EngagedLayoutContext): number | null {
  return ctx.playerContactBattleX ?? ctx.allyContactBattleX ?? null;
}

export function resolveEngagedContactVisualX(
  players: EngagedLayoutPlayerInput[],
  playerContactBattleX: number | null,
  battleVisualOffset: number,
): number | null {
  const living = players.filter((p) => p.isAlive);
  if (living.length === 0) return null;

  if (isBackRowOnlyFormation(living)) {
    const front = getLeadingPlayerFront(living);
    return front?.visualX ?? ROW_X.back;
  }

  if (playerContactBattleX === null) return null;
  return playerContactBattleX + battleVisualOffset;
}

function isAbsoluteEngagedVisualLane(
  player: { formationRow: FormationRow; engagedVisualLaneX?: number },
  leadingRow: FormationRow | null,
  useAbsoluteRear: boolean,
): boolean {
  return (
    useAbsoluteRear &&
    leadingRow !== null &&
    player.formationRow !== leadingRow &&
    player.engagedVisualLaneX !== undefined
  );
}

export function resolveStablePlayerEngagedVisuals(
  players: Array<{
    id: string;
    formationRow: FormationRow;
    rangePx: number;
    battleX: number;
    isAlive: boolean;
    engagedVisualLaneX?: number;
  }>,
  contactVisualX: number,
  battleVisualOffset: number,
  leadingRow: FormationRow | null = null,
  useAbsoluteRear: boolean = false,
): Map<string, number> {
  const living = players.filter((p) => p.isAlive);
  const result = new Map<string, number>();
  const leadingIdeals: Array<{ id: string; visualX: number; isAlive: true }> =
    [];

  for (const player of living) {
    if (isAbsoluteEngagedVisualLane(player, leadingRow, useAbsoluteRear)) {
      result.set(player.id, player.engagedVisualLaneX!);
      continue;
    }
    leadingIdeals.push({
      id: player.id,
      visualX: contactVisualX + (player.engagedVisualLaneX ?? 0),
      isAlive: true as const,
    });
  }

  const separated = separateEngagedSprites(leadingIdeals);
  for (const [id, visualX] of separated) {
    result.set(id, visualX);
  }
  return result;
}

/** @deprecated resolveStablePlayerEngagedVisuals */
export const resolveStableAllyEngagedVisuals = resolveStablePlayerEngagedVisuals;

export function resolveEngagedLayout(
  ctx: EngagedLayoutContext,
): EngagedLayoutResult | null {
  const players = layoutPlayers(ctx);
  const living = players.filter((p) => p.isAlive);
  if (living.length === 0) return null;

  const playerContact = layoutPlayerContact(ctx);
  const frontLineVisualX = resolveEngagedContactVisualX(
    players,
    playerContact,
    ctx.battleVisualOffset,
  );
  if (frontLineVisualX === null) return null;

  const backRowOnly = isBackRowOnlyFormation(living);
  const leadingRow = getLeadingPlayerFormationRow(living);
  const placementInputs = living.map((p) => ({
    id: p.id,
    role: p.role,
    formationRow: p.formationRow,
    rangePx: p.rangePx,
    isAlive: true as const,
  }));

  const engagedFormationTargets =
    !backRowOnly && ctx.frontEnemyVisualAnchor !== null
      ? computeEngagedPlayerTargets(
          placementInputs,
          ctx.frontEnemyVisualAnchor,
        )
      : null;

  const playerVisualX = new Map<string, number>();

  if (engagedFormationTargets && leadingRow !== null) {
    const frontIdeals: Array<{ id: string; visualX: number; isAlive: true }> =
      [];
    for (const player of living) {
      if (player.formationRow !== leadingRow) continue;
      const target = engagedFormationTargets.get(player.id);
      if (target === undefined) continue;
      frontIdeals.push({
        id: player.id,
        visualX: target,
        isAlive: true as const,
      });
    }
    const separatedFront = separateEngagedSprites(frontIdeals);
    for (const [id, visualX] of separatedFront) {
      playerVisualX.set(id, visualX);
    }
  } else {
    const lanes =
      !backRowOnly && ctx.frontEnemyVisualAnchor !== null
        ? computeEngagedPlayerLaneOffsets(
            living,
            ctx.frontEnemyVisualAnchor,
            frontLineVisualX,
          )
        : new Map<string, number>();
    const leadingVisuals = resolveStablePlayerEngagedVisuals(
      living
        .filter(
          (p) => leadingRow === null || p.formationRow === leadingRow,
        )
        .map((p) => ({
          id: p.id,
          formationRow: p.formationRow,
          rangePx: p.rangePx,
          battleX: p.battleX,
          isAlive: true as const,
          engagedVisualLaneX: lanes.get(p.id) ?? 0,
        })),
      frontLineVisualX,
      ctx.battleVisualOffset,
      leadingRow,
      false,
    );
    for (const [id, visualX] of leadingVisuals) {
      playerVisualX.set(id, visualX);
    }
  }

  for (const player of living) {
    if (leadingRow !== null && player.formationRow !== leadingRow) {
      playerVisualX.set(player.id, player.visualX);
    }
  }

  const frontLineGap = engagedFrontLineGap();
  let frontRowMaxVisualX = frontLineVisualX;
  if (leadingRow !== null) {
    for (const player of living) {
      if (player.formationRow !== leadingRow) continue;
      const x = playerVisualX.get(player.id);
      if (x !== undefined) {
        frontRowMaxVisualX = Math.max(frontRowMaxVisualX, x);
      }
    }
  }
  const enemyFrontTargetX = frontRowMaxVisualX + frontLineGap;
  const meleePositions = resolveEngagedMeleeEnemyVisuals(
    ctx.enemies,
    enemyFrontTargetX,
  );

  const backRowPlayers = living.filter((p) => p.formationRow === 'back');
  const formationBackRowTargets = computePlayerPositions(
    living.map((p) => ({
      id: p.id,
      role: p.role,
      formationRow: p.formationRow,
      rangePx: p.rangePx,
      isAlive: true as const,
    })),
  );
  const referenceBackRowPlayerX =
    !backRowOnly && leadingRow && backRowPlayers.length > 0
      ? frontLineVisualX +
        Math.max(
          ...backRowPlayers.map(
            (p) =>
              (formationBackRowTargets.get(p.id) ?? ROW_X.back) -
              ROW_X[leadingRow],
          ),
        )
      : undefined;

  const enemyVisualX = new Map<string, number>();
  for (const enemy of ctx.enemies) {
    if (!enemy.isAlive) continue;
    if (enemy.rangePx > 0) {
      const targetX = ctx.resolveRangedTargetVisualX(enemy.id);
      if (targetX === null) continue;
      const rangeStopX = computeEnemyStopX(enemy.rangePx, targetX, 0);
      const formationStopX = computeRangedEnemyVisualX(
        targetX,
        referenceBackRowPlayerX,
      );
      const rangedStopX = Math.max(rangeStopX, formationStopX);
      enemyVisualX.set(
        enemy.id,
        backRowOnly ? rangedStopX + frontLineGap : rangedStopX,
      );
      continue;
    }
    const meleeX = meleePositions.get(enemy.id);
    if (meleeX !== undefined) {
      enemyVisualX.set(enemy.id, meleeX);
    }
  }

  const separatedEnemies = separateSpritesByGapRight(
    [...enemyVisualX.entries()].map(([id, visualX]) => ({
      id,
      visualX,
      isAlive: true as const,
    })),
    engagedMinBodyGap(),
  );
  for (const [id, visualX] of separatedEnemies) {
    enemyVisualX.set(id, visualX);
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
    const rangedRearCap = maxMeleeVisualX + enemyRangedRearGap();
    for (const enemy of ctx.enemies) {
      if (!enemy.isAlive || enemy.rangePx <= 0) continue;
      const ideal = enemyVisualX.get(enemy.id);
      if (ideal === undefined) continue;
      enemyVisualX.set(enemy.id, Math.max(ideal, rangedRearCap));
    }
  }

  return {
    playerVisualX,
    allyVisualX: playerVisualX,
    enemyVisualX,
    frontLineVisualX,
  };
}

export function resolveLayoutTargets(
  ctx: EngagedLayoutContext,
): EngagedLayoutResult | null {
  return resolveEngagedLayout(ctx);
}

export function moveTowardX(
  current: number,
  target: number,
  maxDelta: number,
): number {
  if (maxDelta <= 0) return current;
  const delta = target - current;
  if (Math.abs(delta) <= maxDelta) return target;
  return current + Math.sign(delta) * maxDelta;
}

/** 接敵中: visualX は双方向補間（L3） */
export function approachVisualX(
  current: number,
  target: number,
  maxDelta: number,
): number {
  return moveTowardX(current, target, maxDelta);
}

/** @deprecated approachVisualX — 旧一方通行の互換名 */
export function approachPlayerVisualX(
  current: number,
  target: number,
  maxDelta: number,
): number {
  return approachVisualX(current, target, maxDelta);
}

/** @deprecated */
export const approachAllyVisualX = approachPlayerVisualX;

export function approachEnemyVisualX(
  current: number,
  target: number,
  maxDelta: number,
): number {
  return approachVisualX(current, target, maxDelta);
}

export function clampPlayerVisualDepth(players: CombatantState[]): void {
  const living = players.filter((p) => p.isAlive);
  if (living.length === 0) return;
  const leadingRow = getLeadingPlayerFormationRow(
    living.map((p) => ({
      id: p.id,
      role: p.role,
      formationRow: p.formationRow,
      rangePx: 0,
      isAlive: true,
    })),
  );
  if (leadingRow === null) return;
  const leadingMaxX = Math.max(
    ...living
      .filter((p) => p.formationRow === leadingRow)
      .map((p) => p.visualX),
  );
  const leadingIndex = ROW_ORDER.indexOf(leadingRow);
  const rowGap = engagedMinBodyGap();

  for (const row of ROW_ORDER.slice(leadingIndex + 1)) {
    const rowUnits = living
      .filter((p) => p.formationRow === row)
      .sort((a, b) => {
        const rangeA = resolveFormationRangePx(a);
        const rangeB = resolveFormationRangePx(b);
        if (rangeA !== rangeB) return rangeA - rangeB;
        return rowRoleOrder(row, a.role) - rowRoleOrder(row, b.role);
      });
    const baseMaxX = leadingMaxX + rowDepthOffset(leadingRow, row);
    const maxSlot = rowUnits.length - 1;
    rowUnits.forEach((player, slot) => {
      if (isAbsoluteEngagedVisualLane(player, leadingRow, true)) return;
      // 同一列: 射程が短い（右／前方）スロットほど maxX を大きくする
      const maxX = baseMaxX + (maxSlot - slot) * rowGap;
      if (player.visualX > maxX) {
        player.visualX = maxX;
      }
    });
  }
}

/** @deprecated clampPlayerVisualDepth */
export const clampAllyVisualDepth = clampPlayerVisualDepth;

export function clampEngagedEnemyGroupOnScreen(
  enemies: Array<{ id: string; visualX: number; isAlive: boolean }>,
  combatCameraX: number,
  maxScreenX: number = CANVAS_W,
  minScreenX: number = -SPRITE_WIDTH,
): Map<string, number> {
  let positions = separateEngagedSprites(enemies);
  if (positions.size === 0) return positions;

  let groupMaxScreen = Number.NEGATIVE_INFINITY;
  for (const visualX of positions.values()) {
    groupMaxScreen = Math.max(groupMaxScreen, visualX + combatCameraX);
  }
  if (Number.isFinite(groupMaxScreen) && groupMaxScreen > maxScreenX) {
    const shift = maxScreenX - groupMaxScreen;
    const shifted = new Map<string, number>();
    for (const [id, visualX] of positions) {
      shifted.set(id, visualX + shift);
    }
    positions = shifted;
  }

  let groupMinScreen = Number.POSITIVE_INFINITY;
  for (const visualX of positions.values()) {
    groupMinScreen = Math.min(groupMinScreen, visualX + combatCameraX);
  }
  if (Number.isFinite(groupMinScreen) && groupMinScreen < minScreenX) {
    const shift = minScreenX - groupMinScreen;
    const shifted = new Map<string, number>();
    for (const [id, visualX] of positions) {
      shifted.set(id, visualX + shift);
    }
    positions = shifted;
  }

  return positions;
}

/** 画面 clamp 後も近接前線より遠距離敵が左に寄りすぎないよう下限を再適用 */
export function enforceEngagedRangedEnemyRearGap(
  enemies: Array<{ id: string; visualX: number; rangePx: number; isAlive: boolean }>,
): void {
  let maxMeleeVisualX = Number.NEGATIVE_INFINITY;
  for (const enemy of enemies) {
    if (!enemy.isAlive || enemy.rangePx > 0) continue;
    maxMeleeVisualX = Math.max(maxMeleeVisualX, enemy.visualX);
  }
  if (!Number.isFinite(maxMeleeVisualX)) return;
  const rangedRearCap = maxMeleeVisualX + enemyRangedRearGap();
  for (const enemy of enemies) {
    if (!enemy.isAlive || enemy.rangePx <= 0) continue;
    if (enemy.visualX < rangedRearCap) {
      enemy.visualX = rangedRearCap;
    }
  }
}

export function resolveMoveVisualX(
  actor: CombatantState,
  anchor: CombatantState,
  effect: MoveSkillEffect,
  gameData: GameData,
): number {
  const mode = effect.moveMode ?? 'engage';
  if (mode === 'toAnchor') {
    return anchor.visualX;
  }

  const actorRangePx = resolveMaxEffectiveRangePx(actor, gameData);

  if (mode === 'behindTarget') {
    const offset = effect.behindOffsetPx ?? 0;
    return actor.isEnemy
      ? anchor.visualX - offset
      : anchor.visualX + offset;
  }

  const anchorRangePx = resolveMaxEffectiveRangePx(anchor, gameData);
  if (actor.isEnemy) {
    return computeEnemyStopX(actorRangePx, anchor.visualX, anchorRangePx);
  }
  const gap = Math.max(actorRangePx, engagedMinBodyGap());
  return anchor.visualX - gap;
}

export type FormationRestorePhase = 'lead' | 'trail' | 'marching';

export const FORMATION_RESTORE_SPACING_EPSILON = 2;

export interface FormationRestoreUnit {
  id: string;
  role: Role;
  formationRow: FormationRow;
  rangePx?: number;
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
  players?: FormationRestoreUnit[];
  /** @deprecated players */
  allies?: FormationRestoreUnit[];
}

function restorePlayers(
  state: StaggeredFormationRestoreState,
): FormationRestoreUnit[] {
  return state.players ?? state.allies ?? [];
}

function formationSlotInRow(
  player: Pick<
    PlayerPlacementInput,
    'id' | 'role' | 'formationRow' | 'isAlive' | 'rangePx'
  >,
  rowPlayers: Array<
    Pick<
      PlayerPlacementInput,
      'id' | 'role' | 'formationRow' | 'isAlive' | 'rangePx'
    >
  >,
): number {
  const row = player.formationRow;
  const sorted = sortPlayersInFormationRow(
    row,
    rowPlayers
      .filter((p) => p.formationRow === row && p.isAlive)
      .map((p) => ({
        id: p.id,
        role: p.role,
        formationRow: p.formationRow,
        rangePx: p.rangePx ?? 0,
        isAlive: true as const,
      })),
  );
  return sorted.findIndex((p) => p.id === player.id);
}

export function getFormationRestoreGroups(
  players: Array<
    Pick<
      PlayerPlacementInput,
      'id' | 'role' | 'formationRow' | 'isAlive' | 'rangePx'
    >
  >,
): FormationRestoreGroups {
  const living = players.filter((p) => p.isAlive);
  const leadIds = new Set<string>();
  const trailIds = new Set<string>();

  for (const player of living) {
    const slot = formationSlotInRow(player, living);
    if (slot <= 0) {
      leadIds.add(player.id);
    } else {
      trailIds.add(player.id);
    }
  }

  return { leadIds, trailIds };
}

export function resolveFormationRestoreAnchors(
  players: FormationRestoreUnit[],
): FormationRestoreAnchors {
  const living = players.filter((p) => p.isAlive);
  let leadFront: FormationRestoreUnit | null = null;
  let leadBack: FormationRestoreUnit | null = null;
  let trailFront: FormationRestoreUnit | null = null;
  let trailBack: FormationRestoreUnit | null = null;

  for (const player of living) {
    const slot = formationSlotInRow(player, living);
    if (player.formationRow === 'front') {
      if (slot <= 0) leadFront = player;
      else trailFront = player;
    } else if (player.formationRow === 'back') {
      if (slot <= 0) leadBack = player;
      else trailBack = player;
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
    Math.abs(leadBackX - leadFrontX - PLAYER_FORMATION_DEPTH) <= epsilon
  );
}

export function isFormationSpacingRestored(
  players: FormationRestoreUnit[],
  epsilon: number = FORMATION_RESTORE_SPACING_EPSILON,
): boolean {
  const living = players.filter((p) => p.isAlive);
  if (living.length === 0) return true;

  const targets = resolveFormationScreenTargets(living);
  for (const player of living) {
    const target = targets.get(player.id);
    if (target === undefined) continue;
    if (Math.abs(player.visualX - target) > epsilon) return false;
  }
  return true;
}

export function resolveFormationScreenTargets(
  players: Array<
    Pick<
      PlayerPlacementInput,
      'id' | 'role' | 'formationRow' | 'isAlive' | 'rangePx'
    > & { rangePx?: number }
  >,
): Map<string, number> {
  const living = players.filter((p) => p.isAlive);
  return computePlayerPositions(
    living.map((p) => ({
      id: p.id,
      role: p.role,
      formationRow: p.formationRow,
      rangePx: p.rangePx ?? 0,
      isAlive: true as const,
    })),
    { engaged: false },
  );
}

export function isFormationScreenLayoutRestored(
  players: FormationRestoreUnit[],
  combatCameraX: number,
  epsilon: number = FORMATION_RESTORE_SPACING_EPSILON,
): boolean {
  const living = players.filter((p) => p.isAlive);
  if (living.length === 0) return true;

  const targets = resolveFormationScreenTargets(living);
  for (const player of living) {
    const target = targets.get(player.id);
    if (target === undefined) continue;
    const screenX = player.visualX + combatCameraX;
    if (Math.abs(screenX - target) > epsilon) return false;
  }
  return true;
}

export function snapFormationScreenLayout(
  players: FormationRestoreUnit[],
): void {
  const living = players.filter((p) => p.isAlive);
  const targets = resolveFormationScreenTargets(living);
  for (const player of living) {
    const target = targets.get(player.id);
    if (target !== undefined) {
      player.visualX = target;
    }
  }
}

export interface CompensatedFormationResetState {
  phase: FormationRestorePhase;
  players?: FormationRestoreUnit[];
  /** @deprecated players */
  allies?: FormationRestoreUnit[];
}

export function tickCompensatedFormationReset(
  state: CompensatedFormationResetState,
  combatCameraX: number,
  deltaTime: number,
  spacingSpeed: number = APPROACH_SPEED,
): { phase: FormationRestorePhase; combatCameraX: number } {
  const players = state.players ?? state.allies ?? [];
  const living = players.filter((p) => p.isAlive);
  if (living.length === 0) {
    return { phase: state.phase, combatCameraX };
  }

  const marchStep = SCROLL_SPEED * deltaTime;
  const spacingStep = spacingSpeed * deltaTime;
  const targets = resolveFormationScreenTargets(living);
  const { leadIds, trailIds } = getFormationRestoreGroups(living);

  for (const player of living) {
    player.visualX += marchStep;
  }
  let camera = combatCameraX - marchStep;

  const correctPlayerTowardScreenTarget = (
    player: FormationRestoreUnit,
  ): void => {
    const targetScreen = targets.get(player.id);
    if (targetScreen === undefined) return;
    const screenX = player.visualX + camera;
    if (Math.abs(screenX - targetScreen) <= FORMATION_RESTORE_SPACING_EPSILON) {
      return;
    }
    const targetVisual = targetScreen - camera;
    player.visualX = approachVisualX(
      player.visualX,
      targetVisual,
      spacingStep,
    );
  };

  let phase = state.phase;

  if (phase === 'lead') {
    for (const player of living) {
      if (leadIds.has(player.id)) {
        correctPlayerTowardScreenTarget(player);
      }
    }
    const leadRestored = living.every((p) => {
      if (!leadIds.has(p.id)) return true;
      const target = targets.get(p.id);
      if (target === undefined) return true;
      return (
        Math.abs(p.visualX + camera - target) <=
        FORMATION_RESTORE_SPACING_EPSILON
      );
    });
    if (leadRestored) phase = 'trail';
  }

  if (phase === 'trail') {
    for (const player of living) {
      if (leadIds.has(player.id) || trailIds.has(player.id)) {
        correctPlayerTowardScreenTarget(player);
      }
    }
    if (isFormationScreenLayoutRestored(living, camera)) {
      phase = 'marching';
    }
  }

  state.phase = phase;
  return { phase, combatCameraX: camera };
}

export function computeEngagedPlayerTargets(
  players: PlayerPlacementInput[],
  frontEnemyX: number,
): Map<string, number> {
  return computePlayerPositions(players, {
    engaged: true,
    frontEnemyX,
  });
}

/** @deprecated computeEngagedPlayerTargets */
export const computeEngagedAllyTargets = computeEngagedPlayerTargets;

export interface EngagedEnemyTargetPlayer {
  x: number;
  rangePx: number;
  referenceBackRowPlayerX?: number;
}

export function computeEngagedEnemyPositions(
  enemies: Array<{
    id: string;
    visualX: number;
    rangePx: number;
    isAlive: boolean;
  }>,
  targetPlayerForEnemy: (
    enemyId: string,
  ) => EngagedEnemyTargetPlayer | null,
): Map<string, number> {
  const living = enemies.filter((e) => e.isAlive);
  if (living.length === 0) return new Map();

  const ideals = living.map((enemy) => {
    const target = targetPlayerForEnemy(enemy.id);
    const visualX =
      target === null
        ? enemy.visualX
        : enemy.rangePx > 0
          ? Math.max(
              computeEnemyStopX(enemy.rangePx, target.x, target.rangePx),
              computeRangedEnemyVisualX(
                target.x,
                target.referenceBackRowPlayerX,
              ),
            )
          : computeEnemyStopX(0, target.x, target.rangePx);
    return {
      id: enemy.id,
      visualX,
      isAlive: true as const,
    };
  });

  return separateSpritesByGapRight(ideals, engagedMinBodyGap());
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

export interface EngagedEnemyTargetRef {
  allyId: string;
  rangePx: number;
}

export function resolveEngagedVisualTargets(
  livingPlayers: Array<PlayerPlacementInput & { visualX: number }>,
  enemies: EngagedEnemyVisualInput[],
  frontEnemyVisualX: number,
  _frontEnemyRangePx: number,
  resolveEnemyTargetRef: (enemyId: string) => EngagedEnemyTargetRef | null,
): EngagedVisualTargetsResult | null {
  const living = livingPlayers.filter((p) => p.isAlive);
  if (living.length === 0) return null;

  const leadingRow = getLeadingPlayerFormationRow(living);
  if (leadingRow === null) return null;

  const targets = computeEngagedPlayerTargets(living, frontEnemyVisualX);
  const placements = [...targets.entries()].map(([id, x]) => {
    const p = living.find((u) => u.id === id)!;
    return {
      id,
      role: p.role,
      formationRow: p.formationRow,
      rangePx: p.rangePx,
      x,
    };
  });

  const leadingPlacements = placements.filter(
    (p) => p.formationRow === leadingRow,
  );
  if (leadingPlacements.length === 0) return null;

  let frontLine = leadingPlacements[0]!;
  for (const placement of leadingPlacements) {
    if (placement.x > frontLine.x) frontLine = placement;
  }

  const backRowPlayer = living.find((p) => p.formationRow === 'back');
  const referenceBackRowPlayerX = backRowPlayer
    ? targets.get(backRowPlayer.id)
    : undefined;

  const enemyTargets = computeEngagedEnemyPositions(enemies, (enemyId) => {
    const ref = resolveEnemyTargetRef(enemyId);
    if (ref === null) return null;
    const enemy = enemies.find((u) => u.id === enemyId);
    if (!enemy) return null;
    if (enemy.rangePx > 0) {
      const targetPlayerX = targets.get(ref.allyId);
      if (targetPlayerX === undefined) return null;
      return {
        x: targetPlayerX,
        rangePx: ref.rangePx,
        referenceBackRowPlayerX,
      };
    }
    return {
      x: frontLine.x,
      rangePx: frontLine.rangePx,
      referenceBackRowPlayerX,
    };
  });

  return {
    allyTargets: targets,
    enemyTargets,
    frontLineTargetX: frontLine.x,
    frontLineRangePx: frontLine.rangePx,
  };
}

export interface FormationMarchPlacementInput extends PlayerPlacementInput {}

/** 進軍中: 理想隊形を保ったまま右へ移動（同列複数ユニットの重なり防止） */
export function applyFormationMarchTick(
  players: FormationRestoreUnit[],
  placements: PlayerPlacementInput[],
  deltaTime: number,
): void {
  const living = players.filter((p) => p.isAlive);
  if (living.length === 0) return;

  const ideals = computePlayerPositions(placements);
  const placementLiving = placements.filter((p) => p.isAlive);
  const leadRow = getLeadingPlayerFormationRow(placementLiving);
  if (leadRow === null) return;

  let anchor = living.find((p) => p.formationRow === leadRow);
  if (!anchor) return;

  let anchorIdeal = ideals.get(anchor.id) ?? ROW_X[leadRow];
  for (const unit of living) {
    if (unit.formationRow !== leadRow) continue;
    const ideal = ideals.get(unit.id) ?? ROW_X[leadRow];
    if (ideal > anchorIdeal) {
      anchorIdeal = ideal;
      anchor = unit;
    }
  }

  let marchOrigin = anchor.visualX - anchorIdeal;
  for (const unit of living) {
    unit.visualX = (ideals.get(unit.id) ?? unit.visualX) + marchOrigin;
  }

  anchor.visualX += SCROLL_SPEED * deltaTime;
  marchOrigin = anchor.visualX - anchorIdeal;
  for (const unit of living) {
    unit.visualX = (ideals.get(unit.id) ?? unit.visualX) + marchOrigin;
  }
}

export function applyStaggeredFormationMarchRestore(
  state: StaggeredFormationRestoreState,
  deltaTime: number,
  spacingSpeed: number = APPROACH_SPEED,
  placements?: FormationMarchPlacementInput[],
): FormationRestorePhase {
  const players = restorePlayers(state);
  const living = players.filter((p) => p.isAlive);
  if (living.length === 0) return state.phase;

  if (placements && placements.length > 0) {
    applyFormationMarchTick(players, placements, deltaTime);
    state.phase = 'marching';
    return state.phase;
  }

  const marchStep = SCROLL_SPEED * deltaTime;
  const spacingStep = spacingSpeed * deltaTime;

  for (const player of living) {
    player.visualX += marchStep;
  }

  const anchors = resolveFormationRestoreAnchors(living);
  let phase = state.phase;

  if (phase === 'lead') {
    if (!anchors.leadFront || !anchors.leadBack) {
      phase = 'trail';
    } else {
      const targetBackX =
        anchors.leadFront.visualX + PLAYER_FORMATION_DEPTH;
      anchors.leadBack.visualX = approachVisualX(
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
        phase = 'trail';
      }
    }
  }

  if (phase === 'trail') {
    if (anchors.leadFront && anchors.trailFront) {
      const target = anchors.leadFront.visualX + PLAYER_ROW_SPACING;
      anchors.trailFront.visualX = approachVisualX(
        anchors.trailFront.visualX,
        target,
        spacingStep,
      );
    }
    if (anchors.leadBack && anchors.trailBack) {
      const target = anchors.leadBack.visualX + PLAYER_ROW_SPACING;
      anchors.trailBack.visualX = approachVisualX(
        anchors.trailBack.visualX,
        target,
        spacingStep,
      );
    }
    if (isFormationSpacingRestored(living)) {
      phase = 'marching';
    }
  }

  state.phase = phase;
  return phase;
}

export interface BeginEngagedLayoutUnit {
  id: string;
  formationRow: FormationRow;
  visualX: number;
  isAlive: boolean;
}

export interface BeginEngagedLayoutInput {
  allies: BeginEngagedLayoutUnit[];
  combatCameraX: number;
  leadingRow: FormationRow | null;
  contactVisualX: number | null;
}

export interface BeginEngagedLayoutResult {
  combatCameraX: number;
  engageRearScreenX: Map<string, number>;
  cameraFocusLineX: number;
  allyVisualX: Map<string, number>;
}

/**
 * 接敵開始の単一フレームセットアップ:
 * 1. カメラを visualX に焼き込み → combatCameraX = 0
 * 2. 後列の画面 X を engageRearScreenX に記録
 * 3. 前列 visualX はスナップしない
 */
export function beginEngagedLayout(
  input: BeginEngagedLayoutInput,
): BeginEngagedLayoutResult {
  const engageRearScreenX = new Map<string, number>();
  const allyVisualX = new Map<string, number>();
  const cameraBake = input.combatCameraX;

  for (const ally of input.allies) {
    if (!ally.isAlive) continue;
    const screenX = ally.visualX + cameraBake;
    allyVisualX.set(ally.id, screenX);
    if (
      input.leadingRow !== null &&
      ally.formationRow !== input.leadingRow
    ) {
      engageRearScreenX.set(ally.id, screenX);
    }
  }

  const cameraFocusLineX =
    input.contactVisualX !== null
      ? input.contactVisualX + SPRITE_WIDTH / 2
      : ROW_X.front;

  return {
    combatCameraX: 0,
    engageRearScreenX,
    cameraFocusLineX,
    allyVisualX,
  };
}

/** 接敵中: 記録済み後列の画面 X をカメラパン後も維持 */
export function tickEngagedRearVisuals(
  visualX: number,
  engageRearScreenX: number,
  combatCameraX: number,
): number {
  return engageRearScreenX - combatCameraX;
}

export { ENGAGED_VISUAL_TUNING };
