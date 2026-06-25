import type { BattleEventListener } from "./events.ts";
import {
  createAlliesFromPartyState,
  createCooldowns,
  createEnemiesForStage,
  hideFallenAllyCorpses,
  resetEntityIdCounter,
  resetPerWaveCombatantFlags,
} from "./entities.ts";
import {
  applyDamageToTarget,
  applyHealToTarget,
  clampHpToEffectiveMax,
  currentHpRatio,
  getEffectiveAttackSpeedMultiplier,
  getEffectiveMaxHp,
  getPassiveDefs,
  resolveDotAmountFromStatus,
  resolveHotAmountFromStatus,
} from "./combatMath.ts";
import {
  applyDelayedDamageTick,
  computeDamageDelayTickAmount,
  getDamageDelayRemainingSec,
  hasActiveDamageDelay,
} from "./damageDelay.ts";
import { getBasicCooldownRate } from "../progression/levelGrowth.ts";
import { resolveAttackSpeedTier } from "../progression/memberStatsDisplay.ts";
import {
  getEnemyContactX,
  getPlayerFrontlineContactX,
  resolveFormationRangePx,
  resolveMaxEffectiveRangePx,
  isMeleeUnit,
  updateUnitApproach,
  capEngagedEnemyApproachBattleX,
  syncFieldX,
  syncAllFieldX,
  freezeEnemyCorpseBattleAnchor,
  syncDeadEnemyCorpseBattleX,
  resolvePartyDeployTargets,
  placePartyOffScreenForDeploy,
  resolveEnemyDeployTargets,
  placeEnemiesOffScreenForDeploy,
  clearPlayerRearAssaultAccess,
} from "./combatPosition.ts";
import { waveHasTrainingDummy } from "./trainingStage.ts";
import {
  BODY_ANIM_APPROACH_SETTLED_PX,
  resolveCombatantBodyAnimMarching,
  type BodyAnimMarchingContext,
} from "./bodyAnimMarching.ts";
import {
  resolveAllPlayerApproachBattleX,
  resolveEnemyApproachBattleX,
  resolveEnemyAttackTargetPlayer,
  resolveEnemyChaseTargetPlayer,
  shouldSkipEngagedAutoApproach,
} from "./resolveApproachBattleX.ts";
import {
  CANVAS_W as BATTLE_CANVAS_W,
  MOVE_PX_PER_SEC,
  moveDeltaPx,
} from "./battleConstants.ts";
import { isUnitMovementBlocked, isUnitStunned } from "./ccEffects.ts";
import {
  applyCounterRetaliation,
  applyPassiveCounterRetaliation,
  type CounterAttackKind,
} from "./counterEffects.ts";
import {
  resolveIncomingHealAmount,
  firePeriodicPassivesForTrigger,
  handlePassiveDispelOnDebuffReceived,
  resetPassiveDispelTriggerLimits,
  stripPassivesAurasFromSource,
  syncHotAuras,
  syncBuffAuras,
  syncDebuffAuras,
  syncDamageReductionAuras,
  syncFrontThreatControlAuras,
  syncSelfHpRatioBuffAuras,
} from "./passiveEffects.ts";
import {
  resolveHerbalPotencyHotBonus,
  resolvePartyHerbalPotencyConfig,
  syncHerbalPotencyAuras,
  tickHerbalPotencyAccumulation,
} from "./herbalPotency.ts";
import {
  resolveBlockResonanceConfigForUnit,
  syncBlockResonanceAuras,
  tickBlockResonanceDecay,
} from "./blockResonance.ts";
import { syncFrontBlockAuras } from "./frontBlockAura.ts";
import { mitigateIncomingDamage } from "./incomingDamageMitigation.ts";
import { syncBloodlustDuelistAuras } from "./bloodlustDuelist.ts";
import { syncDuelistPrideAuras } from "./duelistPride.ts";
import { resetLowHpCoverRedirects } from "./lowHpCover.ts";
import {
  applyLastStandGutsEndEffects,
  LAST_STAND_GUTS_OVERLAY,
  resolveLastStandGutsEndConfig,
} from "./lastStandGuts.ts";
import {
  ARENA_DOMINANCE_OVERLAY,
  handleArenaDominanceEnd,
  hasActiveStageTriggerRemaining,
  initActiveStageTriggerLimits,
  isAllySupportBlockedDuringArenaDominance,
} from "./arenaDominance.ts";
import { tryTriggerHealReservation, grantHealReservationStacks } from "./healReservation.ts";
import { tryTriggerBarrierBreakRegen } from "./barrierBreakRegen.ts";
import { tryTriggerBarrierDepletionHeal } from "./barrierDepletionHeal.ts";
import { applyWardBarrierToIncomingDamage } from "./wardBarrier.ts";
import {
  applyThreatFromDamage,
  applyThreatFromDebuffApply,
  applyThreatControlOnBlock,
  applyThreatControlOnDamageTaken,
  applyThreatBurst,
  applyFrontThreatFloor,
  initializeAllyThreat,
  refreshAlliesBaseThreat,
  resolveAllyThreatDecayMultiplier,
  tickAllyThreatDecay,
} from "./threat.ts";
import { deathAnimDurationMs } from "../render/deathPlayback.ts";
import {
  clearEngagedDisplayAnchor,
  EngagedCompositionTracker,
  getEngagedDisplayAnchorPlayerId,
  setEngagedDisplayAnchorPlayerId,
} from "./battleDisplay.ts";
import {
  getLeadingPlayerFormationRow,
  resolveEngagedLayout,
  applyEngagedFormationToBattleX,
  resolveEngagePlayerBattleAnchor,
  resolveEngagedFormationOverlaps,
  type EngagedLayoutResult,
} from "./battleLayout.ts";
import { SPRITE_WIDTH } from "./battleConstants.ts";
import { SkillExecutor } from "./skills/SkillExecutor.ts";
import { tickPendingHits } from "./skills/pendingSkillHits.ts";
import { SkillSequenceRunner } from "./skills/skillSequence.ts";
import {
  chargeCountTrigger,
  findReadyCountTriggerCooldowns,
  forceActiveCooldownReady,
  initializeSkillCooldowns,
  isCountTriggerReady,
  isCountTriggerSkill,
  isTimeTrigger,
  resolveSkillTrigger,
  shouldPauseActiveCooldown,
  shouldTickCooldown,
  tickCountTriggerCooldowns,
} from "./skillTrigger.ts";
import {
  bankReadyChargeIfPossible,
  hasAvailableActiveCharge,
  resolveEffectiveMaxCharges,
  resolveFirePolicy,
} from "./skills/chargeBank.ts";
import {
  isActiveFireHold,
  shouldFireActiveSkill,
  type FireGateContext,
} from "./skills/fireGate.ts";
import { resolveBattleActiveSkillIdsForMember } from "../progression/battleActiveSkills.ts";
import { resolveRuntimeBattlePhase } from "./battlePhase.ts";
import {
  ANNOUNCEMENT_FADE_OUT_START_MS,
  ANNOUNCEMENT_TOTAL_MS,
  POST_ANNOUNCEMENT_ENGAGE_DELAY_SEC,
  POST_DEPLOY_SETTLE_DELAY_SEC,
} from "../render/announcementOverlayTiming.ts";
import type { BattlePhase, BattleSnapshot, CombatantState, GameData, PartySlotState, PendingSkillHit, SkillCooldown, SkillTriggerKind, StatusEffect } from "./types.ts";
import type { LevelCurvesConfig } from "../progression/levelGrowth.ts";

const RESTART_DELAY_SEC = 3;
const VICTORY_EXIT_PX_PER_SEC = MOVE_PX_PER_SEC * 2;
const OVERLAY_TICK_SEC = 1;
/** 敵死亡演出（アニメ + ホールド）後に Victory / 次 Wave へ遷移 */
const ENEMY_DEATH_SETTLE_DELAY_SEC =
  (deathAnimDurationMs() + 500) / 1000;
/** 味方死亡演出（アニメ + ホールド）後に Defeat へ遷移 */
const ALLY_DEATH_DEFEAT_DELAY_SEC =
  (deathAnimDurationMs() + 500) / 1000;

export interface BattleEngineOptions {
  onDamageApplied?: (
    actor: CombatantState,
    target: CombatantState,
    amount: number,
  ) => void;
  /** 確認モード: 特定 Wave のみ周回（null = ステージ全 Wave） */
  getLoopWaveIndex?: () => number | null;
}

export class BattleEngine {
  private phase: BattlePhase = "idle";
  private players: CombatantState[] = [];
  private enemies: CombatantState[] = [];
  private worldOffsetX = 0;
  private pendingVictoryTimer = 0;
  private pendingVictorySurvivors: number[] | null = null;
  private pendingDefeatTimer = 0;
  private pendingDefeatSurvivors: number[] | null = null;
  private waveAdvanceDelayTimer = 0;
  private pendingNextWaveIndex: number | null = null;
  /** 次 Wave へ: 死亡演出後の右退場 march（VictoryExit と同速度） */
  private waveExitMarchActive = false;
  /** Wave 開始: 告知オーバーレイ（PartyDeploy と同時進行） */
  private waveAnnouncementActive = false;
  private waveAnnouncementElapsedMs = 0;
  /** fade-out 開始後の接敵待機（null = 未開始） */
  private postAnnouncementEngageDelaySec: number | null = null;
  /** PartyDeploy 到達後の接敵待機（null = 未到達 or 消費済み） */
  private postDeploySettleDelaySec: number | null = null;
  /** 各 Wave 開始: 味方が左外から初期位置へ移動中 */
  private partyDeployActive = false;
  /** PartyDeploy 配置済み・Wave 表示待ち */
  private partyDeployPrepared = false;
  /** PartyDeploy 到達済み（接敵ゲート待ち） */
  private partyDeploySettled = false;
  private partyDeployTargets = new Map<string, number>();
  private enemyDeployTargets = new Map<string, number>();
  /** 訓練ステージ: 配置済み・接敵待ち（startBattle / respawn 時に即接敵） */
  private trainingWaveReadyToEngage = false;
  private engaged = false;
  /** 接敵中に到達した味方最前線 battleX（前列戦死時の layout アンカー維持） */
  private engagedFrontLineAnchor: number | null = null;
  /** Victory 退出開始済み */
  private victoryFormationReady = false;
  private readonly engagedComposition = new EngagedCompositionTracker();
  private restartTimer = 0;
  private readonly listeners = new Set<BattleEventListener>();
  private readonly executor: SkillExecutor;
  private readonly skillSequenceRunner = new SkillSequenceRunner();
  private pendingHitQueue: PendingSkillHit[] = [];
  private battleTimeSec = 0;
  private stageId: string;
  private waveIndex = 0;
  private readonly onDamageApplied?: (
    actor: CombatantState,
    target: CombatantState,
    amount: number,
  ) => void;
  private readonly getLoopWaveIndex?: () => number | null;

  constructor(
    private readonly gameData: GameData,
    private readonly levelCurves: LevelCurvesConfig,
    private readonly getParty: () => PartySlotState[],
    private readonly getStageId: () => string,
    options: BattleEngineOptions = {},
  ) {
    this.stageId = getStageId();
    this.onDamageApplied = options.onDamageApplied;
    this.getLoopWaveIndex = options.getLoopWaveIndex;
    this.executor = new SkillExecutor(gameData, (e) => this.emit(e), {
      getBattleTimeSec: () => this.battleTimeSec,
      enqueuePendingHits: (hits) => {
        this.pendingHitQueue.push(...hits);
      },
      getAllCombatants: () => [...this.players, ...this.enemies],
      getSequenceRunner: () => this.skillSequenceRunner,
      onBasicAttackExecuted: () => {},
      onBasicAttackCountCharged: (actorId) => {
        this.emit({ type: 'basicAttackCountCharged', actorId });
      },
      onDamageApplied: (actor, target, amount, meta) => {
        this.handleDamageThreat(actor, target, amount, meta);
      },
      onDebuffApplied: (actor) => {
        applyThreatFromDebuffApply(actor);
      },
      onTargetReceivedDebuff: (target) => {
        this.handlePassiveDispelOnDebuffReceived(target);
      },
      onHealApplied: () => {
        this.refreshSelfHpRatioBuffAuras();
      },
      onUnitDied: (unit) => {
        clearPlayerRearAssaultAccess(unit);
        this.noteEnemyCorpseAnchor(unit);
      },
    });
    this.reloadBattlefield();
  }

  private handleDamageThreat(
    actor: CombatantState,
    target: CombatantState,
    amount: number,
    meta?: {
      attackKind: CounterAttackKind;
      isCounterDamage?: boolean;
      hpDamage?: number;
      attackRangePx?: number;
      didBlock?: boolean;
      threatBurstFlat?: number;
      threatBurstScale?: number;
      barrierHpBefore?: number;
      barrierDamage?: number;
    },
  ): void {
    applyThreatFromDamage(actor, target, amount);
    if (!actor.isEnemy && actor.isAlive && amount > 0) {
      applyThreatBurst(actor, amount, {
        threatBurstFlat: meta?.threatBurstFlat,
        threatBurstScale: meta?.threatBurstScale,
      });
    }
    if (!target.isEnemy && target.isAlive && amount > 0) {
      const targetPassives = getPassiveDefs(
        target,
        this.gameData.skillRegistry.passives,
      );
      applyThreatControlOnDamageTaken(target, amount, targetPassives);
      if (meta?.didBlock) {
        applyThreatControlOnBlock(target, targetPassives);
      }
    }
    if (amount > 0 && meta?.attackKind) {
      const counterCallbacks = {
        emit: (event: Parameters<BattleEventListener>[0]) => this.emit(event),
        getAllCombatants: () => [...this.players, ...this.enemies],
        onDamageApplied: (
          counterActor: CombatantState,
          counterTarget: CombatantState,
          counterAmount: number,
          counterMeta?: {
            attackKind: CounterAttackKind;
            isCounterDamage?: boolean;
            hpDamage?: number;
          },
        ) => {
          this.handleDamageThreat(
            counterActor,
            counterTarget,
            counterAmount,
            counterMeta,
          );
        },
        getSkillName: (skillId: string) =>
          this.gameData.skillRegistry.actives[skillId]?.name ??
          this.gameData.skillRegistry.passives[skillId]?.name ??
          "反撃",
        onUnitDied: (unit: CombatantState) => {
          clearPlayerRearAssaultAccess(unit);
          this.skillSequenceRunner.clearForActor(unit.id);
          this.noteEnemyCorpseAnchor(unit);
          this.emit({ type: "death", targetId: unit.id });
        },
        onDebuffApplied: (counterActor: CombatantState) => {
          applyThreatFromDebuffApply(counterActor);
        },
        onTargetReceivedDebuff: (debuffTarget: CombatantState) => {
          this.handlePassiveDispelOnDebuffReceived(debuffTarget);
        },
      };
      const counterCtx = {
        attackKind: meta.attackKind,
        appliedDamage: amount,
        isCounterDamage: meta.isCounterDamage,
        attackRangePx: meta.attackRangePx,
      };
      applyPassiveCounterRetaliation(
        target,
        actor,
        counterCtx,
        this.gameData.skillRegistry.passives,
        this.gameData.skillRegistry.actives,
        counterCallbacks,
      );
      applyCounterRetaliation(
        target,
        actor,
        counterCtx,
        this.gameData.skillRegistry.passives,
        this.gameData.skillRegistry.actives,
        counterCallbacks,
      );
    }
    if (
      !target.isEnemy &&
      target.isAlive &&
      (meta?.hpDamage ?? amount) > 0
    ) {
      const reservation = tryTriggerHealReservation(
        target,
        [...this.players, ...this.enemies],
        this.gameData.skillRegistry.passives,
      );
      if (reservation.healed > 0 && reservation.healerId) {
        this.refreshSelfHpRatioBuffAuras();
        this.emit({
          type: "skill",
          actorId: reservation.healerId,
          targetId: target.id,
          skillId: reservation.passiveId ?? "",
          skillName:
            reservation.buffDisplayName ??
            (reservation.passiveId
              ? this.gameData.skillRegistry.passives[reservation.passiveId]?.name
              : undefined) ??
            "癒しの残響",
          effect: "heal",
          amount: reservation.healed,
        });
        if (
          reservation.redirectTarget &&
          reservation.redirectHealed &&
          reservation.redirectHealed > 0
        ) {
          const healer = this.findCombatant(reservation.healerId);
          if (healer) {
            grantHealReservationStacks(
              healer,
              reservation.redirectTarget,
              reservation.redirectHpRatioBeforeHeal ??
                currentHpRatio(reservation.redirectTarget),
              this.gameData.skillRegistry.passives,
            );
          }
          this.emit({
            type: "skill",
            actorId: reservation.healerId,
            targetId: reservation.redirectTarget.id,
            skillId: reservation.passiveId ?? "",
            skillName:
              reservation.buffDisplayName ??
              (reservation.passiveId
                ? this.gameData.skillRegistry.passives[reservation.passiveId]
                    ?.name
                : undefined) ??
              "癒しの残響",
            effect: "heal",
            amount: reservation.redirectAmount ?? reservation.redirectHealed,
          });
        }
      }
    }
    if (
      !target.isEnemy &&
      target.isAlive &&
      meta?.barrierHpBefore !== undefined
    ) {
      const breakRegen = tryTriggerBarrierBreakRegen(
        target,
        meta.barrierHpBefore,
        meta.barrierDamage ?? 0,
        [...this.players, ...this.enemies],
        this.gameData.skillRegistry.passives,
      );
      if (breakRegen.granted > 0 && breakRegen.sourceId) {
        this.emit({
          type: "skill",
          actorId: breakRegen.sourceId,
          targetId: target.id,
          skillId: breakRegen.passiveId ?? "",
          skillName:
            (breakRegen.passiveId
              ? this.gameData.skillRegistry.passives[breakRegen.passiveId]?.name
              : undefined) ?? "",
          effect: "barrier",
          amount: breakRegen.granted,
        });
      }
      const depletionHeal = tryTriggerBarrierDepletionHeal(
        target,
        meta.barrierHpBefore,
        meta.barrierDamage ?? 0,
        [...this.players, ...this.enemies],
        this.gameData.skillRegistry.passives,
      );
      if (depletionHeal.healed > 0 && depletionHeal.sourceId) {
        this.emit({
          type: "skill",
          actorId: depletionHeal.sourceId,
          targetId: target.id,
          skillId: depletionHeal.passiveId ?? "",
          skillName:
            (depletionHeal.passiveId
              ? this.gameData.skillRegistry.passives[depletionHeal.passiveId]
                  ?.name
              : undefined) ?? "",
          effect: "heal",
          amount: depletionHeal.healed,
        });
      }
    }
    this.refreshSelfHpRatioBuffAuras();
    this.onDamageApplied?.(actor, target, amount);
  }

  private reloadBattlefield(): void {
    resetEntityIdCounter();
    this.trainingWaveReadyToEngage = false;
    this.pendingHitQueue = [];
    this.skillSequenceRunner.clearAll();
    this.battleTimeSec = 0;
    this.players = createAlliesFromPartyState(
      this.gameData,
      this.getParty(),
      this.levelCurves,
    );
    this.stageId = this.getStageId();
    const startWaveIndex = this.resolveStartWaveIndex();
    this.waveIndex = startWaveIndex;
    this.clearEngagedVisualState();
    this.victoryFormationReady = false;
    this.clearPendingVictory();
    this.clearPendingDefeat();
    this.clearPendingWaveAdvance();
    this.clearWaveAnnouncement();
    this.beginWaveAnnouncement(startWaveIndex);
    this.initBattlePassiveState();
  }

  private resolveStartWaveIndex(): number {
    const stage = this.gameData.stages.find((s) => s.id === this.stageId);
    const waveCount = stage?.waves.length ?? 0;
    if (waveCount === 0) return 0;

    const loopWave = this.getLoopWaveIndex?.() ?? null;
    if (loopWave === null) return 0;
    if (loopWave < 0 || loopWave >= waveCount) return 0;
    return loopWave;
  }

  private isPinnedWaveComplete(): boolean {
    const loopWave = this.getLoopWaveIndex?.() ?? null;
    return loopWave !== null && this.waveIndex === loopWave;
  }

  private refreshSelfHpRatioBuffAuras(): void {
    syncSelfHpRatioBuffAuras(
      this.players,
      this.enemies,
      this.gameData.skillRegistry.passives,
    );
    syncBloodlustDuelistAuras(
      [...this.players, ...this.enemies],
      this.gameData.skillRegistry.passives,
    );
    syncDuelistPrideAuras(
      [...this.players, ...this.enemies],
      this.gameData.skillRegistry.passives,
    );
  }

  private syncContinuousPassiveAuras(): void {
    const passives = this.gameData.skillRegistry.passives;
    syncHotAuras(this.players, this.enemies, passives, this.gameData);
    syncBuffAuras(this.players, this.enemies, passives, this.gameData);
    syncDebuffAuras(this.players, this.enemies, passives, this.gameData);
    syncDamageReductionAuras(this.players, this.enemies, passives, this.gameData);
    syncFrontThreatControlAuras(this.players, passives);
    syncFrontBlockAuras(this.players, passives);
    syncSelfHpRatioBuffAuras(this.players, this.enemies, passives);
    syncBloodlustDuelistAuras(
      [...this.players, ...this.enemies],
      passives,
    );
    syncDuelistPrideAuras([...this.players, ...this.enemies], passives);
    syncHerbalPotencyAuras(this.players, this.enemies, passives, this.gameData);
    for (const ally of this.players) {
      if (!ally.isAlive) continue;
      const config = resolveBlockResonanceConfigForUnit(ally, passives);
      if (config.maxStacks > 0) {
        syncBlockResonanceAuras(ally, config);
      }
    }
  }

  private handlePassiveDispelOnDebuffReceived(target: CombatantState): void {
    handlePassiveDispelOnDebuffReceived(
      target,
      this.players,
      this.enemies,
      this.gameData.skillRegistry.passives,
      this.gameData,
    );
  }

  private initBattlePassiveState(): void {
    const passives = this.gameData.skillRegistry.passives;
    const actives = this.gameData.skillRegistry.actives;
    initializeAllyThreat(this.players);
    applyFrontThreatFloor(this.players, passives);
    this.syncContinuousPassiveAuras();
    resetPassiveDispelTriggerLimits(
      [...this.players, ...this.enemies],
      passives,
    );
    initActiveStageTriggerLimits(
      [...this.players, ...this.enemies],
      actives,
    );
    firePeriodicPassivesForTrigger(
      'stageStart',
      [...this.players, ...this.enemies],
      this.players,
      this.enemies,
      passives,
      this.gameData,
    );
    for (const unit of [...this.players, ...this.enemies]) {
      initializeSkillCooldowns(unit, actives);
    }
  }

  private isOnBattlefield(ally: CombatantState): boolean {
    return ally.isAlive || ally.corpseVisible;
  }

  private getPlayerPlacementInputs() {
    return this.players
      .filter((a) => this.isOnBattlefield(a))
      .map((a) => ({
        id: a.id,
        role: a.role,
        formationRow: a.formationRow,
        rangePx: resolveFormationRangePx(a),
        damageType: a.traits.damageType,
        isAlive: a.isAlive,
      }));
  }


  private clampEnemyFieldOnScreen(battleX: number): number {
    if (battleX > BATTLE_CANVAS_W) return BATTLE_CANVAS_W;
    if (this.engaged && battleX <= -SPRITE_WIDTH) {
      return -SPRITE_WIDTH + 0.01;
    }
    return battleX;
  }

  private applyEnemyFieldFromBattle(): void {
    for (const enemy of this.enemies) {
      if (!enemy.isAlive) continue;
      enemy.battleX = this.clampEnemyFieldOnScreen(enemy.battleX);
      syncFieldX(enemy);
    }
  }

  private resetEnemyBattlePositions(): void {
    const targets = resolveEnemyDeployTargets(this.enemies);
    for (const enemy of this.enemies) {
      const x = targets.get(enemy.id);
      if (x !== undefined) {
        enemy.battleX = x;
      }
    }
  }

  private advanceWorldOffset(
    deltaTime: number,
    pxPerSec: number = MOVE_PX_PER_SEC,
  ): void {
    this.worldOffsetX += moveDeltaPx(pxPerSec, deltaTime);
  }

  private updateVictoryExitMarch(
    deltaTime: number,
    livingOnly = false,
  ): void {
    const step = moveDeltaPx(VICTORY_EXIT_PX_PER_SEC, deltaTime);
    this.advanceWorldOffset(deltaTime, VICTORY_EXIT_PX_PER_SEC);
    for (const ally of this.players) {
      if (livingOnly && !ally.isAlive) continue;
      ally.battleX += step;
      syncFieldX(ally);
    }
  }

  private hasFallenAllies(): boolean {
    return this.players.some((ally) => !ally.isAlive);
  }

  private areAlliesOffScreen(livingOnly = false): boolean {
    const allies = livingOnly
      ? this.players.filter((ally) => ally.isAlive)
      : this.players;
    if (allies.length === 0) return true;
    return allies.every((ally) => ally.battleX >= BATTLE_CANVAS_W);
  }

  private updateEngagedBattleMovement(deltaTime: number): void {
    const enemyContact = getEnemyContactX(this.enemies);
    const playerContact = getPlayerFrontlineContactX(this.players, this.enemies);
    if (enemyContact === null || playerContact === null) return;

    this.engagedFrontLineAnchor =
      this.engagedFrontLineAnchor === null
        ? playerContact
        : Math.max(this.engagedFrontLineAnchor, playerContact);

    const moveStep = moveDeltaPx(MOVE_PX_PER_SEC, deltaTime);
    const playerApproachTargets = resolveAllPlayerApproachBattleX(
      this.players,
      this.enemies,
      this.gameData,
    );

    for (const ally of this.players) {
      if (!ally.isAlive) continue;
      if (isUnitMovementBlocked(ally)) continue;
      if (this.skillSequenceRunner.isActorInSkillMotion(ally.id)) continue;
      if (
        shouldSkipEngagedAutoApproach(
          ally,
          this.players,
          this.enemies,
          this.gameData,
        )
      ) {
        continue;
      }
      const target = playerApproachTargets.get(ally.id);
      if (target === undefined) continue;
      updateUnitApproach(ally, target, moveStep);
    }

    for (const enemy of this.enemies) {
      if (!enemy.isAlive) continue;
      if (isUnitMovementBlocked(enemy)) continue;
      if (this.skillSequenceRunner.isActorInSkillMotion(enemy.id)) continue;
      if (
        shouldSkipEngagedAutoApproach(
          enemy,
          this.players,
          this.enemies,
          this.gameData,
        )
      ) {
        continue;
      }

      const target = capEngagedEnemyApproachBattleX(
        enemy,
        resolveEnemyApproachBattleX(
          enemy,
          this.players,
          this.enemies,
          this.gameData,
        ),
      );
      updateUnitApproach(enemy, target, moveStep);
    }
  }

  private clearEngagedVisualState(): void {
    this.engagedFrontLineAnchor = null;
    this.engagedComposition.clear();
    for (const unit of [...this.players, ...this.enemies]) {
      clearPlayerRearAssaultAccess(unit);
      unit.engagedBattleLaneX = undefined;
      unit.engagedMeleeDepthSlot = undefined;
      clearEngagedDisplayAnchor(unit);
      if (unit.isEnemy) {
        unit.corpseBattleAnchorX = undefined;
      }
    }
  }

  /** 接敵開始時: 進軍順（battleX）で近接敵の奥行きスロットを固定 */
  private freezeEngagedMeleeVisualSlots(): void {
    const melee = this.enemies
      .filter(
        (enemy) =>
          enemy.isAlive && isMeleeUnit(enemy, this.gameData),
      )
      .sort((a, b) => a.battleX - b.battleX);
    for (const enemy of this.enemies) {
      if (isMeleeUnit(enemy, this.gameData)) {
        enemy.engagedMeleeDepthSlot = undefined;
      }
    }
    melee.forEach((enemy, slot) => {
      enemy.engagedMeleeDepthSlot = slot;
    });
  }

  private buildEngagedLayoutContext() {
    const enemyContact = getEnemyContactX(this.enemies);
    const playerContact = getPlayerFrontlineContactX(this.players, this.enemies);
    if (enemyContact === null || playerContact === null) return null;

    const engageAnchor = resolveEngagePlayerBattleAnchor(
      this.players
        .filter((ally) => this.isOnBattlefield(ally))
        .map((ally) => ({
          id: ally.id,
          role: ally.role,
          formationRow: ally.formationRow,
          rangePx: resolveFormationRangePx(ally),
          isAlive: ally.isAlive,
        })),
      enemyContact,
    );

    return {
      players: this.players
        .filter((ally) => this.isOnBattlefield(ally))
        .map((ally) => ({
          id: ally.id,
          role: ally.role,
          formationRow: ally.formationRow,
          rangePx: resolveFormationRangePx(ally),
          isAlive: ally.isAlive,
          battleX: ally.battleX,
        })),
      enemies: this.enemies.map((enemy) => ({
        id: enemy.id,
        isAlive: enemy.isAlive,
        rangePx: resolveMaxEffectiveRangePx(enemy, this.gameData),
        battleX: enemy.battleX,
        engagedMeleeDepthSlot: enemy.engagedMeleeDepthSlot,
      })),
      playerContactBattleX:
        this.engagedFrontLineAnchor ?? playerContact,
      battleOffset: 0,
      frontEnemyBattleAnchor: engageAnchor,
      resolveRangedTargetBattleX: (enemyId: string) => {
        const enemy = this.enemies.find((unit) => unit.id === enemyId);
        if (!enemy) return null;
        const target = this.resolveEngagedRangedTargetPlayer(enemy);
        return target?.battleX ?? null;
      },
    };
  }

  /** 非接敵配置確定時のみ（訓練 bake 等。A-L1-01 カウンタ対象） */
  private resolveEngagedLayoutForEvent(): EngagedLayoutResult | null {
    const ctx = this.buildEngagedLayoutContext();
    if (ctx === null) return null;
    return resolveEngagedLayout(ctx);
  }

  private applyEngagedFormationLayout(
    layout: EngagedLayoutResult,
    scope?: { players?: boolean; enemies?: boolean },
  ): void {
    applyEngagedFormationToBattleX(this.players, this.enemies, layout, {
      isOnField: (unit) => this.isOnBattlefield(unit),
      players: scope?.players,
      enemies: scope?.enemies,
    });
  }

  private resolveEngagedRangedTargetPlayer(
    enemy: CombatantState,
  ): CombatantState | undefined {
    const frozenId = getEngagedDisplayAnchorPlayerId(enemy);
    let target = frozenId
      ? this.players.find((ally) => ally.id === frozenId && ally.isAlive)
      : undefined;
    if (!target) {
      target =
        resolveEnemyAttackTargetPlayer(
          enemy,
          this.players,
          this.enemies,
          this.gameData,
        ) ??
        resolveEnemyChaseTargetPlayer(
          enemy,
          this.players,
          this.enemies,
          this.gameData,
        ) ??
        undefined;
      if (target) {
        setEngagedDisplayAnchorPlayerId(enemy, target.id);
      }
    }
    return target;
  }

  /**
 * layout bake のタイミング: しない
 * 実装箇所: setupEngagedCombat（凍結・署名のみ）
 */
  private setupEngagedCombat(): void {
    const placementInputs = this.getPlayerPlacementInputs().filter((p) => p.isAlive);
    const leadingRow = getLeadingPlayerFormationRow(placementInputs);

    this.freezeEngagedMeleeVisualSlots();
    this.engagedComposition.freezeRangedTargets(
      this.players,
      this.enemies,
      this.gameData,
    );

    this.engagedComposition.initSignatures(
      this.players,
      this.enemies,
      leadingRow,
      this.gameData,
    );
  }

  private noteEnemyCorpseAnchor(unit: CombatantState): void {
    if (unit.isEnemy) {
      freezeEnemyCorpseBattleAnchor(unit);
    }
  }

  /**
 * layout bake のタイミング: しない（Engaged 中）
 * 実装箇所: maybeRecomputeEngagedLayout — 署名・凍結・表示 target のみ更新
 */
  private maybeRecomputeEngagedLayout(): void {
    const placementInputs = this.getPlayerPlacementInputs().filter((p) => p.isAlive);
    const leadingRow = getLeadingPlayerFormationRow(placementInputs);
    const meleeChanged = this.engagedComposition.consumeMeleeCompositionChange(
      this.enemies,
      this.gameData,
    );
    const leadingChanged =
      this.engagedComposition.consumeLeadingRowCompositionChange(
        this.players,
        leadingRow,
      );
    if (!meleeChanged && !leadingChanged) return;

    if (meleeChanged) {
      this.freezeEngagedMeleeVisualSlots();
    }

    this.engagedComposition.freezeRangedTargets(
      this.players,
      this.enemies,
      this.gameData,
    );
  }

  private clearPendingVictory(): void {
    this.pendingVictoryTimer = 0;
    this.pendingVictorySurvivors = null;
  }

  private clearPendingDefeat(): void {
    this.pendingDefeatTimer = 0;
    this.pendingDefeatSurvivors = null;
  }

  private clearPendingWaveAdvance(): void {
    this.waveAdvanceDelayTimer = 0;
    this.pendingNextWaveIndex = null;
    this.waveExitMarchActive = false;
    this.partyDeployActive = false;
    this.partyDeployPrepared = false;
    this.partyDeploySettled = false;
    this.partyDeployTargets.clear();
    this.enemyDeployTargets.clear();
    this.clearWaveAnnouncement();
  }

  private clearWaveAnnouncement(): void {
    this.waveAnnouncementActive = false;
    this.waveAnnouncementElapsedMs = 0;
    this.postAnnouncementEngageDelaySec = null;
    this.postDeploySettleDelaySec = null;
    this.partyDeployPrepared = false;
  }

  private isWaveStartPhase(): boolean {
    return (
      this.partyDeployPrepared ||
      this.partyDeployActive ||
      (this.partyDeploySettled && !this.engaged)
    );
  }

  private isWaveEndPhase(): boolean {
    return (
      this.isPostCombatSettling() ||
      this.waveExitMarchActive
    );
  }

  private buildFireGateContext(
    actor: CombatantState,
    skill: import("./types.ts").ActiveSkillDef,
    cd?: SkillCooldown,
  ): FireGateContext {
    const stage = this.gameData.stages.find((s) => s.id === this.stageId);
    const waveCount = stage?.waves.length ?? 1;
    return {
      actor,
      allies: this.players,
      enemies: this.enemies,
      skill,
      passives: getPassiveDefs(
        actor,
        this.gameData.skillRegistry.passives,
      ),
      gameData: this.gameData,
      battleTimeSec: this.battleTimeSec,
      cd,
      isWaveStartPhase: this.isWaveStartPhase(),
      isWaveEndPhase: this.isWaveEndPhase(),
      pendingHitQueue: this.pendingHitQueue,
      waveIndex: this.waveIndex,
      waveCount,
    };
  }

  private shouldSuppressCombatSkills(): boolean {
    return (
      this.waveAnnouncementActive ||
      this.partyDeployActive ||
      (this.partyDeploySettled && !this.engaged) ||
      this.waveExitMarchActive ||
      this.waveAdvanceDelayTimer > 0 ||
      this.pendingVictoryTimer > 0
    );
  }

  private isPostCombatSettling(): boolean {
    return this.waveAdvanceDelayTimer > 0 || this.pendingVictoryTimer > 0;
  }

  /** 敵全滅後: 死亡演出待ち → 次 Wave は右退場 → PartyDeploy */
  private tickPostCombatSettle(deltaTime: number): void {
    syncDeadEnemyCorpseBattleX(this.enemies);
    if (this.waveAdvanceDelayTimer > 0) {
      this.waveAdvanceDelayTimer -= deltaTime;
      if (this.waveAdvanceDelayTimer <= 0) {
        if (this.pendingNextWaveIndex !== null) {
          this.waveExitMarchActive = true;
        }
      }
      return;
    }

    if (this.pendingVictoryTimer > 0) {
      this.pendingVictoryTimer -= deltaTime;
      if (this.pendingVictoryTimer <= 0) {
        this.applyVictoryTransition(this.pendingVictorySurvivors ?? []);
        this.pendingVictorySurvivors = null;
      }
    }
  }

  private beginEnemyWipeSettle(hasNextWave: boolean): void {
    if (this.partyDeployActive) return;
    if (this.waveAnnouncementActive) return;
    if (this.partyDeploySettled && !this.engaged) return;
    if (this.enemies.some((enemy) => enemy.isAlive)) return;
    syncDeadEnemyCorpseBattleX(this.enemies);
    this.engaged = false;
    this.clearEngagedVisualState();
    this.skillSequenceRunner.clearAll();
    if (hasNextWave) {
      this.waveAdvanceDelayTimer = ENEMY_DEATH_SETTLE_DELAY_SEC;
    } else {
      this.pendingVictoryTimer = ENEMY_DEATH_SETTLE_DELAY_SEC;
    }
  }

  /** 次 Wave 前: Victory と同様の右退場 → 完了後に Wave 告知 */
  private tickWaveExitMarch(deltaTime: number): void {
    syncDeadEnemyCorpseBattleX(this.enemies);
    this.updateVictoryExitMarch(deltaTime, true);
    if (!this.areAlliesOffScreen(true)) return;

    this.waveExitMarchActive = false;
    const waveIndex = this.pendingNextWaveIndex;
    if (waveIndex !== null) {
      this.beginWaveAnnouncement(waveIndex);
    }
  }

  /**
 * layout bake のタイミング: する
 * 実装箇所: prepareTrainingWave → resolveEngagedLayoutForEvent + applyEngagedFormationLayout
 */
  private prepareTrainingWave(waveIndex: number): void {
    this.waveIndex = waveIndex;
    this.waveAnnouncementActive = false;
    this.waveAnnouncementElapsedMs = 0;
    this.postAnnouncementEngageDelaySec = null;
    this.postDeploySettleDelaySec = null;
    this.partyDeployPrepared = false;
    this.partyDeployActive = false;
    this.partyDeploySettled = false;
    this.partyDeployTargets.clear();
    this.enemyDeployTargets.clear();
    this.pendingNextWaveIndex = null;
    this.engaged = false;
    this.clearEngagedVisualState();
    hideFallenAllyCorpses(this.players);
    this.spawnWaveEnemies();
    const partyTargets = resolvePartyDeployTargets(this.players);
    const enemyTargets = resolveEnemyDeployTargets(this.enemies);
    this.applyDeployTargetsToUnits(partyTargets, enemyTargets);
    const layout = this.resolveEngagedLayoutForEvent();
    if (layout !== null) {
      this.applyEngagedFormationLayout(layout);
      syncAllFieldX([...this.players, ...this.enemies]);
    }
    resetPassiveDispelTriggerLimits(
      [...this.players, ...this.enemies],
      this.gameData.skillRegistry.passives,
    );
    resetPerWaveCombatantFlags(this.players);
    resetLowHpCoverRedirects(this.players, this.gameData.skillRegistry.passives);
    firePeriodicPassivesForTrigger(
      'waveStart',
      [...this.players, ...this.enemies],
      this.players,
      this.enemies,
      this.gameData.skillRegistry.passives,
      this.gameData,
    );
    this.trainingWaveReadyToEngage = true;
    this.tryBeginTrainingEngage();
  }

  private tryBeginTrainingEngage(): void {
    if (!this.trainingWaveReadyToEngage || this.engaged) return;
    if (this.phase !== 'running') return;
    this.trainingWaveReadyToEngage = false;
    this.beginEngaged();
  }

  /** Wave 告知 + PartyDeploy 同時開始 */
  private beginWaveAnnouncement(waveIndex: number): void {
    if (waveHasTrainingDummy(this.gameData, this.stageId, waveIndex)) {
      this.prepareTrainingWave(waveIndex);
      return;
    }
    this.waveIndex = waveIndex;
    this.waveAnnouncementActive = true;
    this.waveAnnouncementElapsedMs = 0;
    this.postAnnouncementEngageDelaySec = null;
    this.postDeploySettleDelaySec = null;
    this.partyDeploySettled = false;
    this.engaged = false;
    this.clearEngagedVisualState();
    this.prepareWaveDeploy(waveIndex);
  }

  private tickWaveAnnouncement(deltaTime: number): void {
    if (!this.waveAnnouncementActive) return;
    const prevMs = this.waveAnnouncementElapsedMs;
    this.waveAnnouncementElapsedMs += deltaTime * 1000;
    if (prevMs <= 0 && this.waveAnnouncementElapsedMs > 0) {
      this.tryStartPartyDeployMovement();
    }
    if (
      prevMs < ANNOUNCEMENT_FADE_OUT_START_MS &&
      this.waveAnnouncementElapsedMs >= ANNOUNCEMENT_FADE_OUT_START_MS
    ) {
      this.postAnnouncementEngageDelaySec = POST_ANNOUNCEMENT_ENGAGE_DELAY_SEC;
    }
    if (this.waveAnnouncementElapsedMs >= ANNOUNCEMENT_TOTAL_MS) {
      this.waveAnnouncementActive = false;
      this.waveAnnouncementElapsedMs = ANNOUNCEMENT_TOTAL_MS;
    }
  }

  /** Wave オーバーレイ表示開始と同時に PartyDeploy 移動を開始 */
  private tryStartPartyDeployMovement(): void {
    if (!this.partyDeployPrepared || this.partyDeployActive || this.partyDeploySettled) {
      return;
    }
    if (this.waveAnnouncementElapsedMs <= 0) return;
    this.partyDeployActive = true;
  }

  private tickPostAnnouncementEngageDelay(deltaTime: number): void {
    if (this.postAnnouncementEngageDelaySec !== null && this.postAnnouncementEngageDelaySec > 0) {
      this.postAnnouncementEngageDelaySec -= deltaTime;
      if (this.postAnnouncementEngageDelaySec < 0) {
        this.postAnnouncementEngageDelaySec = 0;
      }
    }
    if (this.postDeploySettleDelaySec !== null && this.postDeploySettleDelaySec > 0) {
      this.postDeploySettleDelaySec -= deltaTime;
      if (this.postDeploySettleDelaySec < 0) {
        this.postDeploySettleDelaySec = 0;
      }
    }
    this.tryCompleteWaveStart();
  }

  private tryCompleteWaveStart(): void {
    if (!this.partyDeploySettled || this.engaged) return;
    if (this.postAnnouncementEngageDelaySec === null) return;
    if (this.postAnnouncementEngageDelaySec > 0) return;
    if (this.postDeploySettleDelaySec === null) return;
    if (this.postDeploySettleDelaySec > 0) return;
    this.beginEngaged();
  }

  /** PartyDeploy 目標: 味方=隊形アンカー、敵=spawn（接敵は告知終了後に自動接近） */
  private resolveWaveDeployTargetMaps(): {
    partyDeployTargets: Map<string, number>;
    enemyDeployTargets: Map<string, number>;
  } {
    return {
      partyDeployTargets: resolvePartyDeployTargets(this.players),
      enemyDeployTargets: resolveEnemyDeployTargets(this.enemies),
    };
  }

  private applyDeployTargetsToUnits(
    partyDeployTargets: Map<string, number>,
    enemyDeployTargets: Map<string, number>,
  ): void {
    for (const ally of this.players) {
      if (!ally.isAlive) continue;
      const x = partyDeployTargets.get(ally.id);
      if (x === undefined) continue;
      ally.battleX = x;
      syncFieldX(ally);
    }
    for (const enemy of this.enemies) {
      if (!enemy.isAlive) continue;
      const x = enemyDeployTargets.get(enemy.id);
      if (x === undefined) continue;
      enemy.battleX = x;
      syncFieldX(enemy);
    }
  }

  /** Wave 開始: 敵 spawn + 味方・敵を画面外から配置 */
  private prepareWaveDeploy(waveIndex: number): void {
    hideFallenAllyCorpses(this.players);
    this.waveIndex = waveIndex;
    this.pendingNextWaveIndex = null;
    this.engaged = false;
    this.clearEngagedVisualState();
    this.spawnWaveEnemies();
    resetPassiveDispelTriggerLimits(
      [...this.players, ...this.enemies],
      this.gameData.skillRegistry.passives,
    );
    resetPerWaveCombatantFlags(this.players);
    resetLowHpCoverRedirects(this.players, this.gameData.skillRegistry.passives);
    firePeriodicPassivesForTrigger(
      'waveStart',
      [...this.players, ...this.enemies],
      this.players,
      this.enemies,
      this.gameData.skillRegistry.passives,
      this.gameData,
    );
    const deployTargets = this.resolveWaveDeployTargetMaps();
    this.partyDeployTargets = deployTargets.partyDeployTargets;
    this.enemyDeployTargets = deployTargets.enemyDeployTargets;
    placePartyOffScreenForDeploy(this.players, this.partyDeployTargets);
    placeEnemiesOffScreenForDeploy(this.enemies, this.enemyDeployTargets);
    this.partyDeployPrepared = true;
    this.partyDeployActive = false;
    this.partyDeploySettled = false;
    this.tryStartPartyDeployMovement();
  }

  private tickPartyDeploy(deltaTime: number): void {
    const step = moveDeltaPx(MOVE_PX_PER_SEC, deltaTime);
    let allSettled = true;
    for (const ally of this.players) {
      if (!ally.isAlive) continue;
      const target = this.partyDeployTargets.get(ally.id);
      if (target === undefined) continue;
      updateUnitApproach(ally, target, step);
      syncFieldX(ally);
      if (Math.abs(ally.battleX - target) > BODY_ANIM_APPROACH_SETTLED_PX) {
        allSettled = false;
      }
    }
    for (const enemy of this.enemies) {
      if (!enemy.isAlive) continue;
      const target = this.enemyDeployTargets.get(enemy.id);
      if (target === undefined) continue;
      updateUnitApproach(enemy, target, step);
      syncFieldX(enemy);
      if (Math.abs(enemy.battleX - target) > BODY_ANIM_APPROACH_SETTLED_PX) {
        allSettled = false;
      }
    }
    if (allSettled) {
      this.partyDeployActive = false;
      this.partyDeploySettled = true;
      if (this.postDeploySettleDelaySec === null) {
        this.postDeploySettleDelaySec = POST_DEPLOY_SETTLE_DELAY_SEC;
      }
      this.tryCompleteWaveStart();
    }
  }

  private tryAutoFireFinalWaveStageSkills(): void {
    const stage = this.gameData.stages.find((s) => s.id === this.stageId);
    const waveCount = stage?.waves.length ?? 1;
    if (this.waveIndex !== waveCount - 1) return;

    const actives = this.gameData.skillRegistry.actives;
    for (const ally of this.players) {
      if (!ally.isAlive) continue;
      for (const cd of ally.cooldowns) {
        if (cd.slotKind !== 'active') continue;
        const skill = actives[cd.skillId];
        if (!skill) continue;
        if (!skill.fireConditions?.some((c) => c.kind === 'finalWaveStart')) {
          continue;
        }
        if (!hasActiveStageTriggerRemaining(ally, skill)) continue;
        forceActiveCooldownReady(cd);
        this.executor.tryExecute(ally, cd, this.players, this.enemies);
      }
    }
  }

  private handleLastStandGutsEnd(unit: CombatantState): void {
    const config = resolveLastStandGutsEndConfig(
      unit,
      this.gameData.skillRegistry.passives,
    );
    if (!config) return;
    applyLastStandGutsEndEffects(
      unit,
      this.enemies,
      config.endStunSec,
      config.endKnockbackPx,
    );
  }

  private beginEngaged(): void {
    this.partyDeployActive = false;
    this.partyDeployPrepared = false;
    this.partyDeploySettled = false;
    this.partyDeployTargets.clear();
    this.enemyDeployTargets.clear();
    this.postAnnouncementEngageDelaySec = null;
    this.postDeploySettleDelaySec = null;
    this.engaged = true;
    this.setupEngagedCombat();
    this.tryAutoFireFinalWaveStageSkills();
    if (!this.enemies.some((enemy) => enemy.isAlive)) {
      this.checkBattleEnd();
    }
  }

  private spawnWaveEnemies(): void {
    this.enemies = createEnemiesForStage(
      this.gameData,
      this.stageId,
      this.waveIndex,
    );
    this.resetEnemyBattlePositions();
    this.applyEnemyFieldFromBattle();
    const actives = this.gameData.skillRegistry.actives;
    for (const enemy of this.enemies) {
      initializeSkillCooldowns(enemy, actives);
    }
  }

  private applyVictoryTransition(survivingPartyIndices: number[]): void {
    this.partyDeployActive = false;
    this.partyDeploySettled = false;
    this.partyDeployTargets.clear();
    this.enemyDeployTargets.clear();
    syncAllFieldX(this.players);
    this.phase = "victory";
    this.engaged = false;
    this.clearEngagedVisualState();
    this.clearPendingWaveAdvance();
    this.victoryFormationReady = true;
    this.restartTimer = RESTART_DELAY_SEC;
    this.emit({
      type: "battleEnd",
      result: "victory",
      survivingPartyIndices,
    });
  }

  private applyDefeatTransition(survivingPartyIndices: number[]): void {
    this.phase = "defeat";
    this.engaged = false;
    this.clearEngagedVisualState();
    this.clearPendingWaveAdvance();
    hideFallenAllyCorpses(this.players);
    this.restartTimer = RESTART_DELAY_SEC;
    this.emit({
      type: "battleEnd",
      result: "defeat",
      survivingPartyIndices,
    });
  }

  onEvent(listener: BattleEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: Parameters<BattleEventListener>[0]): void {
    if (event.type === "hurt") {
      this.tickCountTriggers(event.targetId, "hitsTaken");
    }
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  startBattle(): void {
    this.phase = "running";
    this.restartTimer = 0;
    this.tryBeginTrainingEngage();
  }

  restartBattle(): void {
    this.engaged = false;
    this.clearPendingVictory();
    this.clearPendingDefeat();
    this.clearPendingWaveAdvance();
    this.reloadBattlefield();
    this.worldOffsetX = 0;
    this.restartTimer = 0;
    this.phase = "running";
    this.tryBeginTrainingEngage();
  }

  syncPartyBuilds(): void {
    if (this.phase !== "running") return;

    const party = this.getParty();
    for (const ally of this.players) {
      const slotIndex = ally.partySlotIndex;
      if (slotIndex === undefined) continue;
      const member = party[slotIndex];
      if (!member) continue;

      const preset = this.gameData.classRegistry[member.classId];
      if (!preset) continue;

      ally.build = structuredClone(member.build);
      const activeSkillIds = resolveBattleActiveSkillIdsForMember(
        member,
        this.gameData,
      );
      ally.cooldowns = createCooldowns(
        preset.basicAttackSkillId,
        member.build,
        activeSkillIds,
      );
      initializeSkillCooldowns(ally, this.gameData.skillRegistry.actives);
    }
  }

  stopBattle(): void {
    this.phase = "idle";
  }

  getSnapshot(): BattleSnapshot {
    const stage = this.gameData.stages.find((s) => s.id === this.stageId);
    const waveCount = stage?.waves.length ?? 1;
    const victoryAwaitExitMarch =
      this.phase === "victory" && !this.hasFallenAllies();
    return {
      phase: this.phase,
      runtimePhase: resolveRuntimeBattlePhase({
        phase: this.phase,
        engaged: this.engaged,
        waveAnnouncementActive: this.waveAnnouncementActive,
        partyDeployActive: this.partyDeployActive,
        postCombatSettling: this.isPostCombatSettling(),
        waveExitMarchActive: this.waveExitMarchActive,
        victoryAwaitExitMarch,
      }),
      engaged: this.engaged,
      waveIndex: this.waveIndex,
      waveCount,
      worldOffsetX: this.worldOffsetX,
      waveAnnouncementActive: this.waveAnnouncementActive,
      waveAnnouncementElapsedMs: this.waveAnnouncementElapsedMs,
      partyDeployActive: this.partyDeployActive,
      partyDeploySettled: this.partyDeploySettled,
      formationResetActive: false,
      alliesOffScreen: this.areAlliesOffScreen(this.waveExitMarchActive),
      victoryUseTimerFade: this.phase === "victory",
      victoryAwaitExitMarch,
      players: this.players.map((c) => this.toSnapshot(c)),
      allies: this.players.map((c) => this.toSnapshot(c)),
      enemies: this.enemies.map((c) => this.toSnapshot(c)),
    };
  }

  private buildBodyAnimMarchingContext(): BodyAnimMarchingContext {
    return {
      phase: this.phase,
      engaged: this.engaged,
      partyDeployActive: this.partyDeployActive,
      partyDeploySettled: this.partyDeploySettled,
      waveExitMarchActive: this.waveExitMarchActive,
      victoryExitMarchActive:
        this.phase === 'victory' &&
        !this.hasFallenAllies() &&
        !this.areAlliesOffScreen(),
      partyDeployTargets: this.partyDeployTargets,
      enemyDeployTargets: this.enemyDeployTargets,
      players: this.players,
      enemies: this.enemies,
      gameData: this.gameData,
      isActorInSkillMotion: (actorId) =>
        this.skillSequenceRunner.isActorInSkillMotion(actorId),
    };
  }

  private resolveBodyAnimMarching(unit: CombatantState): boolean {
    return resolveCombatantBodyAnimMarching(
      unit,
      this.buildBodyAnimMarchingContext(),
    );
  }

  private toSnapshot(c: CombatantState) {
    return {
      id: c.id,
      name: c.name,
      hp: c.hp,
      maxHp: getEffectiveMaxHp(c),
      barrierHp: c.barrierHp,
      atk: c.atk,
      def: c.def,
      reg: c.reg,
      role: c.isEnemy ? undefined : c.role,
      rangePx: c.traits.rangePx,
      effectiveRangePx: resolveMaxEffectiveRangePx(c, this.gameData),
      damageType: c.traits.damageType,
      basicAttackVfx: c.traits.basicAttackVfx,
      spriteKey: c.spriteKey,
      iconKey: c.iconKey,
      formationRow: c.formationRow,
      isEnemy: c.isEnemy,
      battleX: c.battleX,
      visualX: c.battleX,
      bodyAnimMarching: this.resolveBodyAnimMarching(c),
      corpseVisible: c.isEnemy ? undefined : c.corpseVisible,
      ...(c.isEnemy
        ? {}
        : {
            threat: c.threat,
            baseThreat: c.baseThreat,
            partySlotIndex: c.partySlotIndex,
            useLocked: this.skillSequenceRunner.isActorUseLocked(c.id),
          }),
      statusEffects: c.statusEffects.map((effect) => ({ ...effect })),
      activeCooldowns: c.cooldowns
        .filter((cd) => cd.slotKind === "active")
        .map((cd) => {
          const skill = this.gameData.skillRegistry.actives[cd.skillId];
          const trigger = skill
            ? resolveSkillTrigger(skill)
            : { kind: "time" as const, value: 1 };
          const slotIndex = cd.slotIndex ?? 0;
          const effectGauge = c.isEnemy
            ? undefined
            : this.skillSequenceRunner.getActiveEffectGauge(c.id, slotIndex);
          const passives = c.isEnemy
            ? []
            : getPassiveDefs(c, this.gameData.skillRegistry.passives);
          const maxCharges = skill
            ? resolveEffectiveMaxCharges(
                skill,
                passives,
                c.build.learnedActiveIds,
              )
            : 0;
          const stageTriggerExhausted =
            skill !== undefined &&
            !c.isEnemy &&
            skill.stageTriggerLimit !== undefined &&
            !hasActiveStageTriggerRemaining(c, skill);
          const fireGateCtx =
            skill && !c.isEnemy && !stageTriggerExhausted
              ? this.buildFireGateContext(c, skill, cd)
              : null;
          return {
            skillId: cd.skillId,
            remaining: cd.remaining,
            triggerKind: trigger.kind,
            triggerValue: trigger.value,
            slotIndex,
            storedCharges: cd.storedCharges ?? 0,
            maxCharges,
            fireHold: fireGateCtx ? isActiveFireHold(fireGateCtx) : false,
            ...(stageTriggerExhausted ? { stageTriggerExhausted: true } : {}),
            ...(effectGauge
              ? {
                  activeEffectRemaining: effectGauge.remainingSec,
                  activeEffectTotal: effectGauge.totalSec,
                }
              : {}),
          };
        }),
    };
  }

  tick(deltaTime: number): void {
    if (this.phase === "running") {
      this.tickRunning(deltaTime);
      return;
    }
    if (this.phase === "victory" || this.phase === "defeat") {
      this.restartTimer -= deltaTime;
      if (this.phase === "victory" && !this.hasFallenAllies()) {
        if (!this.victoryFormationReady) {
          this.victoryFormationReady = true;
        }
        this.updateVictoryExitMarch(deltaTime);
      }
      const readyToRespawn =
        this.restartTimer <= 0 &&
        (this.phase === "defeat" ||
          (this.phase === "victory" && this.hasFallenAllies()) ||
          this.areAlliesOffScreen());
      if (readyToRespawn) {
        this.respawnAfterEnd();
      }
    }
  }

  private tickRunning(deltaTime: number): void {
    this.battleTimeSec += deltaTime;
    if (this.waveAnnouncementActive) {
      this.tickWaveAnnouncement(deltaTime);
    }
    if (!this.shouldSuppressCombatSkills()) {
      this.tickSkillSequences(deltaTime);
    }
    if (this.pendingVictoryTimer > 0) {
      this.tickPostCombatSettle(deltaTime);
      this.tickStatusAndCooldowns(deltaTime);
      return;
    }
    if (this.pendingDefeatTimer > 0) {
      this.pendingDefeatTimer -= deltaTime;
      this.tickStatusAndCooldowns(deltaTime);
      if (this.pendingDefeatTimer <= 0) {
        this.applyDefeatTransition(this.pendingDefeatSurvivors ?? []);
        this.pendingDefeatSurvivors = null;
      }
      return;
    }
    if (this.isPostCombatSettling()) {
      this.tickPostCombatSettle(deltaTime);
      this.tickStatusAndCooldowns(deltaTime);
      syncDeadEnemyCorpseBattleX(this.enemies);
      return;
    }
    if (this.waveExitMarchActive) {
      this.tickWaveExitMarch(deltaTime);
      this.tickStatusAndCooldowns(deltaTime);
      return;
    }
    if (
      this.waveAnnouncementActive ||
      this.partyDeployActive ||
      (this.partyDeploySettled && !this.engaged)
    ) {
      if (this.partyDeployActive) {
        this.tickPartyDeploy(deltaTime);
      }
      this.tickPostAnnouncementEngageDelay(deltaTime);
      this.tickStatusAndCooldowns(deltaTime);
      return;
    }
    if (this.engaged) {
      if (!this.enemies.some((enemy) => enemy.isAlive)) {
        this.checkBattleEnd();
        if (this.isPostCombatSettling()) {
          this.tickPostCombatSettle(deltaTime);
          this.tickStatusAndCooldowns(deltaTime);
        }
        return;
      }
      this.updateEngagedBattleMovement(deltaTime);
      this.maybeRecomputeEngagedLayout();
      this.tickStatusAndCooldowns(deltaTime);
      this.runUnitSkills(this.enemies);
      this.runUnitSkills(this.players);
      this.tickPendingHitQueue();
      const leadingRowInputs = this.getPlayerPlacementInputs().filter(
        (p) => p.isAlive,
      );
      const engagedLeadingRow =
        getLeadingPlayerFormationRow(leadingRowInputs);
      resolveEngagedFormationOverlaps(
        this.players,
        engagedLeadingRow,
        (unit) => this.isOnBattlefield(unit),
        (id) => this.skillSequenceRunner.isActorInSkillMotion(id),
      );
      syncAllFieldX([...this.players, ...this.enemies]);
      syncDeadEnemyCorpseBattleX(this.enemies);
      this.tickAllyThreat(deltaTime);
      this.checkBattleEnd();
    }
  }

  /** DoT/HoT・バフ/デバフ持続・CD を接敵状態に関係なく進める */
  private tickStatusAndCooldowns(deltaTime: number): void {
    this.tickStatusEffects(deltaTime);
    tickHerbalPotencyAccumulation(
      this.players,
      this.gameData.skillRegistry.passives,
      deltaTime,
    );
    const passives = this.gameData.skillRegistry.passives;
    for (const ally of this.players) {
      if (!ally.isAlive) continue;
      const config = resolveBlockResonanceConfigForUnit(ally, passives);
      if (config.maxStacks > 0) {
        tickBlockResonanceDecay(ally, deltaTime, config);
      }
    }
    this.syncContinuousPassiveAuras();
    this.tickCooldowns(this.players, deltaTime);
    this.tickCooldowns(this.enemies, deltaTime);
  }

  private tickAllyThreat(deltaTime: number): void {
    const passivesRegistry = this.gameData.skillRegistry.passives;
    refreshAlliesBaseThreat(this.players);
    for (const ally of this.players) {
      const ownPassives = getPassiveDefs(ally, passivesRegistry);
      const decayMultiplier = resolveAllyThreatDecayMultiplier(
        ally,
        this.players,
        passivesRegistry,
        ownPassives,
      );
      tickAllyThreatDecay(ally, deltaTime, decayMultiplier);
    }
    applyFrontThreatFloor(this.players, passivesRegistry);
  }

  private tickPendingHitQueue(): void {
    this.pendingHitQueue = tickPendingHits(
      this.pendingHitQueue,
      this.battleTimeSec,
      (hit) => this.executor.applyPendingHit(hit),
    );
  }

  private tickSkillSequences(deltaTime: number): void {
    const units = [...this.players, ...this.enemies];
    this.skillSequenceRunner.tickUseLocks(deltaTime);
    this.skillSequenceRunner.tickAnimLocks(deltaTime);
    this.skillSequenceRunner.tickActiveEffectGauges(deltaTime);
    this.skillSequenceRunner.tickMoves(deltaTime, units);
    this.skillSequenceRunner.tickSequences(
      this.battleTimeSec,
      (step) => {
        this.executor.applyScheduledStep(step, this.players, this.enemies);
      },
      (actorId) => {
        const unit = this.findCombatant(actorId);
        if (unit) clearPlayerRearAssaultAccess(unit);
      },
    );
  }

  private tickStatusEffects(deltaTime: number): void {
    for (const unit of [...this.players, ...this.enemies]) {
      const kept: StatusEffect[] = [];

      for (const effect of unit.statusEffects) {
        const wasActive = effect.remainingSec > 0;
        effect.remainingSec -= deltaTime;
        if (effect.remainingSec <= 0) {
          if (
            wasActive &&
            effect.overlay === LAST_STAND_GUTS_OVERLAY &&
            unit.isAlive
          ) {
            this.handleLastStandGutsEnd(unit);
          }
          if (
            wasActive &&
            effect.overlay === ARENA_DOMINANCE_OVERLAY &&
            unit.isAlive
          ) {
            handleArenaDominanceEnd(this.enemies);
          }
          continue;
        }

        if (
          unit.isAlive &&
          (effect.overlay === "hot" || effect.overlay === "dot") &&
          effect.sourceId &&
          (effect.amount !== undefined || effect.powerMultiplier !== undefined)
        ) {
          if (effect.tickSec === undefined) {
            effect.tickSec = OVERLAY_TICK_SEC;
          }
          effect.tickSec -= deltaTime;
          while (
            effect.tickSec <= 0 &&
            effect.remainingSec > 0 &&
            unit.isAlive
          ) {
            this.applyOverlayTick(unit, effect);
            effect.tickSec += OVERLAY_TICK_SEC;
          }
        }

        if (effect.remainingSec > 0) {
          kept.push(effect);
        }
      }

      unit.statusEffects = kept;
      clampHpToEffectiveMax(unit);
      this.tickDelayedDamage(unit, deltaTime);
    }
  }

  private tickDelayedDamage(unit: CombatantState, deltaTime: number): void {
    const pool = unit.delayedDamagePool ?? 0;
    if (pool <= 0 || !unit.isAlive) return;

    if (!hasActiveDamageDelay(unit.statusEffects)) {
      this.applyConfirmedDelayedDamage(unit, pool);
      unit.delayedDamagePool = 0;
      unit.damageDelayTickSec = undefined;
      return;
    }

    if (unit.damageDelayTickSec === undefined) {
      unit.damageDelayTickSec = OVERLAY_TICK_SEC;
    }
    unit.damageDelayTickSec -= deltaTime;

    while (
      unit.damageDelayTickSec <= 0 &&
      (unit.delayedDamagePool ?? 0) > 0 &&
      unit.isAlive &&
      hasActiveDamageDelay(unit.statusEffects)
    ) {
      const currentPool = unit.delayedDamagePool ?? 0;
      const remainingSec = getDamageDelayRemainingSec(unit.statusEffects);
      const tickAmount = computeDamageDelayTickAmount(currentPool, remainingSec);
      this.applyConfirmedDelayedDamage(unit, tickAmount);
      unit.damageDelayTickSec += OVERLAY_TICK_SEC;
    }
  }

  private applyConfirmedDelayedDamage(
    unit: CombatantState,
    amount: number,
  ): void {
    const damageResult = applyDelayedDamageTick(unit, amount);
    if (damageResult.hpDamage <= 0) return;

    this.emit({ type: "hurt", targetId: unit.id });
    if (damageResult.lethal) {
      unit.isAlive = false;
      if (!unit.isEnemy) {
        stripPassivesAurasFromSource(unit.id, [...this.players, ...this.enemies]);
      }
      clearPlayerRearAssaultAccess(unit);
      this.skillSequenceRunner.clearForActor(unit.id);
      this.noteEnemyCorpseAnchor(unit);
      this.emit({ type: "death", targetId: unit.id });
    }
  }

  private findCombatant(id: string): CombatantState | undefined {
    return [...this.players, ...this.enemies].find((unit) => unit.id === id);
  }

  private applyOverlayTick(
    target: CombatantState,
    effect: StatusEffect,
  ): void {
    const source = this.findCombatant(effect.sourceId!);
    if (!source?.isAlive) return;

    const passives = this.gameData.skillRegistry.passives;
    const skill = effect.skillId
      ? this.gameData.skillRegistry.actives[effect.skillId]
      : undefined;
    const skillName = skill?.name ?? effect.overlay ?? "";

    if (effect.overlay === "hot") {
      if (isAllySupportBlockedDuringArenaDominance(target, source)) {
        return;
      }
      const baseAmount = resolveHotAmountFromStatus(source, target, effect, passives);
      const potencyBonus = resolveHerbalPotencyHotBonus(
        target,
        resolvePartyHerbalPotencyConfig(this.players, passives),
      );
      const amount = resolveIncomingHealAmount(
        target,
        baseAmount + potencyBonus,
        passives,
      );
      if (amount <= 0) return;
      const healed = applyHealToTarget(target, amount);
      if (healed <= 0) return;
      this.refreshSelfHpRatioBuffAuras();
      this.emit({
        type: "skill",
        actorId: source.id,
        targetId: target.id,
        skillId: effect.skillId ?? "",
        skillName,
        effect: "heal",
        statusLabel: "hot",
        amount: healed,
      });
      return;
    }

    if (effect.overlay === "dot") {
      const amount = resolveDotAmountFromStatus(
        source,
        target,
        effect,
        passives,
      );
      const barrierHpBefore = target.barrierHp;
      const wardResult = applyWardBarrierToIncomingDamage(target, amount);
      const mitigation = mitigateIncomingDamage(
        target,
        wardResult.damage,
        passives,
        { allies: this.players },
      );
      if (mitigation.lastStandTriggered) {
        this.emit({ type: "invulnerable", targetId: target.id });
      }
      if (mitigation.lastStandRecoveryTriggered) {
        this.emit({ type: "lastStandRecovery", targetId: target.id });
      }
      if (mitigation.lastStandGutsTriggered) {
        this.emit({ type: "lastStandGuts", targetId: target.id });
      }
      const damageResult = applyDamageToTarget(target, mitigation.finalDamage);
      const appliedDamage =
        damageResult.hpDamage + damageResult.barrierDamage;
      this.handleDamageThreat(source, target, appliedDamage, {
        attackKind: "dot",
        hpDamage: damageResult.hpDamage,
        attackRangePx: source.traits.rangePx,
        barrierHpBefore,
        barrierDamage: damageResult.barrierDamage,
      });
      const { lethal } = damageResult;
      this.emit({
        type: "skill",
        actorId: source.id,
        targetId: target.id,
        skillId: effect.skillId ?? "",
        skillName,
        effect: "dot",
        amount,
      });
      this.emit({ type: "hurt", targetId: target.id });
      if (lethal) {
        target.isAlive = false;
        clearPlayerRearAssaultAccess(target);
        this.skillSequenceRunner.clearForActor(target.id);
        this.emit({ type: "death", targetId: target.id });
        this.noteEnemyCorpseAnchor(target);
      }
    }
  }

  private tickCooldowns(units: CombatantState[], deltaTime: number): void {
    for (const unit of units) {
      if (!unit.isAlive) continue;
      if (this.skillSequenceRunner.isActorUseLocked(unit.id)) continue;
      let basicRate = 1;
      if (unit.isEnemy) {
        const enemyTemplate = this.gameData.enemyRegistry[unit.classId];
        if (enemyTemplate) {
          basicRate = getBasicCooldownRate(
            enemyTemplate.attackSpeedTier ?? "normal",
            this.levelCurves,
          );
        }
      } else {
        const classPreset = this.gameData.classRegistry[unit.classId];
        if (classPreset) {
          basicRate = getBasicCooldownRate(
            resolveAttackSpeedTier(classPreset),
            this.levelCurves,
          );
        }
      }
      for (const cd of unit.cooldowns) {
        if (cd.remaining <= 0) continue;
        const skill = this.gameData.skillRegistry.actives[cd.skillId];
        if (!skill || !shouldTickCooldown(skill, cd.slotKind)) continue;
        const prevRemaining = cd.remaining;
        const speedMul =
          cd.slotKind === "active" ? 1 : getEffectiveAttackSpeedMultiplier(unit);
        const rate = cd.slotKind === "active" ? 1 : basicRate * speedMul;
        cd.remaining = Math.max(0, cd.remaining - deltaTime * rate);
        if (
          cd.slotKind === "active" &&
          prevRemaining > 0 &&
          cd.remaining <= 0 &&
          isTimeTrigger(skill)
        ) {
          this.handleActiveTimeChargeComplete(unit, cd, skill);
        }
      }
    }
  }

  private tickCountTriggers(unitId: string, kind: SkillTriggerKind): void {
    const unit = [...this.players, ...this.enemies].find((u) => u.id === unitId);
    if (!unit?.isAlive) return;
    if (this.skillSequenceRunner.isActorUseLocked(unit.id)) return;
    const actives = this.gameData.skillRegistry.actives;

    if (kind !== "hitsTaken") {
      tickCountTriggerCooldowns(unit.cooldowns, actives, kind);
      return;
    }

    const canConsumeHitsTaken =
      !isUnitStunned(unit) && !this.skillSequenceRunner.isActorBusy(unit.id);

    for (const cd of unit.cooldowns) {
      if (cd.slotKind !== "active") continue;
      const skill = actives[cd.skillId];
      if (!skill || resolveSkillTrigger(skill).kind !== "hitsTaken") continue;

      if (cd.remaining > 0) {
        if (
          !shouldPauseActiveCooldown(
            cd,
            skill,
          )
        ) {
          chargeCountTrigger(cd, skill);
        }
      } else if (canConsumeHitsTaken) {
        this.tryExecuteActiveWithFireGate(unit, cd);
      }
    }
  }

  private handleActiveTimeChargeComplete(
    unit: CombatantState,
    cd: SkillCooldown,
    skill: import("./types.ts").ActiveSkillDef,
  ): void {
    const ctx = this.buildFireGateContext(unit, skill, cd);
    if (resolveFirePolicy(skill) !== "smart" || shouldFireActiveSkill(ctx)) {
      return;
    }
    if (cd.fireHoldSinceSec === undefined) {
      cd.fireHoldSinceSec = this.battleTimeSec;
    }
    const passives = getPassiveDefs(
      unit,
      this.gameData.skillRegistry.passives,
    );
    bankReadyChargeIfPossible(
      cd,
      skill,
      passives,
      unit.build.learnedActiveIds,
    );
  }

  private tryExecuteActiveWithFireGate(
    unit: CombatantState,
    cd: SkillCooldown,
  ): boolean {
    const skill = this.gameData.skillRegistry.actives[cd.skillId];
    if (!skill) return false;
    if (!hasActiveStageTriggerRemaining(unit, skill)) return false;
    const ctx = this.buildFireGateContext(unit, skill, cd);
    if (!shouldFireActiveSkill(ctx)) return false;
    return this.executor.tryExecute(unit, cd, this.players, this.enemies);
  }

  private runUnitSkills(actors: CombatantState[]): void {
    const actives = this.gameData.skillRegistry.actives;

    for (const actor of actors) {
      if (!actor.isAlive || isUnitStunned(actor)) continue;
      const ordered = this.orderUnitSkillCooldowns(actor.cooldowns);
      for (const cd of ordered) {
        if (cd.slotKind === "basic" && cd.remaining <= 0) {
          if (this.skillSequenceRunner.isBasicAttackBlocked(actor.id)) {
            continue;
          }
          const readyActive = findReadyCountTriggerCooldowns(
            actor,
            "basicAttackCount",
            actives,
          )[0];
          if (readyActive) {
            const fired = this.tryExecuteActiveWithFireGate(actor, readyActive);
            if (fired) continue;
            if (this.skillSequenceRunner.isActorBusy(actor.id)) continue;
          }
        }

        const skill = actives[cd.skillId];
        if (skill && isCountTriggerReady(cd, skill)) continue;

        if (cd.slotKind === "active" && skill && !isCountTriggerSkill(skill)) {
          if (
            hasAvailableActiveCharge(
              cd,
              skill,
              getPassiveDefs(actor, this.gameData.skillRegistry.passives),
              actor.build.learnedActiveIds,
            ) &&
            !this.skillSequenceRunner.isActorBusy(actor.id)
          ) {
            this.tryExecuteActiveWithFireGate(actor, cd);
          }
          continue;
        }

        if (cd.remaining > 0) continue;

        if (
          this.skillSequenceRunner.isActorBusy(actor.id) ||
          (cd.slotKind === "basic" &&
            this.skillSequenceRunner.isBasicAttackBlocked(actor.id))
        ) {
          continue;
        }

        this.executor.tryExecute(actor, cd, this.players, this.enemies);
      }
    }
  }

  private orderUnitSkillCooldowns(cooldowns: SkillCooldown[]): SkillCooldown[] {
    const active = cooldowns
      .filter((c) => c.slotKind === "active")
      .sort((a, b) => (a.slotIndex ?? 0) - (b.slotIndex ?? 0));
    const basic = cooldowns.filter((c) => c.slotKind === "basic");
    return [...active, ...basic];
  }

  private checkBattleEnd(): void {
    const alliesAlive = this.players.some((a) => a.isAlive);
    const enemiesAlive = this.enemies.some((e) => e.isAlive);
    const survivingPartyIndices = this.players
      .filter((ally) => ally.isAlive && ally.partySlotIndex !== undefined)
      .map((ally) => ally.partySlotIndex!);

    if (!enemiesAlive) {
      const stage = this.gameData.stages.find((s) => s.id === this.stageId);
      const hasNextWave =
        !this.isPinnedWaveComplete() &&
        stage !== undefined &&
        this.waveIndex + 1 < stage.waves.length;
      if (hasNextWave) {
        if (
          this.pendingNextWaveIndex !== null ||
          this.partyDeployActive ||
          this.waveAdvanceDelayTimer > 0 ||
          this.waveExitMarchActive
        ) {
          return;
        }
        this.beginEnemyWipeSettle(true);
        this.pendingNextWaveIndex = this.waveIndex + 1;
        return;
      }

      if (this.pendingVictoryTimer <= 0 && this.pendingVictorySurvivors === null) {
        this.beginEnemyWipeSettle(false);
        this.pendingVictorySurvivors = survivingPartyIndices;
      }
      return;
    }
    if (!alliesAlive) {
      if (
        this.pendingDefeatTimer > 0 ||
        this.pendingDefeatSurvivors !== null
      ) {
        return;
      }
      this.engaged = false;
      this.pendingDefeatTimer = ALLY_DEATH_DEFEAT_DELAY_SEC;
      this.pendingDefeatSurvivors = survivingPartyIndices;
    }
  }

  private respawnAfterEnd(): void {
    this.reloadBattlefield();
    this.worldOffsetX = 0;
    this.engaged = false;
    this.phase = "running";
    this.tryBeginTrainingEngage();
  }
}
