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
  DispelPriority,
  DotFlavor,
  DamageIncreaseCondition,
  FireCondition,
  FirePolicy,
  HpRatioCompare,
  HealSubKind,
  PassiveEffectKind,
  Role,
  ResourceAmountKind,
  SkillEffectAnimId,
  SkillEffectKind,
  SkillTriggerKind,
  SpecialEffectApplyTo,
  StatusEffectStat,
  TargetRule,
  TargetShape,
  TargetSide,
  VfxAnchor,
  VfxLayer,
} from "../types.ts";

export const ROLES = [
  "defender",
  "attacker",
  "supporter",
] as const satisfies readonly Role[];
export const FORMATION_ROWS = [
  "front",
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
  "dot",
  "barrier",
  "move",
  "stun",
  "knockback",
  "dispel",
  "block",
  "counter",
  "basicAttackTransform",
  "conditionalEffect",
  "herbalPotencyConsume",
  "blockResonanceConsume",
  "enemyReelIn",
  "arenaDominance",
  "grantNextOutgoingDamage",
  "placedField",
  "dotCompress",
  "dotExtend",
  "dotHarvest",
  "poisonSpread",
] as const satisfies readonly SkillEffectKind[];

export const MOVE_MODES = [
  "engage",
  "toAnchor",
] as const satisfies readonly import("../types.ts").MoveMode[];

export const MOVE_MODE_LABELS: Record<import("../types.ts").MoveMode, string> =
  {
    engage: "接敵（射程内）",
    toAnchor: "アンカー座標へ",
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

export const MAX_HP_REFERENCES = [
  "self",
  "target",
] as const satisfies readonly import("../types.ts").MaxHpReference[];

export const MAX_HP_REF_LABELS: Record<
  import("../types.ts").MaxHpReference,
  string
> = {
  self: "自身",
  target: "対象",
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

export const PASSIVE_COUNTER_TRIGGER_KINDS = [
  "selfDamaged",
  "frontAllyDamaged",
] as const satisfies readonly import("../types.ts").PassiveCounterTriggerKind[];

export const PASSIVE_COUNTER_TRIGGER_KIND_LABELS: Record<
  import("../types.ts").PassiveCounterTriggerKind,
  string
> = {
  selfDamaged: "自己被弾",
  frontAllyDamaged: "前列味方被弾（援護）",
};
export const DAMAGE_TYPES = [
  "physical",
  "magic",
] as const satisfies readonly DamageType[];
export const VFX_ANCHORS = [
  "actor",
  "target",
  "between",
  "footActor",
  "footTarget",
] as const satisfies readonly VfxAnchor[];
export const VFX_LAYERS = [
  "behind",
  "front",
] as const satisfies readonly VfxLayer[];

/** AnimPhaseFields の JSON キー（body strip / SkillVfxDef 共通） */
export const ANIM_PHASE_FIELD_KEYS = [
  "animStartFrame",
  "animIntroEndFrame",
  "animLoopFrame",
  "animLoopEndFrame",
  "animOutroStartFrame",
] as const;

/** VfxParticleDef の JSON キー */
export const VFX_PARTICLE_DEF_FIELD_KEYS = [
  "enabled",
  "preset",
  "placement",
  "count",
  "durationSec",
  "delaySec",
  "tint",
] as const;

/** パーティクル preset ID（`particlePresets.ts` と同期） */
export const PARTICLE_PRESET_IDS = [
  "heal_normal",
  "heal_minor",
  "heal_major",
  "heal_cast",
  "heal_area",
  "heal_party",
  "heal_major_party",
] as const;

/** SkillVfxDef の JSON キー（traits.basicAttackVfx / effect.vfx 等） */
export const SKILL_VFX_DEF_FIELD_KEYS = [
  "enabled",
  "placement",
  "particles",
  ...ANIM_PHASE_FIELD_KEYS,
] as const;

/** Phase 6 で廃止した Canvas preset VFX キー（validateGameData で拒否） */
export const DEPRECATED_SKILL_VFX_DEF_FIELD_KEYS = [
  "preset",
  "arc",
  "durationMs",
] as const;

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
  rangedAttackingEnemy: "遠隔帯の敵",
  magicAttackingEnemy: "魔法攻撃の敵",
  highestAtkEnemy: "ATK最高の敵",
  lowestDefEnemy: "DEF最低の敵",
  highestDefEnemy: "DEF最高の敵",
  lowestRegEnemy: "REG最低の敵",
  highestRegEnemy: "REG最高の敵",
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
  "heal",
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
  "excessHealRedirect",
  "targetHpRatioHealScale",
  "targetHpRatioDamageScale",
  "idleAtkRamp",
  "ballistaMark",
  "healReservation",
  "barrierBreakRegen",
  "barrierDepletionHeal",
  "skillAmountOverride",
  "skillPropertyOverride",
  "threatControl",
  "herbalPotency",
  "blockResonance",
  "lastStandInvulnerable",
  "frontBlockAura",
  "lastStandRecovery",
  "lowHpCover",
  "lastStandGuts",
  "bloodlustDuelist",
  "duelistPride",
  "ignoredDefBonusDamage",
  "bonusBasicAttackOnHit",
  "dotCompressAssist",
  "allyBasicAttackDotProc",
  "dotDurationMultiplierOnApply",
  "dottedEnemyHealReceivedDebuff",
  "conditionalEnemyDamageTakenAura",
] as const satisfies readonly PassiveEffectKind[];

export const PASSIVE_EFFECT_KIND_LABELS: Record<
  (typeof PASSIVE_EFFECT_KINDS)[number],
  string
> = {
  targetRuleOverride: "ターゲット上書き",
  heal: "回復",
  excessHealToBarrier: "余剰回復バリア変換",
  excessHealRedirect: "余剰回復転送",
  aoeCrowdBonus: "密集ボーナス",
  specialEffect: "特効効果",
  defenseIgnore: "防御無視",
  periodicDispel: "デバフ解除",
  damageReduction: "ダメージ軽減",
  buff: "バフ",
  debuff: "デバフ",
  counter: "反撃",
  selfHpRatioBuff: "自HP割合バフ",
  targetHpRatioHealScale: "対象HP割合回復補正",
  targetHpRatioDamageScale: "対象HP割合ダメ補正",
  idleAtkRamp: "待機ATK蓄積",
  ballistaMark: "砲撃標的",
  healReservation: "ヒール予約",
  barrierBreakRegen: "バリア再生成",
  barrierDepletionHeal: "バリア枯渇回復",
  skillAmountOverride: "スキル効果量上書き",
  skillPropertyOverride: "スキル属性上書き",
  threatControl: "ヘイト制御",
  herbalPotency: "薬効浸潤",
  blockResonance: "迎撃態勢",
  lastStandInvulnerable: "不撓の誓い",
  frontBlockAura: "護身手",
  lastStandRecovery: "不退転",
  lowHpCover: "攻撃誘導",
  lastStandGuts: "不屈の闘士",
  bloodlustDuelist: "流血闘志",
  duelistPride: "闘士の矜持",
  ignoredDefBonusDamage: "無視DEFボーナス",
  bonusBasicAttackOnHit: "追加通常攻撃",
  dotCompressAssist: "DoT圧縮補助",
  allyBasicAttackDotProc: "味方通常攻撃DoT",
  dotDurationMultiplierOnApply: "DoT付与時間倍率",
  dottedEnemyHealReceivedDebuff: "DoT中被回復減",
  conditionalEnemyDamageTakenAura: "条件付き被ダメ aura",
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
  "wardBarrier",
  "block",
  "evasion",
  "damageDelay",
  "allyAttackFollowUp",
] as const satisfies readonly BuffSubKind[];

export const BUFF_SUB_KIND_LABELS: Record<BuffSubKind, string> = {
  stat: "ステータス",
  barrier: "バリア",
  wardBarrier: "障壁",
  block: "ブロック",
  evasion: "回避",
  damageDelay: "ダメージ遅延",
  allyAttackFollowUp: "追撃モード",
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

export const DOT_FLAVORS = ["bleed", "poison"] as const satisfies readonly DotFlavor[];

export const DOT_FLAVOR_LABELS: Record<DotFlavor, string> = {
  bleed: "出血",
  poison: "毒",
};

export const BUFF_TARGET_KINDS = [
  "hp",
  "atk",
  "def",
  "reg",
  "damageTaken",
  "attackSpeed",
  "evasion",
  "block",
] as const satisfies readonly BuffTargetKind[];

export const BUFF_TARGET_KIND_LABELS: Record<BuffTargetKind, string> = {
  hp: "HP",
  atk: "攻撃",
  def: "防御",
  reg: "REG",
  damageTaken: "被ダメ",
  attackSpeed: "攻撃速度",
  evasion: "回避率",
  block: "ブロック",
};

export const SPECIAL_EFFECT_APPLY_TO_OPTIONS = [
  "damage",
  "heal",
  "barrier",
] as const satisfies readonly SpecialEffectApplyTo[];

export const SPECIAL_EFFECT_APPLY_TO_LABELS: Record<
  SpecialEffectApplyTo,
  string
> = {
  damage: "ダメージ",
  heal: "回復",
  barrier: "バリア",
};

/** エディタ「種別」— クラス固有アクティブ */
export const EDITOR_ACTIVE_CLASS_SPECIFIC_EFFECT_CATEGORIES = [
  "herbalPotencyConsume",
  "blockResonanceConsume",
  "enemyReelIn",
  "arenaDominance",
] as const satisfies readonly SkillEffectKind[];

/** エディタ「種別」— 汎用アクティブ */
export const EDITOR_ACTIVE_GENERAL_EFFECT_CATEGORIES = [
  "damage",
  "heal",
  "buff",
  "debuff",
  "counter",
  "basicAttackTransform",
  "move",
  "knockback",
  "conditionalEffect",
] as const satisfies readonly SkillEffectKind[];

export const EDITOR_ACTIVE_EFFECT_KIND_GROUPS = [
  {
    label: "クラス固有",
    kinds: [...EDITOR_ACTIVE_CLASS_SPECIFIC_EFFECT_CATEGORIES],
  },
  {
    label: "一般",
    kinds: [...EDITOR_ACTIVE_GENERAL_EFFECT_CATEGORIES],
  },
] as const;

/** エディタ top-level（レガシー hot/dot 等は正規化で吸収） */
export const EDITOR_ACTIVE_EFFECT_CATEGORIES = [
  ...EDITOR_ACTIVE_CLASS_SPECIFIC_EFFECT_CATEGORIES,
  ...EDITOR_ACTIVE_GENERAL_EFFECT_CATEGORIES,
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
  basicAttackTransform: "通常攻撃変形",
  move: "移動",
  knockback: "ノックバック",
  conditionalEffect: "条件分岐",
  herbalPotencyConsume: "薬効消費",
  blockResonanceConsume: "迎撃消費",
  enemyReelIn: "敵引き寄せ",
  arenaDominance: "闘技場の掟",
  grantNextOutgoingDamage: "次与ダメ装填",
};
export const STATUS_EFFECT_STATS = [
  "hp",
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

export type FireConditionKind = FireCondition["kind"];

export const FIRE_POLICIES = [
  "immediate",
  "smart",
] as const satisfies readonly FirePolicy[];

export const FIRE_POLICY_LABELS: Record<FirePolicy, string> = {
  immediate: "即時発動",
  smart: "条件発動 (smart)",
};

export const FIRE_POLICY_OPTIONS: FirePolicy[] = [...FIRE_POLICIES];

export const FIRE_CONDITION_KINDS = [
  "targetHp",
  "debuff",
  "minTargets",
  "selfHp",
  "allyDamaged",
  "waveStart",
  "finalWaveStart",
  "waveEnd",
  "enemyCount",
  "pendingIncomingDamage",
  "targetBarrierBelowGrant",
  "blockResonanceStacks",
  "hasDot",
] as const satisfies readonly FireConditionKind[];

export const FIRE_CONDITION_KIND_LABELS: Record<FireConditionKind, string> = {
  targetHp: "対象HP割合",
  debuff: "デバフ",
  minTargets: "最小ターゲット数",
  selfHp: "自身HP割合",
  allyDamaged: "味方被ダメ",
  waveStart: "Wave開始フェーズ",
  finalWaveStart: "最終Wave開始",
  waveEnd: "Wave終了フェーズ",
  enemyCount: "敵数",
  pendingIncomingDamage: "先読み被ダメ",
  targetBarrierBelowGrant: "付与量>現バリア",
  blockResonanceStacks: "迎撃スタック",
  hasDot: "DoT中",
};

export const FIRE_CONDITION_KIND_OPTIONS: FireConditionKind[] = [
  ...FIRE_CONDITION_KINDS,
];

export const HP_RATIO_COMPARES = [
  "lte",
  "gte",
] as const satisfies readonly HpRatioCompare[];

export const HP_RATIO_COMPARE_LABELS: Record<HpRatioCompare, string> = {
  lte: "以下",
  gte: "以上",
};

export const HP_RATIO_COMPARE_OPTIONS = [...HP_RATIO_COMPARES];

export const ENEMY_COUNT_SCOPES = ["living", "inRange"] as const;

export const ENEMY_COUNT_SCOPE_LABELS: Record<
  (typeof ENEMY_COUNT_SCOPES)[number],
  string
> = {
  living: "生存敵全体",
  inRange: "射程内",
};

export const RESOURCE_AMOUNT_KIND_OPTIONS: ResourceAmountKind[] = [
  ...RESOURCE_AMOUNT_KINDS,
];
export const DAMAGE_TYPE_OPTIONS: DamageType[] = [...DAMAGE_TYPES];
export const VFX_ANCHOR_OPTIONS: VfxAnchor[] = [...VFX_ANCHORS];
export const VFX_LAYER_OPTIONS: VfxLayer[] = [...VFX_LAYERS];

export const TARGET_RULE_OPTIONS: TargetRule[] = [...TARGET_RULES];
export const TARGET_SHAPE_OPTIONS: TargetShape[] = [...TARGET_SHAPES];
export const PASSIVE_EFFECT_KIND_OPTIONS: PassiveEffectKind[] = [
  ...PASSIVE_EFFECT_KINDS,
];

/** エディタ「効果種別」— クラス固有パッシブ */
export const EDITOR_PASSIVE_CLASS_SPECIFIC_EFFECT_KINDS = [
  "herbalPotency",
  "blockResonance",
  "lastStandInvulnerable",
  "frontBlockAura",
  "lastStandRecovery",
  "lowHpCover",
  "lastStandGuts",
  "bloodlustDuelist",
  "duelistPride",
  "healReservation",
  "barrierBreakRegen",
  "barrierDepletionHeal",
] as const satisfies readonly (typeof PASSIVE_EFFECT_KINDS)[number][];

/** エディタ「効果種別」— 汎用パッシブ */
export const EDITOR_PASSIVE_GENERAL_EFFECT_KINDS = [
  "specialEffect",
  "buff",
  "debuff",
  "counter",
  "heal",
  "periodicDispel",
  "excessHealToBarrier",
  "excessHealRedirect",
  "damageReduction",
  "threatControl",
  "defenseIgnore",
  "ignoredDefBonusDamage",
  "bonusBasicAttackOnHit",
  "selfHpRatioBuff",
  "targetHpRatioHealScale",
  "targetHpRatioDamageScale",
  "idleAtkRamp",
  "ballistaMark",
  "targetRuleOverride",
  "aoeCrowdBonus",
  "skillAmountOverride",
  "skillPropertyOverride",
] as const satisfies readonly (typeof PASSIVE_EFFECT_KINDS)[number][];

export const EDITOR_PASSIVE_EFFECT_KIND_GROUPS = [
  {
    label: "クラス固有",
    kinds: [...EDITOR_PASSIVE_CLASS_SPECIFIC_EFFECT_KINDS],
  },
  {
    label: "一般",
    kinds: [...EDITOR_PASSIVE_GENERAL_EFFECT_KINDS],
  },
] as const;

/** エディタ「効果種別」ドロップダウン（フラット列；グループは EDITOR_PASSIVE_EFFECT_KIND_GROUPS） */
export const EDITOR_PASSIVE_EFFECT_KINDS = [
  ...EDITOR_PASSIVE_CLASS_SPECIFIC_EFFECT_KINDS,
  ...EDITOR_PASSIVE_GENERAL_EFFECT_KINDS,
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
  { id: "reg" as const, label: "REGデバフ" },
  { id: "damageTaken" as const, label: "被ダメデバフ" },
  { id: "attackSpeed" as const, label: "SPDデバフ" },
  { id: "dot" as const, label: "DoT（全種）" },
  { id: "bleed" as const, label: "出血" },
  { id: "poison" as const, label: "毒" },
  { id: "stun" as const, label: "スタン" },
] as const satisfies readonly { id: DebuffFilterTag; label: string }[];

export const DISPEL_PRIORITIES = [
  "longest",
  "strongest",
] as const satisfies readonly DispelPriority[];

export const DISPEL_PRIORITY_LABELS: Record<DispelPriority, string> = {
  longest: "最長",
  strongest: "最大",
};

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
  { id: "reg" as const, label: "REGバフ" },
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
  "clusterCenter",
  "self",
  "all",
] as const;

export type TargetSpecKind = (typeof TARGET_SPEC_KINDS)[number];

export const TARGET_SPEC_KIND_LABELS: Record<TargetSpecKind, string> = {
  distance: "距離",
  stat: "ステータス",
  attackType: "攻撃種別",
  status: "状態",
  clusterCenter: "クラスタ中心",
  self: "自身",
  all: "全体",
};

export const TARGET_RULE_OVERRIDE_APPLY_TO_OPTIONS = [
  "enemy",
  "player",
] as const;

export const TARGET_RULE_OVERRIDE_APPLY_TO_LABELS: Record<
  (typeof TARGET_RULE_OVERRIDE_APPLY_TO_OPTIONS)[number],
  string
> = {
  enemy: "敵向け effect",
  player: "味方向け effect",
};

export const TARGET_SIDE_OPTIONS = ["ally", "enemy"] as const;
export const TARGET_DISTANCE_ORDER_OPTIONS = [
  "nearest",
  "farthest",
  "selfOrigin",
] as const;
export const TARGET_STAT_OPTIONS = ["hp", "maxHp", "atk", "def", "reg"] as const;
export const TARGET_STAT_ORDER_OPTIONS = [
  "highest",
  "lowest",
  "ratio",
] as const;

export const TARGET_SIDE_LABELS: Record<TargetSide, string> = {
  ally: "味方",
  enemy: "敵",
};

export const TARGET_DISTANCE_ORDER_LABELS: Record<
  "nearest" | "farthest" | "selfOrigin",
  string
> = {
  nearest: "至近",
  farthest: "最遠",
  selfOrigin: "自身起点",
};

export const POWER_STEP_MODE_LABELS: Record<
  import("../types.ts").PowerStepMode,
  string
> = {
  multiply: "累乗",
  divide: "累除",
};

export const TARGET_STAT_LABELS: Record<
  "hp" | "maxHp" | "atk" | "def" | "reg",
  string
> = {
  hp: "HP",
  maxHp: "最大HP",
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
  "attackType",
  "hasDot",
] as const satisfies readonly DamageIncreaseCondition["kind"][];

export const DAMAGE_INCREASE_CONDITION_KIND_LABELS: Record<
  DamageIncreaseCondition["kind"],
  string
> = {
  debuff: "デバフ",
  targetHp: "対象HP",
  attackType: "攻撃種別",
  hasDot: "DoT中",
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
