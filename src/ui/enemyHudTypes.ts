import type { CombatantSnapshot, StatusEffect } from '../battle/types.ts';
import { ENEMY_HUD_MAX_SLOTS } from './battleRootLayout.ts';

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
  res: number;
  isAlive: boolean;
  statusEffects: StatusEffect[];
  /** Optional UI-only telegraph state (not wired from battle logic yet). */
  dangerTelegraphActive?: boolean;
  /** 0–1 progress when dangerTelegraphActive is true. */
  dangerTelegraphProgress?: number;
}

export interface EnemyHudDangerState {
  telegraphActive: boolean;
  telegraphProgress: number;
}

/** HUD 表示専用。戦闘ロジック・ターゲット選定には使わない。 */
export interface EnemyHudGroup {
  groupId: string;
  classId: string;
  enemyTypeId?: string;
  representativeIcon: string;
  representativeName: string;
  enemies: EnemyHudEntry[];
  count: number;
  representativeEnemy: EnemyHudEntry;
  dangerState: EnemyHudDangerState;
  importantStates: StatusEffect[];
}

/** group key — 将来 enemyTypeId へ差し替え可能。 */
export function resolveEnemyHudGroupKey(
  enemy: Pick<CombatantSnapshot, 'classId' | 'enemyTypeId' | 'id'>,
): string {
  if (enemy.enemyTypeId) return enemy.enemyTypeId;
  if (enemy.classId) return enemy.classId;
  return enemy.id;
}

export function combatantToEnemyHudEntry(
  enemy: CombatantSnapshot,
): EnemyHudEntry {
  return {
    id: enemy.id,
    displayName: enemy.name,
    iconKey: enemy.iconKey,
    hp: enemy.hp,
    maxHp: enemy.maxHp,
    baseMaxHp: enemy.baseMaxHp,
    barrierHp: enemy.barrierHp,
    atk: enemy.atk,
    def: enemy.def,
    res: enemy.res,
    isAlive: enemy.hp > 0,
    statusEffects: enemy.statusEffects,
  };
}

/** @deprecated Prefer buildEnemyHudGroups for HUD display. */
export function buildEnemyHudEntries(
  enemies: CombatantSnapshot[],
  maxSlots = ENEMY_HUD_MAX_SLOTS,
): EnemyHudEntry[] {
  return enemies
    .filter((enemy) => enemy.hp > 0)
    .slice(0, maxSlots)
    .map(combatantToEnemyHudEntry);
}

function deriveGroupDangerState(
  entries: EnemyHudEntry[],
): EnemyHudDangerState {
  let telegraphActive = false;
  let telegraphProgress = 0;
  for (const entry of entries) {
    if (entry.dangerTelegraphActive !== true) continue;
    telegraphActive = true;
    telegraphProgress = Math.max(
      telegraphProgress,
      entry.dangerTelegraphProgress ?? 0,
    );
  }
  return { telegraphActive, telegraphProgress };
}

function mergeGroupImportantStates(
  entries: EnemyHudEntry[],
): StatusEffect[] {
  const byId = new Map<string, StatusEffect>();
  for (const entry of entries) {
    for (const effect of entry.statusEffects) {
      const existing = byId.get(effect.id);
      if (!existing) {
        byId.set(effect.id, effect);
        continue;
      }
      const existingStacks = existing.stacks ?? 1;
      const nextStacks = effect.stacks ?? 1;
      if (nextStacks > existingStacks) {
        byId.set(effect.id, effect);
      }
    }
  }
  return [...byId.values()];
}

export function buildEnemyHudGroups(
  enemies: CombatantSnapshot[],
  maxGroups = ENEMY_HUD_MAX_SLOTS,
): EnemyHudGroup[] {
  const alive = enemies.filter((enemy) => enemy.hp > 0);
  const membersByKey = new Map<string, CombatantSnapshot[]>();
  const groupOrder: string[] = [];

  for (const enemy of alive) {
    const key = resolveEnemyHudGroupKey(enemy);
    if (!membersByKey.has(key)) {
      membersByKey.set(key, []);
      groupOrder.push(key);
    }
    membersByKey.get(key)!.push(enemy);
  }

  return groupOrder.slice(0, maxGroups).map((key) => {
    const members = membersByKey.get(key)!;
    const entries = members.map(combatantToEnemyHudEntry);
    const representativeEnemy = entries[0]!;
    const head = members[0]!;
    return {
      groupId: key,
      classId: head.classId ?? key,
      enemyTypeId: head.enemyTypeId,
      representativeIcon: representativeEnemy.iconKey,
      representativeName: representativeEnemy.displayName,
      enemies: entries,
      count: entries.length,
      representativeEnemy,
      dangerState: deriveGroupDangerState(entries),
      importantStates: mergeGroupImportantStates(entries),
    };
  });
}
