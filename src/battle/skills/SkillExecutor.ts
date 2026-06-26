import type { BattleEventListener } from '../events.ts';
import { applyIncomingDamage } from '../damageDelay.ts';
import { shouldTriggerBonusBasicAttackOnHit } from '../bonusBasicAttackOnHit.ts';
import {
  ALLY_ATTACK_FOLLOW_UP_OVERLAY,
  applyFollowUpDefDebuffOnHit,
  buildAllyAttackFollowUpPendingHit,
  findFollowUpLancersForAllyBasic,
  getAllyAttackFollowUpConfig,
} from '../allyAttackFollowUp.ts';
import {
  applyBarrierToTarget,
  applyHealToTarget,
  clampHpToEffectiveMax,
  currentHpRatio,
  getPassiveDefs,
  resolveDamage,
  resolveHealAmount,
  resolveResourceAmount,
  applyConfirmedHpDamage,
} from '../combatMath.ts';
import {
  applyKnockbackToTarget,
  applyStunToTarget,
  isUnitStunned,
} from '../ccEffects.ts';
import {
  applyDirectHealWithExcess,
  sameSideAlliesFrom,
} from '../instantHealExcess.ts';
import { grantHealReservationStacks } from '../healReservation.ts';
import {
  rollsEvasion,
  getPassiveSpecialEffectMultiplier,
  stripPassivesAurasFromSource,
  type PassiveDamageContext,
} from '../passiveEffects.ts';
import { dispelDebuffsOnTarget } from '../debuffDispel.ts';
import { applyBlockToPhysicalDamage, applyBlockToMagicDamage } from '../blockMitigation.ts';
import { grantCounterStatus } from '../counterEffects.ts';
import {
  applyWardBarrierToTarget,
  applyWardBarrierToIncomingDamage,
} from '../wardBarrier.ts';
import {
  addHerbalPotencyStacks,
  consumeAllAllyHerbalPotencyStacks,
  resolvePartyHerbalPotencyConfig,
} from '../herbalPotency.ts';
import {
  addBlockResonanceStacksOnBlock,
  applyBlockResonanceStance,
  applyBlockResonanceStanceOnBlock,
  consumeBlockResonanceStacks,
  hasBlockResonanceStance,
  resolveBlockResonanceConfigForUnit,
  resolveEffectiveUseDurationSec,
} from '../blockResonance.ts';
import { mitigateIncomingDamage } from '../incomingDamageMitigation.ts';
import { resolveLowHpCoverTarget } from '../lowHpCover.ts';
import {
  applyArenaDominanceDamageMitigation,
  applyArenaMarkDamageMitigation,
  grantArenaDominance,
  grantArenaMark,
  isAllySupportBlockedDuringArenaDominance,
  pickHighestAtkEnemy,
  resolveArenaDominanceDurationSec,
  resolveArenaDominanceNonMarkMultiplier,
  consumeActiveStageTrigger,
} from '../arenaDominance.ts';
import {
  findBallistaMarkSplashTargets,
  isBallistaMarked,
  mergeBallistaMarkPassive,
  resolveBallistaMarkSourceId,
  resolveBallistaMarkSplashDamage,
} from '../ballistaMark.ts';
import { resetIdleAtkRampOnAttack } from '../idleAtkRamp.ts';
import {
  scheduleNextOutgoingDamageCharge,
} from '../nextOutgoingDamage.ts';
import { applyEnemyReelIn } from '../enemyReelIn.ts';
import { resolveEffectiveAmountSpecForActiveEffect } from '../skillAmountOverride.ts';
import { resolveEffectiveBasicAttackSkill } from '../resolveEffectiveBasicAttack.ts';
import { basicAttackTransformSpecFromEffect } from '../resolveEffectiveBasicAttack.ts';
import {
  resolveAttackBattleX,
  resolveMoveBattleX,
  isHostileRearAssaultMove,
  setPlayerRearAssaultAccess,
  clearPlayerRearAssaultAccess,
} from '../combatPosition.ts';
import {
  battleDistance,
  isWithinSkillRange,
  resolveSkillRangePx,
} from './rangeUtils.ts';
import {
  chargeBasicAttackCountOnHit,
  resetCooldownAfterFire,
} from '../skillTrigger.ts';
import { consumeActiveChargeOnFire, hasAvailableActiveCharge } from './chargeBank.ts';
import {
  resolveConditionalBranchEffects,
  targetPassesEffectConditions,
  type ConditionEvalContext,
} from './effectConditions.ts';
import { resolvePresentationLockSec } from './presentationLock.ts';
import { resolveEffectApplyDelaySec } from '../../render/skillAnimPlayback.ts';
import type {
  ActiveSkillDef,
  CombatantState,
  GameData,
  MoveSkillEffect,
  PendingSkillHit,
  SkillCooldown,
  SkillEffectDef,
  SkillSlotKind,
  StatusEffect,
} from '../types.ts';
import { asStatusEffectStatList, filterStatusEffectStats } from '../types.ts';
import {
  buildPendingHitsFromResolution,
  findCombatantById,
} from './pendingSkillHits.ts';
import { resolveSkillDamageType } from './damageTypeUtils.ts';
import {
  buildSkillSequence,
  type PendingSkillStep,
  resolveActiveEffectGaugeDurationSec,
  resolveSequenceStepAnchor,
  resolveSequenceWallClockSec,
  resolveUseDurationSec,
  type SkillSequenceRunner,
  skillHasMoveEffect,
  resolveSequenceStepAnchor,
} from './skillSequence.ts';
import {
  resolutionHasTargets,
  resolveEffectResolution,
  resolveEffectTargetSpec,
} from './targeting.ts';

function skillHitEventFields(
  hitIndex?: number,
  vfxSourceId?: string,
): {
  hitIndex?: number;
  vfxSourceId?: string;
} {
  return {
    ...(hitIndex !== undefined ? { hitIndex } : {}),
    ...(vfxSourceId !== undefined ? { vfxSourceId } : {}),
  };
}

function usesSegmentVfxSource(
  targetShape: SkillEffectDef['targetShape'],
): boolean {
  return targetShape === 'chain' || targetShape === 'pierce';
}

export interface SkillExecutorDeps {
  getBattleTimeSec: () => number;
  enqueuePendingHits: (hits: PendingSkillHit[]) => void;
  getAllCombatants: () => CombatantState[];
  getSequenceRunner: () => SkillSequenceRunner;
  onBasicAttackExecuted?: (actorId: string) => void;
  onBasicAttackCountCharged?: (actorId: string) => void;
  onDamageApplied?: (
    actor: CombatantState,
    target: CombatantState,
    amount: number,
    meta?: {
      attackKind: 'damage' | 'dot';
      isCounterDamage?: boolean;
      hpDamage?: number;
      attackRangePx?: number;
      didBlock?: boolean;
      threatBurstFlat?: number;
      threatBurstScale?: number;
      barrierHpBefore?: number;
      barrierDamage?: number;
    },
  ) => void;
  onDebuffApplied?: (actor: CombatantState) => void;
  onTargetReceivedDebuff?: (target: CombatantState) => void;
  onHealApplied?: (target: CombatantState) => void;
  onUnitDied?: (unit: CombatantState) => void;
  onLastStandGuts?: (targetId: string) => void;
  onBattleXChanged?: (
    unit: CombatantState,
    beforeX: number,
    reason: "knockback" | "enemyReelIn",
  ) => void;
}

function shouldDeferUntilHostileToAnchorInRange(
  actor: CombatantState,
  skill: ActiveSkillDef,
  allies: CombatantState[],
  enemies: CombatantState[],
  gameData: GameData,
  passives: ReturnType<typeof getPassiveDefs>,
): boolean {
  for (const effectDef of skill.effect) {
    if (effectDef.type !== 'move') continue;
    if ((effectDef.moveMode ?? 'engage') !== 'toAnchor') continue;
    const spec = resolveEffectTargetSpec(
      effectDef,
      actor,
      allies,
      enemies,
      passives,
    );
    const anchor = resolveSequenceStepAnchor(
      effectDef,
      spec,
      actor,
      allies,
      enemies,
      gameData,
    );
    if (!anchor || anchor.isEnemy === actor.isEnemy) continue;
    const offset = effectDef.anchorOffsetPx ?? 0;
    const idealAnchorX = actor.isEnemy
      ? anchor.battleX - offset
      : anchor.battleX + offset;
    const resolvedMoveX = resolveMoveBattleX(actor, anchor, effectDef, gameData);
    if (Math.abs(resolvedMoveX - idealAnchorX) > 0.5) {
      return true;
    }
  }
  return false;
}

export class SkillExecutor {
  private potencyStacksConsumed = new Map<string, number>();
  private blockResonanceStacksConsumed = new Map<string, number>();

  constructor(
    private readonly gameData: GameData,
    private readonly emit: BattleEventListener,
    private readonly deps: SkillExecutorDeps,
  ) {}

  tryExecute(
    actor: CombatantState,
    cd: SkillCooldown,
    allies: CombatantState[],
    enemies: CombatantState[],
  ): boolean {
    if (!actor.isAlive) return false;
    if (isUnitStunned(actor)) return false;

    const baseSkill = this.gameData.skillRegistry.actives[cd.skillId];
    if (!baseSkill || baseSkill.effect.length === 0) return false;
    const skill =
      cd.slotKind === 'basic'
        ? resolveEffectiveBasicAttackSkill(actor, baseSkill)
        : baseSkill;

    const passives = getPassiveDefs(
      actor,
      this.gameData.skillRegistry.passives,
    );

    if (
      cd.slotKind === 'active' &&
      !hasAvailableActiveCharge(
        cd,
        skill,
        passives,
        actor.build.learnedActiveIds,
      )
    ) {
      return false;
    }
    if (cd.slotKind !== 'active' && cd.remaining > 0) return false;
    if (cd.slotKind === 'active' && cd.remaining > 0 && (cd.storedCharges ?? 0) <= 0) {
      return false;
    }

    const runner = this.deps.getSequenceRunner();
    if (runner.isActorBusy(actor.id)) return false;
    if (cd.slotKind === 'basic' && runner.isBasicAttackBlocked(actor.id)) {
      return false;
    }

    if (skillHasMoveEffect(skill)) {
      if (
        shouldDeferUntilHostileToAnchorInRange(
          actor,
          skill,
          allies,
          enemies,
          this.gameData,
          passives,
        )
      ) {
        return false;
      }
      const sequence = buildSkillSequence(
        skill,
        actor,
        allies,
        enemies,
        this.gameData,
        passives,
        this.deps.getBattleTimeSec(),
        cd,
      );
      if (!sequence) return false;
      this.beginSkillUseIfActive(actor.id, skill, cd.slotKind);
      this.beginActiveEffectGaugeIfNeeded(actor.id, cd, skill);
      this.beginPresentationLockIfNeeded(actor, skill, cd.slotKind);
      this.beginSkillAnimLockIfNeeded(actor.id, skill);
      this.deps.getSequenceRunner().schedule(sequence);
      return true;
    }

    let appliedAny = false;
    this.potencyStacksConsumed.clear();
    this.blockResonanceStacksConsumed.clear();
    for (let effectIndex = 0; effectIndex < skill.effect.length; effectIndex++) {
      if (
        this.applyResolvedEffectStep(
          actor,
          allies,
          enemies,
          skill,
          skill.effect[effectIndex]!,
          effectIndex,
          cd,
          passives,
        )
      ) {
        appliedAny = true;
      }
    }

    if (appliedAny) {
      this.beginSkillUseIfActive(actor.id, skill, cd.slotKind);
      this.beginActiveEffectGaugeIfNeeded(actor.id, cd, skill);
      this.beginPresentationLockIfNeeded(actor, skill, cd.slotKind);
      this.beginSkillAnimLockIfNeeded(actor.id, skill);
      if (cd.slotKind === 'active') {
        consumeActiveChargeOnFire(
          cd,
          skill,
          passives,
          actor.build.learnedActiveIds,
        );
      } else {
        resetCooldownAfterFire(cd, skill);
      }
      if (cd.slotKind === 'basic') {
        this.deps.onBasicAttackExecuted?.(actor.id);
      }
      return true;
    }
    return false;
  }

  private buildConditionEvalContext(
    actor: CombatantState,
    allies: CombatantState[],
    enemies: CombatantState[],
    passives: ReturnType<typeof getPassiveDefs>,
    referenceEffect?: import('../types.ts').SkillEffectDef,
  ): ConditionEvalContext {
    return {
      actor,
      allies,
      enemies,
      passives,
      gameData: this.gameData,
      referenceEffect,
    };
  }

  private applyResolvedEffectStep(
    actor: CombatantState,
    allies: CombatantState[],
    enemies: CombatantState[],
    skill: ActiveSkillDef,
    effectDef: SkillEffectDef,
    effectIndex: number,
    cd: SkillCooldown,
    passives: ReturnType<typeof getPassiveDefs>,
  ): boolean {
    if (effectDef.type === 'herbalPotencyConsume') {
      const resolution = resolveEffectResolution(
        effectDef,
        actor,
        allies,
        enemies,
        this.gameData,
        Math.random,
        passives,
        skill.effect,
      );
      if (!resolutionHasTargets(resolution)) return false;
      const targets = resolution!.waves.flatMap((wave) =>
        wave.targets.map((entry) => entry.unit),
      );
      const consumed = consumeAllAllyHerbalPotencyStacks(allies, targets);
      for (const [targetId, stacks] of consumed) {
        this.potencyStacksConsumed.set(targetId, stacks);
      }
      return consumed.size > 0;
    }

    if (effectDef.type === 'blockResonanceConsume') {
      const stacks = consumeBlockResonanceStacks(actor);
      if (stacks <= 0) return false;
      this.blockResonanceStacksConsumed.set(actor.id, stacks);
      applyBlockResonanceStance(actor, skill, stacks);
      return true;
    }

    if (effectDef.type === 'grantNextOutgoingDamage') {
      const multiplier = effectDef.nextOutgoingDamageMultiplier ?? 1.3;
      const useSec = skill.useDurationSec ?? 0;
      scheduleNextOutgoingDamageCharge(
        actor,
        multiplier,
        skill.id,
        useSec <= 0,
      );
      this.emit({
        type: 'skill',
        actorId: actor.id,
        targetId: actor.id,
        skillId: skill.id,
        skillName: skill.name,
        slotKind: cd.slotKind,
        effect: 'grantNextOutgoingDamage',
        effectIndex,
        amount: multiplier,
        ...skillHitEventFields(undefined, undefined),
      });
      return true;
    }

    if (effectDef.type === 'conditionalEffect') {
      const branchEffects = resolveConditionalBranchEffects(
        effectDef,
        this.buildConditionEvalContext(
          actor,
          allies,
          enemies,
          passives,
          effectDef.thenEffects[0] ?? effectDef.elseEffects[0],
        ),
      );
      let appliedAny = false;
      for (const branchEffect of branchEffects) {
        if (
          this.applyResolvedEffectStep(
            actor,
            allies,
            enemies,
            skill,
            branchEffect,
            effectIndex,
            cd,
            passives,
          )
        ) {
          appliedAny = true;
        }
      }
      return appliedAny;
    }

    const resolution = resolveEffectResolution(
      effectDef,
      actor,
      allies,
      enemies,
      this.gameData,
      Math.random,
      passives,
      skill.effect,
    );
    if (!resolutionHasTargets(resolution)) return false;

    const applyDelaySec = resolveEffectApplyDelaySec(
      skill.id,
      effectIndex,
      effectDef,
    );
    const spread = resolution!.spreadDurationSec;
    if (
      (spread !== undefined && spread > 0) ||
      applyDelaySec > 0
    ) {
      const pending = buildPendingHitsFromResolution(
        resolution!,
        this.deps.getBattleTimeSec(),
        actor.id,
        skill,
        effectDef,
        cd,
        { effectIndex, baseDelaySec: applyDelaySec },
      );
      if (pending.length > 0) {
        if (applyDelaySec > 0) {
          this.emitSkillWindup(actor, skill, effectIndex, cd, resolution!);
        }
        this.deps.enqueuePendingHits(pending);
        return true;
      }
      return false;
    }

    const crowdHitCount =
      effectDef.type === 'damage'
        ? resolution!.waves.reduce(
            (sum, wave) => sum + wave.targets.length,
            0,
          )
        : undefined;
    const damageContext: PassiveDamageContext = {
      skill,
      slotKind: cd.slotKind,
      crowdHitCount,
      targetShape: effectDef.targetShape,
    };

    let appliedAny = false;
    let segmentSourceId = actor.id;
    const effectConditionCtx: ConditionEvalContext = {
      ...this.buildConditionEvalContext(
        actor,
        allies,
        enemies,
        passives,
        effectDef,
      ),
      skill,
      effectIndex,
    };
    for (const wave of resolution!.waves) {
      for (const { unit, powerMultiplierOverride } of wave.targets) {
        if (!targetPassesEffectConditions(effectConditionCtx, effectDef, unit)) {
          continue;
        }
        const vfxSourceId = usesSegmentVfxSource(effectDef.targetShape)
          ? segmentSourceId
          : undefined;
        if (
          this.applyEffect(
            actor,
            unit,
            skill,
            effectDef,
            cd,
            effectIndex,
            powerMultiplierOverride,
            wave.hitIndex,
            vfxSourceId,
            damageContext,
          )
        ) {
          appliedAny = true;
        }
        if (usesSegmentVfxSource(effectDef.targetShape)) {
          segmentSourceId = unit.id;
        }
      }
    }
    return appliedAny;
  }

  private emitSkillWindup(
    actor: CombatantState,
    skill: ActiveSkillDef,
    effectIndex: number,
    cd: SkillCooldown,
    resolution: NonNullable<ReturnType<typeof resolveEffectResolution>>,
  ): void {
    const firstTarget = resolution.waves[0]?.targets[0]?.unit;
    if (!firstTarget) return;
    this.emit({
      type: 'skillWindup',
      actorId: actor.id,
      targetId: firstTarget.id,
      skillId: skill.id,
      skillName: skill.name,
      slotKind: cd.slotKind,
      effectIndex,
    });
  }

  applyScheduledStep(
    step: PendingSkillStep,
    allies: CombatantState[],
    enemies: CombatantState[],
  ): void {
    const actor = findCombatantById(step.actorId, allies, enemies);
    if (!actor?.isAlive) return;

    const skill = this.gameData.skillRegistry.actives[step.skillId];
    if (!skill) return;

    const passives = getPassiveDefs(
      actor,
      this.gameData.skillRegistry.passives,
    );

    if (step.effectDef.type === 'move') {
      if (isUnitStunned(actor)) return;
      let target = findCombatantById(step.targetId, allies, enemies);
      if (!target?.isAlive) {
        const spec = resolveEffectTargetSpec(
          step.effectDef,
          actor,
          allies,
          enemies,
          passives,
        );
        target = resolveSequenceStepAnchor(
          step.effectDef,
          spec,
          actor,
          allies,
          enemies,
          this.gameData,
        );
      }
      if (!target?.isAlive) return;
      this.applyMoveEffect(
        actor,
        target,
        skill,
        step.effectDef,
        step.cd,
        step.effectIndex,
      );
      return;
    }

    this.applyResolvedEffectStep(
      actor,
      allies,
      enemies,
      skill,
      step.effectDef,
      step.effectIndex,
      step.cd,
      passives,
    );
  }

  applyPendingHit(hit: PendingSkillHit): boolean {
    const [allies, enemies] = this.splitCombatants();
    const actor = findCombatantById(hit.actorId, allies, enemies);
    if (!actor?.isAlive) return false;

    const runner = this.deps.getSequenceRunner();
    // pending は同一スキルの applyFrame / spread を優先し、実移動中のみ停止。
    if (runner.isActorInSkillMotion(actor.id)) {
      return false;
    }

    const skill = this.gameData.skillRegistry.actives[hit.skillId];
    if (!skill) return false;

    const cd: SkillCooldown = {
      skillId: hit.skillId,
      remaining: 0,
      slotKind: hit.slotKind,
    };

    const effectIndex =
      hit.effectIndex >= 0 ? hit.effectIndex : 0;
    let appliedAny = false;
    for (const entry of hit.targets) {
      const target = findCombatantById(entry.targetId, allies, enemies);
      if (!target?.isAlive) continue;
      if (
        this.applyEffect(
          actor,
          target,
          skill,
          hit.effectDef,
          cd,
          effectIndex,
          entry.powerMultiplierOverride,
          hit.hitIndex,
          hit.vfxSourceId,
          {
            suppressBonusBasicAttack: hit.suppressBonusBasicAttack === true,
            suppressAllyAttackFollowUp: hit.suppressAllyAttackFollowUp === true,
          },
        )
      ) {
        appliedAny = true;
      }
    }
    return appliedAny;
  }

  private splitCombatants(): [CombatantState[], CombatantState[]] {
    const all = this.deps.getAllCombatants();
    return [
      all.filter((unit) => !unit.isEnemy),
      all.filter((unit) => unit.isEnemy),
    ];
  }

  private chargeBasicAttackCountForHit(actor: CombatantState): void {
    chargeBasicAttackCountOnHit(actor, this.gameData.skillRegistry.actives);
    this.deps.onBasicAttackCountCharged?.(actor.id);
  }

  private applyMoveEffect(
    actor: CombatantState,
    anchor: CombatantState,
    skill: ActiveSkillDef,
    effectDef: MoveSkillEffect,
    cd: SkillCooldown,
    effectIndex: number,
  ): void {
    const toX = resolveMoveBattleX(actor, anchor, effectDef, this.gameData);
    const fromX = actor.battleX;
    const rangePx = resolveSkillRangePx(actor, effectDef);
    const moveDeltaPx = Math.abs(toX - fromX);
    const engageToX = resolveAttackBattleX(actor, anchor.battleX, this.gameData, rangePx);
    if (fromX === toX) {
      this.applyRearAssaultAccessFromMove(actor, anchor, effectDef);
      this.emit({
        type: 'skill',
        actorId: actor.id,
        targetId: anchor.id,
        skillId: skill.id,
        skillName: skill.name,
        slotKind: cd.slotKind,
        effect: 'move',
        effectIndex,
      });
      return;
    }

    this.applyRearAssaultAccessFromMove(actor, anchor, effectDef);

    this.deps.getSequenceRunner().startMove({
      actorId: actor.id,
      fromX,
      toX,
      remainingSec: effectDef.moveDurationSec,
      totalSec: effectDef.moveDurationSec,
    });

    this.emit({
      type: 'skill',
      actorId: actor.id,
      targetId: anchor.id,
      skillId: skill.id,
      skillName: skill.name,
      slotKind: cd.slotKind,
      effect: 'move',
      effectIndex,
    });
  }

  private applyRearAssaultAccessFromMove(
    actor: CombatantState,
    anchor: CombatantState,
    effectDef: MoveSkillEffect,
  ): void {
    if (isHostileRearAssaultMove(actor, anchor, effectDef)) {
      setPlayerRearAssaultAccess(actor);
      return;
    }
    clearPlayerRearAssaultAccess(actor);
  }

  private applyEffect(
    actor: CombatantState,
    target: CombatantState,
    skill: ActiveSkillDef,
    effectDef: SkillEffectDef,
    cd: SkillCooldown,
    effectIndex: number,
    powerMultiplierOverride?: number,
    hitIndex?: number,
    vfxSourceId?: string,
    damageContext: PassiveDamageContext = {},
  ): boolean {
    if (effectDef.type === 'move') {
      return false;
    }

    if (effectDef.type === 'move') {
      return false;
    }

    if (effectDef.type === 'enemyReelIn') {
      if (!target.isEnemy || actor.isEnemy) return false;
      const beforeX = target.battleX;
      const delta = applyEnemyReelIn(actor, target, this.gameData);
      if (delta === 0) return false;
      this.deps.onBattleXChanged?.(target, beforeX, 'enemyReelIn');
      this.emit({
        type: 'skill',
        actorId: actor.id,
        targetId: target.id,
        skillId: skill.id,
        skillName: skill.name,
        slotKind: cd.slotKind,
        effect: 'enemyReelIn',
        effectIndex,
        range: effectDef.range,
        ...skillHitEventFields(hitIndex, vfxSourceId),
      });
      return true;
    }

    if (effectDef.type === 'arenaDominance') {
      const enemies = this.deps
        .getAllCombatants()
        .filter((unit) => unit.isEnemy);
      const duration = resolveArenaDominanceDurationSec(effectDef, skill);
      grantArenaDominance(actor, skill.id, duration);
      const markTarget = pickHighestAtkEnemy(enemies);
      if (markTarget) {
        grantArenaMark(markTarget, actor.id, skill.id, duration);
      }
      for (const enemy of enemies) {
        if (enemy.isAlive) {
          enemy.threatFocusTargetId = actor.id;
        }
      }
      consumeActiveStageTrigger(actor, skill);
      this.emit({
        type: 'skill',
        actorId: actor.id,
        targetId: actor.id,
        skillId: skill.id,
        skillName: skill.name,
        slotKind: cd.slotKind,
        effect: 'arenaDominance',
        effectIndex,
        statusLabel: 'arenaDominance',
        ...skillHitEventFields(hitIndex, vfxSourceId),
      });
      return true;
    }

    if (effectDef.type === 'damage') {
      const passives = this.gameData.skillRegistry.passives;
      const allies = this.deps.getAllCombatants().filter((unit) => !unit.isEnemy);
      const coverResult = resolveLowHpCoverTarget(target, allies, passives);
      const damageTarget = coverResult.target;

      if (rollsEvasion(damageTarget, passives)) {
        this.emit({ type: 'evade', targetId: damageTarget.id });
        return false;
      }

      const damageEffect = {
        ...effectDef,
        amount: resolveEffectiveAmountSpecForActiveEffect(
          actor,
          passives,
          skill,
          effectDef,
          effectIndex,
          effectDef.amount,
        ),
      };
      const afterDr = resolveDamage(
        actor,
        damageTarget,
        damageEffect,
        passives,
        {
          atkScaleOverride: powerMultiplierOverride,
          passiveContext: damageContext,
          effectDamageIncrease: effectDef.damageIncrease,
          effectDefenseIgnore: effectDef.defenseIgnore,
          ignoreDamageTakenReduction:
            effectDef.ignoreDamageTakenReduction === true,
        },
      );

      let finalDamage = afterDr;
      let didBlock = false;
      const damageType = resolveSkillDamageType(actor, effectDef);
      if (effectDef.pierceBlock !== true) {
        if (damageType === 'physical') {
          const blockResult = applyBlockToPhysicalDamage(
            damageTarget,
            afterDr,
            passives,
          );
          finalDamage = blockResult.finalDamage;
          didBlock = blockResult.didBlock;
        } else if (damageType === 'magic') {
          const blockResult = applyBlockToMagicDamage(damageTarget, afterDr);
          finalDamage = blockResult.finalDamage;
          didBlock = blockResult.didBlock;
        }
      }
      if (effectDef.pierceWard !== true) {
        const wardResult = applyWardBarrierToIncomingDamage(
          damageTarget,
          finalDamage,
        );
        finalDamage = wardResult.damage;
      }
      if (damageTarget.isEnemy) {
        finalDamage = applyArenaMarkDamageMitigation(
          damageTarget,
          actor,
          finalDamage,
        );
      }
      if (didBlock) {
        this.emit({ type: 'block', targetId: damageTarget.id });
        const blockResonanceConfig = resolveBlockResonanceConfigForUnit(
          damageTarget,
          passives,
        );
        if (blockResonanceConfig.maxStacks > 0) {
          addBlockResonanceStacksOnBlock(damageTarget, blockResonanceConfig);
        }
        if (hasBlockResonanceStance(damageTarget)) {
            const stanceSkill =
              this.gameData.skillRegistry.actives[
                damageTarget.statusEffects.find(
                  (effect) =>
                    effect.overlay === 'blockResonanceStance' &&
                    effect.remainingSec > 0,
                )?.skillId ?? ''
              ];
            if (stanceSkill) {
              applyBlockResonanceStanceOnBlock(
                damageTarget,
                enemies,
                stanceSkill,
                passives,
                (defender, enemy, counterAmount) => {
                  const ward = applyWardBarrierToIncomingDamage(
                    enemy,
                    counterAmount,
                  );
                  const mitigation = mitigateIncomingDamage(
                    enemy,
                    ward.damage,
                    passives,
                  );
                  if (mitigation.lastStandTriggered) {
                    this.emit({ type: 'invulnerable', targetId: enemy.id });
                  }
                  const incoming = applyIncomingDamage(
                    enemy,
                    mitigation.finalDamage,
                  );
                  const { damageResult } = incoming;
                  const appliedCounterDamage =
                    damageResult.hpDamage + damageResult.barrierDamage;
                  this.deps.onDamageApplied?.(
                    defender,
                    enemy,
                    appliedCounterDamage,
                    {
                      attackKind: 'damage',
                      hpDamage: damageResult.hpDamage,
                      attackRangePx: defender.traits.rangePx,
                    },
                  );
                  if (damageResult.lethal) {
                    enemy.isAlive = false;
                    this.deps.getSequenceRunner().clearForActor(enemy.id);
                    this.deps.onUnitDied?.(enemy);
                    this.emit({ type: 'death', targetId: enemy.id });
                  }
                },
              );
            }
        }
      }
      if (actor.isEnemy && !damageTarget.isEnemy) {
        const dominanceOverlay = damageTarget.statusEffects.find(
          (effect) =>
            effect.overlay === 'arenaDominance' && effect.remainingSec > 0,
        );
        if (dominanceOverlay) {
          const overlaySkill = dominanceOverlay.skillId
            ? this.gameData.skillRegistry.actives[dominanceOverlay.skillId]
            : undefined;
          const mul = overlaySkill
            ? resolveArenaDominanceNonMarkMultiplier(
                { type: 'arenaDominance' },
                overlaySkill,
              )
            : undefined;
          if (mul !== undefined) {
            finalDamage = applyArenaDominanceDamageMitigation(
              damageTarget,
              actor,
              finalDamage,
              mul,
            );
          }
        }
      }
      const mitigation = mitigateIncomingDamage(damageTarget, finalDamage, passives, {
        allies,
      });
      if (mitigation.lastStandTriggered) {
        this.emit({ type: 'invulnerable', targetId: damageTarget.id });
      }
      if (mitigation.lastStandRecoveryTriggered) {
        this.emit({ type: 'lastStandRecovery', targetId: damageTarget.id });
      }
      if (mitigation.lastStandGutsTriggered) {
        this.emit({ type: 'lastStandGuts', targetId: damageTarget.id });
        this.deps.onLastStandGuts?.(damageTarget.id);
      }
      finalDamage = mitigation.finalDamage;
      const barrierHpBefore = damageTarget.barrierHp;
      const incoming = applyIncomingDamage(damageTarget, finalDamage, {
        skipBarrier: effectDef.pierceBarrier === true,
      });
      const { damageResult } = incoming;
      const appliedDamage =
        damageResult.hpDamage +
        damageResult.barrierDamage +
        incoming.delayedDamage;
      this.deps.onDamageApplied?.(actor, damageTarget, appliedDamage, {
        attackKind: 'damage',
        hpDamage: damageResult.hpDamage,
        attackRangePx: effectDef.range ?? actor.traits.rangePx,
        didBlock,
        threatBurstFlat: effectDef.threatBurstFlat,
        threatBurstScale: effectDef.threatBurstScale,
        barrierHpBefore,
        barrierDamage: damageResult.barrierDamage,
      });
      const { lethal } = damageResult;
      if (cd.slotKind === 'basic') {
        this.chargeBasicAttackCountForHit(actor);
      }
      this.emit({
        type: 'skill',
        actorId: actor.id,
        targetId: damageTarget.id,
        skillId: skill.id,
        skillName: skill.name,
        slotKind: cd.slotKind,
        effect: 'damage',
        effectIndex,
        amount: finalDamage,
        range: effectDef.range,
        ...skillHitEventFields(hitIndex, vfxSourceId),
      });
      this.emit({ type: 'hurt', targetId: damageTarget.id });
      if (
        (cd.slotKind === 'basic' || cd.slotKind === 'active') &&
        appliedDamage > 0
      ) {
        resetIdleAtkRampOnAttack(actor);
      }
      const ballistaConfig = mergeBallistaMarkPassive(
        getPassiveDefs(actor, passives),
      );
      if (
        ballistaConfig &&
        damageTarget.isEnemy &&
        isBallistaMarked(damageTarget) &&
        resolveBallistaMarkSourceId(damageTarget) === actor.id &&
        appliedDamage > 0
      ) {
        const splashTargets = findBallistaMarkSplashTargets(
          damageTarget,
          enemies,
          ballistaConfig.splashRadiusPx,
        );
        const splashDamage = resolveBallistaMarkSplashDamage(
          appliedDamage,
          ballistaConfig.splashDamageScale,
        );
        for (const splashTarget of splashTargets) {
          const splashResult = applyConfirmedHpDamage(
            splashTarget,
            splashDamage,
          );
          const splashApplied =
            splashResult.hpDamage + splashResult.barrierDamage;
          if (splashApplied <= 0) continue;
          this.deps.onDamageApplied?.(actor, splashTarget, splashApplied, {
            attackKind: 'damage',
            hpDamage: splashResult.hpDamage,
            attackRangePx: effectDef.range ?? actor.traits.rangePx,
          });
          this.emit({
            type: 'skill',
            actorId: actor.id,
            targetId: splashTarget.id,
            skillId: skill.id,
            skillName: skill.name,
            slotKind: cd.slotKind,
            effect: 'damage',
            effectIndex,
            amount: splashDamage,
            range: effectDef.range,
            ...skillHitEventFields(hitIndex, vfxSourceId),
          });
          this.emit({ type: 'hurt', targetId: splashTarget.id });
          if (splashResult.lethal) {
            splashTarget.isAlive = false;
            this.deps.getSequenceRunner().clearForActor(splashTarget.id);
            this.deps.onUnitDied?.(splashTarget);
            this.emit({ type: 'death', targetId: splashTarget.id });
          }
        }
      }
      if (lethal) {
        damageTarget.isAlive = false;
        if (!damageTarget.isEnemy) {
          stripPassivesAurasFromSource(
            damageTarget.id,
            this.deps.getAllCombatants(),
          );
        }
        this.deps.getSequenceRunner().clearForActor(damageTarget.id);
        this.deps.onUnitDied?.(damageTarget);
        this.emit({ type: 'death', targetId: damageTarget.id });
      }
      if (
        cd.slotKind === 'basic' &&
        !damageContext.suppressBonusBasicAttack &&
        damageTarget.isAlive &&
        shouldTriggerBonusBasicAttackOnHit(actor, damageTarget, passives)
      ) {
        this.deps.enqueuePendingHits([
          {
            applyAtBattleSec: this.deps.getBattleTimeSec(),
            actorId: actor.id,
            skillId: skill.id,
            skillName: skill.name,
            effectDef,
            effectIndex,
            slotKind: 'basic',
            hitIndex: hitIndex ?? 0,
            vfxSourceId,
            suppressBonusBasicAttack: true,
            targets: [{ targetId: damageTarget.id }],
          },
        ]);
      }
      if (
        cd.slotKind === 'basic' &&
        appliedDamage > 0 &&
        damageTarget.isEnemy &&
        !actor.isEnemy
      ) {
        const followUpConfig = getAllyAttackFollowUpConfig(actor);
        if (followUpConfig) {
          if (
            applyFollowUpDefDebuffOnHit(actor, damageTarget, followUpConfig)
          ) {
            this.deps.onTargetReceivedDebuff?.(damageTarget);
          }
        }
      }
      if (
        cd.slotKind === 'basic' &&
        appliedDamage > 0 &&
        damageTarget.isEnemy &&
        !actor.isEnemy &&
        !damageContext.suppressAllyAttackFollowUp
      ) {
        const partyAllies = this.deps
          .getAllCombatants()
          .filter((unit) => !unit.isEnemy);
        const followUpLancers = findFollowUpLancersForAllyBasic(
          actor,
          partyAllies,
        );
        if (followUpLancers.length > 0) {
          const pendingHits = followUpLancers
            .map((lancer) =>
              buildAllyAttackFollowUpPendingHit(
                lancer,
                damageTarget.id,
                this.gameData,
                this.deps.getBattleTimeSec(),
              ),
            )
            .filter((hit): hit is NonNullable<typeof hit> => hit !== undefined);
          if (pendingHits.length > 0) {
            this.deps.enqueuePendingHits(pendingHits);
          }
        }
      }
      return true;
    }

    if (effectDef.type === 'heal') {
      if (isAllySupportBlockedDuringArenaDominance(target, actor)) {
        return false;
      }
      if ((effectDef.healSubKind ?? 'instant') === 'hot') {
        const passives = this.gameData.skillRegistry.passives;
        const baseSpec =
          effectDef.amount ??
          ({ kind: 'flat', flatAmount: 0 } as const);
        let amountSpec = resolveEffectiveAmountSpecForActiveEffect(
          actor,
          passives,
          skill,
          effectDef,
          effectIndex,
          baseSpec,
        );
        if (effectDef.potencyStackScale) {
          const stacks = this.potencyStacksConsumed.get(target.id) ?? 0;
          if (stacks <= 0) return false;
          if (amountSpec.kind === 'percentMaxHp') {
            amountSpec = {
              ...amountSpec,
              percentOfMaxHp: amountSpec.percentOfMaxHp * stacks,
            };
          } else if (amountSpec.kind === 'atkBased') {
            amountSpec = {
              ...amountSpec,
              atkScale: amountSpec.atkScale * stacks,
            };
          } else if (amountSpec.kind === 'flat') {
            amountSpec = {
              ...amountSpec,
              flatAmount: amountSpec.flatAmount * stacks,
            };
          } else if (amountSpec.kind === 'defBased') {
            amountSpec = {
              ...amountSpec,
              defScale: amountSpec.defScale * stacks,
            };
          }
        }
        const duration = effectDef.durationSec ?? 0;
        if (duration <= 0) return false;
        const appliedAt = Date.now();
        target.statusEffects.push({
          id: `${skill.id}_hot_${appliedAt}`,
          kind: 'buff',
          overlay: 'hot',
          multiplier: 1,
          durationSec: duration,
          remainingSec: duration,
          amount: amountSpec,
          sourceId: actor.id,
          skillId: skill.id,
          effectIndex,
          tickSec: 1,
          ...(effectDef.buffDisplayName
            ? { displayName: effectDef.buffDisplayName }
            : {}),
        });
        if (effectDef.stackOnApply && effectDef.stackOnApply > 0) {
          const config = resolvePartyHerbalPotencyConfig(
            sameSideAlliesFrom(this.deps.getAllCombatants(), actor),
            passives,
          );
          if (config.maxStacks > 0) {
            addHerbalPotencyStacks(
              target,
              effectDef.stackOnApply,
              config.maxStacks,
              actor.id,
            );
          }
        }
        this.emit({
          type: 'skill',
          actorId: actor.id,
          targetId: target.id,
          skillId: skill.id,
          skillName: skill.name,
          slotKind: cd.slotKind,
          effect: 'heal',
          effectIndex,
          statusLabel: 'hot',
          range: effectDef.range,
          ...skillHitEventFields(hitIndex, vfxSourceId),
        });
        return true;
      }
      if ((effectDef.healSubKind ?? 'instant') === 'dispel') {
        const removed = dispelDebuffsOnTarget(
          target,
          effectDef.dispelCount ?? 0,
          effectDef.dispelTags,
          actor.id,
          effectDef.dispelPriority,
        );
        if (removed <= 0) return false;
        this.emit({
          type: 'skill',
          actorId: actor.id,
          targetId: target.id,
          skillId: skill.id,
          skillName: skill.name,
          slotKind: cd.slotKind,
          effect: 'dispel',
          effectIndex,
          amount: removed,
          range: effectDef.range,
          ...skillHitEventFields(hitIndex, vfxSourceId),
        });
        return true;
      }
      const passives = this.gameData.skillRegistry.passives;
      const healAmountSpec = resolveEffectiveAmountSpecForActiveEffect(
        actor,
        passives,
        skill,
        effectDef,
        effectIndex,
        effectDef.amount ?? ({ kind: 'flat', flatAmount: 0 } as const),
      );
      const amount = resolveHealAmount(
        actor,
        target,
        healAmountSpec,
        passives,
        {
          atkScaleOverride: powerMultiplierOverride,
          effectSpecialIncrease: effectDef.damageIncrease,
        },
      );
      if (amount <= 0) return false;
      const targetHpRatioBeforeHeal = currentHpRatio(target);
      const sameSideAllies = sameSideAlliesFrom(
        this.deps.getAllCombatants(),
        actor,
      );
      const healResult = applyDirectHealWithExcess(
        actor,
        target,
        amount,
        sameSideAllies,
        passives,
        { allowRedirect: true },
      );
      if (
        healResult.healed <= 0 &&
        healResult.redirectHealed <= 0 &&
        target.barrierHp <= 0
      ) {
        return false;
      }
      grantHealReservationStacks(
        actor,
        target,
        targetHpRatioBeforeHeal,
        passives,
      );
      this.deps.onHealApplied?.(target);
      this.emit({
        type: 'skill',
        actorId: actor.id,
        targetId: target.id,
        skillId: skill.id,
        skillName: skill.name,
        slotKind: cd.slotKind,
        effect: 'heal',
        effectIndex,
        amount,
        range: effectDef.range,
        ...skillHitEventFields(hitIndex, vfxSourceId),
      });
      if (healResult.redirectTarget && healResult.redirectHealed > 0) {
        grantHealReservationStacks(
          actor,
          healResult.redirectTarget,
          healResult.redirectHpRatioBeforeHeal ?? currentHpRatio(healResult.redirectTarget),
          passives,
        );
        this.deps.onHealApplied?.(healResult.redirectTarget);
        this.emit({
          type: 'skill',
          actorId: actor.id,
          targetId: healResult.redirectTarget.id,
          skillId: skill.id,
          skillName: skill.name,
          slotKind: cd.slotKind,
          effect: 'heal',
          effectIndex,
          amount: healResult.redirectAmount,
          range: effectDef.range,
          ...skillHitEventFields(hitIndex, vfxSourceId),
        });
      }
      return true;
    }

    if (effectDef.type === 'basicAttackTransform') {
      const duration = effectDef.buffDurationSec ?? 0;
      const transformSpec = basicAttackTransformSpecFromEffect(effectDef);
      if (duration <= 0 || !transformSpec) return false;
      const appliedAt = Date.now();
      target.statusEffects.push({
        id: `${skill.id}_basicAttackTransform_${appliedAt}`,
        kind: 'buff',
        overlay: 'basicAttackTransform',
        multiplier: 1,
        durationSec: duration,
        remainingSec: duration,
        sourceId: actor.id,
        skillId: skill.id,
        basicAttackTransform: structuredClone(transformSpec),
      });
      this.emit({
        type: 'skill',
        actorId: actor.id,
        targetId: target.id,
        skillId: skill.id,
        skillName: skill.name,
        slotKind: cd.slotKind,
        effect: 'buff',
        effectIndex,
        statusLabel: 'basicAttackTransform',
        range: effectDef.range,
        ...skillHitEventFields(hitIndex, vfxSourceId),
      });
      return true;
    }

    if (effectDef.type === 'buff' || effectDef.type === 'debuff') {
      if (effectDef.type === 'buff') {
        const subKind = effectDef.buffSubKind ?? 'stat';
        if (subKind === 'barrier') {
          if (isAllySupportBlockedDuringArenaDominance(target, actor)) {
            return false;
          }
          const passives = this.gameData.skillRegistry.passives;
          const amountSpec = resolveEffectiveAmountSpecForActiveEffect(
            actor,
            passives,
            skill,
            effectDef,
            effectIndex,
            effectDef.amount ??
              ({ kind: 'flat', flatAmount: 0 } as const),
          );
          const baseGrant = resolveResourceAmount(
            actor,
            target,
            amountSpec,
            passives,
            powerMultiplierOverride,
          );
          const grant = Math.floor(
            baseGrant *
              getPassiveSpecialEffectMultiplier(
                'barrier',
                actor,
                target,
                passives,
              ),
          );
          if (grant <= 0) return false;
          applyBarrierToTarget(target, grant, effectDef.barrierStack);
          this.emit({
            type: 'skill',
            actorId: actor.id,
            targetId: target.id,
            skillId: skill.id,
            skillName: skill.name,
            slotKind: cd.slotKind,
            effect: 'barrier',
            effectIndex,
            amount: grant,
            range: effectDef.range,
            ...skillHitEventFields(hitIndex, vfxSourceId),
          });
          return true;
        }
        if (subKind === 'wardBarrier') {
          const stacks = effectDef.stacks ?? 1;
          const ratio = effectDef.damageReductionRatio ?? 0.1;
          applyWardBarrierToTarget(
            target,
            stacks,
            ratio,
            skill.id,
            actor.id,
          );
          this.emit({
            type: 'skill',
            actorId: actor.id,
            targetId: target.id,
            skillId: skill.id,
            skillName: skill.name,
            slotKind: cd.slotKind,
            effect: 'buff',
            effectIndex,
            statusLabel: 'wardBarrier',
            range: effectDef.range,
            ...skillHitEventFields(hitIndex, vfxSourceId),
          });
          return true;
        }
        if (subKind === 'block' || subKind === 'evasion') {
          const chance = effectDef.chance ?? 0;
          const duration = effectDef.buffDurationSec ?? 0;
          if (chance <= 0 || duration <= 0) return false;
          const appliedAt = Date.now();
          target.statusEffects.push({
            id: `${skill.id}_${subKind}_${appliedAt}`,
            kind: 'buff',
            overlay: subKind,
            ...(subKind === 'block'
              ? { blockChance: chance }
              : { evasionChance: chance }),
            multiplier: 1,
            durationSec: duration,
            remainingSec: duration,
            sourceId: actor.id,
            skillId: skill.id,
          });
          this.emit({
            type: 'skill',
            actorId: actor.id,
            targetId: target.id,
            skillId: skill.id,
            skillName: skill.name,
            slotKind: cd.slotKind,
            effect: subKind === 'block' ? 'block' : 'buff',
            effectIndex,
            statusLabel: subKind,
            range: effectDef.range,
            ...skillHitEventFields(hitIndex, vfxSourceId),
          });
          return true;
        }
        if (subKind === 'damageDelay') {
          const ratio = effectDef.ratio ?? 0;
          const duration = effectDef.buffDurationSec ?? 0;
          if (ratio <= 0 || duration <= 0) return false;
          const appliedAt = Date.now();
          target.statusEffects.push({
            id: `${skill.id}_damageDelay_${appliedAt}`,
            kind: 'buff',
            overlay: 'damageDelay',
            ratio,
            multiplier: 1,
            durationSec: duration,
            remainingSec: duration,
            sourceId: actor.id,
            skillId: skill.id,
          });
          this.emit({
            type: 'skill',
            actorId: actor.id,
            targetId: target.id,
            skillId: skill.id,
            skillName: skill.name,
            slotKind: cd.slotKind,
            effect: 'buff',
            effectIndex,
            statusLabel: 'damageDelay',
            range: effectDef.range,
            ...skillHitEventFields(hitIndex, vfxSourceId),
          });
          return true;
        }
        if (subKind === 'allyAttackFollowUp') {
          const duration = effectDef.buffDurationSec ?? 0;
          const radiusPx = effectDef.allyFollowUpRadiusPx ?? 70;
          const defDebuffMultiplier =
            effectDef.followUpDefDebuffMultiplier ?? 0.95;
          const defDebuffDurationSec =
            effectDef.followUpDefDebuffDurationSec ?? 5;
          if (duration <= 0) return false;
          const appliedAt = Date.now();
          target.statusEffects = target.statusEffects.filter(
            (effect) => effect.overlay !== ALLY_ATTACK_FOLLOW_UP_OVERLAY,
          );
          target.statusEffects.push({
            id: `${skill.id}_allyAttackFollowUp_${appliedAt}`,
            kind: 'buff',
            overlay: ALLY_ATTACK_FOLLOW_UP_OVERLAY,
            multiplier: 1,
            durationSec: duration,
            remainingSec: duration,
            sourceId: actor.id,
            skillId: skill.id,
            allyFollowUpRadiusPx: radiusPx,
            followUpDefDebuffMultiplier: defDebuffMultiplier,
            followUpDefDebuffDurationSec: defDebuffDurationSec,
            displayName: '追撃モード',
          });
          this.emit({
            type: 'skill',
            actorId: actor.id,
            targetId: target.id,
            skillId: skill.id,
            skillName: skill.name,
            slotKind: cd.slotKind,
            effect: 'buff',
            effectIndex,
            statusLabel: 'allyAttackFollowUp',
            range: effectDef.range,
            ...skillHitEventFields(hitIndex, vfxSourceId),
          });
          return true;
        }
      }
      if (effectDef.type === 'debuff') {
        const subKind = effectDef.debuffSubKind ?? 'stat';
        if (subKind === 'dot') {
          const duration = effectDef.durationSec ?? 0;
          const passives = this.gameData.skillRegistry.passives;
          const baseSpec =
            effectDef.amount ??
            (effectDef.powerMultiplier !== undefined &&
            effectDef.powerMultiplier > 0
              ? ({
                  kind: 'atkBased',
                  atkScale: effectDef.powerMultiplier,
                } as const)
              : undefined);
          if (duration <= 0 || baseSpec === undefined) return false;
          const amountSpec = resolveEffectiveAmountSpecForActiveEffect(
            actor,
            passives,
            skill,
            effectDef,
            effectIndex,
            baseSpec,
          );
          const appliedAt = Date.now();
          target.statusEffects.push({
            id: `${skill.id}_dot_${appliedAt}`,
            kind: 'debuff',
            overlay: 'dot',
            multiplier: 1,
            durationSec: duration,
            remainingSec: duration,
            amount: amountSpec,
            sourceId: actor.id,
            skillId: skill.id,
            effectIndex,
            damageType: resolveSkillDamageType(actor, effectDef),
            damageIncrease: effectDef.damageIncrease,
            defenseIgnore: effectDef.defenseIgnore,
            tickSec: 1,
            ...(effectDef.dotFlavor ? { dotFlavor: effectDef.dotFlavor } : {}),
            ...(effectDef.buffDisplayName
              ? { displayName: effectDef.buffDisplayName }
              : {}),
          });
          this.emit({
            type: 'skill',
            actorId: actor.id,
            targetId: target.id,
            skillId: skill.id,
            skillName: skill.name,
            slotKind: cd.slotKind,
            effect: 'dot',
            effectIndex,
            statusLabel: 'dot',
            range: effectDef.range,
            ...skillHitEventFields(hitIndex, vfxSourceId),
          });
          this.deps.onTargetReceivedDebuff?.(target);
          return true;
        }
        if (subKind === 'stun') {
          const duration = effectDef.durationSec ?? 0;
          if (duration <= 0) return false;
          const applied = applyStunToTarget(
            target,
            duration,
            {
              skillId: skill.id,
              sourceId: actor.id,
            },
            { actives: this.gameData.skillRegistry.actives },
          );
          if (!applied) return false;
          this.emit({
            type: 'skill',
            actorId: actor.id,
            targetId: target.id,
            skillId: skill.id,
            skillName: skill.name,
            slotKind: cd.slotKind,
            effect: 'stun',
            effectIndex,
            statusLabel: 'stun',
            range: effectDef.range,
            ...skillHitEventFields(hitIndex, vfxSourceId),
          });
          this.deps.onTargetReceivedDebuff?.(target);
          return true;
        }
      }
      const isBuff = effectDef.type === 'buff';
      const stats = isBuff
        ? filterStatusEffectStats(effectDef.buffStat)
        : asStatusEffectStatList(effectDef.debuffStat);
      const multiplier = isBuff
        ? effectDef.buffMultiplier
        : effectDef.debuffMultiplier;
      const flatBonus = isBuff
        ? effectDef.buffFlatBonus
        : effectDef.debuffFlatBonus;
      let duration = isBuff
        ? effectDef.buffDurationSec
        : effectDef.debuffDurationSec;
      if (
        stats.length === 0 ||
        (multiplier === undefined && flatBonus === undefined)
      ) {
        return false;
      }

      const statusLabels: string[] = [];
      const appliedAt = Date.now();
      if (duration === undefined) return false;

      for (let i = 0; i < stats.length; i++) {
        const stat = stats[i]!;
        const effect: StatusEffect = {
          id: `${skill.id}_${stat}_${appliedAt}_${i}`,
          kind: isBuff ? 'buff' : 'debuff',
          stat,
          multiplier: multiplier ?? 1,
          durationSec: duration,
          remainingSec: duration,
          ...(flatBonus !== undefined ? { flatBonus: Math.abs(flatBonus) } : {}),
        };
        target.statusEffects.push(effect);
        statusLabels.push(formatStatusLabel(stat, multiplier, flatBonus));
      }

      clampHpToEffectiveMax(target);

      this.emit({
        type: 'skill',
        actorId: actor.id,
        targetId: target.id,
        skillId: skill.id,
        skillName: skill.name,
        slotKind: cd.slotKind,
        effect: effectDef.type,
        effectIndex,
        statusLabel: statusLabels.join(', '),
        range: effectDef.range,
        ...skillHitEventFields(hitIndex, vfxSourceId),
      });
      if (!isBuff && actor.isEnemy === false && target.isEnemy) {
        this.deps.onDebuffApplied?.(actor);
      }
      if (!isBuff) {
        this.deps.onTargetReceivedDebuff?.(target);
      }
      return true;
    }

    if (effectDef.type === 'stun') {
      const applied = applyStunToTarget(
        target,
        effectDef.durationSec,
        {
          skillId: skill.id,
          sourceId: actor.id,
        },
        { actives: this.gameData.skillRegistry.actives },
      );
      if (!applied) return false;
      this.emit({
        type: 'skill',
        actorId: actor.id,
        targetId: target.id,
        skillId: skill.id,
        skillName: skill.name,
        slotKind: cd.slotKind,
        effect: 'stun',
        effectIndex,
        statusLabel: 'stun',
        range: effectDef.range,
        ...skillHitEventFields(hitIndex, vfxSourceId),
      });
      this.deps.onTargetReceivedDebuff?.(target);
      return true;
    }

    if (effectDef.type === 'knockback') {
      const beforeX = target.battleX;
      const applied = applyKnockbackToTarget(target, effectDef.distancePx, {
        skillId: skill.id,
        sourceId: actor.id,
      });
      if (!applied) return false;
      this.deps.onBattleXChanged?.(target, beforeX, 'knockback');
      this.emit({
        type: 'skill',
        actorId: actor.id,
        targetId: target.id,
        skillId: skill.id,
        skillName: skill.name,
        slotKind: cd.slotKind,
        effect: 'knockback',
        effectIndex,
        range: effectDef.range,
        ...skillHitEventFields(hitIndex, vfxSourceId),
      });
      return true;
    }

    if (effectDef.type === 'dispel') {
      const removed = dispelDebuffsOnTarget(
        target,
        effectDef.dispelCount,
        effectDef.dispelTags,
        actor.id,
        effectDef.dispelPriority,
      );
      if (removed <= 0) return false;
      this.emit({
        type: 'skill',
        actorId: actor.id,
        targetId: target.id,
        skillId: skill.id,
        skillName: skill.name,
        slotKind: cd.slotKind,
        effect: 'dispel',
        effectIndex,
        amount: removed,
        range: effectDef.range,
        ...skillHitEventFields(hitIndex, vfxSourceId),
      });
      return true;
    }

    if (effectDef.type === 'block') {
      const appliedAt = Date.now();
      target.statusEffects.push({
        id: `${skill.id}_block_${appliedAt}`,
        kind: 'buff',
        overlay: 'block',
        blockChance: effectDef.blockChance,
        multiplier: 1,
        durationSec: effectDef.durationSec,
        remainingSec: effectDef.durationSec,
        sourceId: actor.id,
        skillId: skill.id,
      });
      this.emit({
        type: 'skill',
        actorId: actor.id,
        targetId: target.id,
        skillId: skill.id,
        skillName: skill.name,
        slotKind: cd.slotKind,
        effect: 'block',
        effectIndex,
        statusLabel: 'block',
        range: effectDef.range,
        ...skillHitEventFields(hitIndex, vfxSourceId),
      });
      return true;
    }

    if (effectDef.type === 'counter') {
      grantCounterStatus(actor, {
        responses: effectDef.responses,
        durationSec: effectDef.durationSec,
        range: effectDef.range,
        counterMelee: effectDef.counterMelee,
        counterRanged: effectDef.counterRanged,
        skillId: skill.id,
        sourceId: actor.id,
      });
      this.emit({
        type: 'skill',
        actorId: actor.id,
        targetId: actor.id,
        skillId: skill.id,
        skillName: skill.name,
        slotKind: cd.slotKind,
        effect: 'counter',
        effectIndex,
        statusLabel: 'counter',
        range: effectDef.range,
        ...skillHitEventFields(hitIndex, vfxSourceId),
      });
      return true;
    }

    if (effectDef.type === 'dot') {
      const appliedAt = Date.now();
      target.statusEffects.push({
        id: `${skill.id}_dot_${appliedAt}`,
        kind: 'debuff',
        overlay: 'dot',
        multiplier: 1,
        durationSec: effectDef.durationSec,
        remainingSec: effectDef.durationSec,
        powerMultiplier: effectDef.powerMultiplier,
        sourceId: actor.id,
        skillId: skill.id,
        damageType: resolveSkillDamageType(actor, effectDef),
        damageIncrease: effectDef.damageIncrease,
        defenseIgnore: effectDef.defenseIgnore,
        tickSec: 1,
        ...(effectDef.dotFlavor ? { dotFlavor: effectDef.dotFlavor } : {}),
      });
      this.emit({
        type: 'skill',
        actorId: actor.id,
        targetId: target.id,
        skillId: skill.id,
        skillName: skill.name,
        slotKind: cd.slotKind,
        effect: 'dot',
        effectIndex,
        statusLabel: 'dot',
        range: effectDef.range,
        ...skillHitEventFields(hitIndex, vfxSourceId),
      });
      return true;
    }

    return false;
  }

  private beginPresentationLockIfNeeded(
    actor: CombatantState,
    skill: ActiveSkillDef,
    slotKind: SkillSlotKind,
  ): void {
    const duration = resolvePresentationLockSec(skill, actor, slotKind);
    if (duration > 0) {
      this.deps.getSequenceRunner().beginPresentationLock(actor.id, duration);
    }
  }

  private beginSkillUseIfActive(
    actorId: string,
    skill: ActiveSkillDef,
    slotKind: SkillSlotKind,
  ): void {
    if (slotKind === 'basic') return;
    const useSec = resolveEffectiveUseDurationSec(
      skill,
      actorId,
      this.blockResonanceStacksConsumed,
    );
    if (useSec <= 0) return;
    const duration = Math.max(useSec, resolveSequenceWallClockSec(skill));
    this.deps.getSequenceRunner().beginUse(actorId, duration);
  }

  private beginActiveEffectGaugeIfNeeded(
    actorId: string,
    cd: SkillCooldown,
    skill: ActiveSkillDef,
  ): void {
    if (cd.slotKind !== 'active') return;
    const totalSec = resolveActiveEffectGaugeDurationSec(skill);
    if (totalSec <= 0) return;
    this.deps
      .getSequenceRunner()
      .beginActiveEffectGauge(actorId, cd.slotIndex ?? 0, totalSec);
  }

  private beginSkillAnimLockIfNeeded(
    actorId: string,
    skill: ActiveSkillDef,
  ): void {
    this.deps.getSequenceRunner().beginSkillAnimLockIfNeeded(actorId, skill, 0);
  }
}

function formatStatusLabel(
  stat: NonNullable<StatusEffect['stat']>,
  multiplier: number | undefined,
  flatBonus: number | undefined,
): string {
  const parts: string[] = [stat];
  if (multiplier !== undefined && multiplier !== 1) {
    parts.push(`x${multiplier}`);
  }
  if (flatBonus !== undefined) {
    parts.push(`+${Math.abs(flatBonus)}`);
  }
  return parts.join(' ');
}
