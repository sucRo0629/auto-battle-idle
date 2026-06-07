import type { BattleEventListener } from "./events.ts";
import { getActiveCooldownRate, getPassiveDefs, resolveDotTick, resolveHotTick } from "./combatMath.ts";
import {
  createAlliesFromPartyState,
  createCooldowns,
  createEnemiesForStage,
  resetEntityIdCounter,
} from "./entities.ts";
import {
  computeAllyPositions,
  computeEngagedAllyTargets,
  computeEngagedEnemyPositions,
  computeEngagedStandoffAnchors,
  APPROACH_SPEED,
  SCROLL_SPEED,
  SPRITE_WIDTH,
  separateEngagedSprites,
  getFrontAllyX,
  getFrontEnemyX,
  getFrontLinePair,
  isBattleEngaged,
  marchEnemiesRight,
  moveTowardX,
  separateEnemySprites,
  toVisualCombatant,
} from "../render/formationLayout.ts";
import { SkillExecutor } from "./skills/SkillExecutor.ts";
import type {
  BattlePhase,
  BattleSnapshot,
  CombatantState,
  GameData,
  PartyMemberState,
  SkillCooldown,
  StatusEffect,
} from "./types.ts";
import { DEFAULT_MELEE_RANGE_PX } from "./types.ts";
import type { LevelCurvesConfig } from "../progression/levelGrowth.ts";

const RESTART_DELAY_SEC = 3;
const VICTORY_EXIT_SPEED = SCROLL_SPEED * 2;
const OVERLAY_TICK_SEC = 1;

export class BattleEngine {
  private phase: BattlePhase = "idle";
  private allies: CombatantState[] = [];
  private enemies: CombatantState[] = [];
  private worldOffsetX = 0;
  private engaged = false;
  private restartTimer = 0;
  private readonly listeners = new Set<BattleEventListener>();
  private readonly executor: SkillExecutor;
  private stageId: string;
  private waveIndex = 0;

  constructor(
    private readonly gameData: GameData,
    private readonly levelCurves: LevelCurvesConfig,
    private readonly getParty: () => PartyMemberState[],
    private readonly getStageId: () => string,
  ) {
    this.stageId = getStageId();
    this.executor = new SkillExecutor(gameData, (e) => this.emit(e));
    this.reloadBattlefield();
  }

  private reloadBattlefield(): void {
    resetEntityIdCounter();
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
    this.syncAllyVisualPositions();
    this.resetEnemyVisualPositions();
  }

  private getAllyPlacementInputs() {
    return this.allies.map((a) => ({
      id: a.id,
      role: a.role,
      formationRow: a.formationRow,
      rangePx: a.traits.rangePx ?? DEFAULT_MELEE_RANGE_PX,
      isAlive: a.isAlive,
    }));
  }

  private getVisualAllies() {
    return this.allies.map((unit) => toVisualCombatant(unit));
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
      ally.visualX = positions.get(ally.id) ?? ally.visualX;
    }
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
      }))
    );
    for (const enemy of this.enemies) {
      const x = separated.get(enemy.id);
      if (x !== undefined) {
        enemy.visualX = x;
      }
    }
  }

  private applyEnemyMarch(deltaX: number): void {
    const positions = marchEnemiesRight(
      this.enemies.map((enemy) => ({
        id: enemy.id,
        visualX: enemy.visualX,
        isAlive: enemy.isAlive,
      })),
      deltaX
    );
    for (const enemy of this.enemies) {
      const x = positions.get(enemy.id);
      if (x !== undefined) {
        enemy.visualX = x;
      }
    }
  }

  private updateVictoryExitMarch(deltaTime: number): void {
    const step = VICTORY_EXIT_SPEED * deltaTime;
    for (const ally of this.allies) {
      ally.visualX -= step;
    }
  }

  private areAlliesOffScreen(): boolean {
    if (this.allies.length === 0) return true;
    return this.allies.every((ally) => ally.visualX + SPRITE_WIDTH <= 0);
  }

  private updateEngagedMovement(deltaTime: number): void {
    const visualAllies = this.getVisualAllies();
    const visualEnemies = this.getVisualEnemies();
    const frontAllyX = getFrontAllyX(visualAllies);
    const frontEnemyX = getFrontEnemyX(visualEnemies);
    if (frontAllyX === null || frontEnemyX === null) return;

    const pair = getFrontLinePair(visualAllies, visualEnemies);
    const frontAllyRangePx = pair?.ally.rangePx ?? DEFAULT_MELEE_RANGE_PX;
    const frontEnemyRangePx = pair?.enemy.rangePx ?? DEFAULT_MELEE_RANGE_PX;

    const approachStep = APPROACH_SPEED * deltaTime;
    const { anchorAllyX, anchorEnemyX } = computeEngagedStandoffAnchors(
      frontAllyX,
      frontEnemyX,
      frontAllyRangePx,
      frontEnemyRangePx,
    );

    const allyTargets = computeEngagedAllyTargets(
      this.getAllyPlacementInputs(),
      anchorEnemyX,
    );
    for (const ally of this.allies) {
      if (!ally.isAlive) continue;
      const target = allyTargets.get(ally.id);
      if (target === undefined) continue;
      // 接敵中は敵方向（左）への接近のみ。右への退避はしない
      if (target <= ally.visualX) {
        ally.visualX = moveTowardX(ally.visualX, target, approachStep);
      }
    }

    const enemyTargets = computeEngagedEnemyPositions(
      this.enemies.map((enemy) => ({
        id: enemy.id,
        visualX: enemy.visualX,
        rangePx: enemy.traits.rangePx ?? DEFAULT_MELEE_RANGE_PX,
        isAlive: enemy.isAlive,
      })),
      anchorAllyX,
      frontAllyRangePx,
    );
    for (const enemy of this.enemies) {
      if (!enemy.isAlive) continue;
      const target = enemyTargets.get(enemy.id);
      if (target === undefined) continue;
      enemy.visualX = moveTowardX(enemy.visualX, target, approachStep);
    }

    this.applyEngagedLayout();
  }

  private applyEngagedLayout(): void {
    this.applySpritePositions(
      separateEngagedSprites(
        this.enemies.map((u) => ({
          id: u.id,
          visualX: u.visualX,
          isAlive: u.isAlive,
        })),
      ),
      this.enemies,
    );
  }

  private applySpritePositions(
    positions: Map<string, number>,
    units: CombatantState[],
  ): void {
    for (const unit of units) {
      const x = positions.get(unit.id);
      if (x !== undefined) {
        unit.visualX = x;
      }
    }
  }

  private updateEngagementState(): void {
    if (this.engaged) return;
    if (isBattleEngaged(this.getVisualAllies(), this.getVisualEnemies())) {
      this.engaged = true;
    }
  }

  onEvent(listener: BattleEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: Parameters<BattleEventListener>[0]): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  startBattle(): void {
    this.phase = "running";
    this.restartTimer = 0;
  }

  /** パーティ変更などで戦闘を最初からやり直す */
  restartBattle(): void {
    this.reloadBattlefield();
    this.worldOffsetX = 0;
    this.engaged = false;
    this.restartTimer = 0;
    this.phase = "running";
  }

  /** スキルセット変更を戦闘中に反映（HP・位置は維持） */
  syncPartyBuilds(): void {
    if (this.phase !== "running") return;

    const party = this.getParty();
    for (let i = 0; i < this.allies.length; i++) {
      const member = party[i];
      const ally = this.allies[i];
      if (!member || !ally) continue;

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
    return {
      phase: this.phase,
      engaged: this.engaged,
      worldOffsetX: this.worldOffsetX,
      alliesOffScreen: this.areAlliesOffScreen(),
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
      atk: c.atk,
      def: c.def,
      reg: c.reg,
      role: c.isEnemy ? undefined : c.role,
      attackRange: c.traits.attackRange,
      spriteKey: c.spriteKey,
      iconKey: c.iconKey,
      formationRow: c.formationRow,
      isEnemy: c.isEnemy,
      visualX: c.visualX,
      statusEffects: c.statusEffects.map((effect) => ({ ...effect })),
      activeCooldowns: c.cooldowns
        .filter((cd) => cd.slotKind === "active")
        .map((cd) => {
          const skill = this.gameData.skillRegistry.actives[cd.skillId];
          return {
            skillId: cd.skillId,
            remaining: cd.remaining,
            interval: skill?.interval ?? 1,
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
      if (this.phase === "victory") {
        this.updateVictoryExitMarch(deltaTime);
      }
      const readyToRespawn =
        this.restartTimer <= 0 &&
        (this.phase === "defeat" || this.areAlliesOffScreen());
      if (readyToRespawn) {
        this.respawnAfterEnd();
      }
    }
  }

  private tickRunning(deltaTime: number): void {
    if (!this.engaged) {
      const march = SCROLL_SPEED * deltaTime;
      this.worldOffsetX += march;
      this.applyEnemyMarch(march);
      this.updateEngagementState();
    } else {
      this.updateEngagedMovement(deltaTime);
      this.tickStatusEffects(deltaTime);
      this.tickCooldowns(this.allies, deltaTime);
      this.tickCooldowns(this.enemies, deltaTime);
      this.runUnitSkills(this.allies);
      this.runUnitSkills(this.enemies);
      this.checkBattleEnd();
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
          effect.powerMultiplier !== undefined &&
          effect.sourceId
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
      const amount = resolveHotTick(
        source,
        effect.powerMultiplier!,
        passives,
      );
      if (amount <= 0) return;
      target.hp = Math.min(target.maxHp, target.hp + amount);
      this.emit({
        type: "skill",
        actorId: source.id,
        targetId: target.id,
        skillId: effect.skillId ?? "",
        skillName,
        effect: "hot",
        amount,
      });
      return;
    }

    if (effect.overlay === "dot") {
      const amount = resolveDotTick(
        source,
        target,
        effect.powerMultiplier!,
        effect.damageType ?? "physical",
        passives,
      );
      target.hp = Math.max(0, target.hp - amount);
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
      if (target.hp <= 0) {
        target.isAlive = false;
        this.emit({ type: "death", targetId: target.id });
      }
    }
  }

  private tickCooldowns(units: CombatantState[], deltaTime: number): void {
    for (const unit of units) {
      if (!unit.isAlive) continue;
      const passives = getPassiveDefs(
        unit,
        this.gameData.skillRegistry.passives
      );
      const activeRate = getActiveCooldownRate(passives);
      for (const cd of unit.cooldowns) {
        if (cd.remaining <= 0) continue;
        const rate = cd.slotKind === "active" ? activeRate : 1;
        cd.remaining = Math.max(0, cd.remaining - deltaTime * rate);
      }
    }
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
      .map((ally, index) => (ally.isAlive ? index : -1))
      .filter((index) => index >= 0);

    if (!enemiesAlive) {
      const stage = this.gameData.stages.find((s) => s.id === this.stageId);
      const hasNextWave =
        stage !== undefined && this.waveIndex + 1 < stage.waves.length;
      if (hasNextWave) {
        this.waveIndex += 1;
        this.enemies = createEnemiesForStage(
          this.gameData,
          this.stageId,
          this.waveIndex,
        );
        this.resetEnemyVisualPositions();
        this.engaged = false;
        return;
      }

      this.phase = "victory";
      this.engaged = false;
      this.restartTimer = RESTART_DELAY_SEC;
      this.emit({
        type: "battleEnd",
        result: "victory",
        survivingPartyIndices,
      });
      return;
    }
    if (!alliesAlive) {
      this.phase = "defeat";
      this.engaged = false;
      this.restartTimer = RESTART_DELAY_SEC;
      this.emit({
        type: "battleEnd",
        result: "defeat",
        survivingPartyIndices,
      });
    }
  }

  private respawnAfterEnd(): void {
    this.reloadBattlefield();
    this.worldOffsetX = 0;
    this.engaged = false;
    this.phase = "running";
  }
}
