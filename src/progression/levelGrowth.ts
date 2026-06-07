import type { ClassId, CombatStats } from '../battle/types.ts';

export interface StatGrowth {
  maxHp: number;
  atk: number;
  def: number;
}

export interface LevelCurvesConfig {
  expPerLevel: number;
  statGrowth: {
    default: StatGrowth;
    byClass: Record<ClassId, StatGrowth>;
  };
}

export function loadLevelCurves(raw: unknown): LevelCurvesConfig {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('levelCurves.json must be an object');
  }
  const obj = raw as Record<string, unknown>;
  const expPerLevel = obj.expPerLevel;
  if (typeof expPerLevel !== 'number' || expPerLevel <= 0) {
    throw new Error('levelCurves.json: expPerLevel must be a positive number');
  }

  const statGrowthRaw = obj.statGrowth;
  if (typeof statGrowthRaw !== 'object' || statGrowthRaw === null) {
    throw new Error('levelCurves.json: statGrowth is required');
  }
  const statGrowthObj = statGrowthRaw as Record<string, unknown>;
  const defaultGrowth = parseStatGrowth(statGrowthObj.default, 'statGrowth.default');

  const byClassRaw = statGrowthObj.byClass;
  if (typeof byClassRaw !== 'object' || byClassRaw === null) {
    throw new Error('levelCurves.json: statGrowth.byClass is required');
  }
  const byClass: Record<ClassId, StatGrowth> = {};
  for (const [classId, growth] of Object.entries(byClassRaw)) {
    byClass[classId] = parseStatGrowth(growth, `statGrowth.byClass.${classId}`);
  }

  return { expPerLevel, statGrowth: { default: defaultGrowth, byClass } };
}

function parseStatGrowth(raw: unknown, context: string): StatGrowth {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error(`${context} must be an object`);
  }
  const obj = raw as Record<string, unknown>;
  return {
    maxHp: requireNonNegativeNumber(obj.maxHp, `${context}.maxHp`),
    atk: requireNonNegativeNumber(obj.atk, `${context}.atk`),
    def: requireNonNegativeNumber(obj.def, `${context}.def`),
  };
}

function requireNonNegativeNumber(value: unknown, context: string): number {
  if (typeof value !== 'number' || Number.isNaN(value) || value < 0) {
    throw new Error(`${context} must be a non-negative number`);
  }
  return value;
}

export function getStatGrowth(
  curves: LevelCurvesConfig,
  classId: ClassId,
): StatGrowth {
  return curves.statGrowth.byClass[classId] ?? curves.statGrowth.default;
}

export function expRequiredForLevel(level: number, curves: LevelCurvesConfig): number {
  return curves.expPerLevel * level;
}

export function computeStatsAtLevel(
  base: CombatStats,
  classId: ClassId,
  level: number,
  curves: LevelCurvesConfig,
): CombatStats {
  const growth = getStatGrowth(curves, classId);
  const steps = Math.max(0, level - 1);
  return {
    maxHp: base.maxHp + growth.maxHp * steps,
    atk: base.atk + growth.atk * steps,
    def: base.def + growth.def * steps,
    reg: base.reg,
  };
}

export interface LevelUpResult {
  newLevel: number;
  levelsGained: number;
}

export function addExp(
  progress: { level: number; exp: number },
  amount: number,
  curves: LevelCurvesConfig,
): LevelUpResult {
  if (amount <= 0) {
    return { newLevel: progress.level, levelsGained: 0 };
  }

  const startLevel = progress.level;
  progress.exp += amount;

  while (progress.exp >= expRequiredForLevel(progress.level, curves)) {
    progress.exp -= expRequiredForLevel(progress.level, curves);
    progress.level += 1;
  }

  return {
    newLevel: progress.level,
    levelsGained: progress.level - startLevel,
  };
}
