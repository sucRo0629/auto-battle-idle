import { resolveApproachRangePx } from '../combatPosition.ts';
import { getPassiveDefs } from '../combatMath.ts';
import { isUnitStunned } from '../ccEffects.ts';
import {
  resolveAllPlayerApproachBattleX,
  resolvePlayerAttackTargetEnemy,
  resolvePlayerChaseTargetEnemy,
  shouldSkipEngagedAutoApproach,
} from '../resolveApproachBattleX.ts';
import { battleDistance, isWithinSkillRange } from '../skills/rangeUtils.ts';
import type { SkillSequenceRunner } from '../skills/skillSequence.ts';
import { findReadyCountTriggerCooldowns } from '../skillTrigger.ts';
import { hasAvailableActiveCharge } from '../skills/chargeBank.ts';
import { isCountTriggerSkill } from '../skillTrigger.ts';
import type {
  CombatantState,
  GameData,
  SkillCooldown,
} from '../types.ts';
import type { BattleEngineInternals } from './battleFieldSpec.harness.ts';

const RANGER_A2_SKILL_ID = 'at_ranger_active_2';
const APPROACH_SETTLE_EPSILON_PX = 2;

export type BasicAttackSkipReason =
  | 'ready'
  | 'not_engaged'
  | 'dead'
  | 'stunned'
  | 'cooldown'
  | 'no_target'
  | 'out_of_range'
  | 'target_dead'
  | 'using_skill'
  | 'moving'
  | 'basic_blocked'
  | 'actor_busy'
  | 'active_priority'
  | 'other';

export interface RangerTargetAcquisitionRecord {
  battleSec: number;
  targetId: string | null;
  targetClassId: string | null;
  targetAlive: boolean;
  targetBattleX: number | null;
  rangerBattleX: number;
  distancePx: number | null;
  rangePx: number;
  inRange: boolean;
}

export interface RangerBasicAttackSkipRecord {
  battleSec: number;
  canBasicAttack: boolean;
  skipReason: BasicAttackSkipReason;
  basicCooldownRemaining: number;
  currentAction: string;
  currentSkillId: string | null;
  isUsingSkill: boolean;
  movementState: string;
}

export interface RangerActive2UseRecord {
  battleSec: number;
  targetId: string | null;
  targetClassId: string | null;
  rangerBattleX: number;
  targetDistancePx: number | null;
  basicCooldownRemaining: number;
  basicWithin5Sec: boolean;
}

export interface RangerPreFirstBasicChangeSummary {
  firstBasicSec: number;
  windowStartSec: number;
  targetChanged: boolean;
  targetChangeDetails: string;
  enemyFrontlineDied: boolean;
  enemyDeathDetails: string;
  enteredRange: boolean;
  rangeChangeDetails: string;
  movementCompleted: boolean;
  movementChangeDetails: string;
  skillUseStopped: boolean;
  skillUseChangeDetails: string;
  dominantSkipReasonBefore: BasicAttackSkipReason | null;
  skipReasonAtFirstBasic: BasicAttackSkipReason;
}

export interface RangerBasicAttackDiagnostics {
  targetAcquisition: RangerTargetAcquisitionRecord[];
  basicAttackSkips: RangerBasicAttackSkipRecord[];
  active2Uses: RangerActive2UseRecord[];
  preFirstBasicChanges: RangerPreFirstBasicChangeSummary | null;
  firstBasicActionSec: number | null;
  skipReasonHistogram: Partial<Record<BasicAttackSkipReason, number>>;
}

function findAllyRanger(players: CombatantState[]): CombatantState | undefined {
  return players.find((p) => !p.isEnemy && p.classId === 'at_ranger' && p.isAlive);
}

function getBasicCooldown(ranger: CombatantState): SkillCooldown | undefined {
  return ranger.cooldowns.find((cd) => cd.slotKind === 'basic');
}

function livingAllyCount(players: CombatantState[]): number {
  return players.filter((p) => p.isAlive).length;
}

function resolveCurrentSkillAction(
  rangerId: string,
  runner: SkillSequenceRunner,
): { currentAction: string; currentSkillId: string | null; isUsingSkill: boolean } {
  if (runner.isActorInSkillMotion(rangerId)) {
    return {
      currentAction: 'skill_motion',
      currentSkillId: null,
      isUsingSkill: true,
    };
  }
  if (runner.isActorUseLocked(rangerId)) {
    return {
      currentAction: 'use_lock',
      currentSkillId: null,
      isUsingSkill: true,
    };
  }
  if (runner.isActorAnimLocked(rangerId)) {
    return {
      currentAction: 'anim_lock',
      currentSkillId: null,
      isUsingSkill: true,
    };
  }
  return {
    currentAction: 'idle',
    currentSkillId: null,
    isUsingSkill: false,
  };
}

function resolveMovementState(
  ranger: CombatantState,
  players: CombatantState[],
  enemies: CombatantState[],
  gameData: GameData,
  runner: SkillSequenceRunner,
  engaged: boolean,
): string {
  if (!engaged) return 'not_engaged';
  if (runner.isActorInSkillMotion(ranger.id)) return 'skill_motion';
  if (runner.isActorUseLockPauseApproach(ranger.id)) return 'approach_paused_by_skill';
  const approachTargets = resolveAllPlayerApproachBattleX(players, enemies, gameData);
  const targetX = approachTargets.get(ranger.id);
  const skipApproach = shouldSkipEngagedAutoApproach(
    ranger,
    players,
    enemies,
    gameData,
    { approachTargetX: targetX },
  );
  if (skipApproach) return 'approach_stopped';
  if (targetX === undefined) return 'no_approach_target';
  if (Math.abs(ranger.battleX - targetX) <= APPROACH_SETTLE_EPSILON_PX) {
    return 'at_approach_target';
  }
  return ranger.battleX < targetX ? 'moving_forward' : 'moving_backward';
}

export function resolveRangerBasicAttackSkipReason(
  ranger: CombatantState,
  players: CombatantState[],
  enemies: CombatantState[],
  gameData: GameData,
  runner: SkillSequenceRunner,
  engaged: boolean,
): {
  canBasicAttack: boolean;
  skipReason: BasicAttackSkipReason;
  basicCooldownRemaining: number;
  attackTarget: CombatantState | null;
  chaseTarget: CombatantState | null;
  rangePx: number;
} {
  const basicCd = getBasicCooldown(ranger);
  const basicCooldownRemaining = basicCd?.remaining ?? 0;
  const allyCount = livingAllyCount(players);
  const rangePx = resolveApproachRangePx(ranger, gameData, allyCount);
  const attackTarget = resolvePlayerAttackTargetEnemy(
    ranger,
    players,
    enemies,
    gameData,
  );
  const chaseTarget = resolvePlayerChaseTargetEnemy(
    ranger,
    players,
    enemies,
    gameData,
  );

  if (!engaged) {
    return {
      canBasicAttack: false,
      skipReason: 'not_engaged',
      basicCooldownRemaining,
      attackTarget,
      chaseTarget,
      rangePx,
    };
  }
  if (!ranger.isAlive) {
    return {
      canBasicAttack: false,
      skipReason: 'dead',
      basicCooldownRemaining,
      attackTarget,
      chaseTarget,
      rangePx,
    };
  }
  if (isUnitStunned(ranger)) {
    return {
      canBasicAttack: false,
      skipReason: 'stunned',
      basicCooldownRemaining,
      attackTarget,
      chaseTarget,
      rangePx,
    };
  }
  if (basicCooldownRemaining > 0) {
    return {
      canBasicAttack: false,
      skipReason: 'cooldown',
      basicCooldownRemaining,
      attackTarget,
      chaseTarget,
      rangePx,
    };
  }

  const actives = gameData.skillRegistry.actives;
  const passives = getPassiveDefs(ranger, gameData.skillRegistry.passives);
  const readyBasicCountActive = findReadyCountTriggerCooldowns(
    ranger,
    'basicAttackCount',
    actives,
  )[0];
  if (readyBasicCountActive) {
    return {
      canBasicAttack: false,
      skipReason: 'active_priority',
      basicCooldownRemaining,
      attackTarget,
      chaseTarget,
      rangePx,
    };
  }

  const readyTimeActive = ranger.cooldowns.find((cd) => {
    if (cd.slotKind !== 'active' || cd.remaining > 0) return false;
    const skill = actives[cd.skillId];
    if (!skill || isCountTriggerSkill(skill)) return false;
    return hasAvailableActiveCharge(
      cd,
      skill,
      passives,
      ranger.build.learnedActiveIds,
    );
  });
  if (readyTimeActive && !runner.isActorBusy(ranger.id)) {
    return {
      canBasicAttack: false,
      skipReason: 'active_priority',
      basicCooldownRemaining,
      attackTarget,
      chaseTarget,
      rangePx,
    };
  }

  if (runner.isBasicAttackBlocked(ranger.id)) {
    return {
      canBasicAttack: false,
      skipReason: 'using_skill',
      basicCooldownRemaining,
      attackTarget,
      chaseTarget,
      rangePx,
    };
  }
  if (runner.isActorBusy(ranger.id)) {
    return {
      canBasicAttack: false,
      skipReason: 'actor_busy',
      basicCooldownRemaining,
      attackTarget,
      chaseTarget,
      rangePx,
    };
  }

  const movement = resolveMovementState(
    ranger,
    players,
    enemies,
    gameData,
    runner,
    engaged,
  );
  if (
    movement === 'moving_forward' ||
    movement === 'moving_backward' ||
    movement === 'skill_motion'
  ) {
    return {
      canBasicAttack: false,
      skipReason: 'moving',
      basicCooldownRemaining,
      attackTarget,
      chaseTarget,
      rangePx,
    };
  }

  if (!chaseTarget) {
    return {
      canBasicAttack: false,
      skipReason: 'no_target',
      basicCooldownRemaining,
      attackTarget,
      chaseTarget,
      rangePx,
    };
  }
  if (!chaseTarget.isAlive) {
    return {
      canBasicAttack: false,
      skipReason: 'target_dead',
      basicCooldownRemaining,
      attackTarget,
      chaseTarget,
      rangePx,
    };
  }
  if (!attackTarget) {
    return {
      canBasicAttack: false,
      skipReason: 'out_of_range',
      basicCooldownRemaining,
      attackTarget,
      chaseTarget,
      rangePx,
    };
  }

  return {
    canBasicAttack: true,
    skipReason: 'ready',
    basicCooldownRemaining,
    attackTarget,
    chaseTarget,
    rangePx,
  };
}

export class RangerBasicAttackDiagnosticTracker {
  readonly targetAcquisition: RangerTargetAcquisitionRecord[] = [];
  readonly basicAttackSkips: RangerBasicAttackSkipRecord[] = [];
  readonly active2Uses: RangerActive2UseRecord[] = [];
  readonly skipReasonHistogram: Partial<Record<BasicAttackSkipReason, number>> =
    {};

  private firstBasicActionSec: number | null = null;
  private readonly basicActionTimes: number[] = [];
  private lastTargetKey = '';
  private lastSkipReason: BasicAttackSkipReason | null = null;
  private lastPeriodicLogSec = -Infinity;
  private tickSamples: Array<{
    battleSec: number;
    targetId: string | null;
    inRange: boolean;
    skipReason: BasicAttackSkipReason;
    movementState: string;
    isUsingSkill: boolean;
    enemyFrontAlive: number;
  }> = [];

  recordTick(
    internals: BattleEngineInternals,
    battleSec: number,
    engaged: boolean,
  ): void {
    const ranger = findAllyRanger(internals.players);
    if (!ranger) return;

    const { players, enemies, gameData, skillSequenceRunner: runner } =
      internals;
    const skip = resolveRangerBasicAttackSkipReason(
      ranger,
      players,
      enemies.filter((e) => e.isAlive),
      gameData,
      runner,
      engaged,
    );
    const target = skip.attackTarget ?? skip.chaseTarget;
    const distancePx =
      target !== null ? Math.abs(battleDistance(ranger, target)) : null;
    const inRange =
      target !== null &&
      isWithinSkillRange(ranger, target, skip.rangePx);
    const targetKey = target?.id ?? 'none';
    const { currentAction, currentSkillId, isUsingSkill } =
      resolveCurrentSkillAction(ranger.id, runner);
    const movementState = resolveMovementState(
      ranger,
      players,
      enemies,
      gameData,
      runner,
      engaged,
    );

    this.skipReasonHistogram[skip.skipReason] =
      (this.skipReasonHistogram[skip.skipReason] ?? 0) + 1;

    const shouldLogTarget =
      targetKey !== this.lastTargetKey ||
      (this.firstBasicActionSec === null &&
        battleSec - this.lastPeriodicLogSec >= 5);

    if (shouldLogTarget && engaged) {
      this.targetAcquisition.push({
        battleSec,
        targetId: target?.id ?? null,
        targetClassId: target?.classId ?? null,
        targetAlive: target?.isAlive ?? false,
        targetBattleX: target?.battleX ?? null,
        rangerBattleX: ranger.battleX,
        distancePx,
        rangePx: skip.rangePx,
        inRange,
      });
      this.lastTargetKey = targetKey;
      if (this.firstBasicActionSec === null) {
        this.lastPeriodicLogSec = battleSec;
      }
    }

    const shouldLogSkip =
      skip.skipReason !== this.lastSkipReason &&
      (this.firstBasicActionSec === null || skip.skipReason === 'ready');

    if (shouldLogSkip && engaged) {
      this.basicAttackSkips.push({
        battleSec,
        canBasicAttack: skip.canBasicAttack,
        skipReason: skip.skipReason,
        basicCooldownRemaining: skip.basicCooldownRemaining,
        currentAction,
        currentSkillId,
        isUsingSkill,
        movementState,
      });
      this.lastSkipReason = skip.skipReason;
    }

    if (this.firstBasicActionSec === null && engaged) {
      const frontEnemiesAlive = enemies.filter(
        (e) => e.isAlive && e.formationRow === 'front',
      ).length;
      this.tickSamples.push({
        battleSec,
        targetId: target?.id ?? null,
        inRange,
        skipReason: skip.skipReason,
        movementState,
        isUsingSkill,
        enemyFrontAlive: frontEnemiesAlive,
      });
      if (this.tickSamples.length > 5000) {
        this.tickSamples.shift();
      }
    }
  }

  recordBasicAction(battleSec: number): void {
    this.basicActionTimes.push(battleSec);
    if (this.firstBasicActionSec === null) {
      this.firstBasicActionSec = battleSec;
    }
  }

  recordActive2Use(
    ranger: CombatantState,
    players: CombatantState[],
    enemies: CombatantState[],
    gameData: GameData,
    battleSec: number,
  ): void {
    const target = resolvePlayerAttackTargetEnemy(
      ranger,
      players,
      enemies,
      gameData,
    ) ?? resolvePlayerChaseTargetEnemy(ranger, players, enemies, gameData);
    const basicCd = getBasicCooldown(ranger);
    const basicWithin5Sec = this.basicActionTimes.some(
      (sec) => sec >= battleSec && sec <= battleSec + 5,
    );
    this.active2Uses.push({
      battleSec,
      targetId: target?.id ?? null,
      targetClassId: target?.classId ?? null,
      rangerBattleX: ranger.battleX,
      targetDistancePx: target ? Math.abs(battleDistance(ranger, target)) : null,
      basicCooldownRemaining: basicCd?.remaining ?? 0,
      basicWithin5Sec,
    });
  }

  snapshot(): RangerBasicAttackDiagnostics {
    return {
      targetAcquisition: [...this.targetAcquisition],
      basicAttackSkips: [...this.basicAttackSkips],
      active2Uses: [...this.active2Uses],
      preFirstBasicChanges: this.buildPreFirstBasicSummary(),
      firstBasicActionSec: this.firstBasicActionSec,
      skipReasonHistogram: { ...this.skipReasonHistogram },
    };
  }

  private buildPreFirstBasicSummary(): RangerPreFirstBasicChangeSummary | null {
    if (this.firstBasicActionSec === null || this.tickSamples.length === 0) {
      return null;
    }
    const windowStartSec = Math.max(0, this.firstBasicActionSec - 5);
    const window = this.tickSamples.filter(
      (s) =>
        s.battleSec >= windowStartSec &&
        s.battleSec <= this.firstBasicActionSec!,
    );
    if (window.length === 0) return null;

    const first = window[0]!;
    const last = window[window.length - 1]!;

    const targetChanged = first.targetId !== last.targetId;
    const enteredRange = !first.inRange && last.inRange;
    const movementCompleted =
      (first.movementState === 'moving_forward' ||
        first.movementState === 'moving_backward') &&
      last.movementState === 'approach_stopped';
    const skillUseStopped = first.isUsingSkill && !last.isUsingSkill;
    const enemyFrontlineDied = first.enemyFrontAlive > last.enemyFrontAlive;

    const beforeWindow = this.tickSamples.filter(
      (s) => s.battleSec < windowStartSec,
    );
    const dominantBefore = this.dominantSkipReason(
      beforeWindow.map((s) => s.skipReason),
    );

    return {
      firstBasicSec: this.firstBasicActionSec,
      windowStartSec,
      targetChanged,
      targetChangeDetails: `${first.targetId ?? 'none'} → ${last.targetId ?? 'none'}`,
      enemyFrontlineDied,
      enemyDeathDetails: `frontAlive ${first.enemyFrontAlive} → ${last.enemyFrontAlive}`,
      enteredRange,
      rangeChangeDetails: `inRange ${first.inRange} → ${last.inRange}`,
      movementCompleted,
      movementChangeDetails: `${first.movementState} → ${last.movementState}`,
      skillUseStopped,
      skillUseChangeDetails: `isUsingSkill ${first.isUsingSkill} → ${last.isUsingSkill}`,
      dominantSkipReasonBefore: dominantBefore,
      skipReasonAtFirstBasic: last.skipReason,
    };
  }

  private dominantSkipReason(
    reasons: BasicAttackSkipReason[],
  ): BasicAttackSkipReason | null {
    if (reasons.length === 0) return null;
    const counts = new Map<BasicAttackSkipReason, number>();
    for (const reason of reasons) {
      counts.set(reason, (counts.get(reason) ?? 0) + 1);
    }
    let best: BasicAttackSkipReason | null = null;
    let bestCount = 0;
    for (const [reason, count] of counts) {
      if (count > bestCount) {
        best = reason;
        bestCount = count;
      }
    }
    return best;
  }
}

export function logRangerBasicAttackDiagnostics(
  stageId: string,
  label: string,
  diagnostics: RangerBasicAttackDiagnostics | undefined,
): void {
  if (!diagnostics) {
    console.info(
      `[ranger-basic-diag] ${stageId}/${label}: diagnostics unavailable`,
    );
    return;
  }

  console.info(
    `[ranger-basic-diag] ${stageId}/${label} firstBasicActionSec=${diagnostics.firstBasicActionSec?.toFixed(1) ?? 'none'}`,
  );
  console.info(
    `[ranger-basic-diag] ${stageId}/${label} skipReasonHistogram=${JSON.stringify(diagnostics.skipReasonHistogram)}`,
  );

  console.info(
    `[ranger-basic-diag] ${stageId}/${label} target acquisition (${diagnostics.targetAcquisition.length} events):`,
  );
  for (const row of diagnostics.targetAcquisition) {
    console.info(
      `[ranger-basic-diag]   @${row.battleSec.toFixed(1)} ` +
        `target=${row.targetId ?? 'none'}/${row.targetClassId ?? 'none'} ` +
        `alive=${row.targetAlive} ` +
        `targetX=${row.targetBattleX?.toFixed(0) ?? 'n/a'} rangerX=${row.rangerBattleX.toFixed(0)} ` +
        `dist=${row.distancePx?.toFixed(0) ?? 'n/a'} rangePx=${row.rangePx} inRange=${row.inRange}`,
    );
  }

  console.info(
    `[ranger-basic-diag] ${stageId}/${label} basic skip reasons (${diagnostics.basicAttackSkips.length} changes):`,
  );
  for (const row of diagnostics.basicAttackSkips) {
    console.info(
      `[ranger-basic-diag]   @${row.battleSec.toFixed(1)} ` +
        `canBasic=${row.canBasicAttack} reason=${row.skipReason} ` +
        `basicCd=${row.basicCooldownRemaining.toFixed(2)} ` +
        `action=${row.currentAction} skill=${row.currentSkillId ?? 'none'} ` +
        `isUsingSkill=${row.isUsingSkill} movement=${row.movementState}`,
    );
  }

  console.info(
    `[ranger-basic-diag] ${stageId}/${label} active_2 uses (${diagnostics.active2Uses.length}):`,
  );
  for (const row of diagnostics.active2Uses) {
    console.info(
      `[ranger-basic-diag]   @${row.battleSec.toFixed(1)} ` +
        `target=${row.targetId ?? 'none'}/${row.targetClassId ?? 'none'} ` +
        `rangerX=${row.rangerBattleX.toFixed(0)} dist=${row.targetDistancePx?.toFixed(0) ?? 'n/a'} ` +
        `basicCd=${row.basicCooldownRemaining.toFixed(2)} basicWithin5Sec=${row.basicWithin5Sec}`,
    );
  }

  const pre = diagnostics.preFirstBasicChanges;
  if (pre) {
    console.info(
      `[ranger-basic-diag] ${stageId}/${label} pre-first-basic window ` +
        `[${pre.windowStartSec.toFixed(1)}–${pre.firstBasicSec.toFixed(1)}s]:`,
    );
    console.info(
      `[ranger-basic-diag]   targetChanged=${pre.targetChanged} (${pre.targetChangeDetails})`,
    );
    console.info(
      `[ranger-basic-diag]   enemyFrontlineDied=${pre.enemyFrontlineDied} (${pre.enemyDeathDetails})`,
    );
    console.info(
      `[ranger-basic-diag]   enteredRange=${pre.enteredRange} (${pre.rangeChangeDetails})`,
    );
    console.info(
      `[ranger-basic-diag]   movementCompleted=${pre.movementCompleted} (${pre.movementChangeDetails})`,
    );
    console.info(
      `[ranger-basic-diag]   skillUseStopped=${pre.skillUseStopped} (${pre.skillUseChangeDetails})`,
    );
    console.info(
      `[ranger-basic-diag]   dominantSkipBeforeWindow=${pre.dominantSkipReasonBefore ?? 'none'} ` +
        `skipAtFirstBasic=${pre.skipReasonAtFirstBasic}`,
    );
  }
}

export { RANGER_A2_SKILL_ID };
