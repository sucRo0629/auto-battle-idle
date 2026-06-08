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
  getEnemyContactX,
  marchEnemiesRight as marchEnemiesBattleRight,
  resolveAttackBattleX,
  SCROLL_SPEED,
  separateByGap,
  shouldStartApproach,
  updateUnitApproach,
} from "./combatPosition.ts";
import { resolveAllyApproachBattleX } from "./resolveApproachBattleX.ts";
import { deathAnimDurationMs } from "../render/deathPlayback.ts";
import {
  APPROACH_SPEED,
  clampAllyVisualDepth,
  computeAllyPositions,
  getFrontEnemyX,
  getFrontLinePair,
  moveTowardX,
  approachAllyVisualX,
  resolveEngagedVisualTargets,
  ROW_X,
  separateEnemySprites,
  SPRITE_GAP,
  SPRITE_WIDTH,
  toVisualCombatant,
  type EngagedVisualTargetsResult,
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
import { DEFAULT_MELEE_RANGE_PX } from "./types.ts";
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
/** Wave 間: 生存味方が接敵位置から左へ進軍する時間 */
const WAVE_INTERMISSION_SEC = 0.75;

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
      onBasicAttackExecuted: (actorId) => {
        this.tickCountTriggers(actorId, "basicAttackCount");
      },
      onDamageApplied: (actor, target, amount) => {
        this.onDamageApplied?.(actor, target, amount);
      },
    });
    this.reloadBattlefield();
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
    this.enemies = createEnemiesForStage(
      this.gameData,
      this.stageId,
      this.waveIndex,
    );
    this.resetEnemyBattlePositions();
    this.restoreAlliesToFormationMarch();
    this.resetEnemyVisualPositions();
    this.clearPendingVictory();
    this.clearPendingDefeat();
    this.clearPendingWaveAdvance();
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
        rangePx: a.traits.rangePx ?? DEFAULT_MELEE_RANGE_PX,
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
        rangePx: a.traits.rangePx ?? DEFAULT_MELEE_RANGE_PX,
        isAlive: true as const,
        visualX: a.visualX,
      }));
  }

  private getVisualAllies() {
    return this.allies
      .filter((a) => this.isOnBattlefield(a))
      .map((unit) => toVisualCombatant(unit));
  }

  private getVisualEnemies() {
    return this.enemies.map((unit) => toVisualCombatant(unit));
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
      const x = positions.get(enemy.id);
      if (x !== undefined) {
        enemy.battleX = x;
      }
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

  private tickAllyFormationMarch(deltaTime: number): void {
    this.worldOffsetX += SCROLL_SPEED * deltaTime;
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
      const target = resolveAttackBattleX(enemy, allyContact, this.gameData);
      updateUnitApproach(enemy, target, approachStep);
    }
  }

  private resolveEngagedVisualFrame(): EngagedVisualTargetsResult | null {
    const visualEnemies = this.getVisualEnemies();
    const frontEnemyX = getFrontEnemyX(visualEnemies);
    if (frontEnemyX === null) return null;

    const pair = getFrontLinePair(this.getVisualAllies(), visualEnemies);
    const frontEnemyRangePx = pair?.enemy.rangePx ?? DEFAULT_MELEE_RANGE_PX;

    return resolveEngagedVisualTargets(
      this.getLivingAllyLineInputs(),
      this.enemies.map((enemy) => ({
        id: enemy.id,
        visualX: enemy.visualX,
        rangePx: enemy.traits.rangePx ?? DEFAULT_MELEE_RANGE_PX,
        isAlive: enemy.isAlive,
      })),
      frontEnemyX,
      frontEnemyRangePx,
    );
  }

  private snapEngagedVisualLayout(): void {
    const layout = this.resolveEngagedVisualFrame();
    if (!layout) return;

    for (const ally of this.allies) {
      if (!ally.isAlive) continue;
      const target = layout.allyTargets.get(ally.id);
      if (target !== undefined) ally.visualX = target;
    }
    for (const enemy of this.enemies) {
      if (!enemy.isAlive) continue;
      const target = layout.enemyTargets.get(enemy.id);
      if (target !== undefined) enemy.visualX = target;
    }
    clampAllyVisualDepth(this.allies);
    this.cameraFocusLineX = layout.frontLineTargetX;
  }

  private updateEngagedVisualMovement(deltaTime: number): void {
    const layout = this.resolveEngagedVisualFrame();
    if (!layout) return;

    const approachStep = APPROACH_SPEED * deltaTime;

    for (const ally of this.allies) {
      if (!ally.isAlive || this.skillSequenceRunner.isActorBusy(ally.id)) {
        continue;
      }
      const target = layout.allyTargets.get(ally.id);
      if (target === undefined) continue;
      if (ally.formationRow === "back" && target > ally.visualX) {
        ally.visualX = moveTowardX(ally.visualX, target, approachStep);
      } else {
        ally.visualX = approachAllyVisualX(ally.visualX, target, approachStep);
      }
    }
    clampAllyVisualDepth(this.allies);

    for (const enemy of this.enemies) {
      if (!enemy.isAlive || this.skillSequenceRunner.isActorBusy(enemy.id)) {
        continue;
      }
      const target = layout.enemyTargets.get(enemy.id);
      if (target === undefined) continue;
      enemy.visualX = moveTowardX(enemy.visualX, target, approachStep);
    }
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
    const layout = this.resolveEngagedVisualFrame();
    if (layout === null) return;

    const step = CAMERA_PAN_SPEED * deltaTime;
    this.cameraFocusLineX = moveTowardX(
      this.cameraFocusLineX,
      layout.frontLineTargetX,
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

  private startWaveIntermission(): void {
    this.engaged = false;
    hideFallenAllyCorpses(this.allies);
    this.enemies = [];
    assignInitialAllyBattleX(this.allies);
    this.waveIntermissionActive = true;
    this.waveIntermissionElapsed = 0;
  }

  private updateWaveIntermissionMarch(deltaTime: number): void {
    const step = SCROLL_SPEED * deltaTime;
    for (const ally of this.allies) {
      if (!ally.isAlive) continue;
      ally.visualX -= step;
    }
    this.worldOffsetX += step;
    this.waveIntermissionElapsed += deltaTime;
  }

  private completeWaveIntermission(): void {
    const nextIndex = this.pendingNextWaveIndex;
    if (nextIndex === null) return;

    this.waveIndex = nextIndex;
    this.enemies = createEnemiesForStage(
      this.gameData,
      this.stageId,
      this.waveIndex,
    );
    this.resetEnemyBattlePositions();
    this.resetEnemyVisualPositions();
    this.waveIntermissionActive = false;
    this.waveIntermissionElapsed = 0;
    this.pendingNextWaveIndex = null;
  }

  private applyVictoryTransition(survivingPartyIndices: number[]): void {
    this.phase = "victory";
    this.engaged = false;
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
    if (shouldStartApproach(this.enemies)) {
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
      attackRange: c.traits.attackRange,
      spriteKey: c.spriteKey,
      iconKey: c.iconKey,
      formationRow: c.formationRow,
      isEnemy: c.isEnemy,
      battleX: c.battleX,
      visualX: c.visualX,
      corpseVisible: c.isEnemy ? undefined : c.corpseVisible,
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
      if (this.waveIntermissionElapsed >= WAVE_INTERMISSION_SEC) {
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
      this.tickAllyFormationMarch(deltaTime);
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
      this.tickCooldowns(this.allies, deltaTime);
      this.tickCooldowns(this.enemies, deltaTime);
      this.runUnitSkills(this.allies);
      this.runUnitSkills(this.enemies);
      this.checkBattleEnd();
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
    this.skillSequenceRunner.tickMoves(deltaTime, units);
    this.skillSequenceRunner.tickSequences(this.battleTimeSec, (step) => {
      this.executor.applyScheduledStep(step, this.allies, this.enemies);
    });
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
      const amount = resolveHotAmountFromStatus(source, target, effect, passives);
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
      this.onDamageApplied?.(source, target, appliedDamage);
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
      if (!actor.isAlive) continue;
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
