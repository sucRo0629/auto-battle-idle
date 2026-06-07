import type { BattleEventListener } from "./events.ts";
import { getActiveCooldownRate, getPassiveDefs } from "./combatMath.ts";
import {
  createAlliesFromParty,
  createEnemiesForStage,
  healAllAllies,
  resetEntityIdCounter,
} from "./entities.ts";
import {
  computeAllyPositions,
  computeEngagedAllyTargets,
  computeEngagedEnemyPositions,
  APPROACH_SPEED,
  SCROLL_SPEED,
  enforceEngagedStandoff,
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
  SkillCooldown,
} from "./types.ts";
import { DEFAULT_MELEE_RANGE_PX } from "./types.ts";

const RESTART_DELAY_SEC = 3;
const VICTORY_BURST_SPEED = SCROLL_SPEED * 2;

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

  constructor(
    private readonly gameData: GameData,
    partyId: string,
    stageId: string
  ) {
    this.stageId = stageId;
    this.executor = new SkillExecutor(gameData, (e) => this.emit(e));
    resetEntityIdCounter();
    this.allies = createAlliesFromParty(gameData, partyId);
    this.enemies = createEnemiesForStage(gameData, stageId);
    this.syncAllyVisualPositions();
    this.resetEnemyVisualPositions();
  }

  private getAllyPlacementInputs() {
    return this.allies.map((a) => ({
      id: a.id,
      role: a.role,
      formationRow: a.formationRow,
      rangePx: a.traits.rangePx ?? DEFAULT_MELEE_RANGE_PX,
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

  private updateAllyFormationReform(deltaTime: number): void {
    const targets = computeAllyPositions(this.getAllyPlacementInputs(), {
      engaged: false,
    });
    const step = APPROACH_SPEED * deltaTime;
    for (const ally of this.allies) {
      if (!ally.isAlive) continue;
      const target = targets.get(ally.id);
      if (target === undefined) continue;
      ally.visualX = moveTowardX(ally.visualX, target, step);
    }
  }

  private updateEngagedMovement(deltaTime: number): void {
    const visualAllies = this.getVisualAllies();
    const visualEnemies = this.getVisualEnemies();
    const frontAllyX = getFrontAllyX(visualAllies);
    const frontEnemyX = getFrontEnemyX(visualEnemies);
    if (frontAllyX === null || frontEnemyX === null) return;

    const pair = getFrontLinePair(visualAllies, visualEnemies);
    const frontAllyRangePx = pair?.ally.rangePx ?? DEFAULT_MELEE_RANGE_PX;

    const approachStep = APPROACH_SPEED * deltaTime;

    const allyTargets = computeEngagedAllyTargets(
      this.getAllyPlacementInputs(),
      frontEnemyX
    );
    for (const ally of this.allies) {
      if (!ally.isAlive) continue;
      const target = allyTargets.get(ally.id);
      if (target === undefined) continue;
      if (ally.formationRow === "front") {
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
      frontAllyX,
      frontAllyRangePx
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
        this.allies.map((u) => ({
          id: u.id,
          visualX: u.visualX,
          isAlive: u.isAlive,
        })),
      ),
      this.allies,
    );
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

    const { allyDelta, enemyDelta } = enforceEngagedStandoff(
      this.allies,
      this.enemies,
    );
    if (allyDelta === 0 && enemyDelta === 0) return;

    const frontAlly = this.allies
      .filter((u) => u.isAlive)
      .reduce<(typeof this.allies)[0] | null>(
        (best, u) => (!best || u.visualX < best.visualX ? u : best),
        null,
      );
    const frontEnemy = this.enemies
      .filter((u) => u.isAlive)
      .reduce<(typeof this.enemies)[0] | null>(
        (best, u) => (!best || u.visualX > best.visualX ? u : best),
        null,
      );
    if (frontAlly) frontAlly.visualX += allyDelta;
    if (frontEnemy) frontEnemy.visualX += enemyDelta;
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

  stopBattle(): void {
    this.phase = "idle";
  }

  getSnapshot(): BattleSnapshot {
    return {
      phase: this.phase,
      engaged: this.engaged,
      worldOffsetX: this.worldOffsetX,
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
      role: c.isEnemy ? undefined : c.role,
      spriteKey: c.spriteKey,
      iconKey: c.iconKey,
      formationRow: c.formationRow,
      isEnemy: c.isEnemy,
      visualX: c.visualX,
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
      this.updateAllyFormationReform(deltaTime);
      if (this.phase === "victory") {
        const burst = VICTORY_BURST_SPEED * deltaTime;
        this.worldOffsetX += burst;
        this.applyEnemyMarch(burst);
      }
      if (this.restartTimer <= 0) {
        this.respawnAfterEnd();
      }
    }
  }

  private tickRunning(deltaTime: number): void {
    if (!this.engaged) {
      const march = SCROLL_SPEED * deltaTime;
      this.worldOffsetX += march;
      this.applyEnemyMarch(march);
      this.updateAllyFormationReform(deltaTime);
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
      unit.statusEffects = unit.statusEffects.filter((e) => {
        e.remainingSec -= deltaTime;
        return e.remainingSec > 0;
      });
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

    if (!enemiesAlive) {
      this.phase = "victory";
      this.engaged = false;
      this.restartTimer = RESTART_DELAY_SEC;
      this.emit({ type: "battleEnd", result: "victory" });
      return;
    }
    if (!alliesAlive) {
      this.phase = "defeat";
      this.engaged = false;
      this.restartTimer = RESTART_DELAY_SEC;
      this.emit({ type: "battleEnd", result: "defeat" });
    }
  }

  private respawnAfterEnd(): void {
    healAllAllies(this.allies);
    this.enemies = createEnemiesForStage(this.gameData, this.stageId);
    this.resetEnemyVisualPositions();
    this.worldOffsetX = 0;
    this.engaged = false;
    this.syncAllyVisualPositions(false);
    this.phase = "running";
  }
}
