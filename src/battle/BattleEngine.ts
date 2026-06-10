import type { BattleEventListener } from "./events.ts";
import { resolveDotAmountFromStatus, resolveHotAmountFromStatus, applyDamageToTarget, applyHealToTarget } from "./combatMath.ts";
import {
  createAlliesFromPartyState,
  createCooldowns,
  createEnemiesForStage,
  hideFallenAllyCorpses,
  resetEntityIdCounter,
} from "./entities.ts";
import { getEffectiveAttackSpeedMultiplier } from "./combatMath.ts";
import { getBasicCooldownRate } from "../progression/levelGrowth.ts";
import { resolveAttackSpeedTier } from "../progression/memberStatsDisplay.ts";
import {
  APPROACH_SPEED as BATTLE_APPROACH_SPEED,
  leadingRowContactPlayer,
  getEnemyContactX,
  getMeleeEnemyContactX,
  getPlayerContactX,
  resolveFormationRangePx,
  resolveMaxEffectiveRangePx,
  isMeleeUnit,
  resolveAttackBattleX,
  SCROLL_SPEED,
  updateUnitApproach,
  capEngagedEnemyApproachBattleX,
  syncAllFieldX,
  freezeEnemyCorpseScreenAnchor,
  syncDeadEnemyCorpseBattleX,
  resolvePartyDeployTargets,
  placePartyOffScreenForDeploy,
  resolveEnemyDeployTargets,
  placeEnemiesOffScreenForDeploy,
} from "./combatPosition.ts";
import {
  resolvePlayerApproachBattleX,
  resolveEnemyApproachBattleX,
  resolveEnemyBasicAttackTarget,
  shouldSkipEngagedAutoApproach,
} from "./resolveApproachBattleX.ts";
import {
  CANVAS_W as BATTLE_CANVAS_W,
  SPRITE_GAP,
  engagedMinBodyGap,
} from "./battleConstants.ts";
import { isUnitStunned } from "./ccEffects.ts";
import {
  applyCounterRetaliation,
  applyPassiveCounterRetaliation,
  type CounterAttackKind,
} from "./counterEffects.ts";
import {
  applyDamageTakenToHeal,
  resolveIncomingHealAmount,
  applyPassiveHotFromPassive,
  getPeriodicDispelReady,
  getPeriodicHotReady,
  initializePeriodicDispelStates,
  initializePeriodicHotStates,
  syncHotAuras,
  syncBlockAuras,
  syncDamageReductionAuras,
  syncSelfHpRatioBuffAuras,
  tickPeriodicDispelStates,
  tickPeriodicHotStates,
  type PeriodicDispelPassiveState,
  type PeriodicHotPassiveState,
} from "./passiveEffects.ts";
import { dispelDebuffsOnTarget } from "./debuffDispel.ts";
import { pickTargets } from "./skills/targeting.ts";
import {
  applyThreatFromDamage,
  applyThreatFromDebuffApply,
  initializeAllyThreat,
  refreshAlliesBaseThreat,
  tickAllyThreatDecay,
} from "./threat.ts";
import { deathAnimDurationMs } from "../render/deathPlayback.ts";
import { EngagedCompositionTracker } from "./battleDisplay.ts";
import {
  getLeadingPlayerFormationRow,
  resolveEngagedLayout,
  applyEngagedFormationToBattleX,
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
  initializeSkillCooldowns,
  isCountTriggerReady,
  resolveSkillTrigger,
  shouldTickCooldown,
  tickCountTriggerCooldowns,
} from "./skillTrigger.ts";
import { resolveRuntimeBattlePhase } from "./battlePhase.ts";
import {
  ANNOUNCEMENT_FADE_OUT_START_MS,
  ANNOUNCEMENT_TOTAL_MS,
  POST_ANNOUNCEMENT_ENGAGE_DELAY_SEC,
} from "../render/announcementOverlayTiming.ts";
import type { BattlePhase, BattleSnapshot, CombatantState, FormationRow, GameData, PartySlotState, PendingSkillHit, SkillCooldown, SkillTriggerKind, StatusEffect } from "./types.ts";
import { BATTLE_ENEMY_MARCH_VISIBLE_MAX_X } from "./battleConstants.ts";
import type { LevelCurvesConfig } from "../progression/levelGrowth.ts";

const RESTART_DELAY_SEC = 3;
const VICTORY_EXIT_SPEED = SCROLL_SPEED * 2;
const OVERLAY_TICK_SEC = 1;
/** 敵死亡演出（アニメ + ホールド）後に Victory / 次 Wave へ遷移 */
const ENEMY_DEATH_SETTLE_DELAY_SEC =
  (deathAnimDurationMs() + 500) / 1000;
/** 味方死亡演出（アニメ + ホールド）後に Defeat へ遷移 */
const ALLY_DEATH_DEFEAT_DELAY_SEC =
  (deathAnimDurationMs() + 500) / 1000;
/** 接近完了判定（battleX と目標の差） */
const ENGAGED_APPROACH_SETTLED_PX = 0.5;

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
  private pendingDeployWaveIndex: number | null = null;
  /** fade-out 開始後の接敵待機（null = 未開始） */
  private postAnnouncementEngageDelaySec: number | null = null;
  /** 各 Wave 開始: 味方が左外から初期位置へ移動中 */
  private partyDeployActive = false;
  /** PartyDeploy 到達済み（接敵ゲート待ち） */
  private partyDeploySettled = false;
  private partyDeployTargets = new Map<string, number>();
  private enemyDeployTargets = new Map<string, number>();
  private engaged = false;
  /** 近接敵が生存していた最後の前線 battleX（近接全滅後の接触点ジャンプ抑制） */
  private engagedLastMeleeContactX: number | null = null;
  /** Victory 退出開始済み */
  private victoryFormationReady = false;
  private readonly engagedComposition = new EngagedCompositionTracker();
  private restartTimer = 0;
  private periodicDispelStates = new Map<string, PeriodicDispelPassiveState[]>();
  private periodicHotStates = new Map<string, PeriodicHotPassiveState[]>();
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
      onDamageApplied: (actor, target, amount, meta) => {
        this.handleDamageThreat(actor, target, amount, meta);
      },
      onDebuffApplied: (actor) => {
        applyThreatFromDebuffApply(actor);
      },
      onHealApplied: () => {
        this.refreshSelfHpRatioBuffAuras();
      },
      onUnitDied: (unit) => this.noteEnemyCorpseAnchor(unit),
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
    },
  ): void {
    applyThreatFromDamage(actor, target, amount);
    if (!target.isEnemy && target.isAlive && amount > 0) {
      applyDamageTakenToHeal(
        target,
        amount,
        this.gameData.skillRegistry.passives,
      );
    }
    if (amount > 0 && meta?.attackKind) {
      const counterCallbacks = {
        emit: (event: Parameters<typeof this.emit>[0]) => this.emit(event),
        getAllCombatants: () => [...this.players, ...this.enemies],
        onDamageApplied: (
          counterActor: CombatantState,
          counterTarget: CombatantState,
          counterAmount: number,
          counterMeta?: {
            attackKind: CounterAttackKind;
            isCounterDamage?: boolean;
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
          this.skillSequenceRunner.clearForActor(unit.id);
          this.noteEnemyCorpseAnchor(unit);
          this.emit({ type: "death", targetId: unit.id });
        },
        onDebuffApplied: (counterActor: CombatantState) => {
          applyThreatFromDebuffApply(counterActor);
        },
      };
      const counterCtx = {
        attackKind: meta.attackKind,
        appliedDamage: amount,
        isCounterDamage: meta.isCounterDamage,
      };
      applyPassiveCounterRetaliation(
        target,
        actor,
        counterCtx,
        this.gameData.skillRegistry.passives,
        counterCallbacks,
      );
      applyCounterRetaliation(
        target,
        actor,
        counterCtx,
        this.gameData.skillRegistry.passives,
        counterCallbacks,
      );
    }
    this.refreshSelfHpRatioBuffAuras();
    this.onDamageApplied?.(actor, target, amount);
  }

  private reloadBattlefield(): void {
    resetEntityIdCounter();
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
  }

  private initBattlePassiveState(): void {
    const passives = this.gameData.skillRegistry.passives;
    const actives = this.gameData.skillRegistry.actives;
    initializeAllyThreat(this.players);
    syncHotAuras(this.players, this.enemies, passives);
    syncBlockAuras(this.players, this.enemies, passives);
    syncDamageReductionAuras(this.players, this.enemies, passives);
    syncSelfHpRatioBuffAuras(this.players, this.enemies, passives);
    this.periodicDispelStates.clear();
    this.periodicHotStates.clear();
    for (const unit of [...this.players, ...this.enemies]) {
      initializeSkillCooldowns(unit, actives);
      const dispelStates = initializePeriodicDispelStates(unit, passives);
      if (dispelStates.length > 0) {
        this.periodicDispelStates.set(unit.id, dispelStates);
      }
      const hotStates = initializePeriodicHotStates(unit, passives);
      if (hotStates.length > 0) {
        this.periodicHotStates.set(unit.id, hotStates);
      }
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

  private getLivingAllyLineInputs() {
    return this.players
      .filter((a) => a.isAlive)
      .map((a) => ({
        id: a.id,
        role: a.role,
        formationRow: a.formationRow,
        rangePx: resolveFormationRangePx(a),
        isAlive: true as const,
        battleX: a.battleX,
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
      enemy.visualX = enemy.battleX;
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

  private advanceWorldOffset(deltaTime: number, speed: number = SCROLL_SPEED): void {
    this.worldOffsetX += speed * deltaTime;
  }

  private updateVictoryExitMarch(
    deltaTime: number,
    livingOnly = false,
  ): void {
    const step = VICTORY_EXIT_SPEED * deltaTime;
    this.advanceWorldOffset(deltaTime, VICTORY_EXIT_SPEED);
    for (const ally of this.players) {
      if (livingOnly && !ally.isAlive) continue;
      ally.battleX += step;
      ally.visualX = ally.battleX;
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
    const playerContact = getPlayerContactX(this.players);
    if (enemyContact === null || playerContact === null) return;

    const meleeContact = getMeleeEnemyContactX(this.enemies, this.gameData);
    if (meleeContact !== null) {
      this.engagedLastMeleeContactX = meleeContact;
    }

    const frozenMeleeContactX =
      meleeContact === null ? this.engagedLastMeleeContactX : null;

    const approachStep = BATTLE_APPROACH_SPEED * deltaTime;

    for (const ally of this.players) {
      if (!ally.isAlive) continue;
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
      const target = resolvePlayerApproachBattleX(
        ally,
        this.players,
        this.enemies,
        this.gameData,
        { frozenMeleeContactX },
      );
      updateUnitApproach(ally, target, approachStep);
    }

    for (const enemy of this.enemies) {
      if (!enemy.isAlive) continue;
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
      updateUnitApproach(enemy, target, approachStep);
    }
  }

  private clearEngagedVisualState(): void {
    this.engagedLastMeleeContactX = null;
    this.engagedComposition.clear();
    for (const unit of [...this.players, ...this.enemies]) {
      unit.engagedVisualLaneX = undefined;
      unit.engagedMeleeVisualSlot = undefined;
      unit.engagedVisualTargetPlayerId = undefined;
      unit.engagedVisualTargetAllyId = undefined;
      if (unit.isEnemy) {
        unit.corpseScreenAnchorX = undefined;
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
        enemy.engagedMeleeVisualSlot = undefined;
      }
    }
    melee.forEach((enemy, slot) => {
      enemy.engagedMeleeVisualSlot = slot;
    });
  }

  private buildEngagedLayoutContext() {
    const enemyContact = getEnemyContactX(this.enemies);
    const playerContact = getPlayerContactX(this.players);
    if (enemyContact === null || playerContact === null) return null;

    const engageAnchor = enemyContact - engagedMinBodyGap();

    return {
      allies: this.players
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
        engagedMeleeVisualSlot: enemy.engagedMeleeVisualSlot,
      })),
      playerContactBattleX: playerContact,
      battleVisualOffset: 0,
      frontEnemyVisualAnchor: engageAnchor,
      resolveRangedTargetBattleX: (enemyId: string) => {
        const enemy = this.enemies.find((unit) => unit.id === enemyId);
        if (!enemy) return null;
        const target = this.resolveEngagedRangedTargetPlayer(enemy);
        return target?.battleX ?? null;
      },
    };
  }

  /** 接敵開始・構成変化時（A-L1-01 カウンタ対象） */
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
    const frozenId =
      enemy.engagedVisualTargetPlayerId ?? enemy.engagedVisualTargetAllyId;
    let target = frozenId
      ? this.players.find((ally) => ally.id === frozenId && ally.isAlive)
      : undefined;
    if (!target) {
      target =
        resolveEnemyBasicAttackTarget(
          enemy,
          this.players,
          this.enemies,
          this.gameData,
        ) ?? undefined;
      if (target) {
        enemy.engagedVisualTargetPlayerId = target.id;
        enemy.engagedVisualTargetAllyId = target.id;
      }
    }
    return target;
  }

  /** 接敵開始: 敵 layout 目標を記録（段階接近） */
  private setupEngagedCombat(): void {
    const placementInputs = this.getPlayerPlacementInputs().filter((p) => p.isAlive);
    const leadingRow = getLeadingPlayerFormationRow(placementInputs);

    this.freezeEngagedMeleeVisualSlots();
    this.engagedComposition.freezeRangedTargets(
      this.players,
      this.enemies,
      this.gameData,
    );

    if (this.resolveEngagedLayoutForEvent() === null) return;

    this.engagedComposition.initSignatures(
      this.players,
      this.enemies,
      leadingRow,
      this.gameData,
    );
  }

  private noteEnemyCorpseAnchor(unit: CombatantState): void {
    if (unit.isEnemy) {
      freezeEnemyCorpseScreenAnchor(unit);
    }
  }

  /** 接敵中: 前列 battleX が射程内停止位置を越えないよう clamp（近接前線のみ） */
  private clampEngagedFrontRowBattleX(): void {
    const meleeContact = getMeleeEnemyContactX(this.enemies, this.gameData);
    if (meleeContact === null) return;

    const placementInputs = this.getPlayerPlacementInputs().filter((p) => p.isAlive);
    const leadingRow = getLeadingPlayerFormationRow(placementInputs);
    if (leadingRow === null) return;
    for (const ally of this.players) {
      if (!ally.isAlive || ally.formationRow !== leadingRow) continue;
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
      const maxForward = resolveAttackBattleX(
        ally,
        meleeContact,
        this.gameData,
      );
      if (ally.battleX > maxForward) {
        ally.battleX = maxForward;
      }
    }
  }

  /** 近接/前列構成変化時: formation を battleX へ1回再 bake */
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

    // 敵 battleX は接敵開始 bake のみ。構成変化時の snap は living 敵スライド・死体ずれの原因になる。
    if (!leadingChanged) return;

    const layout = this.resolveEngagedLayoutForEvent();
    if (layout === null) return;
    this.applyEngagedFormationLayout(layout, { enemies: false });
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
    this.partyDeploySettled = false;
    this.partyDeployTargets.clear();
    this.enemyDeployTargets.clear();
    this.clearWaveAnnouncement();
  }

  private clearWaveAnnouncement(): void {
    this.waveAnnouncementActive = false;
    this.waveAnnouncementElapsedMs = 0;
    this.pendingDeployWaveIndex = null;
    this.postAnnouncementEngageDelaySec = null;
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

  /** Wave 告知 + PartyDeploy 同時開始 */
  private beginWaveAnnouncement(waveIndex: number): void {
    this.waveIndex = waveIndex;
    this.pendingDeployWaveIndex = waveIndex;
    this.waveAnnouncementActive = true;
    this.waveAnnouncementElapsedMs = 0;
    this.postAnnouncementEngageDelaySec = null;
    this.partyDeploySettled = false;
    this.engaged = false;
    this.clearEngagedVisualState();
    this.prepareWaveDeploy(waveIndex);
  }

  private tickWaveAnnouncement(deltaTime: number): void {
    if (!this.waveAnnouncementActive) return;
    const prevMs = this.waveAnnouncementElapsedMs;
    this.waveAnnouncementElapsedMs += deltaTime * 1000;
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

  private tickPostAnnouncementEngageDelay(deltaTime: number): void {
    if (this.postAnnouncementEngageDelaySec === null) return;
    if (this.postAnnouncementEngageDelaySec > 0) {
      this.postAnnouncementEngageDelaySec -= deltaTime;
      if (this.postAnnouncementEngageDelaySec < 0) {
        this.postAnnouncementEngageDelaySec = 0;
      }
    }
    this.tryCompleteWaveStart();
  }

  private tryCompleteWaveStart(): void {
    if (!this.partyDeploySettled || this.engaged) return;
    if (this.postAnnouncementEngageDelaySec === null) return;
    if (this.postAnnouncementEngageDelaySec > 0) return;
    this.beginEngaged();
  }

  /** Wave 開始: 敵 spawn + 味方・敵を画面外から配置 */
  private prepareWaveDeploy(waveIndex: number): void {
    hideFallenAllyCorpses(this.players);
    this.waveIndex = waveIndex;
    this.pendingNextWaveIndex = null;
    this.engaged = false;
    this.clearEngagedVisualState();
    this.spawnWaveEnemies();
    this.partyDeployTargets = resolvePartyDeployTargets(this.players);
    this.enemyDeployTargets = resolveEnemyDeployTargets(this.enemies);
    placePartyOffScreenForDeploy(this.players, this.partyDeployTargets);
    placeEnemiesOffScreenForDeploy(this.enemies, this.enemyDeployTargets);
    this.partyDeployActive = true;
    this.partyDeploySettled = false;
  }

  private tickPartyDeploy(deltaTime: number): void {
    const step = BATTLE_APPROACH_SPEED * deltaTime;
    let allSettled = true;
    for (const ally of this.players) {
      if (!ally.isAlive) continue;
      const target = this.partyDeployTargets.get(ally.id);
      if (target === undefined) continue;
      updateUnitApproach(ally, target, step);
      ally.visualX = ally.battleX;
      if (Math.abs(ally.battleX - target) > ENGAGED_APPROACH_SETTLED_PX) {
        allSettled = false;
      }
    }
    for (const enemy of this.enemies) {
      if (!enemy.isAlive) continue;
      const target = this.enemyDeployTargets.get(enemy.id);
      if (target === undefined) continue;
      updateUnitApproach(enemy, target, step);
      enemy.visualX = enemy.battleX;
      if (Math.abs(enemy.battleX - target) > ENGAGED_APPROACH_SETTLED_PX) {
        allSettled = false;
      }
    }
    if (allSettled) {
      this.partyDeployActive = false;
      this.partyDeploySettled = true;
      this.tryCompleteWaveStart();
    }
  }

  private beginEngaged(): void {
    this.partyDeployActive = false;
    this.partyDeploySettled = false;
    this.partyDeployTargets.clear();
    this.enemyDeployTargets.clear();
    this.postAnnouncementEngageDelaySec = null;
    this.pendingDeployWaveIndex = null;
    this.engaged = true;
    this.setupEngagedCombat();
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
      ally.cooldowns = createCooldowns(preset.basicAttackSkillId, member.build);
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

  private toSnapshot(c: CombatantState) {
    return {
      id: c.id,
      name: c.name,
      hp: c.hp,
      maxHp: c.maxHp,
      barrierHp: c.barrierHp,
      atk: c.atk,
      def: c.def,
      reg: c.reg,
      role: c.isEnemy ? undefined : c.role,
      rangePx: c.traits.rangePx,
      damageType: c.traits.damageType,
      basicAttackVfx: c.traits.basicAttackVfx,
      spriteKey: c.spriteKey,
      iconKey: c.iconKey,
      formationRow: c.formationRow,
      isEnemy: c.isEnemy,
      battleX: c.battleX,
      visualX: c.battleX,
      corpseVisible: c.isEnemy ? undefined : c.corpseVisible,
      ...(c.isEnemy
        ? {}
        : {
            threat: c.threat,
            baseThreat: c.baseThreat,
            partySlotIndex: c.partySlotIndex,
          }),
      statusEffects: c.statusEffects.map((effect) => ({ ...effect })),
      activeCooldowns: c.cooldowns
        .filter((cd) => cd.slotKind === "active")
        .map((cd) => {
          const skill = this.gameData.skillRegistry.actives[cd.skillId];
          const trigger = skill
            ? resolveSkillTrigger(skill)
            : { kind: "time" as const, value: 1 };
          return {
            skillId: cd.skillId,
            remaining: cd.remaining,
            triggerKind: trigger.kind,
            triggerValue: trigger.value,
            slotIndex: cd.slotIndex ?? 0,
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
    this.tickPendingHitQueue();
    if (!this.shouldSuppressCombatSkills()) {
      this.tickSkillSequences(deltaTime);
    }
    if (this.pendingVictoryTimer > 0) {
      this.tickPostCombatSettle(deltaTime);
      this.tickStatusAndCooldowns(deltaTime, { suppressPeriodic: true });
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
      this.tickStatusAndCooldowns(deltaTime, { suppressPeriodic: true });
      syncDeadEnemyCorpseBattleX(this.enemies);
      return;
    }
    if (this.waveExitMarchActive) {
      this.tickWaveExitMarch(deltaTime);
      this.tickStatusAndCooldowns(deltaTime, { suppressPeriodic: true });
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
          this.tickStatusAndCooldowns(deltaTime, { suppressPeriodic: true });
        }
        return;
      }
      this.updateEngagedBattleMovement(deltaTime);
      this.clampEngagedFrontRowBattleX();
      this.maybeRecomputeEngagedLayout();
      this.tickStatusAndCooldowns(deltaTime);
      this.runUnitSkills(this.enemies);
      this.runUnitSkills(this.players);
      const leadingRowInputs = this.getPlayerPlacementInputs().filter(
        (p) => p.isAlive,
      );
      const engagedLeadingRow =
        getLeadingPlayerFormationRow(leadingRowInputs);
      resolveEngagedFormationOverlaps(
        this.players,
        engagedLeadingRow,
        (unit) => this.isOnBattlefield(unit),
        this.gameData,
      );
      syncAllFieldX([...this.players, ...this.enemies]);
      syncDeadEnemyCorpseBattleX(this.enemies);
      this.tickAllyThreat(deltaTime);
      this.checkBattleEnd();
    }
  }

  /** DoT/HoT・バフ/デバフ持続・CD を接敵状態に関係なく進める */
  private tickStatusAndCooldowns(
    deltaTime: number,
    options?: { suppressPeriodic?: boolean },
  ): void {
    this.tickStatusEffects(deltaTime);
    if (!options?.suppressPeriodic) {
      this.tickPeriodicDispels(deltaTime);
      this.tickPeriodicHots(deltaTime);
    }
    this.tickCooldowns(this.players, deltaTime);
    this.tickCooldowns(this.enemies, deltaTime);
  }

  private tickAllyThreat(deltaTime: number): void {
    refreshAlliesBaseThreat(this.players);
    for (const ally of this.players) {
      tickAllyThreatDecay(ally, deltaTime);
    }
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
    this.skillSequenceRunner.tickMoves(deltaTime, units);
    this.skillSequenceRunner.tickSequences(this.battleTimeSec, (step) => {
      this.executor.applyScheduledStep(step, this.players, this.enemies);
    });
  }

  private tickPeriodicHots(deltaTime: number): void {
    const passives = this.gameData.skillRegistry.passives;
    for (const actor of this.players) {
      if (!actor.isAlive) continue;
      const before = this.periodicHotStates.get(actor.id);
      if (!before || before.length === 0) continue;

      const after = tickPeriodicHotStates(before, passives, deltaTime);
      this.periodicHotStates.set(actor.id, after);
      const readyIds = getPeriodicHotReady(before, after);
      for (const passiveId of readyIds) {
        const passive = passives[passiveId];
        if (!passive || passive.effect !== 'hot') continue;
        applyPassiveHotFromPassive(
          actor,
          passive,
          this.players,
          this.enemies,
        );
      }
    }
  }

  private tickPeriodicDispels(deltaTime: number): void {
    const passives = this.gameData.skillRegistry.passives;
    for (const actor of [...this.players, ...this.enemies]) {
      if (!actor.isAlive) continue;
      const before = this.periodicDispelStates.get(actor.id);
      if (!before || before.length === 0) continue;

      const after = tickPeriodicDispelStates(before, passives, deltaTime);
      this.periodicDispelStates.set(actor.id, after);
      const readyIds = getPeriodicDispelReady(before, after);
      for (const passiveId of readyIds) {
        const passive = passives[passiveId];
        if (!passive || passive.effect !== 'periodicDispel') continue;
        const spec = passive.dispelTargetRule ?? { kind: 'self' as const };
        const targets = pickTargets(spec, actor, this.players, this.enemies);
        for (const target of targets) {
          dispelDebuffsOnTarget(
            target,
            passive.dispelCount ?? 0,
            passive.dispelTags,
            actor.id,
          );
        }
      }
    }
  }

  private tickStatusEffects(deltaTime: number): void {
    for (const unit of [...this.players, ...this.enemies]) {
      const kept: StatusEffect[] = [];

      for (const effect of unit.statusEffects) {
        effect.remainingSec -= deltaTime;
        if (effect.remainingSec <= 0) continue;

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
      const baseAmount = resolveHotAmountFromStatus(source, target, effect, passives);
      const amount = resolveIncomingHealAmount(target, baseAmount, passives);
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
        effect: "hot",
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
      const damageResult = applyDamageToTarget(target, amount);
      const appliedDamage =
        damageResult.hpDamage + damageResult.barrierDamage;
      this.handleDamageThreat(source, target, appliedDamage, {
        attackKind: "dot",
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
        this.emit({ type: "death", targetId: target.id });
        this.noteEnemyCorpseAnchor(target);
      }
    }
  }

  private tickCooldowns(units: CombatantState[], deltaTime: number): void {
    for (const unit of units) {
      if (!unit.isAlive) continue;
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
        const speedMul =
          cd.slotKind === "active" ? 1 : getEffectiveAttackSpeedMultiplier(unit);
        const rate = cd.slotKind === "active" ? 1 : basicRate * speedMul;
        cd.remaining = Math.max(0, cd.remaining - deltaTime * rate);
      }
    }
  }

  private tickCountTriggers(unitId: string, kind: SkillTriggerKind): void {
    const unit = [...this.players, ...this.enemies].find((u) => u.id === unitId);
    if (!unit?.isAlive) return;
    const actives = this.gameData.skillRegistry.actives;

    if (kind !== "hitsTaken") {
      tickCountTriggerCooldowns(unit.cooldowns, actives, kind);
      return;
    }

    if (isUnitStunned(unit)) return;

    const canConsume = !this.skillSequenceRunner.isActorBusy(unit.id);

    for (const cd of unit.cooldowns) {
      if (cd.slotKind !== "active") continue;
      const skill = actives[cd.skillId];
      if (!skill || resolveSkillTrigger(skill).kind !== "hitsTaken") continue;

      if (cd.remaining > 0) {
        chargeCountTrigger(cd, skill);
      } else if (canConsume) {
        this.executor.tryExecute(unit, cd, this.players, this.enemies);
      }
    }
  }

  private runUnitSkills(actors: CombatantState[]): void {
    const actives = this.gameData.skillRegistry.actives;

    for (const actor of actors) {
      if (!actor.isAlive || isUnitStunned(actor)) continue;
      const ordered = this.orderCooldowns(actor.cooldowns);
      for (const cd of ordered) {
        if (cd.slotKind === "basic" && cd.remaining <= 0) {
          const readyActive = findReadyCountTriggerCooldowns(
            actor,
            "basicAttackCount",
            actives,
          )[0];
          if (readyActive) {
            this.executor.tryExecute(
              actor,
              readyActive,
              this.players,
              this.enemies,
            );
            continue;
          }
        }

        if (cd.remaining > 0) continue;

        const skill = actives[cd.skillId];
        if (skill && isCountTriggerReady(cd, skill)) continue;

        this.executor.tryExecute(actor, cd, this.players, this.enemies);
      }
    }
  }

  private orderCooldowns(cooldowns: SkillCooldown[]): SkillCooldown[] {
    const basic = cooldowns.filter((c) => c.slotKind === "basic");
    const active = cooldowns
      .filter((c) => c.slotKind === "active")
      .sort((a, b) => (a.slotIndex ?? 0) - (b.slotIndex ?? 0));
    return [...basic, ...active];
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
  }
}
