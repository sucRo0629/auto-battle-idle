import { getBattleX } from './combatPosition.ts';
import type { CombatantState, GameData } from './types.ts';

const SPRITE_WIDTH = 64;

/** 敵 battleX を使用者の traits.rangePx 射程内へ引き寄せる（進軍下限を尊重） */
export function resolveEnemyReelInBattleX(
  duelist: CombatantState,
  enemy: CombatantState,
  _gameData: GameData,
): number {
  const targetX = getBattleX(duelist) + duelist.traits.rangePx;
  const minX = -SPRITE_WIDTH + 0.01;
  return Math.max(minX, Math.min(enemy.battleX, targetX));
}

export function applyEnemyReelIn(
  duelist: CombatantState,
  enemy: CombatantState,
  gameData: GameData,
): number {
  const fromX = enemy.battleX;
  const toX = resolveEnemyReelInBattleX(duelist, enemy, gameData);
  enemy.battleX = toX;
  return toX - fromX;
}
