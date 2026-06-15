import { isUnitStunned } from './ccEffects.ts';
import {
  capEngagedEnemyApproachBattleX,
} from './combatPosition.ts';
import {
  resolveAllPlayerApproachBattleX,
  resolveEnemyApproachBattleX,
  shouldSkipEngagedAutoApproach,
} from './resolveApproachBattleX.ts';
import type {
  BattlePhase,
  CombatantState,
  GameData,
} from './types.ts';

/** 接近完了判定（battleX と目標の差）。PartyDeploy / 接敵接近と共通 */
export const BODY_ANIM_APPROACH_SETTLED_PX = 0.5;

export interface BodyAnimMarchingContext {
  phase: BattlePhase;
  engaged: boolean;
  partyDeployActive: boolean;
  partyDeploySettled: boolean;
  waveExitMarchActive: boolean;
  /** 全員生存 Victory の右退場 march */
  victoryExitMarchActive: boolean;
  partyDeployTargets: ReadonlyMap<string, number>;
  enemyDeployTargets: ReadonlyMap<string, number>;
  players: CombatantState[];
  enemies: CombatantState[];
  gameData: GameData;
  isActorInSkillMotion: (actorId: string) => boolean;
}

function isApproachingTarget(
  battleX: number,
  target: number,
  settledPx: number = BODY_ANIM_APPROACH_SETTLED_PX,
): boolean {
  return Math.abs(battleX - target) > settledPx;
}

function resolveDeployMarching(
  unit: CombatantState,
  targets: ReadonlyMap<string, number>,
): boolean {
  if (!unit.isAlive) return false;
  const target = targets.get(unit.id);
  if (target === undefined) return false;
  return isApproachingTarget(unit.battleX, target);
}

function resolveEngagedMarching(
  unit: CombatantState,
  ctx: BodyAnimMarchingContext,
): boolean {
  if (!unit.isAlive) return false;
  if (isUnitStunned(unit)) return false;
  if (ctx.isActorInSkillMotion(unit.id)) return true;
  if (
    shouldSkipEngagedAutoApproach(
      unit,
      ctx.players,
      ctx.enemies,
      ctx.gameData,
    )
  ) {
    return false;
  }

  if (unit.isEnemy) {
    const target = capEngagedEnemyApproachBattleX(
      unit,
      resolveEnemyApproachBattleX(
        unit,
        ctx.players,
        ctx.enemies,
        ctx.gameData,
      ),
    );
    return isApproachingTarget(unit.battleX, target);
  }

  const target = resolveAllPlayerApproachBattleX(
    ctx.players,
    ctx.enemies,
    ctx.gameData,
  ).get(unit.id);
  if (target === undefined) return false;
  return isApproachingTarget(unit.battleX, target);
}

/** entity body の move / idle 切替用。overlap 等の座標微調整は含めない */
export function resolveCombatantBodyAnimMarching(
  unit: CombatantState,
  ctx: BodyAnimMarchingContext,
): boolean {
  if (!unit.isAlive) return false;
  if (ctx.phase !== 'running' && ctx.phase !== 'victory') return false;

  if (ctx.victoryExitMarchActive && !unit.isEnemy) {
    return true;
  }
  if (ctx.phase !== 'running') return false;

  if (ctx.waveExitMarchActive && !unit.isEnemy) {
    return true;
  }
  if (ctx.partyDeploySettled && !ctx.engaged) {
    return false;
  }
  if (ctx.partyDeployActive) {
    const targets = unit.isEnemy
      ? ctx.enemyDeployTargets
      : ctx.partyDeployTargets;
    return resolveDeployMarching(unit, targets);
  }
  if (ctx.engaged) {
    return resolveEngagedMarching(unit, ctx);
  }

  return false;
}
