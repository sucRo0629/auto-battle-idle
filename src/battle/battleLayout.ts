import type {
  CombatantState,
  FormationRow,
  GameData,
  Role,
} from './types.ts';
import { RANGED_ATTACK_MIN_PX } from './types.ts';
import {
  resolveApproachFormationRangePx,
  resolveFormationRangePx,
} from './combatPosition.ts';
import {
  CANVAS_W,
  ENGAGED_VISUAL_TUNING,
  PARTY_FORMATION_LEFT_ANCHOR,
  PARTY_FORMATION_SLOT_SPACING,
  PLAYER_FORMATION_DEPTH,
  PLAYER_ROW_SPACING,
  PLAYER_VISUAL_MIN_GAP,
  ROW_X,
  MOVE_PX_PER_SEC,
  moveDeltaPx,
  SPRITE_WIDTH,
  engagedFrontLineGap,
  engagedMinBodyGap,
  enemyRangedRearGap,
} from './battleConstants.ts';
import {
  compareFormationRowSlot,
  computePartyFormationBattleX,
  partyFormationDepthPx,
  type PartyFormationUnit,
} from './partyFormation.ts';
import type { DamageType } from './types.ts';

/** Placement row sort input; rangePx defaults to 0 when omitted. */
type FormationSlotUnit = Pick<
  PlayerPlacementInput,
  'id' | 'role' | 'formationRow' | 'isAlive'
> & { rangePx?: number };

export interface PlayerPlacementInput {
  id: string;
  role: Role;
  formationRow: FormationRow;
  rangePx: number;
  damageType?: DamageType;
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

const ROW_ORDER: FormationRow[] = ['front', 'back'];

/** 同射程前列近接の停止深度（range 差 3px と同程度） */
export const FRONT_ROW_SAME_RANGE_MELEE_DEPTH_PX = 3;

/** 接敵深度の列内ステップ（px） */
export const FORMATION_DEPTH_STEP_PX = FRONT_ROW_SAME_RANGE_MELEE_DEPTH_PX;

/** 接敵 layout: effectiveRangePx が遠隔帯（formation depth + 凍結ターゲット） */
export function isEngagedFormationRangePx(effectiveRangePx: number): boolean {
  return effectiveRangePx >= RANGED_ATTACK_MIN_PX;
}

interface Placement {
  id: string;
  role: Role;
  formationRow: FormationRow;
  rangePx: number;
  x: number;
}

function compareFormationSlot(
  row: FormationRow,
  a: PlayerPlacementInput,
  b: PlayerPlacementInput,
): number {
  return compareFormationRowSlot(row, toPartyFormationUnit(a), toPartyFormationUnit(b));
}

function toPartyFormationUnit(
  input: PlayerPlacementInput,
): PartyFormationUnit {
  return {
    id: input.id,
    role: input.role,
    rangePx: input.rangePx,
    damageType: input.damageType ?? 'physical',
    formationRow: input.formationRow,
  };
}

function sortPlayersInFormationRow(
  row: FormationRow,
  players: PlayerPlacementInput[],
): PlayerPlacementInput[] {
  return [...players].sort((a, b) => compareFormationSlot(row, a, b));
}

/**
 * 接敵: 同一 formationRow 内で baseApproach を列ソート順に積み上げ、
 * 各ユニットを max(自身の base, 前スロット + DEPTH) に揃える。
 * 死体スロットはチェーン維持用に含める（戦死後の前線継承）。
 */
export function applyFormationRowApproachSpacing(
  baseApproachById: Map<string, number>,
  players: PlayerPlacementInput[],
): Map<string, number> {
  const result = new Map<string, number>();
  const rows = new Set(players.map((p) => p.formationRow));

  for (const row of rows) {
    const rowFormation = players.filter((p) => p.formationRow === row);
    if (rowFormation.length === 0) continue;

    const living = livingPlayers(rowFormation);
    if (living.length === 1 && rowFormation.length >= 2) {
      const sorted = sortPlayersInFormationRow(row, rowFormation);
      const unit = living[0]!;
      const ownBase = baseApproachById.get(unit.id);
      if (ownBase !== undefined) {
        let prevX = Number.NEGATIVE_INFINITY;
        let forwardmostX = ownBase;
        for (const input of sorted) {
          const unitBase = baseApproachById.get(input.id) ?? forwardmostX;
          const x =
            prevX === Number.NEGATIVE_INFINITY
              ? unitBase
              : Math.max(unitBase, prevX + FORMATION_DEPTH_STEP_PX);
          forwardmostX = x;
          prevX = x;
        }
        result.set(unit.id, forwardmostX);
      }
      continue;
    }

    const sorted = sortPlayersInFormationRow(row, rowFormation);
    let prevX = Number.NEGATIVE_INFINITY;

    for (const input of sorted) {
      const base = baseApproachById.get(input.id);
      if (base === undefined) continue;

      if (!input.isAlive) {
        if (prevX !== Number.NEGATIVE_INFINITY) {
          prevX += FORMATION_DEPTH_STEP_PX;
        }
        continue;
      }

      const x =
        prevX === Number.NEGATIVE_INFINITY
          ? base
          : Math.max(base, prevX + FORMATION_DEPTH_STEP_PX);
      result.set(input.id, x);
      prevX = x;
    }
  }

  return result;
}

/** @deprecated applyFormationRowApproachSpacing を使用 */
export function resolveFrontRowSameRangeMeleeDepthPx(
  player: PlayerPlacementInput,
  players: PlayerPlacementInput[],
): number {
  const base = new Map<string, number>([[player.id, 0]]);
  const spaced = applyFormationRowApproachSpacing(base, players);
  return spaced.get(player.id) ?? 0;
}

function prefersLeftOnOverlap(row: FormationRow, role: Role): boolean {
  if (row === 'front') return role === 'attacker';
  if (row === 'back') return role === 'supporter';
  return false;
}

function livingPlayers(players: PlayerPlacementInput[]): PlayerPlacementInput[] {
  return players.filter((p) => p.isAlive);
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

export function getFrontEnemyBattleX(
  enemies: Array<{ battleX: number; isAlive: boolean }>,
): number | null {
  const living = enemies.filter((e) => e.isAlive);
  if (living.length === 0) return null;
  return Math.min(...living.map((e) => e.battleX));
}

export function getFrontPlayerBattleX(
  players: Array<{ battleX: number; isAlive: boolean }>,
): number | null {
  const living = players.filter((p) => p.isAlive);
  if (living.length === 0) return null;
  return Math.max(...living.map((p) => p.battleX));
}

export function getLeadingPlayerFront(
  players: Array<PlayerPlacementInput & { battleX: number }>,
): { battleX: number; rangePx: number } | null {
  const living = players.filter((p) => p.isAlive);
  if (living.length === 0) return null;
  const leadingRow = getLeadingPlayerFormationRow(living);
  if (leadingRow === null) return null;
  const rowUnits = living.filter((p) => p.formationRow === leadingRow);
  let front = rowUnits[0]!;
  for (const unit of rowUnits) {
    if (unit.battleX > front.battleX) front = unit;
  }
  return { battleX: front.battleX, rangePx: front.rangePx };
}

/** @deprecated getLeadingPlayerFront */
export const getLeadingAllyFront = getLeadingPlayerFront;

function toFormationUnits(
  players: PlayerPlacementInput[],
): PartyFormationUnit[] {
  return players.map((p) => toPartyFormationUnit(p));
}

function buildFormationPlacements(
  players: PlayerPlacementInput[],
): Placement[] {
  const living = livingPlayers(players);
  const positions = computePartyFormationBattleX(toFormationUnits(living));
  return living.map((player) => ({
    id: player.id,
    role: player.role,
    formationRow: player.formationRow,
    rangePx: player.rangePx,
    x: positions.get(player.id) ?? 0,
  }));
}

/** 接敵時: 右端（最短射程側）を接敵アンカーへブレンド */
function buildEngagedPlacements(
  players: PlayerPlacementInput[],
  frontEnemyBattleX: number,
  _contactBattleX: number,
): Placement[] {
  const living = livingPlayers(players);
  const placements = buildFormationPlacements(living);
  if (placements.length === 0) {
    return placements;
  }

  const advanceT = ENGAGED_VISUAL_TUNING.leadingRowAdvanceT;
  const frontLineGap = engagedFrontLineGap();
  const engageAnchorX = frontEnemyBattleX - frontLineGap;
  const rightmostX = Math.max(...placements.map((p) => p.x));

  for (const placement of placements) {
    const formOffset = placement.x - rightmostX;
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
  frontEnemyBattleX: number,
  contactBattleX: number,
  advanceT: number = ENGAGED_VISUAL_TUNING.leadingRowAdvanceT,
): Map<string, number> {
  const living = livingPlayers(players);
  const formation = buildFormationPlacements(living);
  const engaged = buildEngagedPlacements(
    living,
    frontEnemyBattleX,
    contactBattleX,
  );
  const formationMap = new Map(formation.map((p) => [p.id, p.x]));
  const engagedMap = new Map(engaged.map((p) => [p.id, p.x]));
  const lanes = new Map<string, number>();

  const formationAnchorX =
    formation.length > 0
      ? Math.max(...formation.map((p) => p.x))
      : contactBattleX;
  const leadingRow = getLeadingPlayerFormationRow(living);

  for (const player of living) {
    const formX = formationMap.get(player.id) ?? contactBattleX;
    if (player.formationRow === leadingRow) {
      const engagedX = engagedMap.get(player.id) ?? formX;
      const blendedX = formX + (engagedX - formX) * advanceT;
      lanes.set(player.id, blendedX - contactBattleX);
      continue;
    }
    lanes.set(player.id, formX - formationAnchorX);
  }
  return lanes;
}

/** @deprecated computeEngagedPlayerLaneOffsets */
export const computeEngagedAllyLaneOffsets = computeEngagedPlayerLaneOffsets;

function separateSpritesByGap(
  units: Array<{ id: string; battleX: number; isAlive: boolean }>,
  minGap: number,
): Map<string, number> {
  const living = units
    .filter((unit) => unit.isAlive)
    .sort((a, b) => a.battleX - b.battleX);
  const positions = new Map<string, number>();

  for (const unit of living) {
    positions.set(unit.id, unit.battleX);
  }

  for (let i = 1; i < living.length; i++) {
    const prev = living[i - 1];
    const cur = living[i];
    const minX = (positions.get(prev.id) ?? prev.battleX) + minGap;
    const curX = positions.get(cur.id) ?? cur.battleX;
    if (curX < minX) {
      positions.set(cur.id, minX);
    }
  }

  return positions;
}

export function separateSpritesByGapRight(
  units: Array<{ id: string; battleX: number; isAlive: boolean }>,
  minGap: number,
): Map<string, number> {
  const living = units
    .filter((unit) => unit.isAlive)
    .sort((a, b) => a.battleX - b.battleX);
  const positions = new Map<string, number>();

  for (const unit of living) {
    positions.set(unit.id, unit.battleX);
  }

  for (let i = living.length - 2; i >= 0; i--) {
    const right = living[i + 1];
    const cur = living[i];
    const maxX = (positions.get(right.id) ?? right.battleX) - minGap;
    const curX = positions.get(cur.id) ?? cur.battleX;
    if (curX > maxX) {
      positions.set(cur.id, maxX);
    }
  }

  return positions;
}

export function separateEngagedSprites(
  units: Array<{ id: string; battleX: number; isAlive: boolean }>,
): Map<string, number> {
  return separateSpritesByGap(units, engagedMinBodyGap());
}

function compareEngagedContactEnemyOrder(
  a: EngagedLayoutEnemyInput,
  b: EngagedLayoutEnemyInput,
): number {
  if (a.rangePx !== b.rangePx) return a.rangePx - b.rangePx;
  const slotA = a.engagedMeleeVisualSlot ?? 0;
  const slotB = b.engagedMeleeVisualSlot ?? 0;
  if (slotA !== slotB) return slotA - slotB;
  return a.battleX - b.battleX;
}

/** 接敵: 同一 effectiveRangePx は同停止線、差分 px で奥行き（§4.2 / L10） */
function resolveEngagedContactEnemyVisuals(
  enemies: EngagedLayoutEnemyInput[],
  frontLineTargetX: number,
): Map<string, number> {
  const contact = enemies
    .filter((e) => e.isAlive && !isEngagedFormationRangePx(e.rangePx))
    .sort(compareEngagedContactEnemyOrder);
  if (contact.length === 0) return new Map();

  const minRangePx = Math.min(...contact.map((e) => e.rangePx));
  const positions = new Map<string, number>();
  for (const enemy of contact) {
    positions.set(enemy.id, frontLineTargetX + (enemy.rangePx - minRangePx));
  }
  return positions;
}

/** §2.5: 敵停止 X = target.battleX + effectiveRangePx（L10: body gap 加算なし） */
export function computeEnemyStopX(
  enemyRangePx: number,
  targetPlayerX: number,
  _targetPlayerRangePx: number,
): number {
  return targetPlayerX + enemyRangePx;
}

export function computeRangedEnemyBattleX(
  targetPlayerX: number,
  referenceBackRowPlayerX?: number,
  partySize: number = 5,
): number {
  const defaultDepth = partyFormationDepthPx(partySize);
  const depth =
    referenceBackRowPlayerX !== undefined
      ? targetPlayerX - referenceBackRowPlayerX
      : -defaultDepth;
  return targetPlayerX + Math.max(Math.abs(depth), defaultDepth);
}

export interface EngagedLayoutPlayerInput extends PlayerPlacementInput {
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
  /** legacy: engagedVisualSlot — 接敵開始時に固定する射程 px 奥行きスロット */
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
  resolveRangedTargetBattleX: (enemyId: string) => number | null;
}

export interface EngagedLayoutResult {
  playerBattleX: Map<string, number>;
  /** @deprecated playerBattleX */
  allyBattleX: Map<string, number>;
  enemyBattleX: Map<string, number>;
  frontLineBattleX: number;
}

function layoutPlayers(ctx: EngagedLayoutContext): EngagedLayoutPlayerInput[] {
  return ctx.players ?? ctx.allies ?? [];
}

function layoutPlayerContact(ctx: EngagedLayoutContext): number | null {
  return ctx.playerContactBattleX ?? ctx.allyContactBattleX ?? null;
}

export function resolveEngagedContactBattleX(
  players: EngagedLayoutPlayerInput[],
  playerContactBattleX: number | null,
  battleVisualOffset: number,
): number | null {
  const living = players.filter((p) => p.isAlive);
  if (living.length === 0) return null;

  if (isBackRowOnlyFormation(living)) {
    const front = getLeadingPlayerFront(living);
    return front?.battleX ?? PARTY_FORMATION_LEFT_ANCHOR;
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
  contactBattleX: number,
  _battleVisualOffset: number,
  leadingRow: FormationRow | null = null,
  useAbsoluteRear: boolean = false,
): Map<string, number> {
  const living = players.filter((p) => p.isAlive);
  const result = new Map<string, number>();
  const leadingIdeals: Array<{ id: string; battleX: number; isAlive: true }> =
    [];

  for (const player of living) {
    if (isAbsoluteEngagedVisualLane(player, leadingRow, useAbsoluteRear)) {
      result.set(player.id, player.engagedVisualLaneX!);
      continue;
    }
    leadingIdeals.push({
      id: player.id,
      battleX: contactBattleX + (player.engagedVisualLaneX ?? 0),
      isAlive: true as const,
    });
  }

  const separated = separateEngagedSprites(leadingIdeals);
  for (const [id, x] of separated) {
    result.set(id, x);
  }
  return result;
}

/** @deprecated resolveStablePlayerEngagedVisuals */
export const resolveStableAllyEngagedVisuals = resolveStablePlayerEngagedVisuals;

/** Vitest 専用: resolveEngagedLayout の呼び出し回数（spec A-L1-01） */
let resolveEngagedLayoutCallCount = 0;

export const __testOnlyBattleLayout = {
  getResolveEngagedLayoutCallCount: (): number => resolveEngagedLayoutCallCount,
  resetResolveEngagedLayoutCallCount: (): void => {
    resolveEngagedLayoutCallCount = 0;
  },
};

/** layout 目標の算出（毎 tick 可。カウンタは増やさない） */
export function computeEngagedLayout(
  ctx: EngagedLayoutContext,
): EngagedLayoutResult | null {
  const players = layoutPlayers(ctx);
  const living = players.filter((p) => p.isAlive);
  if (living.length === 0) return null;

  const playerContact = layoutPlayerContact(ctx);
  const frontLineBattleX = resolveEngagedContactBattleX(
    players,
    playerContact,
    ctx.battleVisualOffset,
  );
  if (frontLineBattleX === null) return null;

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

  const playerBattleX = new Map<string, number>();

  if (engagedFormationTargets && leadingRow !== null) {
    const frontIdeals: Array<{ id: string; battleX: number; isAlive: true }> =
      [];
    for (const player of living) {
      if (player.formationRow !== leadingRow) continue;
      const target = engagedFormationTargets.get(player.id);
      if (target === undefined) continue;
      frontIdeals.push({
        id: player.id,
        battleX: target,
        isAlive: true as const,
      });
    }
    const separatedFront = separateEngagedSprites(frontIdeals);
    for (const [id, x] of separatedFront) {
      playerBattleX.set(id, x);
    }
  } else {
    const lanes =
      !backRowOnly && ctx.frontEnemyVisualAnchor !== null
        ? computeEngagedPlayerLaneOffsets(
            living,
            ctx.frontEnemyVisualAnchor,
            frontLineBattleX,
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
      frontLineBattleX,
      ctx.battleVisualOffset,
      leadingRow,
      false,
    );
    for (const [id, x] of leadingVisuals) {
      playerBattleX.set(id, x);
    }
  }

  for (const player of living) {
    if (leadingRow !== null && player.formationRow !== leadingRow) {
      playerBattleX.set(player.id, player.battleX);
    }
  }

  const frontLineGap = engagedFrontLineGap();
  let frontRowMaxBattleX = frontLineBattleX;
  if (leadingRow !== null) {
    for (const player of living) {
      if (player.formationRow !== leadingRow) continue;
      const x = playerBattleX.get(player.id);
      if (x !== undefined) {
        frontRowMaxBattleX = Math.max(frontRowMaxBattleX, x);
      }
    }
  }
  const enemyFrontTargetX = frontRowMaxBattleX + frontLineGap;
  const contactPositions = resolveEngagedContactEnemyVisuals(
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
      ? frontLineBattleX +
        Math.max(
          ...backRowPlayers.map(
            (p) =>
              (formationBackRowTargets.get(p.id) ?? ROW_X.back) -
              ROW_X[leadingRow],
          ),
        )
      : undefined;

  const enemyBattleX = new Map<string, number>();
  for (const enemy of ctx.enemies) {
    if (!enemy.isAlive) continue;
    if (isEngagedFormationRangePx(enemy.rangePx)) {
      const targetX = ctx.resolveRangedTargetBattleX(enemy.id);
      if (targetX === null) continue;
      const rangeStopX = computeEnemyStopX(enemy.rangePx, targetX, 0);
      const formationStopX = computeRangedEnemyBattleX(
        targetX,
        referenceBackRowPlayerX,
      );
      const rangedStopX = Math.max(rangeStopX, formationStopX);
      enemyBattleX.set(
        enemy.id,
        backRowOnly ? rangedStopX + frontLineGap : rangedStopX,
      );
      continue;
    }
    const contactX = contactPositions.get(enemy.id);
    if (contactX !== undefined) {
      enemyBattleX.set(enemy.id, contactX);
    }
  }

  const separatedEnemies = separateSpritesByGapRight(
    [...enemyBattleX.entries()]
      .filter(([id]) => {
        const enemy = ctx.enemies.find((e) => e.id === id);
        return enemy !== undefined && isEngagedFormationRangePx(enemy.rangePx);
      })
      .map(([id, x]) => ({
        id,
        battleX: x,
        isAlive: true as const,
      })),
    engagedMinBodyGap(),
  );
  for (const [id, x] of separatedEnemies) {
    enemyBattleX.set(id, x);
  }

  let maxContactBattleX = Number.NEGATIVE_INFINITY;
  for (const enemy of ctx.enemies) {
    if (!enemy.isAlive || isEngagedFormationRangePx(enemy.rangePx)) continue;
    const contactX = enemyBattleX.get(enemy.id);
    if (contactX !== undefined) {
      maxContactBattleX = Math.max(maxContactBattleX, contactX);
    }
  }
  if (Number.isFinite(maxContactBattleX)) {
    const rangedRearCap = maxContactBattleX + enemyRangedRearGap();
    for (const enemy of ctx.enemies) {
      if (!enemy.isAlive || !isEngagedFormationRangePx(enemy.rangePx)) continue;
      const ideal = enemyBattleX.get(enemy.id);
      if (ideal === undefined) continue;
      enemyBattleX.set(enemy.id, Math.max(ideal, rangedRearCap));
    }
  }

  return {
    playerBattleX,
    allyBattleX: playerBattleX,
    enemyBattleX,
    frontLineBattleX,
  };
}

/** 構成変化・接敵開始時のみ（A-L1-01 カウンタ対象） */
export function resolveEngagedLayout(
  ctx: EngagedLayoutContext,
): EngagedLayoutResult | null {
  resolveEngagedLayoutCallCount += 1;
  return computeEngagedLayout(ctx);
}

/** R1-fix: layout 結果を battleX（= 描画正本）へ1回適用 */
export function applyEngagedFormationToBattleX(
  players: CombatantState[],
  enemies: CombatantState[],
  layout: EngagedLayoutResult,
  options?: {
    isOnField?: (unit: CombatantState) => boolean;
    players?: boolean;
    enemies?: boolean;
  },
): void {
  const applyPlayers = options?.players !== false;
  const applyEnemies = options?.enemies !== false;

  if (applyPlayers) {
    for (const player of players) {
      if (!player.isAlive) continue;
      if (options?.isOnField && !options.isOnField(player)) continue;
      const x = layout.playerBattleX.get(player.id);
      if (x !== undefined) {
        player.battleX = x;
        player.battleX = x;
      }
    }
  }
  if (applyEnemies) {
    for (const enemy of enemies) {
      if (!enemy.isAlive) continue;
      const x = layout.enemyBattleX.get(enemy.id);
      if (x !== undefined) {
        enemy.battleX = x;
        enemy.battleX = x;
      }
    }
  }
}

/** 接敵中: 前列 battleX の overlap 解消（毎 tick） */
export function resolveEngagedFormationOverlaps(
  players: CombatantState[],
  leadingRow: FormationRow | null,
  isOnField: (unit: CombatantState) => boolean,
  gameData: GameData,
): void {
  if (leadingRow === null) return;
  const frontUnits = players.filter(
    (p) => isOnField(p) && p.isAlive && p.formationRow === leadingRow,
  );
  if (frontUnits.length < 2) return;

  const allContactBand = frontUnits.every(
    (p) => resolveApproachFormationRangePx(p) < RANGED_ATTACK_MIN_PX,
  );

  if (allContactBand) {
    const placements = frontUnits.map((p) => ({
      id: p.id,
      role: p.role,
      formationRow: p.formationRow,
      rangePx: resolveFormationRangePx(p),
      isAlive: true as const,
    }));
    const sorted = sortPlayersInFormationRow(leadingRow, placements);
    const minGap = FRONT_ROW_SAME_RANGE_MELEE_DEPTH_PX;
    for (let i = 1; i < sorted.length; i++) {
      const rear = frontUnits.find((p) => p.id === sorted[i - 1]!.id);
      const front = frontUnits.find((p) => p.id === sorted[i]!.id);
      if (!rear || !front) continue;
      const minFrontX = rear.battleX + minGap;
      if (front.battleX < minFrontX) {
        front.battleX = minFrontX;
      }
    }
    return;
  }

  const separated = separateSpritesByGapRight(
    frontUnits.map((p) => ({
      id: p.id,
      battleX: p.battleX,
      isAlive: true as const,
    })),
    PLAYER_ROW_SPACING,
  );
  for (const player of frontUnits) {
    const x = separated.get(player.id);
    if (x !== undefined) {
      player.battleX = x;
      player.battleX = x;
    }
  }
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

export function clampEngagedEnemyGroupOnScreen(
  enemies: Array<{ id: string; battleX: number; isAlive: boolean }>,
  _combatCameraX: number = 0,
  maxScreenX: number = CANVAS_W,
  minScreenX: number = -SPRITE_WIDTH,
): Map<string, number> {
  let positions = separateEngagedSprites(enemies);
  if (positions.size === 0) return positions;

  let groupMax = Number.NEGATIVE_INFINITY;
  for (const battleX of positions.values()) {
    groupMax = Math.max(groupMax, battleX);
  }
  if (Number.isFinite(groupMax) && groupMax > maxScreenX) {
    const shift = maxScreenX - groupMax;
    const shifted = new Map<string, number>();
    for (const [id, x] of positions) {
      shifted.set(id, x + shift);
    }
    positions = shifted;
  }

  let groupMin = Number.POSITIVE_INFINITY;
  for (const battleX of positions.values()) {
    groupMin = Math.min(groupMin, battleX);
  }
  if (Number.isFinite(groupMin) && groupMin < minScreenX) {
    const shift = minScreenX - groupMin;
    const shifted = new Map<string, number>();
    for (const [id, x] of positions) {
      shifted.set(id, x + shift);
    }
    positions = shifted;
  }

  return positions;
}

export type FormationRestorePhase = 'lead' | 'trail' | 'marching';

export const FORMATION_RESTORE_SPACING_EPSILON = 2;

export interface FormationRestoreUnit {
  id: string;
  role: Role;
  formationRow: FormationRow;
  rangePx?: number;
  isAlive: boolean;
  battleX: number;
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
  player: FormationSlotUnit,
  rowPlayers: FormationSlotUnit[],
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
  players: FormationSlotUnit[],
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
    if (Math.abs(player.battleX - target) > epsilon) return false;
  }
  return true;
}

export function resolveFormationScreenTargets(
  players: FormationSlotUnit[],
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
  _combatCameraX: number = 0,
  epsilon: number = FORMATION_RESTORE_SPACING_EPSILON,
): boolean {
  const living = players.filter((p) => p.isAlive);
  if (living.length === 0) return true;

  const targets = resolveFormationScreenTargets(living);
  for (const player of living) {
    const target = targets.get(player.id);
    if (target === undefined) continue;
    if (Math.abs(player.battleX - target) > epsilon) return false;
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
      player.battleX = target;
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
  _combatCameraX: number = 0,
  deltaTime: number,
  spacingPxPerSec: number = MOVE_PX_PER_SEC,
): { phase: FormationRestorePhase; combatCameraX: number } {
  const players = state.players ?? state.allies ?? [];
  const living = players.filter((p) => p.isAlive);
  if (living.length === 0) {
    return { phase: state.phase, combatCameraX: 0 };
  }

  const moveStep = moveDeltaPx(MOVE_PX_PER_SEC, deltaTime);
  const spacingStep = moveDeltaPx(spacingPxPerSec, deltaTime);
  const targets = resolveFormationScreenTargets(living);
  const { leadIds, trailIds } = getFormationRestoreGroups(living);

  for (const player of living) {
    player.battleX += moveStep;
  }

  const correctPlayerTowardTarget = (player: FormationRestoreUnit): void => {
    const target = targets.get(player.id);
    if (target === undefined) return;
    if (Math.abs(player.battleX - target) <= FORMATION_RESTORE_SPACING_EPSILON) {
      return;
    }
    player.battleX = approachVisualX(player.battleX, target, spacingStep);
  };

  let phase = state.phase;

  if (phase === 'lead') {
    for (const player of living) {
      if (leadIds.has(player.id)) {
        correctPlayerTowardTarget(player);
      }
    }
    const leadRestored = living.every((p) => {
      if (!leadIds.has(p.id)) return true;
      const target = targets.get(p.id);
      if (target === undefined) return true;
      return Math.abs(p.battleX - target) <= FORMATION_RESTORE_SPACING_EPSILON;
    });
    if (leadRestored) phase = 'trail';
  }

  if (phase === 'trail') {
    for (const player of living) {
      if (leadIds.has(player.id) || trailIds.has(player.id)) {
        correctPlayerTowardTarget(player);
      }
    }
    if (isFormationScreenLayoutRestored(living)) {
      phase = 'marching';
    }
  }

  state.phase = phase;
  return { phase, combatCameraX: 0 };
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
    battleX: number;
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
    const rangeStopX =
      target === null
        ? enemy.battleX
        : computeEnemyStopX(enemy.rangePx, target.x, target.rangePx);
    const idealX =
      target === null
        ? enemy.battleX
        : isEngagedFormationRangePx(enemy.rangePx)
          ? Math.max(
              rangeStopX,
              computeRangedEnemyBattleX(
                target.x,
                target.referenceBackRowPlayerX,
              ),
            )
          : rangeStopX;
    return {
      id: enemy.id,
      battleX: idealX,
      isAlive: true as const,
    };
  });

  return separateSpritesByGapRight(ideals, engagedMinBodyGap());
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

  let marchOrigin = anchor.battleX - anchorIdeal;
  for (const unit of living) {
    unit.battleX = (ideals.get(unit.id) ?? unit.battleX) + marchOrigin;
  }

  anchor.battleX += moveDeltaPx(MOVE_PX_PER_SEC, deltaTime);
  marchOrigin = anchor.battleX - anchorIdeal;
  for (const unit of living) {
    unit.battleX = (ideals.get(unit.id) ?? unit.battleX) + marchOrigin;
  }
}

export function applyStaggeredFormationMarchRestore(
  state: StaggeredFormationRestoreState,
  deltaTime: number,
  spacingPxPerSec: number = MOVE_PX_PER_SEC,
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

  const moveStep = moveDeltaPx(MOVE_PX_PER_SEC, deltaTime);
  const spacingStep = moveDeltaPx(spacingPxPerSec, deltaTime);

  for (const player of living) {
    player.battleX += moveStep;
  }

  const anchors = resolveFormationRestoreAnchors(living);
  let phase = state.phase;

  if (phase === 'lead') {
    if (!anchors.leadFront || !anchors.leadBack) {
      phase = 'trail';
    } else {
      const targetBackX =
        anchors.leadFront.battleX + PLAYER_FORMATION_DEPTH;
      anchors.leadBack.battleX = approachVisualX(
        anchors.leadBack.battleX,
        targetBackX,
        spacingStep,
      );
      if (
        isLeadColumnSpacingRestored(
          anchors.leadFront.battleX,
          anchors.leadBack.battleX,
        )
      ) {
        phase = 'trail';
      }
    }
  }

  if (phase === 'trail') {
    if (anchors.leadFront && anchors.trailFront) {
      const target = anchors.leadFront.battleX + PLAYER_ROW_SPACING;
      anchors.trailFront.battleX = approachVisualX(
        anchors.trailFront.battleX,
        target,
        spacingStep,
      );
    }
    if (anchors.leadBack && anchors.trailBack) {
      const target = anchors.leadBack.battleX + PLAYER_ROW_SPACING;
      anchors.trailBack.battleX = approachVisualX(
        anchors.trailBack.battleX,
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
  battleX: number;
  isAlive: boolean;
}

export interface BeginEngagedLayoutInput {
  allies: BeginEngagedLayoutUnit[];
  combatCameraX: number;
  leadingRow: FormationRow | null;
  contactBattleX: number | null;
}

export interface BeginEngagedLayoutResult {
  combatCameraX: number;
  engageRearScreenX: Map<string, number>;
  cameraFocusLineX: number;
  /** @deprecated playerBattleX */
  allyBattleX: Map<string, number>;
}

/** 接敵開始: 後列の battleX を記録（カメラ廃止後は screenX = battleX） */
export function beginEngagedLayout(
  input: BeginEngagedLayoutInput,
): BeginEngagedLayoutResult {
  const engageRearScreenX = new Map<string, number>();
  const playerBattleXMap = new Map<string, number>();

  for (const ally of input.allies) {
    if (!ally.isAlive) continue;
    playerBattleXMap.set(ally.id, ally.battleX);
    if (
      input.leadingRow !== null &&
      ally.formationRow !== input.leadingRow
    ) {
      engageRearScreenX.set(ally.id, ally.battleX);
    }
  }

  const cameraFocusLineX =
    input.contactBattleX !== null
      ? input.contactBattleX + SPRITE_WIDTH / 2
      : PARTY_FORMATION_LEFT_ANCHOR + PARTY_FORMATION_SLOT_SPACING * 2;

  return {
    combatCameraX: 0,
    engageRearScreenX,
    cameraFocusLineX,
    allyBattleX: playerBattleXMap,
  };
}

export { ENGAGED_VISUAL_TUNING };
