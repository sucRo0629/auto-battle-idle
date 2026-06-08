import type {
  AttackRange,
  AttackSpeedTier,
  DamageType,
  FormationRow,
  GrowthPresetKey,
  GrowthTier,
  PassiveEffectKind,
  Role,
  ResourceAmountKind,
  SkillEffectAnimId,
  SkillEffectKind,
  SkillTriggerKind,
  SkillVfxPresetId,
  StatusEffectStat,
  TargetRule,
  TargetShape,
} from "../types.ts";

export const ROLES = [
  "defender",
  "attacker",
  "supporter",
] as const satisfies readonly Role[];
export const FORMATION_ROWS = [
  "front",
  "middle",
  "back",
] as const satisfies readonly FormationRow[];
export const ATTACK_RANGES = [
  "melee",
  "ranged",
] as const satisfies readonly AttackRange[];
export const SKILL_EFFECT_KINDS = [
  "damage",
  "heal",
  "buff",
  "debuff",
  "hot",
  "dot",
  "barrier",
  "move",
] as const satisfies readonly SkillEffectKind[];

export const MOVE_MODES = [
  "engage",
  "toAnchor",
  "behindTarget",
] as const satisfies readonly import("../types.ts").MoveMode[];

export const MOVE_MODE_LABELS: Record<
  import("../types.ts").MoveMode,
  string
> = {
  engage: "接敵（射程内）",
  toAnchor: "アンカー座標へ",
  behindTarget: "敵の背後",
};

export const SKILL_EFFECT_ANIM_IDS = [
  "idle",
  "attack",
  "heal",
  "hurt",
  "death",
  "dash",
  "none",
] as const satisfies readonly SkillEffectAnimId[];

export const SKILL_EFFECT_ANIM_LABELS: Record<SkillEffectAnimId, string> = {
  idle: "待機",
  attack: "攻撃",
  heal: "回復",
  hurt: "被弾",
  death: "死亡",
  dash: "突進",
  none: "なし",
};

export const RESOURCE_AMOUNT_KINDS = [
  "atkBased",
  "flat",
  "percentMaxHp",
] as const satisfies readonly ResourceAmountKind[];

export const RESOURCE_AMOUNT_KIND_LABELS: Record<ResourceAmountKind, string> = {
  atkBased: "ATK 四則",
  flat: "固定値",
  percentMaxHp: "maxHp 割合",
};
export const DAMAGE_TYPES = [
  "physical",
  "magic",
] as const satisfies readonly DamageType[];
export const VFX_PRESETS = [
  "slash",
  "orb",
  "arrow",
  "healRise",
] as const satisfies readonly SkillVfxPresetId[];
export const TARGET_RULES = [
  "closestAlly",
  "frontEnemy",
  "lowestHpEnemy",
  "mostDamagedAlly",
  "self",
  "rangedAttackingEnemy",
  "highestAtkEnemy",
  "lowestDefEnemy",
  "highestDefEnemy",
  "lowestRegEnemy",
  "highestRegEnemy",
  "highestHpEnemy",
  "farthestEnemy",
] as const satisfies readonly TargetRule[];
export const TARGET_SHAPES = [
  "single",
  "aoe",
  "multiLock",
  "pierce",
  "chain",
  "scatter",
] as const satisfies readonly TargetShape[];

export const TARGET_RULE_LABELS: Record<TargetRule, string> = {
  closestAlly: "最も近い味方",
  frontEnemy: "最前線の敵",
  lowestHpEnemy: "HP最低の敵",
  mostDamagedAlly: "最もダメージを受けた味方",
  self: "自身",
  rangedAttackingEnemy: "遠距離攻撃の敵",
  highestAtkEnemy: "ATK最高の敵",
  lowestDefEnemy: "DEF最低の敵",
  highestDefEnemy: "DEF最高の敵",
  lowestRegEnemy: "REG最低の敵",
  highestRegEnemy: "REG最高の敵",
  highestHpEnemy: "HP最高の敵",
  farthestEnemy: "最も遠い敵",
};

export const TARGET_SHAPE_LABELS: Record<TargetShape, string> = {
  single: "単体",
  aoe: "範囲",
  multiLock: "マルチロック（複数対象・同一可）",
  pierce: "貫通",
  chain: "連鎖",
  scatter: "乱打",
};

export const POWER_STEP_MODES = [
  "multiply",
  "divide",
] as const satisfies readonly import("../types.ts").PowerStepMode[];

export const PASSIVE_EFFECT_KINDS = [
  "targetRuleOverride",
  "evasionChance",
  "basicAttackFeedsActive",
  "heavyStrikeDamageScale",
  "threatBonus",
  "threatOnDebuff",
  "selfLowHpDamageScale",
  "damageTakenToHeal",
  "partyHotAura",
  "healAppliesBarrier",
  "extendSelfAppliedDebuff",
  "aoeCrowdBonus",
  "damageVsDotTarget",
] as const satisfies readonly PassiveEffectKind[];

export const PASSIVE_EFFECT_KIND_LABELS: Record<PassiveEffectKind, string> = {
  targetRuleOverride: "ターゲット上書き",
  evasionChance: "回避率",
  basicAttackFeedsActive: "通常攻撃で構え",
  heavyStrikeDamageScale: "重撃威力倍率",
  threatBonus: "ヘイトボーナス",
  threatOnDebuff: "デバフ付与ヘイト倍化",
  selfLowHpDamageScale: "低HP火力",
  damageTakenToHeal: "被ダメ回復",
  partyHotAura: "味方全体HoT",
  healAppliesBarrier: "回復時バリア",
  extendSelfAppliedDebuff: "デバフ延長",
  aoeCrowdBonus: "密集ボーナス",
  damageVsDotTarget: "DoT対象与ダメ増",
};
export const STATUS_EFFECT_STATS = [
  "atk",
  "def",
  "reg",
  "damageTaken",
] as const satisfies readonly StatusEffectStat[];
export const VALID_REG_VALUES = [0, 5, 10, 15, 20] as const;
export const JOB_TIERS = [1, 2] as const;

export const ATTACK_SPEED_TIERS = [
  "slow",
  "somewhatSlow",
  "normal",
  "somewhatFast",
  "fast",
] as const satisfies readonly AttackSpeedTier[];

export const ATTACK_SPEED_TIER_LABELS: Record<AttackSpeedTier, string> = {
  slow: "遅い",
  somewhatSlow: "やや遅い",
  normal: "普通",
  somewhatFast: "やや早い",
  fast: "早い",
};

export const GROWTH_TIERS = [1, 2, 3] as const satisfies readonly GrowthTier[];

export const GROWTH_TIER_LABELS: Record<GrowthTier, string> = {
  1: "低",
  2: "中",
  3: "高",
};

export const GROWTH_PRESET_KEYS = [
  "attacker",
  "caster",
] as const satisfies readonly GrowthPresetKey[];

export const GROWTH_PRESET_KEY_LABELS: Record<GrowthPresetKey, string> = {
  attacker: "物理 (attacker)",
  caster: "魔法 (caster)",
};

export const MEMBER_STAT_LABELS = {
  hp: "HP",
  atk: "攻撃力",
  def: "防御力",
  reg: "魔法耐性",
  spd: "攻撃速度",
} as const;

export const ATTACK_SPEED_TIER_OPTIONS: AttackSpeedTier[] = [
  ...ATTACK_SPEED_TIERS,
];
export const GROWTH_TIER_OPTIONS: GrowthTier[] = [...GROWTH_TIERS];
export const GROWTH_PRESET_KEY_OPTIONS: GrowthPresetKey[] = [
  ...GROWTH_PRESET_KEYS,
];
export const ROLE_OPTIONS: Role[] = [...ROLES];
export const FORMATION_ROW_OPTIONS: FormationRow[] = [...FORMATION_ROWS];
export const ATTACK_RANGE_OPTIONS: AttackRange[] = [...ATTACK_RANGES];
export const SKILL_EFFECT_KIND_OPTIONS: SkillEffectKind[] = [
  ...SKILL_EFFECT_KINDS,
];
export const SKILL_EFFECT_ANIM_OPTIONS: SkillEffectAnimId[] = [
  ...SKILL_EFFECT_ANIM_IDS,
];

export const SKILL_TRIGGER_KINDS = [
  "time",
  "basicAttackCount",
  "hitsTaken",
] as const satisfies readonly SkillTriggerKind[];

export const SKILL_TRIGGER_KIND_LABELS: Record<SkillTriggerKind, string> = {
  time: "時間",
  basicAttackCount: "攻撃回数",
  hitsTaken: "被攻撃回数",
};

export const SKILL_TRIGGER_VALUE_LABELS: Record<SkillTriggerKind, string> = {
  time: "秒",
  basicAttackCount: "通常攻撃回数",
  hitsTaken: "被攻撃回数",
};

export const SKILL_TRIGGER_KIND_OPTIONS: SkillTriggerKind[] = [
  ...SKILL_TRIGGER_KINDS,
];
export const RESOURCE_AMOUNT_KIND_OPTIONS: ResourceAmountKind[] = [
  ...RESOURCE_AMOUNT_KINDS,
];
export const DAMAGE_TYPE_OPTIONS: DamageType[] = [...DAMAGE_TYPES];
export const VFX_PRESET_OPTIONS: SkillVfxPresetId[] = [...VFX_PRESETS];
export const TARGET_RULE_OPTIONS: TargetRule[] = [...TARGET_RULES];
export const TARGET_SHAPE_OPTIONS: TargetShape[] = [...TARGET_SHAPES];
export const PASSIVE_EFFECT_KIND_OPTIONS: PassiveEffectKind[] = [
  ...PASSIVE_EFFECT_KINDS,
];
export const STATUS_EFFECT_STAT_OPTIONS: StatusEffectStat[] = [
  ...STATUS_EFFECT_STATS,
];
export const REG_OPTIONS: number[] = [...VALID_REG_VALUES];
export const JOB_TIER_OPTIONS: number[] = [...JOB_TIERS];
