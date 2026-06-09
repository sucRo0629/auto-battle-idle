import type { BattleEventListener } from "./events.ts";
import { resolveDotAmountFromStatus, resolveHotAmountFromStatus, applyDamageToTarget, applyHealToTarget } from "./combatMath.ts";
import {
  createAlliesFromPartyState,
  createCooldowns,
  createEnemiesForStage,
  hideFallenAllyCorpses,
  resetEntityIdCounter,
} from "./entities.ts";
import { getBasicCooldownRate } from "../progression/levelGrowth.ts";
import { resolveAttackSpeedTier } from "../progression/memberStatsDisplay.ts";
import {
  APPROACH_SPEED as BATTLE_APPROACH_SPEED,
  assignInitialAllyBattleX,
  getAllyContactX,
  getBattleVisualOffset,
  getEngagedFrontEnemyVisualAnchor,
  getEnemyContactX,
  marchEnemiesRight as marchEnemiesBattleRight,
  resolveEnemyMarchCapX,
  resolveMaxEffectiveRangePx,
  SCROLL_SPEED,
  separateByGap,
  shouldStartApproach,
  updateUnitApproach,
} from "./combatPosition.ts";
import {
  resolveAllyApproachBattleX,
  resolveEnemyApproachBattleX,
  resolveEnemyBasicAttackTarget,
} from "./resolveApproachBattleX.ts";
import { isUnitStunned } from "./ccEffects.ts";
import {
  applyDamageTakenToHeal,
  resolveIncomingHealAmount,
  applyPassiveHotFromPassive,
  getPeriodicDispelReady,
  getPeriodicHotReady,
  initializeCountTriggerCooldowns,
  initializePeriodicDispelStates,
  initializePeriodicHotStates,
  syncHotAuras,
  syncBlockAuras,
  syncDamageReductionAuras,
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
  clampAllyVisualDepth,
  computeAllyPositions,
  computeEngagedAllyLaneOffsets,
  computeRangedEnemyVisualX,
  ENGAGED_VISUAL_TUNING,
  engagedFrontLineStandoffGap,
  getFrontEnemyX,
  getLeadingAllyFormationRow,
  moveTowardX,
  resolveEngagedMeleeEnemyVisuals,
  resolveStableAllyEngagedVisuals,
  ROW_X,
  separateEnemySprites,
  SPRITE_GAP,
  SPRITE_WIDTH,
  toVisualCombatant,
} from "../render/formationLayout.ts";
import { SkillExecutor } from "./skills/SkillExecutor.ts";
import { tickPendingHits } from "./skills/pendingSkillHits.ts";
import { SkillSequenceRunner } from "./skills/skillSequence.ts";
import {
  resolveSkillTrigger,
  shouldTickCooldown,
  tickCountTriggerCooldowns,
} from "./skillTrigger.ts";
import type {
  BattlePhase,
  BattleSnapshot,
  CombatantState,
  GameData,
  PartySlotState,
  PendingSkillHit,
  SkillCooldown,
  SkillTriggerKind,
  StatusEffect,
} from "./types.ts";
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
  private engaged = false;
  /** 接敵開始時に固定する visualX − battleX（フレーム間で変動させない） */
  private engagedBattleVisualOffset: number | null = null;
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
      onDamageApplied: (actor, target, amount) => {
        this.handleDamageThreat(actor, target, amount);
      },
      onDebuffApplied: (actor) => {
        applyThreatFromDebuffApply(actor);
      },
    });
    this.reloadBattlefield();
  }

  private handleDamageThreat(
    actor: CombatantState,
    target: CombatantState,
    amount: number,
  ): void {
    applyThreatFromDamage(actor, target, amount);
    if (!target.isEnemy && target.isAlive && amount > 0) {
      applyDamageTakenToHeal(
        target,
        amount,
        this.gameData.skillRegistry.passives,
      );
    }
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
    this.engagedBattleVisualOffset = null;
    this.clearEngagedVisualState();
    this.restoreAlliesToFormationMarch();
    this.clearPendingVictory();
    this.clearPendingDefeat();
    this.clearPendingWaveAdvance();
    this.beginWaveApproachMarch(0);
    this.initBattlePassiveState();
  }

  private initBattlePassiveState(): void {
    const passives = this.gameData.skillRegistry.passives;
    const actives = this.gameData.skillRegistry.actives;
    initializeAllyThreat(this.allies);
    syncHotAuras(this.allies, this.enemies, passives);
    syncBlockAuras(this.allies, this.enemies, passives);
    syncDamageReductionAuras(this.allies, this.enemies, passives);
    this.periodicDispelStates.clear();
    this.periodicHotStates.clear();
    for (const unit of [...this.allies, ...this.enemies]) {
      initializeCountTriggerCooldowns(unit, actives);
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

  /** 非接敵進軍・戦闘区切り: フィールド在席者の visualX を隊列へ戻す */
  private restoreAlliesToFormationMarch(): void {
    assignInitialAllyBattleX(this.allies);
    this.syncAllyVisualPositions(false);
  }

  private resetEnemyVisualPositions(): void {
    for (const enemy of this.enemies) {
      enemy.visualX = enemy.spawnX!;
    }
    const separated = separateEnemySprites(
      this.enemies.map((enemy) => ({
        id: enemy.id,
        visualX: enemy.visualX,
        isAlive: enemy.isAlive,
      })),
    );
    for (const enemy of this.enemies) {
      const x = separated.get(enemy.id);
      if (x !== undefined) {
        enemy.visualX = x;
      }
    }
  }

  private syncEnemyVisualFromBattle(): void {
    for (const enemy of this.enemies) {
      enemy.visualX = enemy.battleX;
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

  private getEngagedFrontLineVisualX(): number | null {
    const contact = getAllyContactX(this.allies);
    const offset = this.engagedBattleVisualOffset;
    if (contact === null || offset === null) return null;
    return contact + offset;
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

  /** 接敵中: 固定レーン + battleX オフセット描画（味方↔敵 visual 相互参照なし） */
  private applyEngagedVisualLayoutFromBattle(deltaTime: number): void {
    const offset = this.engagedBattleVisualOffset;
    if (offset === null) return;

    const contactVisual = this.getEngagedFrontLineVisualX();
    if (contactVisual === null) return;

    const moveStep = ENGAGED_VISUAL_TUNING.engageVisualMoveSpeed * deltaTime;

    const allyPositions = resolveStableAllyEngagedVisuals(
      this.allies
        .filter((ally) => this.isOnBattlefield(ally))
        .map((ally) => ({
          id: ally.id,
          formationRow: ally.formationRow,
          isAlive: ally.isAlive,
          engagedVisualLaneX: ally.engagedVisualLaneX,
        })),
      contactVisual,
    );
    for (const ally of this.allies) {
      if (!this.isOnBattlefield(ally)) continue;
      const target = allyPositions.get(ally.id);
      if (target !== undefined) {
        ally.visualX = moveTowardX(ally.visualX, target, moveStep);
      }
    }
    clampAllyVisualDepth(this.allies);

    const frontLineStandoff = engagedFrontLineStandoffGap();
    const enemyFrontTargetX = contactVisual - frontLineStandoff;

    const meleePositions = resolveEngagedMeleeEnemyVisuals(
      this.enemies.map((enemy) => ({
        id: enemy.id,
        isAlive: enemy.isAlive,
        engagedMeleeVisualSlot: enemy.engagedMeleeVisualSlot,
      })),
      enemyFrontTargetX,
    );
    for (const enemy of this.enemies) {
      if (!enemy.isAlive) continue;
      const rangePx = resolveMaxEffectiveRangePx(enemy, this.gameData);
      if (rangePx > 0) {
        const targetAlly = this.resolveEngagedRangedTargetAlly(enemy);
        if (targetAlly) {
          const target = computeRangedEnemyVisualX(
            targetAlly.battleX + offset,
          );
          enemy.visualX = moveTowardX(enemy.visualX, target, moveStep);
        }
        continue;
      }
      const target = meleePositions.get(enemy.id);
      if (target !== undefined) {
        enemy.visualX = moveTowardX(enemy.visualX, target, moveStep);
      }
    }
  }

  /** 接敵列の横ずれを固定（隊列と standoff のブレンド） */
  private refreshEngagedVisualLanes(): void {
    const offset = this.engagedBattleVisualOffset;
    const contactVisual = this.getEngagedFrontLineVisualX();
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
    for (const ally of this.allies) {
      if (!this.isOnBattlefield(ally)) continue;
      if (ally.formationRow === "back") {
        ally.engagedVisualLaneX = 0;
        continue;
      }
      ally.engagedVisualLaneX = lanes.get(ally.id) ?? 0;
    }
    this.engagedLeadingRowSignature = this.getEngagedLeadingRowSignature();
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
    const frontLine = this.getEngagedFrontLineVisualX();
    if (frontLine !== null) {
      this.cameraFocusLineX = frontLine;
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
    if (
      meleeSignature !== null &&
      meleeSignature !== this.engagedMeleeEnemySignature
    ) {
      this.freezeEngagedMeleeVisualSlots();
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
    const frontLineTargetX = this.getEngagedFrontLineVisualX();
    if (frontLineTargetX === null) return;

    const step = CAMERA_PAN_SPEED * deltaTime;
    this.cameraFocusLineX = moveTowardX(
      this.cameraFocusLineX,
      frontLineTargetX,
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
    this.bakeCombatCameraIntoVisualX((unit) => !unit.isEnemy && unit.isAlive);
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
    for (const enemy of this.enemies) {
      initializeCountTriggerCooldowns(
        enemy,
        this.gameData.skillRegistry.actives,
      );
    }
  }

  private startWaveIntermission(): void {
    this.engaged = false;
    this.engagedBattleVisualOffset = null;
    this.clearEngagedVisualState();
    hideFallenAllyCorpses(this.allies);
    this.restoreAlliesToFormationMarch();
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

    this.waveIndex = waveIndex;
    this.spawnWaveEnemies();
    this.waveIntermissionActive = false;
    this.waveIntermissionElapsed = 0;
    this.pendingNextWaveIndex = null;
  }

  private applyVictoryTransition(survivingPartyIndices: number[]): void {
    this.phase = "victory";
    this.engaged = false;
    this.engagedBattleVisualOffset = null;
    this.clearEngagedVisualState();
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
    this.engagedBattleVisualOffset = null;
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
      this.engaged = true;
      this.engagedBattleVisualOffset = getBattleVisualOffset(this.allies);
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
    this.tickPendingHitQueue();
    this.tickSkillSequences(deltaTime);
    if (this.waveIntermissionActive) {
      this.updateWaveIntermissionMarch(deltaTime);
      if (this.waveIntermissionElapsed >= WAVE_APPROACH_MARCH_SEC) {
        this.completeWaveIntermission();
      }
      return;
    }
    if (this.pendingDefeatTimer > 0) {
      this.pendingDefeatTimer -= deltaTime;
      if (this.pendingDefeatTimer <= 0) {
        this.applyDefeatTransition(this.pendingDefeatSurvivors ?? []);
        this.pendingDefeatSurvivors = null;
      }
      return;
    }
    if (!this.engaged) {
      this.applyEnemyMarch(SCROLL_SPEED * deltaTime);
      this.updateEngagementState();
    } else {
      if (this.waveAdvanceDelayTimer > 0) {
        this.waveAdvanceDelayTimer -= deltaTime;
        if (this.waveAdvanceDelayTimer <= 0) {
          this.startWaveIntermission();
        }
        return;
      }
      if (this.pendingVictoryTimer > 0) {
        this.pendingVictoryTimer -= deltaTime;
        this.updateCombatCamera(deltaTime);
        if (this.pendingVictoryTimer <= 0) {
          this.applyVictoryTransition(this.pendingVictorySurvivors ?? []);
          this.pendingVictorySurvivors = null;
        }
        return;
      }
      this.updateEngagedBattleMovement(deltaTime);
      this.updateEngagedVisualMovement(deltaTime);
      this.applySkillMoveVisualOverlay();
      this.updateCombatCamera(deltaTime);
      this.tickStatusEffects(deltaTime);
      this.tickPeriodicDispels(deltaTime);
      this.tickPeriodicHots(deltaTime);
      this.tickCooldowns(this.allies, deltaTime);
      this.tickCooldowns(this.enemies, deltaTime);
      this.runUnitSkills(this.allies);
      this.runUnitSkills(this.enemies);
      this.tickAllyThreat(deltaTime);
      this.checkBattleEnd();
    }
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
      this.handleDamageThreat(source, target, appliedDamage);
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
        const rate = cd.slotKind === "active" ? 1 : basicRate;
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
          this.waveAdvanceDelayTimer > 0
        ) {
          return;
        }
        this.bakeCombatCameraForWaveAdvance();
        this.waveAdvanceDelayTimer = ENEMY_DEATH_SETTLE_DELAY_SEC;
        this.pendingNextWaveIndex = this.waveIndex + 1;
        return;
      }

      if (this.pendingVictoryTimer <= 0 && this.pendingVictorySurvivors === null) {
        this.pendingVictoryTimer = ENEMY_DEATH_SETTLE_DELAY_SEC;
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
