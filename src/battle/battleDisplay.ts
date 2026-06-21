import { isMeleeUnit } from './combatPosition.ts';
import {
  resolveEnemyAttackTargetPlayer,
  resolveEnemyChaseTargetPlayer,
} from './resolveApproachBattleX.ts';
import type { CombatantState, FormationRow, GameData } from './types.ts';

/** DisplayAnchor 読取（優先: engagedDisplayAnchorPlayerId → engagedVisualTargetPlayerId → engagedVisualTargetAllyId） */
export function getEngagedDisplayAnchorPlayerId(
  enemy: CombatantState,
): string | undefined {
  return (
    enemy.engagedDisplayAnchorPlayerId ??
    enemy.engagedVisualTargetPlayerId ??
    enemy.engagedVisualTargetAllyId
  );
}

/** DisplayAnchor 書込（移行中互換: 新旧 alias すべてに代入） */
export function setEngagedDisplayAnchorPlayerId(
  enemy: CombatantState,
  playerId: string,
): void {
  enemy.engagedDisplayAnchorPlayerId = playerId;
  enemy.engagedVisualTargetPlayerId = playerId;
  enemy.engagedVisualTargetAllyId = playerId;
}

/** DisplayAnchor クリア（新旧 alias すべてを undefined に） */
export function clearEngagedDisplayAnchor(enemy: CombatantState): void {
  enemy.engagedDisplayAnchorPlayerId = undefined;
  enemy.engagedVisualTargetPlayerId = undefined;
  enemy.engagedVisualTargetAllyId = undefined;
}

/**
 * 接敵中の構成変化検知（R1-fix: visual 補間は廃止）。
 * Engaged 中は layout bake せず、署名更新・凍結・表示 target 再評価のみ。
 * layout bake は非接敵配置確定（訓練等）で BattleEngine + applyEngagedFormationToBattleX が担当。
 */
export class EngagedCompositionTracker {
  private meleeEnemySignature: string | null = null;
  private leadingRowSignature: string | null = null;

  clear(): void {
    this.meleeEnemySignature = null;
    this.leadingRowSignature = null;
  }

  initSignatures(
    players: CombatantState[],
    enemies: CombatantState[],
    leadingRow: FormationRow | null,
    gameData: GameData,
  ): void {
    this.meleeEnemySignature = this.buildMeleeSignature(enemies, gameData);
    this.leadingRowSignature = this.buildLeadingRowSignature(
      players,
      leadingRow,
    );
  }

  freezeRangedTargets(
    players: CombatantState[],
    enemies: CombatantState[],
    gameData: GameData,
  ): void {
    for (const enemy of enemies) {
      if (!enemy.isAlive) continue;
      if (isMeleeUnit(enemy, gameData)) continue;
      const target =
        resolveEnemyAttackTargetPlayer(enemy, players, enemies, gameData) ??
        resolveEnemyChaseTargetPlayer(enemy, players, enemies, gameData) ??
        undefined;
      if (target) {
        setEngagedDisplayAnchorPlayerId(enemy, target.id);
      }
    }
  }

  private buildMeleeSignature(
    enemies: CombatantState[],
    gameData: GameData,
  ): string | null {
    const ids = enemies
      .filter(
        (e) => e.isAlive && isMeleeUnit(e, gameData),
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

  /** 生存近接敵の構成が変わったら true */
  consumeMeleeCompositionChange(
    enemies: CombatantState[],
    gameData: GameData,
  ): boolean {
    const next = this.buildMeleeSignature(enemies, gameData);
    if (next === this.meleeEnemySignature) return false;
    this.meleeEnemySignature = next;
    return true;
  }

  /** 前列構成が変わったら true */
  consumeLeadingRowCompositionChange(
    players: CombatantState[],
    leadingRow: FormationRow | null,
  ): boolean {
    const next = this.buildLeadingRowSignature(players, leadingRow);
    if (next === null || next === this.leadingRowSignature) return false;
    this.leadingRowSignature = next;
    return true;
  }
}

/** @deprecated EngagedCompositionTracker */
export class EngageDisplayState extends EngagedCompositionTracker {}
