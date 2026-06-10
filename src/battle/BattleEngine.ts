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
  assignInitialPlayerBattleX,
  getBattleVisualOffset,
  getEngagedFrontEnemyVisualAnchor,
  leadingRowContactPlayer,
  getEnemyContactX,
  getPlayerContactX,
  marchEnemiesLeft,
  resolveEnemyMarchCapX,
  resolveFormationRangePx,
  resolveMaxEffectiveRangePx,
  SCROLL_SPEED,
  separateByGap,
  shouldStartApproach,
  syncEnemyVisualToBattleContact,
  updateUnitApproach,
} from "./combatPosition.ts";
import {
  resolvePlayerApproachBattleX,
  resolveEnemyApproachBattleX,
  resolveEnemyBasicAttackTarget,
} from "./resolveApproachBattleX.ts";
import {
  CANVAS_W as BATTLE_CANVAS_W,
  COMBAT_CAMERA_CENTER_X,
  ROW_X,
  SPRITE_GAP,
  engagedMinBodyGap,
} from "./battleConstants.ts";
import { moveTowardX } from "./battleCamera.ts";
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
import { EngageDisplayState } from "./battleDisplay.ts";
import {
  applyStaggeredFormationMarchRestore,
  computePlayerPositions,
  getFrontEnemyX,
  getLeadingPlayerFormationRow,
  isFormationScreenLayoutRestored,
  resolveEngagedLayout,
  separateEngagedSprites,
  snapFormationScreenLayout,
  tickCompensatedFormationReset,
  type EngagedLayoutResult,
  type FormationRestorePhase,
} from "./battleLayout.ts";
import { SPRITE_WIDTH, toVisualCombatant } from "../render/formationLayout.ts";
import { SkillExecutor } from "./skills/SkillExecutor.ts";
import { tickPendingHits } from "./skills/pendingSkillHits.ts";
import { SkillSequenceRunner } from "./skills/skillSequence.ts";
import {
  initializeSkillCooldowns,
  resolveSkillTrigger,
  shouldTickCooldown,
  tickCountTriggerCooldowns,
} from "./skillTrigger.ts";
import { resolveRuntimeBattlePhase } from "./battlePhase.ts";
import type { BattlePhase, BattleSnapshot, CombatantState, FormationRow, GameData, PartySlotState, PendingSkillHit, SkillCooldown, SkillTriggerKind, StatusEffect } from "./types.ts";
import { BATTLE_ENEMY_MARCH_VISIBLE_MAX_X } from "./battleConstants.ts";
import type { LevelCurvesConfig } from "../progression/levelGrowth.ts";

const RESTART_DELAY_SEC = 3;
const VICTORY_EXIT_SPEED = SCROLL_SPEED * 2;
const OVERLAY_TICK_SEC = 1;
const BATTLE_UI_RIGHT_PAD = 16;
const CAMERA_PAN_SPEED = 400;
/** 敵死亡演出（アニメ + ホールド）後に Victory / 次 Wave へ遷移 */
const ENEMY_DEATH_SETTLE_DELAY_SEC =
  (deathAnimDurationMs() + 500) / 1000;
/** 味方死亡演出（アニメ + ホールド）後に Defeat へ遷移 */
const ALLY_DEATH_DEFEAT_DELAY_SEC =
  (deathAnimDurationMs() + 500) / 1000;
/** 各 Wave 開始前: 敵出現前に味方が左へ進軍する時間（Wave 1 含む全 Wave 共通） */
export const WAVE_APPROACH_MARCH_SEC = 0.75;
/** 接敵解除後: 隊列 visualX を戻す速度（px/s） */
const FORMATION_RESTORE_SPEED = BATTLE_APPROACH_SPEED;

export interface BattleEngineOptions {
  onDamageApplied?: (
    actor: CombatantState,
    target: CombatantState,
    amount: number,
  ) => void;
}

export class BattleEngine {
  private phase: BattlePhase = "idle";
  private players: CombatantState[] = [];
  private enemies: CombatantState[] = [];
  private worldOffsetX = 0;
  private combatCameraX = 0;
  private cameraFocusLineX = ROW_X.front;
  private pendingVictoryTimer = 0;
  private pendingVictorySurvivors: number[] | null = null;
  private pendingDefeatTimer = 0;
  private pendingDefeatSurvivors: number[] | null = null;
  private waveAdvanceDelayTimer = 0;
  private pendingNextWaveIndex: number | null = null;
  private waveIntermissionActive = false;
  private waveIntermissionElapsed = 0;
  /** Wave 2+: カメラ補正付き絶対隊列リセット中 */
  private formationResetActive = false;
  private engaged = false;
  /** 戦闘後の段階的隊列復帰フェーズ */
  private formationRestorePhase: FormationRestorePhase = "lead";
  /** Victory 退出前: 隊列復帰完了（exit march の切替振動防止） */
  private victoryFormationReady = false;
  private readonly engageDisplay = new EngageDisplayState();
  /** 近接敵の生存構成変化検知（奥行きスロット再固定用） */
  private engagedMeleeEnemySignature: string | null = null;
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

  constructor(
    private readonly gameData: GameData,
    private readonly levelCurves: LevelCurvesConfig,
    private readonly getParty: () => PartySlotState[],
    private readonly getStageId: () => string,
    options: BattleEngineOptions = {},
  ) {
    this.stageId = getStageId();
    this.onDamageApplied = options.onDamageApplied;
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
          this.emit({ type: "death", targetId: unit.id });
          this.skillSequenceRunner.clearForActor(unit.id);
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
    this.waveIndex = 0;
    this.clearEngagedVisualState();
    this.formationRestorePhase = "lead";
    this.victoryFormationReady = false;
    this.restoreAlliesToFormationMarch(true);
    this.clearPendingVictory();
    this.clearPendingDefeat();
    this.clearPendingWaveAdvance();
    this.beginWaveApproachMarch(0);
    this.initBattlePassiveState();
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
        isAlive: a.isAlive,
      }));
  }

  /** @deprecated getPlayerPlacementInputs */
  private getAllyPlacementInputs() {
    return this.getPlayerPlacementInputs();
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
        visualX: a.visualX,
      }));
  }

  private getVisualAllies() {
    return this.players
      .filter((a) => this.isOnBattlefield(a))
      .map((unit) => toVisualCombatant(unit, this.gameData));
  }

  private getVisualEnemies() {
    return this.enemies.map((unit) => toVisualCombatant(unit, this.gameData));
  }

  private syncAllyVisualPositions(engaged = this.engaged): void {
    const frontEnemyX = engaged
      ? getFrontEnemyX(this.getVisualEnemies())
      : null;
    const positions = computePlayerPositions(this.getPlayerPlacementInputs(), {
      engaged,
      frontEnemyX: frontEnemyX ?? undefined,
    });
    for (const ally of this.players) {
      if (!this.isOnBattlefield(ally)) continue;
      ally.visualX = positions.get(ally.id) ?? ally.visualX;
    }
  }

  private getFormationRestoreUnits() {
    return this.players
      .filter((ally) => this.isOnBattlefield(ally) && ally.isAlive)
      .map((ally) => ({
        id: ally.id,
        role: ally.role,
        formationRow: ally.formationRow,
        rangePx: resolveFormationRangePx(ally),
        isAlive: true as const,
        visualX: ally.visualX,
      }));
  }

  private isFormationSpacingRestored(): boolean {
    return isFormationScreenLayoutRestored(
      this.getFormationRestoreUnits(),
      this.combatCameraX,
    );
  }

  /** 非接敵: 理想隊形を保ったまま右進軍 */
  private tickStaggeredFormationRestore(deltaTime: number): void {
    const units = this.getFormationRestoreUnits();
    this.formationRestorePhase = applyStaggeredFormationMarchRestore(
      {
        phase: this.formationRestorePhase,
        allies: units,
      },
      deltaTime,
      FORMATION_RESTORE_SPEED,
      this.getPlayerPlacementInputs().filter((p) => p.isAlive),
    );
    for (const unit of units) {
      const ally = this.players.find((a) => a.id === unit.id);
      if (ally) ally.visualX = unit.visualX;
    }
    this.resetMarchFormationCamera();
  }

  /** 生存味方スプライト中心の visualX */
  private resolvePartyCenterVisualX(): number | null {
    const living = this.players.filter(
      (ally) => this.isOnBattlefield(ally) && ally.isAlive,
    );
    if (living.length === 0) return null;
    const centers = living.map((ally) => ally.visualX + SPRITE_WIDTH / 2);
    return centers.reduce((sum, x) => sum + x, 0) / centers.length;
  }

  /** 非接敵進軍: 隊形は ROW_X 基準のままカメラは固定 */
  private resetMarchFormationCamera(): void {
    this.combatCameraX = 0;
    const center = this.resolvePartyCenterVisualX();
    if (center !== null) {
      this.cameraFocusLineX = center;
    }
  }

  /** 非接敵進軍・戦闘区切り: battleX を隊列へ。visualX は instant 時のみ即時同期 */
  private restoreAlliesToFormationMarch(instant = false): void {
    assignInitialPlayerBattleX(this.players, this.gameData);
    if (instant) {
      this.syncAllyVisualPositions(false);
    }
  }

  private resetEnemyVisualPositions(): void {
    this.applyEnemyVisualFromBattle();
  }

  private syncEnemyVisualFromBattle(): void {
    this.applyEnemyVisualFromBattle();
  }

  private clampEnemyVisualOnScreen(visualX: number): number {
    const maxScreen = this.engaged ? BATTLE_CANVAS_W : BATTLE_ENEMY_MARCH_VISIBLE_MAX_X;
    const screenX = visualX + this.combatCameraX;
    if (screenX <= maxScreen) return visualX;
    return maxScreen - this.combatCameraX;
  }

  private applyEnemyVisualFromBattle(): void {
    syncEnemyVisualToBattleContact(this.players, this.enemies);
    const living = this.enemies
      .filter((enemy) => enemy.isAlive)
      .map((enemy) => ({
        id: enemy.id,
        visualX: enemy.visualX,
        isAlive: true as const,
      }));
    const separated = separateEngagedSprites(living);
    for (const enemy of this.enemies) {
      const x = separated.get(enemy.id);
      if (x === undefined) continue;
      enemy.visualX = this.clampEnemyVisualOnScreen(x);
    }
  }

  private resetEnemyBattlePositions(): void {
    for (const enemy of this.enemies) {
      enemy.battleX = enemy.spawnX!;
    }
    const separated = separateByGap(
      this.enemies.map((enemy) => ({
        id: enemy.id,
        battleX: enemy.battleX,
        isAlive: enemy.isAlive,
      })),
      SPRITE_GAP,
    );
    for (const enemy of this.enemies) {
      const x = separated.get(enemy.id);
      if (x !== undefined) {
        enemy.battleX = x;
      }
    }
  }

  private applyEnemyMarch(deltaX: number): void {
    const positions = marchEnemiesLeft(
      this.enemies.map((enemy) => ({
        id: enemy.id,
        battleX: enemy.battleX,
        isAlive: enemy.isAlive,
      })),
      deltaX,
    );
    for (const enemy of this.enemies) {
      let x = positions.get(enemy.id);
      if (x === undefined) continue;
      const marchCap = resolveEnemyMarchCapX(
        enemy,
        this.players,
        this.gameData,
        this.enemies,
      );
      if (marchCap !== null) {
        x = Math.max(x, marchCap);
      }
      enemy.battleX = x;
    }
    this.syncEnemyVisualFromBattle();
  }

  private advanceWorldOffset(deltaTime: number, speed: number = SCROLL_SPEED): void {
    this.worldOffsetX += speed * deltaTime;
  }

  private updateVictoryExitMarch(deltaTime: number): void {
    const step = VICTORY_EXIT_SPEED * deltaTime;
    this.advanceWorldOffset(deltaTime, VICTORY_EXIT_SPEED);
    for (const ally of this.players) {
      ally.visualX += step;
    }
  }

  private hasFallenAllies(): boolean {
    return this.players.some((ally) => !ally.isAlive);
  }

  private areAlliesOffScreen(): boolean {
    if (this.players.length === 0) return true;
    return this.players.every((ally) => ally.visualX >= BATTLE_CANVAS_W);
  }

  private updateEngagedBattleMovement(deltaTime: number): void {
    const enemyContact = getEnemyContactX(this.enemies);
    const playerContact = getPlayerContactX(this.players);
    if (enemyContact === null || playerContact === null) return;

    const approachStep = BATTLE_APPROACH_SPEED * deltaTime;
    const placementInputs = this.getPlayerPlacementInputs().filter((p) => p.isAlive);
    const leadingRow = getLeadingPlayerFormationRow(placementInputs);

    for (const ally of this.players) {
      if (!ally.isAlive) continue;
      if (leadingRow !== null && ally.formationRow !== leadingRow) continue;
      if (this.skillSequenceRunner.isActorBusy(ally.id)) continue;
      const target = resolvePlayerApproachBattleX(
        ally,
        this.players,
        this.enemies,
        this.gameData,
      );
      updateUnitApproach(ally, target, approachStep);
    }

    for (const enemy of this.enemies) {
      if (this.skillSequenceRunner.isActorBusy(enemy.id)) continue;
      const target = resolveEnemyApproachBattleX(
        enemy,
        this.players,
        this.enemies,
        this.gameData,
      );
      updateUnitApproach(enemy, target, approachStep);
    }
  }

  private clearEngagedVisualState(): void {
    this.engagedMeleeEnemySignature = null;
    this.engageDisplay.clear();
    for (const unit of [...this.players, ...this.enemies]) {
      unit.engagedVisualLaneX = undefined;
      unit.engagedMeleeVisualSlot = undefined;
      unit.engagedVisualTargetPlayerId = undefined;
      unit.engagedVisualTargetAllyId = undefined;
    }
  }

  private getEngagedMeleeEnemySignature(): string | null {
    const ids = this.enemies
      .filter(
        (enemy) =>
          enemy.isAlive &&
          resolveMaxEffectiveRangePx(enemy, this.gameData) <= 0,
      )
      .map((enemy) => enemy.id)
      .sort();
    return ids.length > 0 ? ids.join(",") : null;
  }

  /** 接敵開始時: 進軍順（battleX）で近接敵の奥行きスロットを固定 */
  private freezeEngagedMeleeVisualSlots(): void {
    const melee = this.enemies
      .filter(
        (enemy) =>
          enemy.isAlive &&
          resolveMaxEffectiveRangePx(enemy, this.gameData) <= 0,
      )
      .sort((a, b) => a.battleX - b.battleX);
    for (const enemy of this.enemies) {
      if (resolveMaxEffectiveRangePx(enemy, this.gameData) <= 0) {
        enemy.engagedMeleeVisualSlot = undefined;
      }
    }
    melee.forEach((enemy, slot) => {
      enemy.engagedMeleeVisualSlot = slot;
    });
    this.engagedMeleeEnemySignature = this.getEngagedMeleeEnemySignature();
  }

  private resolveCurrentEngagedLayout(): EngagedLayoutResult | null {
    const offset = getBattleVisualOffset(this.players);
    if (offset === null) return null;

    return resolveEngagedLayout({
      allies: this.players
        .filter((ally) => this.isOnBattlefield(ally))
        .map((ally) => ({
          id: ally.id,
          role: ally.role,
          formationRow: ally.formationRow,
          rangePx: resolveFormationRangePx(ally),
          isAlive: ally.isAlive,
          visualX: ally.visualX,
          battleX: ally.battleX,
        })),
      enemies: this.enemies.map((enemy) => ({
        id: enemy.id,
        isAlive: enemy.isAlive,
        rangePx: resolveMaxEffectiveRangePx(enemy, this.gameData),
        battleX: enemy.battleX,
        engagedMeleeVisualSlot: enemy.engagedMeleeVisualSlot,
      })),
      playerContactBattleX: getPlayerContactX(this.players),
      battleVisualOffset: offset,
      frontEnemyVisualAnchor: getEngagedFrontEnemyVisualAnchor(
        this.players,
        this.enemies,
        offset,
      ),
      resolveRangedTargetVisualX: (enemyId) => {
        const enemy = this.enemies.find((unit) => unit.id === enemyId);
        if (!enemy) return null;
        const target = this.resolveEngagedRangedTargetPlayer(enemy);
        return target?.visualX ?? null;
      },
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

  /** 接敵開始: layout を1回だけ解決し screenAnchor を確定 */
  private setupEngagedCombat(): void {
    const placementInputs = this.getPlayerPlacementInputs().filter((p) => p.isAlive);
    const leadingRow = getLeadingPlayerFormationRow(placementInputs);
    const contact = leadingRowContactPlayer(this.players);

    this.freezeEngagedMeleeVisualSlots();
    const layout = this.resolveCurrentEngagedLayout();
    if (layout === null) return;

    const camera = this.engageDisplay.begin({
      players: this.players,
      enemies: this.enemies,
      combatCameraX: this.combatCameraX,
      leadingRow,
      contactVisualX: contact?.visualX ?? null,
      isOnField: (unit) => this.isOnBattlefield(unit),
      layout,
      gameData: this.gameData,
    });
    this.combatCameraX = camera.combatCameraX;
    this.cameraFocusLineX = camera.cameraFocusLineX;
    this.engagedMeleeEnemySignature = this.getEngagedMeleeEnemySignature();
  }

  private updateEngagedVisualMovement(deltaTime: number): void {
    const placementInputs = this.getPlayerPlacementInputs().filter((p) => p.isAlive);
    const leadingRow = getLeadingPlayerFormationRow(placementInputs);

    const meleeSignature = this.getEngagedMeleeEnemySignature();
    if (meleeSignature !== this.engagedMeleeEnemySignature) {
      if (meleeSignature !== null) {
        this.freezeEngagedMeleeVisualSlots();
        const layout = this.resolveCurrentEngagedLayout();
        if (layout !== null) {
          this.engageDisplay.recomputeEnemyTargets(
            layout,
            this.enemies,
            this.combatCameraX,
            this.gameData,
          );
        }
      }
      this.engagedMeleeEnemySignature = meleeSignature;
    }

    this.engageDisplay.tick(
      {
        players: this.players,
        enemies: this.enemies,
        combatCameraX: this.combatCameraX,
        leadingRow,
        isOnField: (unit) => this.isOnBattlefield(unit),
        gameData: this.gameData,
      },
      deltaTime,
    );
  }

  private applySkillMoveVisualOverlay(): void {
    for (const move of this.skillSequenceRunner.getActiveMoves()) {
      const unit = [...this.players, ...this.enemies].find(
        (u) => u.id === move.actorId,
      );
      if (!unit) continue;
      const baseVisualX = move.baseVisualX ?? unit.visualX;
      const t =
        move.toX === move.fromX
          ? 1
          : (unit.battleX - move.fromX) / (move.toX - move.fromX);
      unit.visualX = baseVisualX + (move.toVisualX - baseVisualX) * t;
    }
  }

  /** 接敵中: 前列 battleX が敵最前線を越えないよう clamp（スキル knockback 後） */
  private clampEngagedFrontRowBattleX(): void {
    const enemyContact = getEnemyContactX(this.enemies);
    if (enemyContact === null) return;
    const maxForward = enemyContact - engagedMinBodyGap();
    const placementInputs = this.getPlayerPlacementInputs().filter((p) => p.isAlive);
    const leadingRow = getLeadingPlayerFormationRow(placementInputs);
    if (leadingRow === null) return;
    for (const ally of this.players) {
      if (!ally.isAlive || ally.formationRow !== leadingRow) continue;
      if (ally.battleX > maxForward) {
        ally.battleX = maxForward;
      }
    }
  }

  /** 接敵中カメラ: 最前線接触ユニット基準（後列死亡で画面がずれない） */
  private resolveEngagedCameraFocusX(): number | null {
    const living = this.players.filter(
      (ally) => this.isOnBattlefield(ally) && ally.isAlive,
    );
    const contact = leadingRowContactPlayer(living);
    if (contact) {
      return contact.visualX + SPRITE_WIDTH / 2;
    }
    return this.resolvePartyCenterVisualX();
  }

  private updateCombatCamera(deltaTime: number): void {
    const focusX = this.resolveEngagedCameraFocusX();
    if (focusX === null) return;

    const step = CAMERA_PAN_SPEED * deltaTime;
    this.cameraFocusLineX = moveTowardX(
      this.cameraFocusLineX,
      focusX,
      step,
    );
    let targetCamera = COMBAT_CAMERA_CENTER_X - this.cameraFocusLineX;
    const maxCamera =
      BATTLE_CANVAS_W - BATTLE_UI_RIGHT_PAD - ROW_X.back - SPRITE_WIDTH;
    targetCamera = Math.min(targetCamera, maxCamera);
    const nextCamera = moveTowardX(this.combatCameraX, targetCamera, step);
    // 接敵中は左方向パンを抑え、前列右進軍と同調した単調パンのみ
    this.combatCameraX =
      nextCamera >= this.combatCameraX ? nextCamera : this.combatCameraX;
  }

  /** combatCameraX を visualX へ戻し screen X を維持したままカメラを 0 にする */
  private bakeCombatCameraIntoVisualX(
    filter: (unit: CombatantState) => boolean,
  ): void {
    if (this.combatCameraX === 0) return;
    const cameraX = this.combatCameraX;
    for (const ally of this.players) {
      if (filter(ally)) ally.visualX += cameraX;
    }
    for (const enemy of this.enemies) {
      if (filter(enemy)) enemy.visualX += cameraX;
    }
    this.resetCombatCamera();
  }

  private beginVictoryExit(): void {
    this.restoreAlliesToFormationMarch();
  }

  /** Wave クリア: 死亡敵の death 演出位置を固定してから待機へ */
  private bakeCombatCameraForWaveAdvance(): void {
    this.bakeCombatCameraIntoVisualX((unit) =>
      unit.isEnemy ? true : unit.isAlive,
    );
  }

  private resetCombatCamera(): void {
    this.combatCameraX = 0;
    this.cameraFocusLineX = ROW_X.front;
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
    this.waveIntermissionActive = false;
    this.waveIntermissionElapsed = 0;
    this.formationResetActive = false;
  }

  private isWaveTransitionSettling(): boolean {
    return (
      this.waveAdvanceDelayTimer > 0 ||
      this.formationResetActive ||
      this.waveIntermissionActive
    );
  }

  private shouldSuppressCombatSkills(): boolean {
    return (
      this.formationResetActive ||
      this.waveAdvanceDelayTimer > 0 ||
      this.pendingVictoryTimer > 0
    );
  }

  private isPostCombatSettling(): boolean {
    return this.waveAdvanceDelayTimer > 0 || this.pendingVictoryTimer > 0;
  }

  /** 敵全滅後: 死亡演出待ち → Wave 2+ はカメラ補正付き隊列リセット */
  private tickPostCombatSettle(deltaTime: number): void {
    if (this.waveAdvanceDelayTimer > 0) {
      this.waveAdvanceDelayTimer -= deltaTime;
      if (this.waveAdvanceDelayTimer <= 0) {
        this.startFormationReset();
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
    if (this.enemies.some((enemy) => enemy.isAlive)) return;
    this.engaged = false;
    this.clearEngagedVisualState();
    this.skillSequenceRunner.clearAll();
    this.formationRestorePhase = "lead";
    if (hasNextWave) {
      this.bakeCombatCameraForWaveAdvance();
      this.waveAdvanceDelayTimer = ENEMY_DEATH_SETTLE_DELAY_SEC;
    } else {
      this.bakeCombatCameraIntoVisualX(
        (unit) => !unit.isEnemy && unit.isAlive,
      );
      this.pendingVictoryTimer = ENEMY_DEATH_SETTLE_DELAY_SEC;
    }
  }

  private beginWaveApproachMarch(waveIndex: number): void {
    this.enemies = [];
    this.pendingNextWaveIndex = waveIndex;
    this.engaged = false;
    this.waveIntermissionActive = true;
    this.waveIntermissionElapsed = 0;
  }

  private spawnWaveEnemies(): void {
    this.enemies = createEnemiesForStage(
      this.gameData,
      this.stageId,
      this.waveIndex,
    );
    this.resetEnemyBattlePositions();
    this.resetEnemyVisualPositions();
    const actives = this.gameData.skillRegistry.actives;
    for (const enemy of this.enemies) {
      initializeSkillCooldowns(enemy, actives);
    }
  }

  private startFormationReset(): void {
    if (this.enemies.some((enemy) => enemy.isAlive)) return;
    this.engaged = false;
    this.clearEngagedVisualState();
    hideFallenAllyCorpses(this.players);
    if (this.pendingNextWaveIndex === null) return;
    this.enemies = [];
    this.formationResetActive = true;
    this.formationRestorePhase = "lead";
  }

  private tickCompensatedFormationReset(deltaTime: number): void {
    const units = this.getFormationRestoreUnits();
    const result = tickCompensatedFormationReset(
      {
        phase: this.formationRestorePhase,
        allies: units,
      },
      this.combatCameraX,
      deltaTime,
      FORMATION_RESTORE_SPEED,
    );
    this.formationRestorePhase = result.phase;
    this.combatCameraX = result.combatCameraX;
    for (const unit of units) {
      const ally = this.players.find((a) => a.id === unit.id);
      if (ally) ally.visualX = unit.visualX;
    }
  }

  private isFormationScreenLayoutRestored(): boolean {
    return isFormationScreenLayoutRestored(
      this.getFormationRestoreUnits(),
      this.combatCameraX,
    );
  }

  private completeWaveFormationReset(): void {
    const waveIndex = this.pendingNextWaveIndex;
    if (waveIndex === null) return;

    const units = this.getFormationRestoreUnits();
    snapFormationScreenLayout(units);
    for (const unit of units) {
      const ally = this.players.find((a) => a.id === unit.id);
      if (ally) ally.visualX = unit.visualX;
    }
    this.combatCameraX = 0;
    this.resetCombatCamera();
    assignInitialPlayerBattleX(this.players, this.gameData);
    this.formationRestorePhase = "lead";
    this.formationResetActive = false;
    this.waveIndex = waveIndex;
    this.spawnWaveEnemies();
    this.pendingNextWaveIndex = null;
  }

  /** Wave 1 開始 preamble 用（Wave 2+ は startFormationReset） */
  private startWaveIntermission(): void {
    this.engaged = false;
    this.clearEngagedVisualState();
    hideFallenAllyCorpses(this.players);
    if (this.pendingNextWaveIndex === null) return;
    this.enemies = [];
    this.waveIntermissionActive = true;
    this.waveIntermissionElapsed = 0;
  }

  private updateWaveIntermissionMarch(deltaTime: number): void {
    this.advanceWorldOffset(deltaTime);
    this.waveIntermissionElapsed += deltaTime;
  }

  private completeWaveIntermission(): void {
    const waveIndex = this.pendingNextWaveIndex;
    if (waveIndex === null) return;

    const units = this.getFormationRestoreUnits();
    snapFormationScreenLayout(units);
    for (const unit of units) {
      const ally = this.players.find((a) => a.id === unit.id);
      if (ally) ally.visualX = unit.visualX;
    }
    this.combatCameraX = 0;
    this.resetCombatCamera();
    assignInitialPlayerBattleX(this.players, this.gameData);
    this.waveIndex = waveIndex;
    this.spawnWaveEnemies();
    this.waveIntermissionActive = false;
    this.waveIntermissionElapsed = 0;
    this.pendingNextWaveIndex = null;
  }

  private applyVictoryTransition(survivingPartyIndices: number[]): void {
    // beginEnemyWipeSettle で既に bake 済み。再 bake / snap / カメラ reseed しない。
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
    this.resetCombatCamera();
    this.restartTimer = RESTART_DELAY_SEC;
    this.emit({
      type: "battleEnd",
      result: "defeat",
      survivingPartyIndices,
    });
  }

  private updateEngagementState(): void {
    if (this.engaged) return;
    if (shouldStartApproach(this.players, this.enemies, this.gameData)) {
      this.engaged = true;
      this.setupEngagedCombat();
    }
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
    this.resetCombatCamera();
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
        formationResetActive: this.formationResetActive,
        waveIntermissionActive: this.waveIntermissionActive,
        victoryAwaitExitMarch,
      }),
      engaged: this.engaged,
      waveIndex: this.waveIndex,
      waveCount,
      worldOffsetX: this.worldOffsetX,
      combatCameraX: this.combatCameraX,
      formationResetActive: this.formationResetActive,
      alliesOffScreen: this.areAlliesOffScreen(),
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
      visualX: c.visualX,
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
          this.tickStaggeredFormationRestore(deltaTime);
          if (this.isFormationSpacingRestored()) {
            this.victoryFormationReady = true;
          }
        } else {
          this.updateVictoryExitMarch(deltaTime);
        }
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
    this.tickPendingHitQueue();
    if (!this.shouldSuppressCombatSkills()) {
      this.tickSkillSequences(deltaTime);
    }
    if (this.pendingVictoryTimer > 0) {
      this.tickPostCombatSettle(deltaTime);
      this.tickStatusAndCooldowns(deltaTime, { suppressPeriodic: true });
      return;
    }
    if (this.formationResetActive) {
      this.advanceWorldOffset(deltaTime);
      this.tickCompensatedFormationReset(deltaTime);
      this.tickStatusAndCooldowns(deltaTime, { suppressPeriodic: true });
      if (this.isFormationScreenLayoutRestored()) {
        this.completeWaveFormationReset();
      }
      return;
    }
    if (this.waveIntermissionActive) {
      this.updateWaveIntermissionMarch(deltaTime);
      // Wave 1: 隊列は ROW_X のまま（Wave 2+ リセット完了位置と一致）。背景のみスクロール。
      if (this.pendingNextWaveIndex !== 0) {
        this.tickStaggeredFormationRestore(deltaTime);
      }
      this.tickStatusAndCooldowns(deltaTime);
      if (this.waveIntermissionElapsed >= WAVE_APPROACH_MARCH_SEC) {
        this.completeWaveIntermission();
      }
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
      const suppressPeriodic =
        this.waveAdvanceDelayTimer > 0 ||
        this.formationResetActive ||
        this.pendingVictoryTimer > 0;
      this.tickPostCombatSettle(deltaTime);
      this.tickStatusAndCooldowns(deltaTime, { suppressPeriodic });
      return;
    }
    if (!this.engaged) {
      this.advanceWorldOffset(deltaTime);
      this.applyEnemyMarch(SCROLL_SPEED * deltaTime);
      this.updateEngagementState();
      this.tickStatusAndCooldowns(deltaTime);
      if (
        this.enemies.length > 0 &&
        !this.enemies.some((enemy) => enemy.isAlive)
      ) {
        this.checkBattleEnd();
        if (this.isPostCombatSettling()) {
          const suppressPeriodic =
            this.waveAdvanceDelayTimer > 0 ||
            this.formationResetActive ||
            this.pendingVictoryTimer > 0;
          this.tickPostCombatSettle(deltaTime);
          this.tickStatusAndCooldowns(deltaTime, { suppressPeriodic });
        }
      }
    } else {
      if (!this.enemies.some((enemy) => enemy.isAlive)) {
        this.checkBattleEnd();
        if (this.isPostCombatSettling()) {
          const suppressPeriodic =
            this.waveAdvanceDelayTimer > 0 ||
            this.formationResetActive ||
            this.pendingVictoryTimer > 0;
          this.tickPostCombatSettle(deltaTime);
          this.tickStatusAndCooldowns(deltaTime, { suppressPeriodic });
        }
        return;
      }
      this.updateEngagedBattleMovement(deltaTime);
      this.updateEngagedVisualMovement(deltaTime);
      this.applySkillMoveVisualOverlay();
      this.updateCombatCamera(deltaTime);
      this.tickStatusAndCooldowns(deltaTime);
      // 敵→味方の順でスキル解決し、同 tick 内で付与したバリア等が描画前に消費されないようにする
      this.runUnitSkills(this.enemies);
      this.runUnitSkills(this.players);
      this.clampEngagedFrontRowBattleX();
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
    tickCountTriggerCooldowns(
      unit.cooldowns,
      this.gameData.skillRegistry.actives,
      kind,
    );
  }

  private runUnitSkills(actors: CombatantState[]): void {
    for (const actor of actors) {
      if (!actor.isAlive || isUnitStunned(actor)) continue;
      const ordered = this.orderCooldowns(actor.cooldowns);
      for (const cd of ordered) {
        if (cd.remaining > 0) continue;
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
        stage !== undefined && this.waveIndex + 1 < stage.waves.length;
      if (hasNextWave) {
        if (
          this.pendingNextWaveIndex !== null ||
          this.waveIntermissionActive ||
          this.formationResetActive ||
          this.waveAdvanceDelayTimer > 0
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
    this.resetCombatCamera();
    this.engaged = false;
    this.phase = "running";
  }
}
