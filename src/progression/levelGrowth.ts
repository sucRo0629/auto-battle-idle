import type {
  AttackSpeedTier,
  ClassPreset,
  GrowthPresetKey,
  GrowthTier,
  GrowthTierSet,
  Role,
} from '../battle/types.ts';

export interface StatGrowth {
  maxHp: number;
  atk: number;
  def: number;
}

type GrowthPresetId = 'defender' | 'attacker' | 'supporter';

type GrowthPresetTable = Record<
  keyof StatGrowth,
  Record<'1' | '2' | '3', number>
>;

export interface LevelCurvesConfig {
  expPerLevel: number;
  growthPresets: Record<GrowthPresetId, GrowthPresetTable>;
  attackSpeedPresets: Record<AttackSpeedTier, { basicCooldownRate: number }>;
}

const DEFAULT_GROWTH_TIER: GrowthTierSet = { maxHp: 2, atk: 2, def: 2 };

const ATTACK_SPEED_TIER_ORDER: AttackSpeedTier[] = [
  'slow',
  'somewhatSlow',
  'normal',
  'somewhatFast',
  'fast',
];

export function loadLevelCurves(raw: unknown): LevelCurvesConfig {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('levelCurves.json must be an object');
  }
  const obj = raw as Record<string, unknown>;
  const expPerLevel = obj.expPerLevel;
  if (typeof expPerLevel !== 'number' || expPerLevel <= 0) {
    throw new Error('levelCurves.json: expPerLevel must be a positive number');
  }

  const growthPresets = parseGrowthPresets(obj.growthPresets);
  const attackSpeedPresets = parseAttackSpeedPresets(obj.attackSpeedPresets);

  return { expPerLevel, growthPresets, attackSpeedPresets };
}

function parseGrowthPresets(raw: unknown): Record<GrowthPresetId, GrowthPresetTable> {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('levelCurves.json: growthPresets is required');
  }
  const obj = raw as Record<string, unknown>;
  const presets: Partial<Record<GrowthPresetId, GrowthPresetTable>> = {};
  for (const presetId of ['defender', 'attacker', 'supporter'] as const) {
    presets[presetId] = parseGrowthPresetTable(
      obj[presetId],
      `growthPresets.${presetId}`,
    );
  }
  return presets as Record<GrowthPresetId, GrowthPresetTable>;
}

function parseGrowthPresetTable(raw: unknown, context: string): GrowthPresetTable {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error(`${context} must be an object`);
  }
  const obj = raw as Record<string, unknown>;
  const table: Partial<GrowthPresetTable> = {};
  for (const stat of ['maxHp', 'atk', 'def'] as const) {
    table[stat] = parseGrowthTierRow(obj[stat], `${context}.${stat}`);
  }
  return table as GrowthPresetTable;
}

function parseGrowthTierRow(
  raw: unknown,
  context: string,
): Record<'1' | '2' | '3', number> {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error(`${context} must be an object`);
  }
  const obj = raw as Record<string, unknown>;
  const tier1 = requireNonNegativeNumber(obj['1'], `${context}.1`);
  const tier2 = requireNonNegativeNumber(obj['2'], `${context}.2`);
  const tier3 = requireNonNegativeNumber(obj['3'], `${context}.3`);
  if (!(tier1 < tier2 && tier2 < tier3)) {
    throw new Error(`${context} must satisfy tier 1 < 2 < 3`);
  }
  return { '1': tier1, '2': tier2, '3': tier3 };
}

function parseAttackSpeedPresets(
  raw: unknown,
): Record<AttackSpeedTier, { basicCooldownRate: number }> {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('levelCurves.json: attackSpeedPresets is required');
  }
  const obj = raw as Record<string, unknown>;
  const presets = {} as Record<AttackSpeedTier, { basicCooldownRate: number }>;
  let prevRate = 0;
  for (const tier of ATTACK_SPEED_TIER_ORDER) {
    const entry = obj[tier];
    if (typeof entry !== 'object' || entry === null) {
      throw new Error(`levelCurves.json: attackSpeedPresets.${tier} is required`);
    }
    const rate = requirePositiveNumber(
      (entry as Record<string, unknown>).basicCooldownRate,
      `attackSpeedPresets.${tier}.basicCooldownRate`,
    );
    if (rate <= prevRate) {
      throw new Error(
        `levelCurves.json: attackSpeedPresets rates must strictly increase (${tier})`,
      );
    }
    presets[tier] = { basicCooldownRate: rate };
    prevRate = rate;
  }
  return presets;
}

function requireNonNegativeNumber(value: unknown, context: string): number {
  if (typeof value !== 'number' || Number.isNaN(value) || value < 0) {
    throw new Error(`${context} must be a non-negative number`);
  }
  return value;
}

function requirePositiveNumber(value: unknown, context: string): number {
  if (typeof value !== 'number' || Number.isNaN(value) || value <= 0) {
    throw new Error(`${context} must be a positive number`);
  }
  return value;
}

function resolveRolePresetKey(
  role: Role,
  growthPresetKey?: GrowthPresetKey,
): GrowthPresetId | 'caster' {
  if (role === 'defender') return 'defender';
  if (role === 'supporter') return 'supporter';
  return growthPresetKey === 'caster' ? 'caster' : 'attacker';
}

function lookupGrowthValue(
  curves: LevelCurvesConfig,
  presetKey: GrowthPresetId | 'caster',
  stat: keyof StatGrowth,
  tier: GrowthTier,
): number {
  const tierKey = String(tier) as '1' | '2' | '3';
  if (presetKey === 'caster') {
    const tableKey: GrowthPresetId = stat === 'atk' ? 'attacker' : 'supporter';
    return curves.growthPresets[tableKey][stat][tierKey];
  }
  return curves.growthPresets[presetKey][stat][tierKey];
}

export function resolveGrowthTierSet(preset: Pick<ClassPreset, 'growthTier'>): GrowthTierSet {
  return preset.growthTier ?? DEFAULT_GROWTH_TIER;
}

export function resolveStatGrowth(
  preset: Pick<ClassPreset, 'role' | 'growthTier' | 'growthPresetKey'>,
  curves: LevelCurvesConfig,
): StatGrowth {
  const tiers = resolveGrowthTierSet(preset);
  const presetKey = resolveRolePresetKey(preset.role, preset.growthPresetKey);
  return {
    maxHp: lookupGrowthValue(curves, presetKey, 'maxHp', tiers.maxHp),
    atk: lookupGrowthValue(curves, presetKey, 'atk', tiers.atk),
    def: lookupGrowthValue(curves, presetKey, 'def', tiers.def),
  };
}

export function getBasicCooldownRate(
  tier: AttackSpeedTier,
  curves: LevelCurvesConfig,
): number {
  return curves.attackSpeedPresets[tier].basicCooldownRate;
}

export function expRequiredForLevel(level: number, curves: LevelCurvesConfig): number {
  return curves.expPerLevel * level;
}

export function computeStatsAtLevel(
  base: StatGrowth & { reg: number },
  preset: Pick<ClassPreset, 'role' | 'growthTier' | 'growthPresetKey'>,
  level: number,
  curves: LevelCurvesConfig,
): StatGrowth & { reg: number } {
  const growth = resolveStatGrowth(preset, curves);
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
