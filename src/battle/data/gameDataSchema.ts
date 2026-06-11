import type {
  AttackRange,
  AttackSpeedTier,
  BuffSubKind,
  DamageType,
  DebuffSubKind,
  FormationRow,
  GrowthPresetKey,
  GrowthTier,
  BuffFilterTag,
  BuffTargetKind,
  DebuffFilterTag,
  DamageIncreaseCondition,
  HealSubKind,
  PassiveEffectKind,
  Role,
  ResourceAmountKind,
  SkillEffectAnimId,
  SkillEffectKind,
  SkillTriggerKind,
  SkillVfxPresetId,
  SpecialEffectApplyTo,
  StatusEffectStat,
  TargetRule,
  TargetShape,
  TargetSpec,
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
  "stun",
  "knockback",
  "dispel",
  "block",
  "counter",
] as const satisfies readonly SkillEffectKind[];

export const MOVE_MODES = [
  "engage",
  "toAnchor",
  "behindTarget",
] as const satisfies readonly import("../types.ts").MoveMode[];

export const MOVE_MODE_LABELS: Record<import("../types.ts").MoveMode, string> =
  {
    engage: "接敵（射程内）",
    toAnchor: "アンカー座標へ",
    behindTarget: "敵の背後",
  };

export const SKILL_EFFECT_ANIM_IDS = [
  "idle",
  "attack",
  "death",
  "none",
] as const satisfies readonly SkillEffectAnimId[];

/** JSON 読み込み互換（エディタ選択肢には出さない） */
export const LEGACY_SKILL_EFFECT_ANIM_IDS = [
  "dash",
  "heal",
  "hurt",
] as const satisfies readonly SkillEffectAnimId[];

export const ALL_SKILL_EFFECT_ANIM_IDS = [
  ...SKILL_EFFECT_ANIM_IDS,
  ...LEGACY_SKILL_EFFECT_ANIM_IDS,
] as const satisfies readonly SkillEffectAnimId[];

export const SKILL_EFFECT_ANIM_LABELS: Record<SkillEffectAnimId, string> = {
  idle: "待機",
  attack: "攻撃",
  death: "死亡",
  none: "なし",
  dash: "（非推奨）",
  heal: "（非推奨）",
  hurt: "（非推奨）",
};

export const RESOURCE_AMOUNT_KINDS = [
  "atkBased",
  "defBased",
  "flat",
  "percentMaxHp",
] as const satisfies readonly ResourceAmountKind[];

export const RESOURCE_AMOUNT_KIND_LABELS: Record<ResourceAmountKind, string> = {
  atkBased: "ATK 四則",
  defBased: "DEF 四則",
  flat: "固定値",
  percentMaxHp: "maxHp 割合",
};

export const COUNTER_RESPONSE_KINDS = [
  "damage",
  "debuff",
  "dot",
  "stun",
  "knockback",
] as const satisfies readonly import("../types.ts").CounterResponseKind[];

export const COUNTER_RESPONSE_KIND_LABELS: Record<
  import("../types.ts").CounterResponseKind,
  string
> = {
  damage: "ダメージ",
  debuff: "デバフ",
  dot: "DoT",
  stun: "スタン",
  knockback: "ノックバック",
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
  "magicAttackingEnemy",
  "highestAtkEnemy",
  "lowestDefEnemy",
  "highestDefEnemy",
  "lowestRegEnemy",
  "highestRegEnemy",
  "highestHpEnemy",
  "farthestEnemy",
  "debuffedEnemy",
  "allAllies",
  "allEnemies",
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
  magicAttackingEnemy: "魔法攻撃の敵",
  highestAtkEnemy: "ATK最高の敵",
  lowestDefEnemy: "DEF最低の敵",
  highestDefEnemy: "DEF最高の敵",
  lowestRegEnemy: "耐魔最低の敵",
  highestRegEnemy: "耐魔最高の敵",
  highestHpEnemy: "HP最高の敵",
  farthestEnemy: "最も遠い敵",
  debuffedEnemy: "デバフを受けている対象",
  allAllies: "味方全員",
  allEnemies: "敵全員",
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
  "damageTakenToHeal",
  "hot",
  "excessHealToBarrier",
  "aoeCrowdBonus",
  "specialEffect",
  "defenseIgnore",
  "periodicDispel",
  "damageReduction",
  "buff",
  "debuff",
  "counter",
  "selfHpRatioBuff",
] as const satisfies readonly PassiveEffectKind[];

export const PASSIVE_EFFECT_KIND_LABELS: Record<
  (typeof PASSIVE_EFFECT_KINDS)[number],
  string
> = {
  targetRuleOverride: "ターゲット上書き",
  damageTakenToHeal: "被ダメ回復",
  hot: "HoT",
  excessHealToBarrier: "余剰回復バリア変換",
  aoeCrowdBonus: "密集ボーナス",
  specialEffect: "特効効果",
  defenseIgnore: "防御無視",
  periodicDispel: "デバフ解除",
  damageReduction: "ダメージ軽減",
  buff: "バフ",
  debuff: "デバフ",
  counter: "反撃",
  selfHpRatioBuff: "自HP割合バフ",
};

export const HEAL_SUB_KINDS = [
  "instant",
  "hot",
  "dispel",
] as const satisfies readonly HealSubKind[];

export const HEAL_SUB_KIND_LABELS: Record<HealSubKind, string> = {
  instant: "即時回復",
  hot: "HoT",
  dispel: "デバフ解除",
};

export const BUFF_SUB_KINDS = [
  "stat",
  "barrier",
  "block",
  "evasion",
] as const satisfies readonly BuffSubKind[];

export const BUFF_SUB_KIND_LABELS: Record<BuffSubKind, string> = {
  stat: "ステータス",
  barrier: "バリア",
  block: "ブロック",
  evasion: "回避",
};

export const DEBUFF_SUB_KINDS = [
  "stat",
  "dot",
  "stun",
] as const satisfies readonly DebuffSubKind[];

export const DEBUFF_SUB_KIND_LABELS: Record<DebuffSubKind, string> = {
  stat: "ステータス",
  dot: "DoT",
  stun: "スタン",
};

export const BUFF_TARGET_KINDS = [
  "atk",
  "def",
  "reg",
  "damageTaken",
  "attackSpeed",
  "evasion",
  "block",
] as const satisfies readonly BuffTargetKind[];

export const BUFF_TARGET_KIND_LABELS: Record<BuffTargetKind, string> = {
  atk: "攻撃",
  def: "防御",
  reg: "耐魔",
  damageTaken: "被ダメ",
  attackSpeed: "攻撃速度",
  evasion: "回避率",
  block: "ブロック",
};

export const SPECIAL_EFFECT_APPLY_TO_OPTIONS = [
  "damage",
  "heal",
] as const satisfies readonly SpecialEffectApplyTo[];

export const SPECIAL_EFFECT_APPLY_TO_LABELS: Record<
  SpecialEffectApplyTo,
  string
> = {
  damage: "ダメージ",
  heal: "回復",
};

/** エディタ top-level（レガシー hot/dot 等は正規化で吸収） */
export const EDITOR_ACTIVE_EFFECT_CATEGORIES = [
  "damage",
  "heal",
  "buff",
  "debuff",
  "counter",
  "move",
  "knockback",
] as const;

export const EDITOR_ACTIVE_EFFECT_CATEGORY_LABELS: Record<
  (typeof EDITOR_ACTIVE_EFFECT_CATEGORIES)[number],
  string
> = {
  damage: "ダメージ",
  heal: "回復",
  buff: "バフ",
  debuff: "デバフ",
  counter: "反撃",
  move: "移動",
  knockback: "ノックバック",
};
export const STATUS_EFFECT_STATS = [
  "atk",
  "def",
  "reg",
  "damageTaken",
  "attackSpeed",
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
  ...EDITOR_ACTIVE_EFFECT_CATEGORIES,
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

/** エディタ「効果種別」ドロップダウン（新 taxonomy を先頭に並べる） */
export const EDITOR_PASSIVE_EFFECT_KINDS = [
  "specialEffect",
  "buff",
  "debuff",
  "counter",
  "hot",
  "periodicDispel",
  "damageTakenToHeal",
  "excessHealToBarrier",
  "damageReduction",
  "defenseIgnore",
  "selfHpRatioBuff",
  "targetRuleOverride",
  "aoeCrowdBonus",
] as const satisfies readonly (typeof PASSIVE_EFFECT_KINDS)[number][];

export const EDITOR_PASSIVE_EFFECT_KIND_OPTIONS: (typeof EDITOR_PASSIVE_EFFECT_KINDS)[number][] =
  [...EDITOR_PASSIVE_EFFECT_KINDS];

export const STATUS_EFFECT_STAT_OPTIONS: StatusEffectStat[] = [
  ...STATUS_EFFECT_STATS,
];

/** デバフフィルタ用タグ（新デバフ種追加時はここと debuffMatching.ts を更新） */
export const DEBUFF_FILTER_TAGS = [
  { id: "atk" as const, label: "ATKデバフ" },
  { id: "def" as const, label: "DEFデバフ" },
  { id: "reg" as const, label: "耐魔デバフ" },
  { id: "damageTaken" as const, label: "被ダメデバフ" },
  { id: "dot" as const, label: "DoT" },
  { id: "stun" as const, label: "スタン" },
] as const satisfies readonly { id: DebuffFilterTag; label: string }[];

export const DEBUFF_FILTER_TAG_OPTIONS: DebuffFilterTag[] =
  DEBUFF_FILTER_TAGS.map((entry) => entry.id);

export const DEBUFF_FILTER_TAG_LABELS: Record<DebuffFilterTag, string> =
  Object.fromEntries(
    DEBUFF_FILTER_TAGS.map((entry) => [entry.id, entry.label])
  ) as Record<DebuffFilterTag, string>;

/** バフフィルタ用タグ（新バフ種追加時はここと statusMatching.ts を更新） */
export const BUFF_FILTER_TAGS = [
  { id: "atk" as const, label: "ATKバフ" },
  { id: "def" as const, label: "DEFバフ" },
  { id: "reg" as const, label: "耐魔バフ" },
  { id: "damageTaken" as const, label: "被ダメバフ" },
  { id: "hot" as const, label: "HoT" },
  { id: "block" as const, label: "ブロック" },
  { id: "evasion" as const, label: "回避" },
] as const satisfies readonly { id: BuffFilterTag; label: string }[];

export const BUFF_FILTER_TAG_OPTIONS: BuffFilterTag[] = BUFF_FILTER_TAGS.map(
  (entry) => entry.id
);

export const BUFF_FILTER_TAG_LABELS: Record<BuffFilterTag, string> =
  Object.fromEntries(
    BUFF_FILTER_TAGS.map((entry) => [entry.id, entry.label])
  ) as Record<BuffFilterTag, string>;

export const TARGET_SPEC_KINDS = [
  "distance",
  "stat",
  "attackType",
  "status",
  "self",
  "all",
] as const;

export type TargetSpecKind = (typeof TARGET_SPEC_KINDS)[number];

export const TARGET_SPEC_KIND_LABELS: Record<TargetSpecKind, string> = {
  distance: "距離",
  stat: "ステータス",
  attackType: "攻撃種別",
  status: "状態",
  self: "自身",
  all: "全体",
};

export const TARGET_SIDE_OPTIONS = ["ally", "enemy"] as const;
export const TARGET_DISTANCE_ORDER_OPTIONS = ["nearest", "farthest"] as const;
export const TARGET_STAT_OPTIONS = ["hp", "atk", "def", "reg"] as const;
export const TARGET_STAT_ORDER_OPTIONS = [
  "highest",
  "lowest",
  "ratio",
] as const;

export const TARGET_SIDE_LABELS: Record<
  TargetSpec["kind"] extends never ? never : "ally" | "enemy",
  string
> = {
  ally: "味方",
  enemy: "敵",
};

export const TARGET_DISTANCE_ORDER_LABELS: Record<
  "nearest" | "farthest",
  string
> = {
  nearest: "至近",
  farthest: "最遠",
};

export const TARGET_STAT_LABELS: Record<"hp" | "atk" | "def" | "reg", string> =
  {
    hp: "HP",
    atk: "ATK",
    def: "DEF",
    reg: "REG",
  };

export const TARGET_STAT_ORDER_LABELS: Record<
  "highest" | "lowest" | "ratio",
  string
> = {
  highest: "最高",
  lowest: "最低",
  ratio: "割合（最低）",
};

export const DAMAGE_INCREASE_CONDITION_KINDS = [
  "debuff",
  "targetHp",
] as const satisfies readonly DamageIncreaseCondition["kind"][];

export const DAMAGE_INCREASE_CONDITION_KIND_LABELS: Record<
  DamageIncreaseCondition["kind"],
  string
> = {
  debuff: "デバフ",
  targetHp: "対象HP",
};

export const DEFENSE_IGNORE_DEF_MODES = ["flat", "percent"] as const;

export const DEFENSE_IGNORE_DEF_MODE_LABELS: Record<
  "flat" | "percent",
  string
> = {
  flat: "固定値",
  percent: "割合",
};
export const REG_OPTIONS: number[] = [...VALID_REG_VALUES];
export const JOB_TIER_OPTIONS: number[] = [...JOB_TIERS];
