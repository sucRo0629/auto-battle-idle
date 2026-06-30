import type {
  PassiveSkillDef,
  StatBuffModifierEntry,
  StatBuffTarget,
} from './types.ts';
import { filterStatBuffTargets } from './types.ts';

export interface StatBuffModifierSource {
  buffStatModifiers?: StatBuffModifierEntry[];
  buffStat?: PassiveSkillDef['buffStat'];
  buffMultiplier?: number;
  buffFlatBonus?: number;
}

export function defaultStatBuffModifierEntry(): StatBuffModifierEntry {
  return { stat: 'atk', multiplier: 1.1 };
}

export function parseStatBuffModifiers(
  source: StatBuffModifierSource,
): StatBuffModifierEntry[] {
  if (source.buffStatModifiers && source.buffStatModifiers.length > 0) {
    return source.buffStatModifiers;
  }

  const stats = filterStatBuffTargets(source.buffStat);
  const multiplier = source.buffMultiplier;
  const flatBonus = source.buffFlatBonus;
  if (stats.length === 0) return [];

  return stats.map((stat) => ({
    stat,
    ...(multiplier !== undefined ? { multiplier } : {}),
    ...(flatBonus !== undefined ? { flatBonus } : {}),
  }));
}

export function syncPassiveBuffStatModifiers(
  passive: PassiveSkillDef,
  entries: StatBuffModifierEntry[],
): void {
  const cleaned = entries.filter(
    (entry) =>
      entry.stat &&
      (entry.multiplier !== undefined || entry.flatBonus !== undefined),
  );

  if (cleaned.length === 0) {
    passive.buffStat = 'atk';
    passive.buffMultiplier = 1.2;
    delete passive.buffFlatBonus;
    delete passive.buffStatModifiers;
    return;
  }

  if (cleaned.length === 1) {
    const entry = cleaned[0]!;
    passive.buffStat = entry.stat;
    if (entry.multiplier !== undefined) {
      passive.buffMultiplier = entry.multiplier;
    } else {
      delete passive.buffMultiplier;
    }
    if (entry.flatBonus !== undefined) {
      passive.buffFlatBonus = entry.flatBonus;
    } else {
      delete passive.buffFlatBonus;
    }
    delete passive.buffStatModifiers;
    return;
  }

  passive.buffStatModifiers = cleaned;
  passive.buffStat = cleaned.map((entry) => entry.stat);
  delete passive.buffMultiplier;
  delete passive.buffFlatBonus;
}

export function formatStatBuffModifierEntries(
  entries: StatBuffModifierEntry[],
  formatEntry: (
    stat: StatBuffTarget,
    multiplier: number | undefined,
    flatBonus: number | undefined,
  ) => string,
): string {
  if (entries.length === 0) return '—';
  return entries
    .map((entry) =>
      formatEntry(entry.stat, entry.multiplier, entry.flatBonus),
    )
    .join('・');
}
