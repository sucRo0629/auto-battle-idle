import { isMeleeUnit } from './combatPosition.ts';
import { resolveFrontlinePeerPlayerIds } from './combatPosition.ts';
import {
  resolveEnemyAttackTargetPlayer,
  resolveEnemyChaseTargetPlayer,
} from './resolveApproachBattleX.ts';
import type { CombatantState, GameData } from './types.ts';

/** DisplayAnchor 読取 */
export function getEngagedDisplayAnchorPlayerId(
  enemy: CombatantState,
): string | undefined {
  return enemy.engagedDisplayAnchorPlayerId;
}

/** DisplayAnchor 書込 */
export function setEngagedDisplayAnchorPlayerId(
  enemy: CombatantState,
  playerId: string,
): void {
  enemy.engagedDisplayAnchorPlayerId = playerId;
}

/** DisplayAnchor クリア */
export function clearEngagedDisplayAnchor(enemy: CombatantState): void {
  enemy.engagedDisplayAnchorPlayerId = undefined;
}

/**
 * 接敵中の構成変化検知（R1-fix: visual 補間は廃止）。
 * Engaged 中は layout bake せず、署名更新・凍結・表示 target 再評価のみ。
 * layout bake は非接敵配置確定（訓練等）で BattleEngine + applyEngagedFormationToBattleX が担当。
 */
export class EngagedCompositionTracker {
  private meleeEnemySignature: string | null = null;
  private frontlineSignature: string | null = null;

  clear(): void {
    this.meleeEnemySignature = null;
    this.frontlineSignature = null;
  }

  initSignatures(
    players: CombatantState[],
    enemies: CombatantState[],
    _gameData: GameData,
  ): void {
    this.meleeEnemySignature = this.buildMeleeSignature(enemies, _gameData);
    this.frontlineSignature = this.buildFrontlineSignature(players);
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

  private buildFrontlineSignature(players: CombatantState[]): string | null {
    const ids = [...resolveFrontlinePeerPlayerIds(players)]
      .filter((id) => players.some((player) => player.id === id && player.isAlive))
      .sort()
      .join(',');
    return ids.length > 0 ? ids : null;
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

  /** frontline peer 構成が変わったら true */
  consumeFrontlineCompositionChange(players: CombatantState[]): boolean {
    const next = this.buildFrontlineSignature(players);
    if (next === null || next === this.frontlineSignature) return false;
    this.frontlineSignature = next;
    return true;
  }

  /** @deprecated consumeFrontlineCompositionChange を使用 */
  consumeLeadingRowCompositionChange(
    players: CombatantState[],
    _leadingRow?: unknown,
  ): boolean {
    return this.consumeFrontlineCompositionChange(players);
  }
}

/** @deprecated EngagedCompositionTracker */
export class EngageDisplayState extends EngagedCompositionTracker {}
