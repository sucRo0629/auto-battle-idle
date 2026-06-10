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
  assignInitialAllyBattleX,
  getAllyContactX,
  getBattleVisualOffset,
  getEngagedFrontEnemyVisualAnchor,
  leadingRowContactAlly,
  getEnemyContactX,
  marchEnemiesRight as marchEnemiesBattleRight,
  resolveEnemyMarchCapX,
  resolveMaxEffectiveRangePx,
  SCROLL_SPEED,
  separateByGap,
  shouldStartApproach,
  syncEnemyVisualToBattleContact,
  updateUnitApproach,
} from "./combatPosition.ts";
import {
  resolveAllyApproachBattleX,
  resolveEnemyApproachBattleX,
  resolveEnemyBasicAttackTarget,
} from "./resolveApproachBattleX.ts";
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
import {
  applyStaggeredFormationMarchRestore,
  approachAllyVisualX,
  approachEnemyVisualX,
  clampAllyVisualDepth,
  clampEngagedEnemyGroupOnScreen,
  computeAllyPositions,
  computeEngagedAllyLaneOffsets,
  ENGAGED_VISUAL_TUNING,
  getFrontEnemyX,
  getLeadingAllyFormationRow,
  isFormationScreenLayoutRestored,
  isFormationSpacingRestored,
  moveTowardX,
  resolveEngagedContactVisualX,
  resolveEngagedLayout,
  separateEngagedSprites,
  snapFormationScreenLayout,
  tickCompensatedFormationReset,
  type EngagedLayoutResult,
  type FormationRestorePhase,
  ROW_X,
  SPRITE_GAP,
  SPRITE_WIDTH,
  toVisualCombatant,
} from "../render/formationLayout.ts";
import { SkillExecutor } from "./skills/SkillExecutor.ts";
import { tickPendingHits } from "./skills/pendingSkillHits.ts";
import { SkillSequenceRunner } from "./skills/skillSequence.ts";
import {
  initializeSkillCooldowns,
  resolveSkillTrigger,
  shouldTickCooldown,
  tickCountTriggerCooldowns,
} from "./skillTrigger.ts";
import type { BattlePhase, BattleSnapshot, CombatantState, GameData, PartySlotState, PendingSkillHit, SkillCooldown, SkillTriggerKind, StatusEffect } from "./types.ts";
import { BATTLE_ENEMY_MARCH_VISIBLE_MIN_X } from "./types.ts";
import type { LevelCurvesConfig } from "../progression/levelGrowth.ts";

const RESTART_DELAY_SEC = 3;
const VICTORY_EXIT_SPEED = SCROLL_SPEED * 2;
const OVERLAY_TICK_SEC = 1;
const COMBAT_CAMERA_CENTER_X = 240;
const CAMERA_PAN_SPEED = 400;
const BATTLE_CANVAS_W = 480;
const BATTLE_UI_RIGHT_PAD = 16;
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
  private allies: CombatantState[] = [];
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
  /** 最前線列の生存メンバー変化検知（レーン再固定用） */
  private engagedLeadingRowSignature: string | null = null;
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
      getAllCombatants: () => [...this.allies, ...this.enemies],
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
        getAllCombatants: () => [...this.allies, ...this.enemies],
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
    this.allies = createAlliesFromPartyState(
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
      this.allies,
      this.enemies,
      this.gameData.skillRegistry.passives,
    );
  }

  private initBattlePassiveState(): void {
    const passives = this.gameData.skillRegistry.passives;
    const actives = this.gameData.skillRegistry.actives;
    initializeAllyThreat(this.allies);
    syncHotAuras(this.allies, this.enemies, passives);
    syncBlockAuras(this.allies, this.enemies, passives);
    syncDamageReductionAuras(this.allies, this.enemies, passives);
    syncSelfHpRatioBuffAuras(this.allies, this.enemies, passives);
    this.periodicDispelStates.clear();
    this.periodicHotStates.clear();
    for (const unit of [...this.allies, ...this.enemies]) {
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

  private getAllyPlacementInputs() {
    return this.allies
      .filter((a) => this.isOnBattlefield(a))
      .map((a) => ({
        id: a.id,
        role: a.role,
        formationRow: a.formationRow,
        rangePx: resolveMaxEffectiveRangePx(a, this.gameData),
        isAlive: a.isAlive,
      }));
  }

  private getLivingAllyLineInputs() {
    return this.allies
      .filter((a) => a.isAlive)
      .map((a) => ({
        id: a.id,
        role: a.role,
        formationRow: a.formationRow,
        rangePx: resolveMaxEffectiveRangePx(a, this.gameData),
        isAlive: true as const,
        visualX: a.visualX,
      }));
  }

  private getVisualAllies() {
    return this.allies
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
    const positions = computeAllyPositions(this.getAllyPlacementInputs(), {
      engaged,
      frontEnemyX: frontEnemyX ?? undefined,
    });
    for (const ally of this.allies) {
      if (!this.isOnBattlefield(ally)) continue;
      ally.visualX = positions.get(ally.id) ?? ally.visualX;
    }
  }

  private getFormationRestoreUnits() {
    return this.allies
      .filter((ally) => this.isOnBattlefield(ally) && ally.isAlive)
      .map((ally) => ({
        id: ally.id,
        role: ally.role,
        formationRow: ally.formationRow,
        isAlive: true as const,
        visualX: ally.visualX,
      }));
  }

  private isFormationSpacingRestored(): boolean {
    return isFormationSpacingRestored(this.getFormationRestoreUnits());
  }

  /** 非接敵: 左進軍しつつ段階的に隊列間隔を広げる */
  private tickStaggeredFormationRestore(deltaTime: number): void {
    const units = this.getFormationRestoreUnits();
    this.formationRestorePhase = applyStaggeredFormationMarchRestore(
      {
        phase: this.formationRestorePhase,
        allies: units,
      },
      deltaTime,
      FORMATION_RESTORE_SPEED,
    );
    for (const unit of units) {
      const ally = this.allies.find((a) => a.id === unit.id);
      if (ally) ally.visualX = unit.visualX;
    }
    this.alignPartyCenterCamera();
  }

  /** 生存味方スプライト中心の visualX */
  private resolvePartyCenterVisualX(): number | null {
    const living = this.allies.filter(
      (ally) => this.isOnBattlefield(ally) && ally.isAlive,
    );
    if (living.length === 0) return null;
    const centers = living.map((ally) => ally.visualX + SPRITE_WIDTH / 2);
    return centers.reduce((sum, x) => sum + x, 0) / centers.length;
  }

  /** パーティ全員がなるべく画面中央に映るよう combatCameraX を設定 */
  private alignPartyCenterCamera(): void {
    const center = this.resolvePartyCenterVisualX();
    if (center === null) return;

    this.cameraFocusLineX = center;
    let targetCamera = COMBAT_CAMERA_CENTER_X - center;
    const maxCamera =
      BATTLE_CANVAS_W - BATTLE_UI_RIGHT_PAD - ROW_X.back - SPRITE_WIDTH;
    this.combatCameraX = Math.min(targetCamera, maxCamera);
  }

  /** 接敵終了 bake 後: パーティ中心でカメラ seed */
  private seedPostCombatFormationCamera(): void {
    this.alignPartyCenterCamera();
  }

  /** 非接敵進軍・戦闘区切り: battleX を隊列へ。visualX は instant 時のみ即時同期 */
  private restoreAlliesToFormationMarch(instant = false): void {
    assignInitialAllyBattleX(this.allies);
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
    const minScreen = this.engaged ? 0 : BATTLE_ENEMY_MARCH_VISIBLE_MIN_X;
    const screenX = visualX + this.combatCameraX;
    if (screenX >= minScreen) return visualX;
    return minScreen - this.combatCameraX;
  }

  private applyEnemyVisualFromBattle(): void {
    syncEnemyVisualToBattleContact(this.allies, this.enemies);
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
    const positions = marchEnemiesBattleRight(
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
        this.allies,
        this.gameData,
        this.enemies,
      );
      if (marchCap !== null) {
        x = Math.min(x, marchCap);
      }
      enemy.battleX = x;
    }
    this.syncEnemyVisualFromBattle();
  }

  private updateVictoryExitMarch(deltaTime: number): void {
    const step = VICTORY_EXIT_SPEED * deltaTime;
    for (const ally of this.allies) {
      ally.visualX -= step;
    }
  }

  private hasFallenAllies(): boolean {
    return this.allies.some((ally) => !ally.isAlive);
  }

  private areAlliesOffScreen(): boolean {
    if (this.allies.length === 0) return true;
    return this.allies.every((ally) => ally.visualX + SPRITE_WIDTH <= 0);
  }

  private updateEngagedBattleMovement(deltaTime: number): void {
    const enemyContact = getEnemyContactX(this.enemies);
    const allyContact = getAllyContactX(this.allies);
    if (enemyContact === null || allyContact === null) return;

    const approachStep = BATTLE_APPROACH_SPEED * deltaTime;

    for (const ally of this.allies) {
      if (this.skillSequenceRunner.isActorBusy(ally.id)) continue;
      const target = resolveAllyApproachBattleX(
        ally,
        this.allies,
        this.enemies,
        this.gameData,
      );
      updateUnitApproach(ally, target, approachStep);
    }

    for (const enemy of this.enemies) {
      if (this.skillSequenceRunner.isActorBusy(enemy.id)) continue;
      const target = resolveEnemyApproachBattleX(
        enemy,
        this.allies,
        this.enemies,
        this.gameData,
      );
      updateUnitApproach(enemy, target, approachStep);
    }
  }

  private clearEngagedVisualState(): void {
    this.engagedLeadingRowSignature = null;
    this.engagedMeleeEnemySignature = null;
    for (const unit of [...this.allies, ...this.enemies]) {
      unit.engagedVisualLaneX = undefined;
      unit.engagedMeleeVisualSlot = undefined;
      unit.engagedVisualTargetAllyId = undefined;
    }
  }

  private getEngagedLeadingRowSignature(): string | null {
    const inputs = this.getAllyPlacementInputs().filter((ally) => ally.isAlive);
    const leadingRow = getLeadingAllyFormationRow(inputs);
    if (leadingRow === null) return null;
    const ids = inputs
      .filter((ally) => ally.formationRow === leadingRow)
      .map((ally) => ally.id)
      .sort()
      .join(",");
    return `${leadingRow}:${ids}`;
  }

  /** 前列構成変化時のみレーンを固定（振動防止） */
  private refreshEngagedVisualLanes(): void {
    const offset = getBattleVisualOffset(this.allies);
    const allyInputs = this.allies
      .filter((ally) => this.isOnBattlefield(ally))
      .map((ally) => ({
        id: ally.id,
        role: ally.role,
        formationRow: ally.formationRow,
        rangePx: resolveMaxEffectiveRangePx(ally, this.gameData),
        isAlive: ally.isAlive,
        visualX: ally.visualX,
        battleX: ally.battleX,
      }));
    const contactVisual = resolveEngagedContactVisualX(
      allyInputs,
      getAllyContactX(this.allies),
      offset ?? 0,
    );
    const frontEnemyAnchor = getEngagedFrontEnemyVisualAnchor(
      this.allies,
      this.enemies,
      offset,
    );
    if (offset === null || contactVisual === null || frontEnemyAnchor === null) {
      return;
    }

    const lanes = computeEngagedAllyLaneOffsets(
      this.getAllyPlacementInputs(),
      frontEnemyAnchor,
      contactVisual,
    );
    const contact = leadingRowContactAlly(this.allies);
    const contactLane = contact ? (lanes.get(contact.id) ?? 0) : 0;
    for (const ally of this.allies) {
      if (!this.isOnBattlefield(ally)) continue;
      if (ally.formationRow === "back") {
        ally.engagedVisualLaneX = 0;
        continue;
      }
      ally.engagedVisualLaneX = (lanes.get(ally.id) ?? 0) - contactLane;
    }
    if (contact && contactLane !== 0) {
      contact.visualX += contactLane;
    }
    this.engagedLeadingRowSignature = this.getEngagedLeadingRowSignature();
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
      .sort((a, b) => b.battleX - a.battleX);
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
    const offset = getBattleVisualOffset(this.allies);
    if (offset === null) return null;

    return resolveEngagedLayout({
      allies: this.allies
        .filter((ally) => this.isOnBattlefield(ally))
        .map((ally) => ({
          id: ally.id,
          role: ally.role,
          formationRow: ally.formationRow,
          rangePx: resolveMaxEffectiveRangePx(ally, this.gameData),
          isAlive: ally.isAlive,
          visualX: ally.visualX,
          battleX: ally.battleX,
          engagedVisualLaneX: ally.engagedVisualLaneX,
        })),
      enemies: this.enemies.map((enemy) => ({
        id: enemy.id,
        isAlive: enemy.isAlive,
        rangePx: resolveMaxEffectiveRangePx(enemy, this.gameData),
        battleX: enemy.battleX,
        engagedMeleeVisualSlot: enemy.engagedMeleeVisualSlot,
      })),
      allyContactBattleX: getAllyContactX(this.allies),
      battleVisualOffset: offset,
      frontEnemyVisualAnchor: getEngagedFrontEnemyVisualAnchor(
        this.allies,
        this.enemies,
        offset,
      ),
      resolveRangedTargetVisualX: (enemyId) => {
        const enemy = this.enemies.find((unit) => unit.id === enemyId);
        if (!enemy) return null;
        const target = this.resolveEngagedRangedTargetAlly(enemy);
        return target?.visualX ?? null;
      },
    });
  }

  /** 接敵開始時: 遠距離敵の狙い味方だけ固定（ターゲット切替のちらつき防止） */
  private freezeEngagedRangedTargets(): void {
    for (const enemy of this.enemies) {
      if (!enemy.isAlive) continue;
      if (resolveMaxEffectiveRangePx(enemy, this.gameData) <= 0) continue;
      const target = resolveEnemyBasicAttackTarget(
        enemy,
        this.allies,
        this.enemies,
        this.gameData,
      );
      enemy.engagedVisualTargetAllyId = target?.id;
    }
  }

  /** 接敵中: resolver 目標へ補間のみ適用 */
  private applyEngagedVisualLayoutFromBattle(deltaTime: number): void {
    const layout = this.resolveCurrentEngagedLayout();
    if (layout === null) return;

    const moveStep = ENGAGED_VISUAL_TUNING.engageMoveSpeedPxPerSec * deltaTime;

    for (const ally of this.allies) {
      if (!this.isOnBattlefield(ally)) continue;
      const target = layout.allyVisualX.get(ally.id);
      if (target !== undefined) {
        ally.visualX = approachAllyVisualX(ally.visualX, target, moveStep);
      }
    }
    clampAllyVisualDepth(this.allies);

    for (const enemy of this.enemies) {
      if (!enemy.isAlive) continue;
      const target = layout.enemyVisualX.get(enemy.id);
      if (target !== undefined) {
        enemy.visualX = approachEnemyVisualX(enemy.visualX, target, moveStep);
      }
    }
    const clampedEnemies = clampEngagedEnemyGroupOnScreen(
      this.enemies
        .filter((enemy) => enemy.isAlive)
        .map((enemy) => ({
          id: enemy.id,
          visualX: enemy.visualX,
          isAlive: true as const,
        })),
      this.combatCameraX,
    );
    for (const enemy of this.enemies) {
      const x = clampedEnemies.get(enemy.id);
      if (x !== undefined) {
        enemy.visualX = x;
      }
    }
  }

  private resolveEngagedRangedTargetAlly(
    enemy: CombatantState,
  ): CombatantState | undefined {
    let target = enemy.engagedVisualTargetAllyId
      ? this.allies.find(
          (ally) =>
            ally.id === enemy.engagedVisualTargetAllyId && ally.isAlive,
        )
      : undefined;
    if (!target) {
      target =
        resolveEnemyBasicAttackTarget(
          enemy,
          this.allies,
          this.enemies,
          this.gameData,
        ) ?? undefined;
      if (target) enemy.engagedVisualTargetAllyId = target.id;
    }
    return target;
  }

  private snapEngagedVisualLayout(): void {
    this.freezeEngagedRangedTargets();
    this.freezeEngagedMeleeVisualSlots();
    this.refreshEngagedVisualLanes();
    const layout = this.resolveCurrentEngagedLayout();
    if (layout !== null) {
      this.cameraFocusLineX = layout.frontLineVisualX;
    }
  }

  private updateEngagedVisualMovement(deltaTime: number): void {
    const allySignature = this.getEngagedLeadingRowSignature();
    if (
      allySignature !== null &&
      allySignature !== this.engagedLeadingRowSignature
    ) {
      this.refreshEngagedVisualLanes();
    }
    const meleeSignature = this.getEngagedMeleeEnemySignature();
    if (meleeSignature !== this.engagedMeleeEnemySignature) {
      if (meleeSignature !== null) {
        this.freezeEngagedMeleeVisualSlots();
      } else {
        this.refreshEngagedVisualLanes();
        this.engagedMeleeEnemySignature = null;
      }
    }
    this.applyEngagedVisualLayoutFromBattle(deltaTime);
  }

  private applySkillMoveVisualOverlay(): void {
    for (const move of this.skillSequenceRunner.getActiveMoves()) {
      const unit = [...this.allies, ...this.enemies].find(
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

  private updateCombatCamera(deltaTime: number): void {
    const partyCenter = this.resolvePartyCenterVisualX();
    if (partyCenter === null) return;

    const step = CAMERA_PAN_SPEED * deltaTime;
    this.cameraFocusLineX = moveTowardX(
      this.cameraFocusLineX,
      partyCenter,
      step,
    );
    let targetCamera = COMBAT_CAMERA_CENTER_X - this.cameraFocusLineX;
    const maxCamera =
      BATTLE_CANVAS_W - BATTLE_UI_RIGHT_PAD - ROW_X.back - SPRITE_WIDTH;
    targetCamera = Math.min(targetCamera, maxCamera);
    this.combatCameraX = moveTowardX(this.combatCameraX, targetCamera, step);
  }

  /** combatCameraX を visualX へ戻し screen X を維持したままカメラを 0 にする */
  private bakeCombatCameraIntoVisualX(
    filter: (unit: CombatantState) => boolean,
  ): void {
    if (this.combatCameraX === 0) return;
    const cameraX = this.combatCameraX;
    for (const ally of this.allies) {
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
      this.tickStaggeredFormationRestore(deltaTime);
      this.pendingVictoryTimer -= deltaTime;
      if (this.pendingVictoryTimer <= 0) {
        this.applyVictoryTransition(this.pendingVictorySurvivors ?? []);
        this.pendingVictorySurvivors = null;
      }
    }
  }

  private beginEnemyWipeSettle(hasNextWave: boolean): void {
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
      this.seedPostCombatFormationCamera();
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
    this.engaged = false;
    this.clearEngagedVisualState();
    hideFallenAllyCorpses(this.allies);
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
      const ally = this.allies.find((a) => a.id === unit.id);
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
      const ally = this.allies.find((a) => a.id === unit.id);
      if (ally) ally.visualX = unit.visualX;
    }
    this.combatCameraX = 0;
    this.resetCombatCamera();
    assignInitialAllyBattleX(this.allies);
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
    hideFallenAllyCorpses(this.allies);
    if (this.pendingNextWaveIndex === null) return;
    this.enemies = [];
    this.waveIntermissionActive = true;
    this.waveIntermissionElapsed = 0;
  }

  private updateWaveIntermissionMarch(deltaTime: number): void {
    this.worldOffsetX += SCROLL_SPEED * deltaTime;
    this.waveIntermissionElapsed += deltaTime;
  }

  private completeWaveIntermission(): void {
    const waveIndex = this.pendingNextWaveIndex;
    if (waveIndex === null) return;

    this.alignPartyCenterCamera();
    this.waveIndex = waveIndex;
    this.spawnWaveEnemies();
    this.waveIntermissionActive = false;
    this.waveIntermissionElapsed = 0;
    this.pendingNextWaveIndex = null;
  }

  private applyVictoryTransition(survivingPartyIndices: number[]): void {
    if (this.combatCameraX !== 0) {
      this.bakeCombatCameraIntoVisualX(
        (unit) => !unit.isEnemy && unit.isAlive,
      );
    }
    this.phase = "victory";
    this.engaged = false;
    this.clearEngagedVisualState();
    this.victoryFormationReady = this.isFormationSpacingRestored();
    this.beginVictoryExit();
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
    hideFallenAllyCorpses(this.allies);
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
    if (shouldStartApproach(this.allies, this.enemies, this.gameData)) {
      if (this.combatCameraX !== 0) {
        this.bakeCombatCameraIntoVisualX(() => true);
      }
      this.engaged = true;
      this.snapEngagedVisualLayout();
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
    for (const ally of this.allies) {
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
    return {
      phase: this.phase,
      engaged: this.engaged,
      waveIndex: this.waveIndex,
      waveCount,
      worldOffsetX: this.worldOffsetX,
      combatCameraX: this.combatCameraX,
      formationResetActive: this.formationResetActive,
      alliesOffScreen: this.areAlliesOffScreen(),
      victoryUseTimerFade: this.phase === "victory",
      victoryAwaitExitMarch:
        this.phase === "victory" && !this.hasFallenAllies(),
      allies: this.allies.map((c) => this.toSnapshot(c)),
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
    if (this.formationResetActive) {
      this.tickCompensatedFormationReset(deltaTime);
      this.tickStatusAndCooldowns(deltaTime, { suppressPeriodic: true });
      if (this.isFormationScreenLayoutRestored()) {
        this.completeWaveFormationReset();
      }
      return;
    }
    if (this.waveIntermissionActive) {
      this.updateWaveIntermissionMarch(deltaTime);
      this.tickStaggeredFormationRestore(deltaTime);
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
      this.applyEnemyMarch(SCROLL_SPEED * deltaTime);
      this.updateEngagementState();
      this.tickStatusAndCooldowns(deltaTime);
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
      this.runUnitSkills(this.allies);
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
    this.tickCooldowns(this.allies, deltaTime);
    this.tickCooldowns(this.enemies, deltaTime);
  }

  private tickAllyThreat(deltaTime: number): void {
    refreshAlliesBaseThreat(this.allies);
    for (const ally of this.allies) {
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
    const units = [...this.allies, ...this.enemies];
    this.skillSequenceRunner.tickUseLocks(deltaTime);
    this.skillSequenceRunner.tickMoves(deltaTime, units);
    this.skillSequenceRunner.tickSequences(this.battleTimeSec, (step) => {
      this.executor.applyScheduledStep(step, this.allies, this.enemies);
    });
  }

  private tickPeriodicHots(deltaTime: number): void {
    const passives = this.gameData.skillRegistry.passives;
    for (const actor of this.allies) {
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
          this.allies,
          this.enemies,
        );
      }
    }
  }

  private tickPeriodicDispels(deltaTime: number): void {
    const passives = this.gameData.skillRegistry.passives;
    for (const actor of [...this.allies, ...this.enemies]) {
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
        const targets = pickTargets(spec, actor, this.allies, this.enemies);
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
    for (const unit of [...this.allies, ...this.enemies]) {
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
    return [...this.allies, ...this.enemies].find((unit) => unit.id === id);
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
    const unit = [...this.allies, ...this.enemies].find((u) => u.id === unitId);
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
        this.executor.tryExecute(actor, cd, this.allies, this.enemies);
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
    const alliesAlive = this.allies.some((a) => a.isAlive);
    const enemiesAlive = this.enemies.some((e) => e.isAlive);
    const survivingPartyIndices = this.allies
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
