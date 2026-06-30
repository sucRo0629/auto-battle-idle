import type { CombatantSnapshot, StatusEffect } from '../battle/types.ts';

export interface EnemyHudEntry {
  id: string;
  displayName: string;
  iconKey: string;
  hp: number;
  maxHp: number;
  baseMaxHp: number;
  barrierHp: number;
  atk: number;
  def: number;
  reg: number;
  isAlive: boolean;
  statusEffects: StatusEffect[];
  /** Optional UI-only telegraph state (not wired from battle logic yet). */
  dangerTelegraphActive?: boolean;
  /** 0–1 progress when dangerTelegraphActive is true. */
  dangerTelegraphProgress?: number;
}

export function buildEnemyHudEntries(
  enemies: CombatantSnapshot[],
  maxSlots = 10,
): EnemyHudEntry[] {
  return enemies.slice(0, maxSlots).map((enemy) => ({
    id: enemy.id,
    displayName: enemy.name,
    iconKey: enemy.iconKey,
    hp: enemy.hp,
    maxHp: enemy.maxHp,
    baseMaxHp: enemy.baseMaxHp,
    barrierHp: enemy.barrierHp,
    atk: enemy.atk,
    def: enemy.def,
    reg: enemy.reg,
    isAlive: enemy.hp > 0,
    statusEffects: enemy.statusEffects,
  }));
}
