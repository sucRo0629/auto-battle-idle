import {
  approachVisualX,
  beginEngagedLayout,
  separateEngagedSprites,
  tickEngagedRearVisuals,
  type EngagedLayoutResult,
} from './battleLayout.ts';
import { ENGAGED_VISUAL_TUNING } from './battleConstants.ts';
import { resolveEnemyEngageVisualTargets } from './engageStandoff.ts';
import type { CombatantState, FormationRow, GameData } from './types.ts';
import { resolveMaxEffectiveRangePx } from './combatPosition.ts';
import { resolveEnemyBasicAttackTarget } from './resolveApproachBattleX.ts';
import { getLeadingPlayerFormationRow } from './battleLayout.ts';

export interface EngageDisplayBeginInput {
  players: CombatantState[];
  enemies: CombatantState[];
  combatCameraX: number;
  leadingRow: FormationRow | null;
  contactVisualX: number | null;
  isOnField: (unit: CombatantState) => boolean;
  layout: EngagedLayoutResult;
  gameData: GameData;
}

export interface EngageDisplayTickInput {
  players: CombatantState[];
  enemies: CombatantState[];
  combatCameraX: number;
  leadingRow: FormationRow | null;
  isOnField: (unit: CombatantState) => boolean;
  gameData: GameData;
}

/**
 * 接敵中の表示状態（screenAnchor モデル）。
 * layout 解決は begin / 構成変化時のみ。tick では anchor → visualX のみ。
 */
export class EngageDisplayState {
  private readonly rearScreenAnchors = new Map<string, number>();
  private readonly frontBattleOffsets = new Map<string, number>();
  private readonly enemyVisualTargets = new Map<string, number>();
  private readonly enemyFrozenScreenX = new Map<string, number>();
  private enemyVisualFrozen = false;
  private leadingRowSignature: string | null = null;
  private meleeEnemySignature: string | null = null;
  private readonly rangedTargetByEnemy = new Map<string, string>();

  clear(): void {
    this.rearScreenAnchors.clear();
    this.frontBattleOffsets.clear();
    this.enemyVisualTargets.clear();
    this.enemyFrozenScreenX.clear();
    this.enemyVisualFrozen = false;
    this.leadingRowSignature = null;
    this.meleeEnemySignature = null;
    this.rangedTargetByEnemy.clear();
  }

  begin(input: EngageDisplayBeginInput): {
    combatCameraX: number;
    cameraFocusLineX: number;
  } {
    const layout = beginEngagedLayout({
      allies: input.players
        .filter((p) => input.isOnField(p) && p.isAlive)
        .map((p) => ({
          id: p.id,
          formationRow: p.formationRow,
          visualX: p.visualX,
          isAlive: true as const,
        })),
      combatCameraX: input.combatCameraX,
      leadingRow: input.leadingRow,
      contactVisualX: input.contactVisualX,
    });

  // 後列 visualX は接敵開始時に書き換えない（Wave 2 接敵ジャンプ防止）。
  // screenAnchor のみ記録し、以降は camera 補正で維持する。

    this.frontBattleOffsets.clear();
    if (input.leadingRow !== null) {
      for (const player of input.players) {
        if (!player.isAlive || player.formationRow !== input.leadingRow) continue;
        this.frontBattleOffsets.set(player.id, player.visualX - player.battleX);
      }
    }

    this.rearScreenAnchors.clear();
    for (const player of input.players) {
      if (!player.isAlive || !input.isOnField(player)) continue;
      if (
        input.leadingRow !== null &&
        player.formationRow === input.leadingRow
      ) {
        continue;
      }
      this.rearScreenAnchors.set(
        player.id,
        player.visualX + input.combatCameraX,
      );
    }

    this.freezeRangedTargets(input.players, input.enemies, input.gameData);
    this.meleeEnemySignature = this.buildMeleeSignature(input.enemies, input.gameData);
    this.leadingRowSignature = this.buildLeadingRowSignature(
      input.players,
      input.leadingRow,
    );

    const enemyTargets = resolveEnemyEngageVisualTargets(
      input.layout,
      input.enemies.map((e) => ({
        id: e.id,
        isAlive: e.isAlive,
        rangePx: resolveMaxEffectiveRangePx(e, input.gameData),
      })),
      layout.combatCameraX,
    );
    this.enemyVisualTargets.clear();
    for (const [id, x] of enemyTargets) {
      this.enemyVisualTargets.set(id, x);
    }
    this.enemyVisualFrozen = false;
    this.enemyFrozenScreenX.clear();

    return {
      combatCameraX: layout.combatCameraX,
      cameraFocusLineX: layout.cameraFocusLineX,
    };
  }

  tick(input: EngageDisplayTickInput, deltaTime: number): void {
    this.syncLeadingRowOffsets(input);
    this.tickFrontRowVisuals(input, deltaTime);
    this.tickEnemyVisuals(input, deltaTime);
  }

  /** カメラ更新後に呼ぶ: 凍結済み screenAnchor を維持 */
  applyScreenFreeze(
    players: CombatantState[],
    enemies: CombatantState[],
    combatCameraX: number,
    isOnField: (unit: CombatantState) => boolean,
  ): void {
    this.maintainRearScreenFreeze(players, combatCameraX, isOnField);
    this.maintainEnemyScreenFreeze(enemies, combatCameraX);
  }

  private freezeRangedTargets(
    players: CombatantState[],
    enemies: CombatantState[],
    gameData: GameData,
  ): void {
    this.rangedTargetByEnemy.clear();
    for (const enemy of enemies) {
      if (!enemy.isAlive) continue;
      if (resolveMaxEffectiveRangePx(enemy, gameData) <= 0) continue;
      const target =
        resolveEnemyBasicAttackTarget(enemy, players, enemies, gameData) ??
        undefined;
      if (target) {
        this.rangedTargetByEnemy.set(enemy.id, target.id);
        enemy.engagedVisualTargetPlayerId = target.id;
        enemy.engagedVisualTargetAllyId = target.id;
      }
    }
  }

  private buildMeleeSignature(
    enemies: CombatantState[],
    gameData: GameData,
  ): string | null {
    const ids = enemies
      .filter(
        (e) => e.isAlive && resolveMaxEffectiveRangePx(e, gameData) <= 0,
      )
      .map((e) => e.id)
      .sort();
    return ids.length > 0 ? ids.join(',') : null;
  }

  private buildLeadingRowSignature(
    players: CombatantState[],
    leadingRow: FormationRow | null,
  ): string | null {
    if (leadingRow === null) return null;
    const ids = players
      .filter((p) => p.isAlive && p.formationRow === leadingRow)
      .map((p) => p.id)
      .sort()
      .join(',');
    return `${leadingRow}:${ids}`;
  }

  private syncLeadingRowOffsets(input: EngageDisplayTickInput): void {
    const living = input.players.filter((p) => p.isAlive);
    const leadingRow =
      input.leadingRow ?? getLeadingPlayerFormationRow(
        living.map((p) => ({
          id: p.id,
          role: p.role,
          formationRow: p.formationRow,
          rangePx: 0,
          isAlive: true,
        })),
      );
    const signature = this.buildLeadingRowSignature(living, leadingRow);
    if (signature === null || signature === this.leadingRowSignature) return;
    this.leadingRowSignature = signature;
    if (leadingRow === null) return;
    for (const player of living) {
      if (player.formationRow !== leadingRow) continue;
      if (!this.frontBattleOffsets.has(player.id)) {
        this.frontBattleOffsets.set(player.id, player.visualX - player.battleX);
      }
    }
  }

  private tickFrontRowVisuals(
    input: EngageDisplayTickInput,
    deltaTime: number,
  ): void {
    if (input.leadingRow === null) return;
    const moveStep = ENGAGED_VISUAL_TUNING.engageMoveSpeedPxPerSec * deltaTime;
    const frontUnits = input.players.filter(
      (p) =>
        input.isOnField(p) &&
        p.isAlive &&
        p.formationRow === input.leadingRow,
    );
    if (frontUnits.length === 0) return;

    for (const player of frontUnits) {
      const offset = this.frontBattleOffsets.get(player.id) ?? 0;
      const target = player.battleX + offset;
      if (target > player.visualX) {
        player.visualX = approachVisualX(player.visualX, target, moveStep);
      }
    }

    const separated = separateEngagedSprites(
      frontUnits.map((p) => ({
        id: p.id,
        visualX: p.visualX,
        isAlive: true as const,
      })),
    );
    for (const player of frontUnits) {
      const x = separated.get(player.id);
      if (x !== undefined) player.visualX = x;
    }
  }

  private tickEnemyVisuals(
    input: EngageDisplayTickInput,
    deltaTime: number,
  ): void {
    if (this.enemyVisualFrozen) return;
    const moveStep = ENGAGED_VISUAL_TUNING.engageMoveSpeedPxPerSec * deltaTime;

    let allSettled = true;
    for (const enemy of input.enemies) {
      if (!enemy.isAlive) continue;
      const target = this.enemyVisualTargets.get(enemy.id);
      if (target === undefined) continue;
      const next = approachVisualX(enemy.visualX, target, moveStep);
      enemy.visualX = next;
      if (Math.abs(next - target) > 0.5) allSettled = false;
    }

    if (allSettled) {
      this.freezeEnemyScreenPositions(input.enemies, input.combatCameraX);
      this.enemyVisualFrozen = true;
    }
  }

  private freezeEnemyScreenPositions(
    enemies: CombatantState[],
    combatCameraX: number,
  ): void {
    this.enemyFrozenScreenX.clear();
    for (const enemy of enemies) {
      if (!enemy.isAlive) continue;
      this.enemyFrozenScreenX.set(enemy.id, enemy.visualX + combatCameraX);
    }
  }

  private maintainRearScreenFreeze(
    players: CombatantState[],
    combatCameraX: number,
    isOnField: (unit: CombatantState) => boolean,
  ): void {
    if (this.rearScreenAnchors.size === 0) return;
    for (const player of players) {
      if (!isOnField(player) || !player.isAlive) continue;
      const frozenScreen = this.rearScreenAnchors.get(player.id);
      if (frozenScreen === undefined) continue;
      player.visualX = tickEngagedRearVisuals(
        player.visualX,
        frozenScreen,
        combatCameraX,
      );
    }
  }

  private maintainEnemyScreenFreeze(
    enemies: CombatantState[],
    combatCameraX: number,
  ): void {
    if (!this.enemyVisualFrozen) return;
    for (const enemy of enemies) {
      if (!enemy.isAlive) continue;
      const frozenScreen = this.enemyFrozenScreenX.get(enemy.id);
      if (frozenScreen === undefined) continue;
      enemy.visualX = frozenScreen - combatCameraX;
    }
  }

  /** 近接敵構成変化時: layout を1回だけ再適用して目標を更新 */
  recomputeEnemyTargets(
    layout: EngagedLayoutResult,
    enemies: CombatantState[],
    combatCameraX: number,
    gameData: GameData,
  ): void {
    const targets = resolveEnemyEngageVisualTargets(
      layout,
      enemies.map((e) => ({
        id: e.id,
        isAlive: e.isAlive,
        rangePx: resolveMaxEffectiveRangePx(e, gameData),
      })),
      combatCameraX,
    );
    this.enemyVisualTargets.clear();
    for (const [id, x] of targets) {
      this.enemyVisualTargets.set(id, x);
    }
    this.enemyVisualFrozen = false;
    this.enemyFrozenScreenX.clear();
  }
}
