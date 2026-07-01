import type {
  CombatantState,
  FormationRow,
  Role,
} from './types.ts';
import { RANGED_ATTACK_MIN_PX } from './types.ts';
import {
  resolveApproachFormationRangePx,
  resolveFormationRangePx,
  isPlayerRearAssaultAccess,
  resolveEngagedFrontlineClusterIdsByBattleX,
  PLAYER_OFF_FRONTLINE_PEER_MARGIN_PX,
  type PlayerRearAssaultBattleContext,
} from './combatPosition.ts';
import {
  CANVAS_W,
  ENGAGED_VISUAL_TUNING,
  PARTY_FORMATION_LEFT_ANCHOR,
  PARTY_FORMATION_SLOT_SPACING,
  PLAYER_ROW_SPACING,
  PLAYER_VISUAL_MIN_GAP,
  ROW_X,
  SPRITE_WIDTH,
  engagedMinBodyGap,
  enemyRangedRearGap,
} from './battleConstants.ts';
import { COMBAT_SAFE_LEFT, COMBAT_SAFE_RIGHT } from './combatSafeArea.ts';
import {
  compareFormationRowSlot,
  comparePartyFormationSlot,
  computePartyFormationBattleX,
  isMeleeFormationSlot,
  partyFormationDepthPx,
  type PartyFormationUnit,
} from './partyFormation.ts';
import type { DamageType } from './types.ts';

export interface PlayerPlacementInput {
  id: string;
  role: Role;
  formationRow: FormationRow;
  rangePx: number;
  damageType?: DamageType;
  isAlive: boolean;
}


export interface PlayerPositionOptions {
  engaged?: boolean;
  frontEnemyX?: number;
}


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
 * 接敵: partyFormation ソート順で baseApproach を深度積み上げ。
 * 死体スロットはチェーン維持用に含める（戦死後の前線継承）。
 */
export function applyPartyFormationApproachSpacing(
  baseApproachById: Map<string, number>,
  players: PlayerPlacementInput[],
): Map<string, number> {
  const result = new Map<string, number>();
  const sorted = [...players].sort((a, b) =>
    comparePartyFormationSlot(toPartyFormationUnit(a), toPartyFormationUnit(b)),
  );
  const living = livingPlayers(players);

  if (living.length === 1 && players.length >= 2) {
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
    return result;
  }

  let prevX = Number.NEGATIVE_INFINITY;
  let prevDeployRow: FormationRow | null = null;
  for (const input of sorted) {
    const base = baseApproachById.get(input.id);
    if (base === undefined) continue;

    const deployRow = toPartyFormationUnit(input).formationRow ?? 'front';
    if (prevDeployRow !== null && deployRow !== prevDeployRow) {
      prevX = Number.NEGATIVE_INFINITY;
    }
    prevDeployRow = deployRow;

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

  return result;
}

/** @deprecated applyPartyFormationApproachSpacing を使用 */
export function applyFormationRowApproachSpacing(
  baseApproachById: Map<string, number>,
  players: PlayerPlacementInput[],
): Map<string, number> {
  return applyPartyFormationApproachSpacing(baseApproachById, players);
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

function placementToFormationUnit(p: Placement): PartyFormationUnit {
  return {
    id: p.id,
    role: p.role,
    rangePx: p.rangePx,
    damageType: 'physical',
    formationRow: p.formationRow,
  };
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
    compareFormationRowSlot(
      sameRow,
      placementToFormationUnit(right),
      placementToFormationUnit(left),
    ) > 0
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

/** 接敵アンカー: frontline 最短射程分だけ敵接触点より後方（body gap は加算しない） */
export function resolveEngagePlayerBattleAnchor(
  players: PlayerPlacementInput[],
  enemyContact: number,
): number {
  const living = livingPlayers(players);
  if (living.length === 0) return enemyContact;

  const contactPlayers = resolveForwardMeleeFormationUnits(living);
  const minFrontRange = Math.min(...contactPlayers.map((player) => player.rangePx));
  return enemyContact - minFrontRange;
}

function minContactEnemyRangePx(
  enemies: EngagedLayoutEnemyInput[],
): number {
  const contact = enemies.filter(
    (e) => e.isAlive && !isEngagedFormationRangePx(e.rangePx),
  );
  if (contact.length === 0) return 0;
  return Math.min(...contact.map((e) => e.rangePx));
}

/** 近接前線スロットが 1 体もいない編成（全員遠隔帯） */
export function isRearDepthOnlyFormation(
  players: PlayerPlacementInput[],
): boolean {
  const living = livingPlayers(players);
  return (
    living.length > 0 &&
    living.every((player) => !isMeleeFormationSlot(toPartyFormationUnit(player)))
  );
}

/** @deprecated isRearDepthOnlyFormation を使用 */
export function isBackRowOnlyFormation(
  players: PlayerPlacementInput[],
): boolean {
  return isRearDepthOnlyFormation(players);
}

function resolveForwardMeleeFormationUnits(
  players: PlayerPlacementInput[],
): PlayerPlacementInput[] {
  const living = livingPlayers(players);
  if (living.length === 0) return [];
  const sorted = [...living].sort((a, b) =>
    comparePartyFormationSlot(toPartyFormationUnit(a), toPartyFormationUnit(b)),
  );
  const melee = sorted.filter((player) =>
    isMeleeFormationSlot(toPartyFormationUnit(player)),
  );
  return melee.length > 0 ? melee : [sorted[sorted.length - 1]!];
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

/** @deprecated formationRow ベース。battleX peer frontline へ移行済み */
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

export function getFrontlineContactFront(
  players: Array<PlayerPlacementInput & { battleX: number }>,
): { battleX: number; rangePx: number } | null {
  const living = players.filter((player) => player.isAlive);
  if (living.length === 0) return null;
  const maxX = Math.max(...living.map((player) => player.battleX));
  const atFront = living.filter(
    (player) => player.battleX >= maxX - PLAYER_OFF_FRONTLINE_PEER_MARGIN_PX,
  );
  let front = atFront[0]!;
  for (const unit of atFront) {
    if (unit.battleX > front.battleX) front = unit;
  }
  return { battleX: front.battleX, rangePx: front.rangePx };
}

/** @deprecated getFrontlineContactFront を使用 */
export function getLeadingPlayerFront(
  players: Array<PlayerPlacementInput & { battleX: number }>,
): { battleX: number; rangePx: number } | null {
  return getFrontlineContactFront(players);
}


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
  // §2.5: cross-faction anchor uses effectiveRangePx, not body gap
  const engageAnchorX = frontEnemyBattleX;
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


export function computeEngagedPlayerBattleLaneOffsets(
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
  const frontlineIds = resolveEngagedFrontlineClusterIdsByBattleX(living);

  for (const player of living) {
    const formX = formationMap.get(player.id) ?? contactBattleX;
    if (frontlineIds.has(player.id)) {
      const engagedX = engagedMap.get(player.id) ?? formX;
      const blendedX = formX + (engagedX - formX) * advanceT;
      lanes.set(player.id, blendedX - contactBattleX);
      continue;
    }
    lanes.set(player.id, formX - formationAnchorX);
  }
  return lanes;
}


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
  const slotA = a.engagedMeleeDepthSlot ?? 0;
  const slotB = b.engagedMeleeDepthSlot ?? 0;
  if (slotA !== slotB) return slotA - slotB;
  return a.battleX - b.battleX;
}

/** 接敵: 同一 effectiveRangePx は同停止線、差分 px で奥行き（§4.2 / L10） */
function resolveEngagedContactEnemyBattleX(
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
  engagedBattleLaneX?: number;
}


export interface EngagedLayoutEnemyInput {
  id: string;
  isAlive: boolean;
  rangePx: number;
  battleX: number;
  /** 接敵開始時に固定する射程 px 奥行きスロット */
  engagedMeleeDepthSlot?: number;
}

export interface EngagedLayoutContext {
  players?: EngagedLayoutPlayerInput[];
  enemies: EngagedLayoutEnemyInput[];
  playerContactBattleX?: number | null;
  battleOffset: number;
  frontEnemyBattleAnchor: number | null;
  resolveRangedTargetBattleX: (enemyId: string) => number | null;
}

export interface EngagedLayoutResult {
  playerBattleX: Map<string, number>;
  enemyBattleX: Map<string, number>;
  frontLineBattleX: number;
}

function layoutPlayers(ctx: EngagedLayoutContext): EngagedLayoutPlayerInput[] {
  return ctx.players ?? [];
}

function layoutPlayerContact(ctx: EngagedLayoutContext): number | null {
  return ctx.playerContactBattleX ?? null;
}

export function resolveEngagedContactBattleX(
  players: EngagedLayoutPlayerInput[],
  playerContactBattleX: number | null,
  battleOffset: number,
): number | null {
  const living = players.filter((p) => p.isAlive);
  if (living.length === 0) return null;

  if (isRearDepthOnlyFormation(living)) {
    const front = getFrontlineContactFront(living);
    return front?.battleX ?? PARTY_FORMATION_LEFT_ANCHOR;
  }

  if (playerContactBattleX === null) return null;
  return playerContactBattleX + battleOffset;
}

function isAbsoluteEngagedBattleLane(
  player: { id: string; engagedBattleLaneX?: number },
  frontlineIds: Set<string>,
  useAbsoluteRear: boolean,
): boolean {
  return (
    useAbsoluteRear &&
    !frontlineIds.has(player.id) &&
    player.engagedBattleLaneX !== undefined
  );
}

export function resolveStablePlayerEngagedBattleX(
  players: Array<{
    id: string;
    rangePx: number;
    battleX: number;
    isAlive: boolean;
    engagedBattleLaneX?: number;
  }>,
  contactBattleX: number,
  _battleOffset: number,
  frontlineIds: Set<string> = resolveEngagedFrontlineClusterIdsByBattleX(players),
  useAbsoluteRear: boolean = false,
): Map<string, number> {
  const living = players.filter((p) => p.isAlive);
  const result = new Map<string, number>();
  const leadingIdeals: Array<{ id: string; battleX: number; isAlive: true }> =
    [];

  for (const player of living) {
    if (isAbsoluteEngagedBattleLane(player, frontlineIds, useAbsoluteRear)) {
      result.set(player.id, player.engagedBattleLaneX!);
      continue;
    }
    leadingIdeals.push({
      id: player.id,
      battleX: contactBattleX + (player.engagedBattleLaneX ?? 0),
      isAlive: true as const,
    });
  }

  const separated = separateEngagedSprites(leadingIdeals);
  for (const [id, x] of separated) {
    result.set(id, x);
  }
  return result;
}


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
    ctx.battleOffset,
  );
  if (frontLineBattleX === null) return null;

  const rearDepthOnly = isRearDepthOnlyFormation(living);
  const frontlineIds = resolveEngagedFrontlineClusterIdsByBattleX(living);
  const placementInputs = living.map((p) => ({
    id: p.id,
    role: p.role,
    formationRow: p.formationRow,
    rangePx: p.rangePx,
    isAlive: true as const,
  }));

  const engagedFormationTargets =
    !rearDepthOnly && ctx.frontEnemyBattleAnchor !== null
      ? computeEngagedPlayerTargets(
          placementInputs,
          ctx.frontEnemyBattleAnchor,
        )
      : null;

  const playerBattleX = new Map<string, number>();

  if (engagedFormationTargets && frontlineIds.size > 0) {
    const frontIdeals: Array<{ id: string; battleX: number; isAlive: true }> =
      [];
    for (const player of living) {
      if (!frontlineIds.has(player.id)) continue;
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
      !rearDepthOnly && ctx.frontEnemyBattleAnchor !== null
        ? computeEngagedPlayerBattleLaneOffsets(
            living,
            ctx.frontEnemyBattleAnchor,
            frontLineBattleX,
          )
        : new Map<string, number>();
    const leadingBattleX = resolveStablePlayerEngagedBattleX(
      living
        .filter((player) => frontlineIds.has(player.id))
        .map((player) => ({
          id: player.id,
          rangePx: player.rangePx,
          battleX: player.battleX,
          isAlive: true as const,
          engagedBattleLaneX: lanes.get(player.id) ?? 0,
        })),
      frontLineBattleX,
      ctx.battleOffset,
      frontlineIds,
      false,
    );
    for (const [id, x] of leadingBattleX) {
      playerBattleX.set(id, x);
    }
  }

  for (const player of living) {
    if (!frontlineIds.has(player.id)) {
      playerBattleX.set(player.id, player.battleX);
    }
  }

  let frontlineMaxBattleX = frontLineBattleX;
  for (const player of living) {
    if (!frontlineIds.has(player.id)) continue;
    const x = playerBattleX.get(player.id);
    if (x !== undefined) {
      frontlineMaxBattleX = Math.max(frontlineMaxBattleX, x);
    }
  }
  const enemyFrontTargetX =
    frontlineMaxBattleX + minContactEnemyRangePx(ctx.enemies);
  const contactPositions = resolveEngagedContactEnemyBattleX(
    ctx.enemies,
    enemyFrontTargetX,
  );

  const rearDepthPlayers = living.filter((player) => !frontlineIds.has(player.id));
  const formationDepthTargets = computePlayerPositions(
    living.map((p) => ({
      id: p.id,
      role: p.role,
      formationRow: p.formationRow,
      rangePx: p.rangePx,
      isAlive: true as const,
    })),
  );
  const formationDeploy = buildFormationPlacements(living);
  const formationAnchorX =
    formationDeploy.length > 0
      ? Math.max(...formationDeploy.map((placement) => placement.x))
      : frontLineBattleX;
  const referenceBackRowPlayerX =
    !rearDepthOnly && rearDepthPlayers.length > 0
      ? frontLineBattleX +
        Math.max(
          ...rearDepthPlayers.map(
            (player) =>
              (formationDepthTargets.get(player.id) ??
                PARTY_FORMATION_LEFT_ANCHOR) - formationAnchorX,
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
      enemyBattleX.set(enemy.id, rangedStopX);
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
    enemyBattleX,
    frontLineBattleX,
  };
}

/** 非接敵配置確定時のみ（訓練 bake 等。Engaged 中の構成変化では呼ばない。A-L1-01 カウンタ対象） */
export function resolveEngagedLayout(
  ctx: EngagedLayoutContext,
): EngagedLayoutResult | null {
  resolveEngagedLayoutCallCount += 1;
  return computeEngagedLayout(ctx);
}

/** 非接敵配置確定: layout 結果を battleX（= 描画正本）へ1回適用（訓練・Wave 開始 bake 等） */
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
interface EngagedFormationOverlapOptions {
  maxCorrectionPx?: number;
  movementBudgetOriginById?: ReadonlyMap<string, number>;
}

function resolveEngagedMeleeOverlapClusterIds(
  players: CombatantState[],
): Set<string> {
  const living = players.filter((player) => player.isAlive);
  if (living.length === 0) return new Set();
  const maxX = Math.max(...living.map((player) => player.battleX));
  const depthLimit = partyFormationDepthPx(Math.max(living.length, 5));
  return new Set(
    living
      .filter(
        (player) =>
          resolveApproachFormationRangePx(player) < RANGED_ATTACK_MIN_PX &&
          player.battleX >= maxX - depthLimit,
      )
      .map((player) => player.id),
  );
}

export function resolveEngagedFormationOverlaps(
  players: CombatantState[],
  isOnField: (unit: CombatantState) => boolean,
  isInSkillMotion?: (id: string) => boolean,
  options?: EngagedFormationOverlapOptions & {
    battleContext?: PlayerRearAssaultBattleContext;
  },
): void {
  const maxCorrectionPx = resolveOverlapCorrectionLimit(
    options?.maxCorrectionPx,
  );
  const battleContext = options?.battleContext;
  const onFieldLiving = players.filter(
    (player) =>
      isOnField(player) &&
      player.isAlive &&
      !(isInSkillMotion?.(player.id) ?? false) &&
      (battleContext === undefined ||
        !isPlayerRearAssaultAccess(player, battleContext)),
  );
  const overlapIds = resolveEngagedMeleeOverlapClusterIds(onFieldLiving);
  const frontUnits = onFieldLiving.filter((player) => overlapIds.has(player.id));
  if (frontUnits.length < 2) return;

  const allContactBand = frontUnits.every(
    (player) => resolveApproachFormationRangePx(player) < RANGED_ATTACK_MIN_PX,
  );

  if (allContactBand) {
    const placements = frontUnits.map((player) => ({
      id: player.id,
      role: player.role,
      formationRow: player.formationRow,
      rangePx: resolveFormationRangePx(player),
      isAlive: true as const,
    }));
    const sorted = [...placements].sort((a, b) =>
      comparePartyFormationSlot(
        toPartyFormationUnit(a),
        toPartyFormationUnit(b),
      ),
    );
    const minGap = FRONT_ROW_SAME_RANGE_MELEE_DEPTH_PX;
    for (let i = 1; i < sorted.length; i++) {
      const rear = frontUnits.find((player) => player.id === sorted[i - 1]!.id);
      const front = frontUnits.find((player) => player.id === sorted[i]!.id);
      if (!rear || !front) continue;
      const minFrontX = rear.battleX + minGap;
      if (front.battleX < minFrontX) {
        front.battleX = applyOverlapCorrectionLimit(
          front.id,
          front.battleX,
          minFrontX,
          maxCorrectionPx,
          options?.movementBudgetOriginById,
        );
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
      player.battleX = applyOverlapCorrectionLimit(
        player.id,
        player.battleX,
        x,
        maxCorrectionPx,
        options?.movementBudgetOriginById,
      );
    }
  }
}

function resolveOverlapCorrectionLimit(maxCorrectionPx: number | undefined) {
  if (maxCorrectionPx === undefined) return Number.POSITIVE_INFINITY;
  return Math.max(0, maxCorrectionPx);
}

function applyOverlapCorrectionLimit(
  unitId: string,
  currentX: number,
  targetX: number,
  maxCorrectionPx: number,
  movementBudgetOriginById: ReadonlyMap<string, number> | undefined,
): number {
  const correctionLimit = resolveRemainingOverlapCorrectionPx(
    unitId,
    currentX,
    maxCorrectionPx,
    movementBudgetOriginById,
  );
  const delta = targetX - currentX;
  if (Math.abs(delta) <= correctionLimit) return targetX;
  return currentX + Math.sign(delta) * correctionLimit;
}

function resolveRemainingOverlapCorrectionPx(
  unitId: string,
  currentX: number,
  maxCorrectionPx: number,
  movementBudgetOriginById: ReadonlyMap<string, number> | undefined,
): number {
  const originX = movementBudgetOriginById?.get(unitId);
  if (originX === undefined) return maxCorrectionPx;
  const spentMovementPx = Math.abs(currentX - originX);
  return Math.max(0, maxCorrectionPx - spentMovementPx);
}

/** 接敵中: 敵グループを安全領域内に clamp（battleX 正本） */
export function clampEngagedEnemyGroupOnScreen(
  enemies: Array<{ id: string; battleX: number; isAlive: boolean }>,
  maxScreenX: number = COMBAT_SAFE_RIGHT,
  minScreenX: number = COMBAT_SAFE_LEFT - SPRITE_WIDTH,
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

export function computeEngagedPlayerTargets(
  players: PlayerPlacementInput[],
  frontEnemyX: number,
): Map<string, number> {
  return computePlayerPositions(players, {
    engaged: true,
    frontEnemyX,
  });
}

export { ENGAGED_VISUAL_TUNING };
