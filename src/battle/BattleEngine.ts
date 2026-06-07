import type { BattleEventListener } from './events.ts';
import { getActiveCooldownRate, getPassiveDefs } from './combatMath.ts';
import {
  createAlliesFromParty,
  createEnemiesForStage,
  healAllAllies,
  resetEntityIdCounter,
} from './entities.ts';
import { SkillExecutor } from './skills/SkillExecutor.ts';
import type {
  BattlePhase,
  BattleSnapshot,
  CombatantState,
  GameData,
  SkillCooldown,
} from './types.ts';

const RESTART_DELAY_SEC = 3;
const SCROLL_SPEED = 8;
const VICTORY_BURST_SPEED = 24;

export class BattleEngine {
  private phase: BattlePhase = 'idle';
  private allies: CombatantState[] = [];
  private enemies: CombatantState[] = [];
  private worldOffsetX = 0;
  private restartTimer = 0;
  private readonly listeners = new Set<BattleEventListener>();
  private readonly executor: SkillExecutor;
  private stageId: string;

  constructor(
    private readonly gameData: GameData,
    partyId: string,
    stageId: string,
  ) {
    this.stageId = stageId;
    this.executor = new SkillExecutor(gameData, (e) => this.emit(e));
    resetEntityIdCounter();
    this.allies = createAlliesFromParty(gameData, partyId);
    this.enemies = createEnemiesForStage(gameData, stageId);
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
    this.phase = 'running';
    this.restartTimer = 0;
  }

  stopBattle(): void {
    this.phase = 'idle';
  }

  getSnapshot(): BattleSnapshot {
    return {
      phase: this.phase,
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
      formationRow: c.formationRow,
      isEnemy: c.isEnemy,
      activeCooldowns: c.cooldowns
        .filter((cd) => cd.slotKind === 'active')
        .map((cd) => ({ skillId: cd.skillId, remaining: cd.remaining })),
    };
  }

  tick(deltaTime: number): void {
    if (this.phase === 'running') {
      this.tickRunning(deltaTime);
      return;
    }
    if (this.phase === 'victory' || this.phase === 'defeat') {
      this.restartTimer -= deltaTime;
      if (this.phase === 'victory') {
        this.worldOffsetX -= VICTORY_BURST_SPEED * deltaTime;
      }
      if (this.restartTimer <= 0) {
        this.respawnAfterEnd();
      }
    }
  }

  private tickRunning(deltaTime: number): void {
    this.worldOffsetX -= SCROLL_SPEED * deltaTime;
    this.tickStatusEffects(deltaTime);
    this.tickCooldowns(this.allies, deltaTime);
    this.tickCooldowns(this.enemies, deltaTime);
    this.runUnitSkills(this.allies);
    this.runUnitSkills(this.enemies);
    this.checkBattleEnd();
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
        this.gameData.skillRegistry.passives,
      );
      const activeRate = getActiveCooldownRate(passives);
      for (const cd of unit.cooldowns) {
        if (cd.remaining <= 0) continue;
        const rate = cd.slotKind === 'active' ? activeRate : 1;
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
    const basic = cooldowns.filter((c) => c.slotKind === 'basic');
    const active = cooldowns
      .filter((c) => c.slotKind === 'active')
      .sort((a, b) => (a.slotIndex ?? 0) - (b.slotIndex ?? 0));
    return [...basic, ...active];
  }

  private checkBattleEnd(): void {
    const alliesAlive = this.allies.some((a) => a.isAlive);
    const enemiesAlive = this.enemies.some((e) => e.isAlive);

    if (!enemiesAlive) {
      this.phase = 'victory';
      this.restartTimer = RESTART_DELAY_SEC;
      this.emit({ type: 'battleEnd', result: 'victory' });
      return;
    }
    if (!alliesAlive) {
      this.phase = 'defeat';
      this.restartTimer = RESTART_DELAY_SEC;
      this.emit({ type: 'battleEnd', result: 'defeat' });
    }
  }

  private respawnAfterEnd(): void {
    healAllAllies(this.allies);
    this.enemies = createEnemiesForStage(this.gameData, this.stageId);
    this.worldOffsetX = 0;
    this.phase = 'running';
  }
}
