export type Role = "defender" | "attacker" | "supporter";
export type ClassId = string;
export type FormationRow = "front" | "back";
/** 遠隔帯の下限（px）。`rangePx >= RANGED_ATTACK_MIN_PX` が遠隔帯 */
export const RANGED_ATTACK_MIN_PX = 100;
/** 近接帯の上限（px）。rangePx < RANGED_ATTACK_MIN_PX */
export const MELEE_RANGE_MAX_PX = RANGED_ATTACK_MIN_PX - 1;
/** @deprecated 互換用。近接帯上限 = MELEE_RANGE_MAX_PX */
export const RANGED_ATTACK_THRESHOLD_PX = MELEE_RANGE_MAX_PX;

export function isMeleeRangePx(rangePx: number): boolean {
  return rangePx < RANGED_ATTACK_MIN_PX;
}

/** @deprecated traits.rangePx を使用 */
export type AttackRange = "melee" | "ranged";

/** 近接スキル射程の未指定時デフォルト（px） */
export const DEFAULT_MELEE_ATTACK_RANGE_PX = 0;
/** @deprecated 旧遠隔フォールバック。traits.rangePx を使用 */
export const DEFAULT_RANGED_RANGE_PX = 50;
/** @deprecated battleConstants.ts を参照 */
export {
  BATTLE_ENEMY_MARCH_VISIBLE_MAX_X,
  BATTLE_ENEMY_MARCH_VISIBLE_MIN_X,
  BATTLE_ENEMY_VISIBLE_MAX_X,
} from "./battleConstants.ts";

/** @deprecated 演出用。ロジックには使わない */
export const DEFAULT_MELEE_RANGE_PX = 45;

/** PC・敵共通の traits JSON（省略可フィールド） */
export interface EntityTraits {
  rangePx?: number;
  damageType?: DamageType;
  basicAttackVfx?: SkillVfxDef;
  /** 接敵後も spawn 位置を維持（訓練用ダミー等） */
  stationary?: boolean;
}

/** ロード後の正規化済み traits（戦闘用・PC/敵共通） */
export interface NormalizedEntityTraits {
  rangePx: number;
  damageType: DamageType;
  basicAttackVfx?: SkillVfxDef;
  /** 省略時は false（接敵後も移動する） */
  stationary?: boolean;
}

/** @deprecated EntityTraits / NormalizedEntityTraits に置換 */
export type ClassTraits = NormalizedEntityTraits;

export interface CombatStats {
  maxHp: number;
  atk: number;
  def: number;
  reg: number;
}

export interface ClassSkillUnlock {
  level: number;
  skillIds: string[];
}

export type JobTier = 1 | 2;

/** 攻撃速度段階（内部略称 SPD）。未指定時は normal */
export type AttackSpeedTier =
  | "slow"
  | "somewhatSlow"
  | "normal"
  | "somewhatFast"
  | "fast";

/** Phase 7 で本番化。Phase 4 では JSON 予約のみ */
export interface ClassPromotion {
  minLevel: number;
  targetClassIds: ClassId[];
}

/** 成長段階（1=低 / 2=中 / 3=高） */
export type GrowthTier = 1 | 2 | 3;

export interface GrowthTierSet {
  maxHp: GrowthTier;
  atk: GrowthTier;
  def: GrowthTier;
}

/** role=attacker のみ。未指定は attacker（物理） */
export type GrowthPresetKey = "attacker" | "caster";

export interface ClassPreset extends CombatStats {
  id: ClassId;
  role: Role;
  displayName: string;
  /** 英語職名（UI ルビ上段。表示リファクタ時に使用） */
  epithetEn?: string;
  formationRow: FormationRow;
  traits: NormalizedEntityTraits;
  /** 未指定時は `{id}_basic_attack` */
  basicAttackSkillId: string;
  /** 固定パッシブ（LvUP で増えない）。skills[] とは分離 */
  passiveIds?: string[];
  skills: ClassSkillUnlock[];
  /** 一次職 = 1（既定）。二次職 = 2 は Phase 7 以降 */
  jobTier?: JobTier;
  /** 一次職のみ（Phase 7） */
  promotion?: ClassPromotion;
  /** 二次職のみ（Phase 7） */
  promotesFrom?: ClassId;
  /** skills[level=0] から導出 */
  starterPassiveIds: string[];
  starterActiveIds: string[];
  /** skills[] 全 ID（検証・セット可否） */
  classSkillIds: string[];
  /** 基本攻撃 CD 段階（SPD）。未指定は normal */
  attackSpeedTier?: AttackSpeedTier;
  /** LvUP 成長段階（HP/ATK/DEF 各独立）。一次職は必須 */
  growthTier?: GrowthTierSet;
  /** 術師のみ caster（HP/DEF=supporter 表、ATK=attacker 表） */
  growthPresetKey?: GrowthPresetKey;
}

export type TargetRule =
  | "closestAlly"
  | "frontEnemy"
  | "lowestHpEnemy"
  | "mostDamagedAlly"
  | "self"
  | "rangedAttackingEnemy"
  | "magicAttackingEnemy"
  | "highestAtkEnemy"
  | "lowestDefEnemy"
  | "highestDefEnemy"
  | "lowestRegEnemy"
  | "highestRegEnemy"
  | "highestHpEnemy"
  | "farthestEnemy"
  | "debuffedEnemy"
  | "allAllies"
  | "allEnemies";

export type TargetSide = "ally" | "enemy";
export type TargetDistanceOrder = "nearest" | "farthest" | "selfOrigin";
export type TargetStat = "hp" | "atk" | "def" | "reg";
export type TargetStatOrder = "highest" | "lowest" | "ratio";

/** バフフィルタタグ（gameDataSchema.BUFF_FILTER_TAGS と同期） */
export type BuffFilterTag = StatusEffectStat | "hot" | "block" | "evasion";

export type TargetSpec =
  | { kind: "self" }
  | { kind: "all"; side: TargetSide }
  | {
      kind: "distance";
      side: TargetSide;
      order: TargetDistanceOrder;
      /** 味方 side 時、最終対象に使用者を含める（既定 false） */
      includeSelf?: boolean;
    }
  | { kind: "stat"; side: TargetSide; stat: TargetStat; order: TargetStatOrder }
  | {
      kind: "attackType";
      physical?: boolean;
      magic?: boolean;
      melee?: boolean;
      ranged?: boolean;
    }
  | {
      kind: "status";
      side?: TargetSide;
      debuffTags?: DebuffFilterTag[];
      buffTags?: BuffFilterTag[];
    };

/** 効果のターゲット形状。未指定は single */
export type TargetShape =
  | "single"
  | "aoe"
  | "multiLock"
  | "pierce"
  | "chain"
  | "scatter";

export type PowerStepMode = "multiply" | "divide";

/** percentMaxHp — 参照する maxHp の主体 */
export type MaxHpReference = "self" | "target";

/** heal / hot / barrier 共用の効果量種別 */
export type ResourceAmountKind =
  | "atkBased"
  | "defBased"
  | "flat"
  | "percentMaxHp";

export interface ResourceAmountSpec {
  kind: ResourceAmountKind;
  /** atkBased — effectiveAtk への加減（加算・減算の net）。未指定時 0 */
  atkOffset?: number;
  /** atkBased — 倍率（乗算・除算の net）。未指定時 1（旧 powerMultiplier 互換） */
  atkScale?: number;
  /** defBased — effectiveDef への加減（加算・減算の net）。未指定時 0 */
  defOffset?: number;
  /** defBased — 倍率（乗算・除算の net）。未指定時 1 */
  defScale?: number;
  /** flat */
  flatAmount?: number;
  /** 0〜1、percentMaxHp — 自身 or 対象の maxHp 基準 */
  percentOfMaxHp?: number;
  /** percentMaxHp — 参照する maxHp。未指定 = target（後方互換） */
  maxHpRef?: MaxHpReference;
}

export interface Combatant extends CombatStats {
  id: string;
  name: string;
  hp: number;
  isAlive: boolean;
}

export type SkillSlotKind = "basic" | "active";

export type SkillTriggerKind = "time" | "basicAttackCount" | "hitsTaken";

export interface SkillTrigger {
  kind: SkillTriggerKind;
  /** time=秒 / basicAttackCount=通常攻撃回数 / hitsTaken=被攻撃回数 */
  value: number;
}

export type FirePolicy = "immediate" | "smart";

/** HP 割合条件の比較。省略時 `lte`（以下）。 */
export type HpRatioCompare = "lte" | "gte";

export type FireCondition =
  | {
      kind: "debuff";
      tags: DebuffFilterTag[];
      selfAppliedOnly?: boolean;
    }
  | { kind: "targetHp"; maxHpRatio: number; compare?: HpRatioCompare }
  | { kind: "minTargets"; count: number }
  | { kind: "selfHp"; maxHpRatio: number; compare?: HpRatioCompare }
  | { kind: "allyDamaged" }
  | { kind: "waveStart" }
  | { kind: "waveEnd" }
  | {
      kind: "enemyCount";
      min?: number;
      max?: number;
      scope?: "living" | "inRange";
    }
  | {
      kind: "pendingIncomingDamage";
      maxHpRatio: number;
      windowSec: number;
    }
  | { kind: "targetBarrierBelowGrant" }
  | { kind: "blockResonanceStacks"; min: number };

export interface SkillCooldown {
  skillId: string;
  remaining: number;
  slotKind: SkillSlotKind;
  slotIndex?: number;
  /** 多段チャージ: 確定ストック数（戦闘開始 0） */
  storedCharges?: number;
  /** smart 発動待ち開始時刻（fireTimeoutSec 用） */
  fireHoldSinceSec?: number;
}

export interface CharacterBuild {
  learnedPassiveIds: string[];
  learnedActiveIds: string[];
  /** 歴史的互換フィールド。戦闘参加は learnedActiveIds を正本にする。 */
  equippedActiveSlots: string[];
}

export interface CharacterProgress {
  level: number;
  exp: number;
}

export const PARTY_SLOT_COUNT = 4;

export interface PartyMemberState {
  classId: ClassId;
  progress: CharacterProgress;
  build: CharacterBuild;
}

export type PartySlotState = PartyMemberState | null;

export const SAVE_VERSION = 2;

export interface StageProgress {
  currentStageId: string;
  totalClears: number;
}

export interface SaveGameState {
  version: number;
  stageProgress: StageProgress;
  party: PartySlotState[];
  unlockedClassIds: ClassId[];
}

export interface StatusEffect {
  id: string;
  kind: "buff" | "debuff" | "cc";
  /** buff/debuff 用（stat 系） */
  stat?: StatusEffectStat;
  /** HoT/DoT/CC バッジ用 */
  overlay?:
    | "hot"
    | "dot"
    | "stun"
    | "moveLock"
    | "block"
    | "counter"
    | "evasion"
    | "damageDelay"
    | "basicAttackTransform"
    | "healReservation"
    | "wardBarrier"
    | "herbalPotency"
    | "blockResonance"
    | "blockResonanceStance"
    | "invulnerable";
  /** damageDelay overlay: 後払いにする被ダメ割合（0.5 = 50%） */
  ratio?: number;
  /** HoT tick 量（ResourceAmountSpec） */
  amount?: ResourceAmountSpec;
  /** HoT/DoT tick 量（旧 JSON 互換） */
  powerMultiplier?: number;
  /** HoT/DoT 付与者 */
  sourceId?: string;
  skillId?: string;
  /** 付与元スキル effect の index（DoT/HoT tick 上書き用） */
  effectIndex?: number;
  damageType?: DamageType;
  /** 次 tick までの残秒（1 秒間隔） */
  tickSec?: number;
  multiplier: number;
  /** 正の量。符号は kind から決定 */
  flatBonus?: number;
  /** 付与時の効果時間（秒） */
  durationSec: number;
  remainingSec: number;
  /** DoT tick 用: 付与スキル effect からコピー */
  damageIncrease?: DamageIncreaseSpec;
  defenseIgnore?: DefenseIgnoreSpec;
  /** 一時ブロック付与 */
  blockChance?: number;
  /** 回避率付与 */
  evasionChance?: number;
  /** 反撃 overlay: 発動時に攻撃者へ適用するレスポンス一覧 */
  responses?: CounterResponseDef[];
  /** 反撃 overlay: この射程内の攻撃のみ反撃発動（未指定 = 持有者 traits.rangePx） */
  counterRangePx?: number;
  /** 反撃 overlay: 近接帯の攻撃のみ反撃（未指定かつ counterRanged も未指定 = 全区間） */
  counterMelee?: boolean;
  /** 反撃 overlay: 遠隔帯の攻撃のみ反撃 */
  counterRanged?: boolean;
  /** basicAttackTransform overlay: 通常攻撃変形 spec（付与時コピー） */
  basicAttackTransform?: BasicAttackTransformSpec;
  /** wardBarrier overlay: 残スタック数 */
  stacks?: number;
  /** HUD / ログ用の表示名（未指定時は overlay / stat から解決） */
  displayName?: string;
}

/** 反撃対象の近接／遠隔帯フィルタ（OR。両方未指定 = 全区間） */
export interface CounterAttackRangeBandFilter {
  counterMelee?: boolean;
  counterRanged?: boolean;
}

export type StatusEffectStat =
  | "hp"
  | "atk"
  | "def"
  | "reg"
  | "damageTaken"
  | "attackSpeed";

/** デバフフィルタタグ（gameDataSchema.DEBUFF_FILTER_TAGS と同期） */
export type DebuffFilterTag = StatusEffectStat | "dot" | "stun";

/** デバフ解除の優先順位（dispelCount > 0 のとき） */
export type DispelPriority = "longest" | "strongest";

export type DamageIncreaseCondition =
  | {
      kind: "debuff";
      tags: DebuffFilterTag[];
      selfAppliedOnly?: boolean;
    }
  | { kind: "targetHp"; maxHpRatio: number };

export interface DamageIncreaseSpec {
  scale: number;
  conditions: DamageIncreaseCondition[];
}

/** パッシブ特効効果（DamageIncreaseSpec と同型） */
export type SpecialEffectSpec = DamageIncreaseSpec;

export type SpecialEffectApplyTo = "damage" | "heal" | "barrier";

export type HealSubKind = "instant" | "hot" | "dispel";
export type BuffSubKind =
  | "stat"
  | "barrier"
  | "wardBarrier"
  | "block"
  | "evasion"
  | "damageDelay";

/** 通常攻撃変形 — primary effect への部分パッチ */
export interface BasicAttackTransformPrimaryPatch {
  damageType?: DamageType;
  amount?: Partial<ResourceAmountSpec>;
  target?: TargetSpec;
  targetShape?: TargetShape;
  aoeRadiusPx?: number;
}

/** 通常攻撃変形 spec（バフ持続中に basic skill へマージ） */
export interface BasicAttackTransformSpec {
  /** 既存 primary effect の hitCount に乗算 */
  hitCountMultiplier?: number;
  /** primary effect を丸ごと差し替え */
  primaryEffectOverride?: SkillEffectDef;
  /** primary への部分パッチ */
  primaryPatch?: BasicAttackTransformPrimaryPatch;
  /** primary の後に追加する effect */
  appendEffects?: SkillEffectDef[];
}
export type DebuffSubKind = "stat" | "dot" | "stun";

export type BuffTargetKind = StatusEffectStat | "evasion" | "block";

export interface DefenseIgnoreDefSpec {
  mode: "flat" | "percent";
  amount: number;
}

export interface DefenseIgnoreRegSpec {
  percent: number;
}

export interface DefenseIgnoreSpec {
  /** 発動確率（0–1）。未指定 = 1 */
  chance?: number;
  def?: DefenseIgnoreDefSpec;
  reg?: DefenseIgnoreRegSpec;
}

const STATUS_EFFECT_STAT_VALUES: readonly StatusEffectStat[] = [
  "hp",
  "atk",
  "def",
  "reg",
  "damageTaken",
  "attackSpeed",
];

export function isStatusEffectStat(value: string): value is StatusEffectStat {
  return (STATUS_EFFECT_STAT_VALUES as readonly string[]).includes(value);
}

export function filterStatusEffectStats(
  stat: BuffTargetKind | BuffTargetKind[] | undefined,
): StatusEffectStat[] {
  const list = Array.isArray(stat) ? stat : stat !== undefined ? [stat] : [];
  return list.filter((entry): entry is StatusEffectStat =>
    isStatusEffectStat(entry),
  );
}

export function asStatusEffectStatList(
  stat: StatusEffectStat | StatusEffectStat[] | undefined
): StatusEffectStat[] {
  if (!stat) return [];
  return Array.isArray(stat) ? stat : [stat];
}

/** runtime-only: Threat / FrontlineOwner から除外する一時アクセス（シリアライズしない） */
export type CombatantAccessState = "normal" | "rearAssault";

export interface CombatantState extends Combatant {
  /** ダメージ先消耗のシールド量（maxHp 超え可） */
  barrierHp: number;
  role: Role;
  classId: ClassId;
  /** 味方のみ: save.party のスロット番号 */
  partySlotIndex?: number;
  formationRow: FormationRow;
  traits: ClassTraits;
  build: CharacterBuild;
  cooldowns: SkillCooldown[];
  statusEffects: StatusEffect[];
  spriteKey: string;
  iconKey: string;
  isEnemy: boolean;
  /** 戦闘ロジック用 1D 座標（大きいほど前方＝右） */
  battleX: number;
  /** snapshot 出力用。描画は formationLayout の隊形配置で算出 */
  visualX: number;
  /** 接敵中: battleX 基準線からのレーンずれ（接敵開始時に固定） */
  engagedBattleLaneX?: number;
  /** 近接敵: 最前列からの奥行きスロット（接敵開始時に固定、0=最前列） */
  engagedMeleeDepthSlot?: number;
  /** 遠距離敵: DisplayAnchor（描画・VFX 基準プレイヤー id。接敵開始時に固定） */
  engagedDisplayAnchorPlayerId?: string;
  /** @deprecated engagedDisplayAnchorPlayerId */
  engagedVisualTargetPlayerId?: string;
  /** @deprecated engagedDisplayAnchorPlayerId */
  engagedVisualTargetAllyId?: string;
  /** 味方: Wave 中の death スプライト表示。Wave 移行で false（HP0・HUD は維持） */
  corpseVisible: boolean;
  /** 敵のみ: ステージ配置のスポーン battleX */
  spawnX?: number;
  /** 敵 dead: 死亡時に固定する battleX（= screenX） */
  corpseScreenAnchorX?: number;
  /** 味方のみ: 敵 AI ヘイト（ランタイム） */
  threat?: number;
  /** 味方のみ: 減衰の目標ヘイト */
  baseThreat?: number;
  /** 敵のみ: Threat ヒステリシス用の現在フォーカス対象 id */
  threatFocusTargetId?: string;
  /** runtime-only: 背後滞在など一時アクセス。`isPlayerRearAssaultAccess` の正本 */
  accessState?: CombatantAccessState;
  /** periodicDispel: Wave 内の残り発動回数（passiveId → 残数） */
  passiveDispelRemainingTriggers?: Record<string, number>;
  /** damageDelay: 後払いダメージプール */
  delayedDamagePool?: number;
  /** damageDelay tick 用（1 秒間隔） */
  damageDelayTickSec?: number;
  /** barrierBreakRegen: 対象ユニットで再生成を消費済み */
  barrierBreakRegenUsed?: boolean;
  /** barrierDepletionHeal: 対象ユニットで枯渇回復を消費済み（Wave 1 回） */
  barrierDepletionHealUsed?: boolean;
  /** herbalPotency: 蓄積タイマー残秒（3 秒間隔） */
  herbalPotencyAccumTickSec?: number;
  /** herbalPotency: 到達済み体質段階（active_4 消費後も維持） */
  herbalPotencyConstitutionTier?: number;
  /** blockResonance: 減衰タイマー残秒 */
  blockResonanceDecayTickSec?: number;
  /** lastStandInvulnerable: Wave 内 1 回消費済み */
  lastStandInvulnerableUsed?: boolean;
}

export type PassiveEffectKind =
  | "targetRuleOverride"
  | "heal"
  | "excessHealToBarrier"
  | "aoeCrowdBonus"
  | "specialEffect"
  | "defenseIgnore"
  | "periodicDispel"
  | "damageReduction"
  | "buff"
  | "debuff"
  | "counter"
  | "selfHpRatioBuff"
  | "excessHealRedirect"
  | "targetHpRatioHealScale"
  | "healReservation"
  | "barrierBreakRegen"
  | "barrierDepletionHeal"
  | "skillAmountOverride"
  | "skillPropertyOverride"
  | "threatControl"
  /** @deprecated 読み込み互換 */
  | "evasionChance"
  | "block"
  | "counterChance"
  | "damageIncrease"
  | "healReceivedIncrease"
  | "extendSelfAppliedDebuff"
  | "herbalPotency"
  | "blockResonance"
  | "lastStandInvulnerable"
  /** @deprecated 読み込み互換（正規化後は heal + healSubKind: hot） */
  | "hot";

export function isPassiveHot(passive: PassiveSkillDef): boolean {
  if (passive.effect === "heal") {
    return (passive.healSubKind ?? "hot") === "hot";
  }
  return passive.effect === "hot";
}

export type TargetRuleOverrideApplyTo = "enemy" | "ally";

export type PassivePeriodicTriggerKind =
  | "stageStart"
  | "waveStart"
  | "onDebuffReceived";

/** skillAmountOverride — パッシブ側 amount フィールドの上書き対象 */
export type PassiveAmountField = "hotAmount" | "barrierAmount";

export interface PassiveSkillDef {
  id: string;
  name: string;
  /** 未指定時は所属クラス role からプレースホルダー。PNG は assets/skill-icons/{iconKey}.png */
  iconKey?: string;
  effect: PassiveEffectKind;
  /** heal パッシブの種別。未指定時 hot（パッシブ heal は HoT のみ） */
  healSubKind?: HealSubKind;
  targetRuleOverride?: TargetSpec;
  /** targetRuleOverride の適用スコープ。未指定 = enemy */
  targetRuleOverrideApplyTo?: TargetRuleOverrideApplyTo;
  /** block/evasion/counter: 効果率・反撃率。Stage/Wave 開始パッシブ: 発動確率（未指定=1） */
  chance?: number;
  ratio?: number;
  hotAmount?: ResourceAmountSpec;
  /** buff + barrier: 付与量 */
  barrierAmount?: ResourceAmountSpec;
  /** buff + barrier: true で既存バリアに加算 */
  barrierStack?: boolean;
  hotTargetRule?: TargetSpec;
  /** アクティブ effect.targetShape に対応 */
  hotTargetShape?: TargetShape;
  hotRange?: number;
  hotAoeRadiusPx?: number;
  hotHitCount?: number;
  hotHitDurationSec?: number;
  hotPiercePowerStepMultiplier?: number;
  hotPiercePowerStepMode?: PowerStepMode;
  hotPierceDurationSec?: number;
  hotChainCount?: number;
  hotChainMaxDistancePx?: number;
  hotChainPowerStepMultiplier?: number;
  hotChainPowerStepMode?: PowerStepMode;
  hotChainDurationSec?: number;
  hotScatterRadiusPx?: number;
  hotScatterSpreadRadiusPx?: number;
  hotScatterHitCount?: number;
  hotScatterDurationSec?: number;
  hotScatterSpreadRate?: number;
  /** hot: 付与 HoT の効果時間（秒）。0 または未指定 = 無限 */
  hotDurationSec?: number;
  /** damageReduction: 被ダメ軽減率（0.2 = 20% 軽減） */
  damageReductionPercent?: number;
  damageReductionTargetRule?: TargetSpec;
  damageReductionTargetShape?: TargetShape;
  damageReductionRange?: number;
  damageReductionAoeRadiusPx?: number;
  damageReductionHitCount?: number;
  damageReductionHitDurationSec?: number;
  damageReductionPiercePowerStepMultiplier?: number;
  damageReductionPiercePowerStepMode?: PowerStepMode;
  damageReductionPierceDurationSec?: number;
  damageReductionChainCount?: number;
  damageReductionChainMaxDistancePx?: number;
  damageReductionChainPowerStepMultiplier?: number;
  damageReductionChainPowerStepMode?: PowerStepMode;
  damageReductionChainDurationSec?: number;
  damageReductionScatterRadiusPx?: number;
  damageReductionScatterSpreadRadiusPx?: number;
  damageReductionScatterHitCount?: number;
  damageReductionScatterDurationSec?: number;
  damageReductionScatterSpreadRate?: number;
  barrierScale?: number;
  perExtraTargetScale?: number;
  maxExtraTargets?: number;
  specialEffectApplyTo?: SpecialEffectApplyTo;
  specialEffect?: SpecialEffectSpec;
  defenseIgnore?: DefenseIgnoreSpec;
  buffSubKind?: BuffSubKind;
  buffTargetRule?: TargetSpec;
  /** アクティブ effect.targetShape に対応 */
  buffTargetShape?: TargetShape;
  /** アクティブ effect.range に対応 */
  buffRange?: number;
  /** アクティブ effect.aoeRadiusPx に対応 */
  buffAoeRadiusPx?: number;
  buffHitCount?: number;
  buffHitDurationSec?: number;
  buffPiercePowerStepMultiplier?: number;
  buffPiercePowerStepMode?: PowerStepMode;
  buffPierceDurationSec?: number;
  buffChainCount?: number;
  buffChainMaxDistancePx?: number;
  buffChainPowerStepMultiplier?: number;
  buffChainPowerStepMode?: PowerStepMode;
  buffChainDurationSec?: number;
  buffScatterRadiusPx?: number;
  buffScatterSpreadRadiusPx?: number;
  buffScatterHitCount?: number;
  buffScatterDurationSec?: number;
  buffScatterSpreadRate?: number;
  buffMultiplier?: number;
  buffFlatBonus?: number;
  /** stat buff 持続（秒）。aura 未指定時は無限、定期発動時は必須 */
  buffDurationSec?: number;
  debuffSubKind?: DebuffSubKind;
  debuffTargetRule?: TargetSpec;
  /** アクティブ effect.targetShape に対応 */
  debuffTargetShape?: TargetShape;
  /** アクティブ effect.range に対応 */
  debuffRange?: number;
  /** アクティブ effect.aoeRadiusPx に対応 */
  debuffAoeRadiusPx?: number;
  debuffHitCount?: number;
  debuffHitDurationSec?: number;
  debuffPiercePowerStepMultiplier?: number;
  debuffPiercePowerStepMode?: PowerStepMode;
  debuffPierceDurationSec?: number;
  debuffChainCount?: number;
  debuffChainMaxDistancePx?: number;
  debuffChainPowerStepMultiplier?: number;
  debuffChainPowerStepMode?: PowerStepMode;
  debuffChainDurationSec?: number;
  debuffScatterRadiusPx?: number;
  debuffScatterSpreadRadiusPx?: number;
  debuffScatterHitCount?: number;
  debuffScatterDurationSec?: number;
  debuffScatterSpreadRate?: number;
  debuffStat?: StatusEffectStat | StatusEffectStat[];
  debuffMultiplier?: number;
  debuffFlatBonus?: number;
  /** stat debuff 持続（秒）。aura 未指定時は無限、定期発動時は必須 */
  debuffDurationSec?: number;
  /** dot debuff 持続（秒） */
  debuffDotDurationSec?: number;
  debuffDotAmount?: ResourceAmountSpec;
  debuffDotDamageType?: DamageType;
  /** stun debuff 持続（秒） */
  debuffStunDurationSec?: number;
  /** @deprecated 時間間隔トリガーは廃止。読み込み時に除去される。 */
  intervalSec?: number;
  /** hot / buff / debuff / periodicDispel: Stage/Wave 開始時発動。未指定 = 常時（barrier は未指定 = stageStart） */
  periodicTrigger?: PassivePeriodicTriggerKind;
  /** threatControl: 被ダメ時の固定 threat 加算 */
  onDamageTakenFlat?: number;
  /** threatControl: 被ダメ量に対する threat 係数 */
  onDamageTakenScale?: number;
  /** threatControl: ブロック成功時の固定 threat 加算 */
  onBlockFlat?: number;
  /** threatControl: threat 減衰倍率（1 = 既定。0.5 = 半減速） */
  threatDecayMultiplier?: number;
  /** threatControl: 生存中、前列味方の threat 下限（source threat × ratio） */
  frontThreatFloor?: number;
  /** threatControl: 生存中、前列味方の threat 減衰倍率（1 = 既定） */
  frontThreatDecayMultiplier?: number;
  /** threatControl: 生存中、前列味方の被ダメ軽減率（0.08 = 8%） */
  frontDamageTakenReduction?: number;
  dispelTargetRule?: TargetSpec;
  /** アクティブ effect.targetShape に対応 */
  dispelTargetShape?: TargetShape;
  dispelRange?: number;
  dispelAoeRadiusPx?: number;
  dispelHitCount?: number;
  dispelHitDurationSec?: number;
  dispelPiercePowerStepMultiplier?: number;
  dispelPiercePowerStepMode?: PowerStepMode;
  dispelPierceDurationSec?: number;
  dispelChainCount?: number;
  dispelChainMaxDistancePx?: number;
  dispelChainPowerStepMultiplier?: number;
  dispelChainPowerStepMode?: PowerStepMode;
  dispelChainDurationSec?: number;
  dispelScatterRadiusPx?: number;
  dispelScatterSpreadRadiusPx?: number;
  dispelScatterHitCount?: number;
  dispelScatterDurationSec?: number;
  dispelScatterSpreadRate?: number;
  dispelTags?: DebuffFilterTag[];
  dispelCount?: number;
  dispelPriority?: DispelPriority;
  /** periodicDispel: 1 Wave 内の発動上限。未指定 = 無制限 */
  dispelTriggerLimit?: number;
  /** counter: 反撃内容 */
  counterResponses?: CounterResponseDef[];
  /** counter: 反撃発動射程（px）。未指定 = 持有者 traits.rangePx */
  counterRange?: number;
  /** counter: 近接帯の攻撃のみ反撃（未指定かつ counterRanged も未指定 = 全区間） */
  counterMelee?: boolean;
  /** counter: 遠隔帯の攻撃のみ反撃 */
  counterRanged?: boolean;
  /** buff / selfHpRatioBuff: 対象 stat */
  buffStat?: BuffTargetKind | BuffTargetKind[];
  /** selfHpRatioBuff: 最大倍率（満タン時は 1 = 中立） */
  buffMultiplierMax?: number;
  /** selfHpRatioBuff: 最大固定加算 */
  buffFlatBonusMax?: number;
  /** selfHpRatioBuff: この HP 割合以下で最大バフ（0〜1、1 未満） */
  maxBuffAtHpRatio?: number;
  /** targetHpRatioHealScale: 対象 HP 割合に応じた回復倍率の上限（1 超） */
  healScaleMax?: number;
  /** targetHpRatioHealScale: この HP 割合以下で healScaleMax に到達（0〜1、1 未満） */
  maxScaleAtHpRatio?: number;
  /** healReservation: 付与時の対象 HP 割合上限（この割合以下を回復したとき 1 スタック） */
  grantOnHealMaxHpRatio?: number;
  /** healReservation: スタック持続秒 */
  stackDurationSec?: number;
  /** healReservation: 被ダメ後に発動する HP 割合上限 */
  triggerHpRatio?: number;
  /** healReservation: 発動時回復量（source ATK 基準） */
  healAmount?: ResourceAmountSpec;
  /** healReservation: 付与バフの表示名 */
  buffDisplayName?: string;
  /** excessHealToBarrier / excessHealRedirect: 余剰変換の対象（未指定 = outgoing のみ） */
  excessHealSources?: Array<"outgoing" | "incoming">;
  /** excessHealRedirect: 余剰回復の転送割合（0〜1） */
  redirectScale?: number;
  /** @deprecated 読み込み互換（正規化後は buff + chance） */
  evasionChance?: number;
  /** @deprecated 読み込み互換（正規化後は buff + chance） */
  blockChance?: number;
  /** @deprecated 読み込み互換（正規化後は counter + chance） */
  counterChance?: number;
  /** @deprecated 読み込み互換（正規化後は specialEffect） */
  damageIncrease?: DamageIncreaseSpec;
  /** @deprecated 読み込み互換 */
  extendSec?: number;
  durationMultiplier?: number;
  /** @deprecated 読み込み互換（正規化後は specialEffect heal） */
  percent?: number;
  /** skillAmountOverride: 上書き対象スキル ID（actives または passives） */
  targetSkillId?: string;
  /** skillAmountOverride: アクティブ effect の index（未指定 = amount 持ち effect すべて） */
  effectIndex?: number;
  /** skillAmountOverride: パッシブ amount フィールド（未指定 = 対象パッシブから自動） */
  passiveAmountField?: PassiveAmountField;
  /** skillAmountOverride: 上書き後の効果量 */
  amount?: ResourceAmountSpec;
  /** skillPropertyOverride: maxCharges 加算（対象スキル） */
  maxChargesBonus?: number;
  /** skillPropertyOverride: 対象アクティブ ID（未指定 = 全習得アクティブ） */
  skillPropertyTargetSkillIds?: string[];
  /** herbalPotency: スタック上限 */
  herbalPotencyMaxStacks?: number;
  /** herbalPotency: stack ごとの HoT maxHp 加算率（0.0005 = 0.05%/stack） */
  herbalPotencyHotPerStackPercent?: number;
  /** herbalPotency: 体質段階の stack 閾値（passive_4） */
  herbalPotencyConstitutionThresholds?: number[];
  /** herbalPotency: 体質段階ごとの hp 乗算（閾値と同順） */
  herbalPotencyConstitutionHpMultipliers?: number[];
  /** blockResonance: スタック上限 */
  blockResonanceMaxStacks?: number;
  /** blockResonance: stack ごとの被ダメ軽減率（0.03 = 3%/stack） */
  blockResonanceDamageTakenPerStack?: number;
  /** blockResonance: stack 減衰間隔（秒） */
  blockResonanceDecayIntervalSec?: number;
}

export type SkillEffectKind =
  | "damage"
  | "heal"
  | "buff"
  | "debuff"
  | "dot"
  | "barrier"
  | "move"
  | "stun"
  | "knockback"
  | "dispel"
  | "block"
  | "counter"
  | "basicAttackTransform"
  | "conditionalEffect"
  | "herbalPotencyConsume"
  | "blockResonanceConsume";

export type MoveMode = "engage" | "toAnchor";
export type DamageType = "physical" | "magic";

/** strip / VFX PNG 共通の再生フェーズ（絶対コマ index） */
export interface AnimPhaseFields {
  /** 再生開始コマ。先頭 idle 参照コマ skip 時は 1 等 */
  animStartFrame?: number;
  /** イントロ最終コマ（inclusive）。未指定時は animLoopFrame */
  animIntroEndFrame?: number;
  /** ループ開始コマ（inclusive）。指定時は intro / hold / outro の 3 段再生 */
  animLoopFrame?: number;
  /** ループ終了コマ（inclusive）。未指定時は animLoopFrame */
  animLoopEndFrame?: number;
  /** アウトロ開始コマ。未指定時は (animLoopEndFrame ?? animLoopFrame) + 1 */
  animOutroStartFrame?: number;
}

export type VfxAnchor =
  | "actor"
  | "target"
  | "between"
  | "footActor"
  | "footTarget";

export type VfxLayer = "behind" | "front";

export interface VfxPlacement {
  anchor: VfxAnchor;
  offsetX?: number;
  offsetY?: number;
  layer?: VfxLayer;
}

/** パーティクル VFX（preset レジストリ + JSON 上書き）。PNG strip と併用可 */
export interface VfxParticleDef {
  /** false でパーティクル抑制。省略 = 有効 */
  enabled?: boolean;
  /** `particlePresets.ts` レジストリ ID */
  preset: string;
  /** 未指定時は親 SkillVfxDef.placement を継承 */
  placement?: VfxPlacement;
  /** preset 既定 count の上書き */
  count?: number;
  /** preset 既定 durationSec の上書き */
  durationSec?: number;
  /** spawn 開始を遅らせる秒数。省略 = 即時 */
  delaySec?: number;
  /** preset 既定 tint の上書き（`#rrggbb`） */
  tint?: string;
}

/** スキル VFX 定義（skills.json / traits.basicAttackVfx）。PNG strip + パーティクル */
export interface SkillVfxDef extends AnimPhaseFields {
  /** false で VFX 抑制。省略 = 有効 */
  enabled?: boolean;
  placement?: VfxPlacement;
  particles?: VfxParticleDef;
}

/** effect ごとの entity スプライトアニメ。none = 再生なし（スキルアニメ PNG 優先） */
export type SkillEffectAnimId =
  | "idle"
  | "attack"
  | "death"
  | "none"
  /** @deprecated 読み込み互換。none として正規化 */
  | "dash"
  /** @deprecated 読み込み互換。none として正規化 */
  | "heal"
  /** @deprecated 読み込み互換。none として正規化 */
  | "hurt";

interface SkillEffectCommon extends AnimPhaseFields {
  target: TargetSpec;
  /** @deprecated 読み込み専用。正規化後は target のみ使用 */
  targetRule?: TargetRule;
  /** 未指定は single（単体） */
  targetShape?: TargetShape;
  /** aoe 時必須: anchor から ±px */
  aoeRadiusPx?: number;
  /** single / aoe / multiLock。single/aoe は省略=1 */
  hitCount?: number;
  /** single / aoe で hitCount>=2 時必須: 全ヒットを均等分散 */
  hitDurationSec?: number;
  /** pierce 時: 命中ごとの威力 step */
  piercePowerStepMultiplier?: number;
  piercePowerStepMode?: PowerStepMode;
  /** pierce 時: hit 分散秒（未指定 = 即時） */
  pierceDurationSec?: number;
  /** chain 時必須 */
  chainCount?: number;
  chainMaxDistancePx?: number;
  chainPowerStepMultiplier?: number;
  chainPowerStepMode?: PowerStepMode;
  /** chain 時: hit 分散秒（未指定 = 0.15×chainCount + 0.5 秒を 2 体以上命中時に自動適用） */
  chainDurationSec?: number;
  /** scatter 時必須: 命中判定半径（乱打半径） */
  scatterRadiusPx?: number;
  /** scatter 任意: 着弾位置の分散半径（±px）。未指定 = scatterRadiusPx */
  scatterSpreadRadiusPx?: number;
  scatterHitCount?: number;
  scatterDurationSec?: number;
  /** 0〜1。0 = anchor 中心固定 */
  scatterSpreadRate?: number;
  /** move 含むスキル: この effect 適用後、次 effect までの待機秒（正数） */
  waitAfterSec?: number;
  type: SkillEffectKind;
  /** 命中判定・VFX 共用（px）。未指定 = actor.traits.rangePx */
  range?: number;
  /** 未指定時は effect 種別の既定アニメ。none = スプライトアニメなし */
  anim?: SkillEffectAnimId;
  /**
   * スキル strip 内の効果適用コマ（絶対 index）。省略 = 即時。
   * 遅延秒 = max(0, applyFrame - animStartFrame) / 8
   */
  applyFrame?: number;
  /** 未指定時は skill vfx を使う。どちらも未設定なら VFX なし */
  vfx?: SkillVfxDef;
  /** 命中時 VFX（main `vfx` とは別 PNG）。未指定 = 解決層の既定 */
  hitVfx?: SkillVfxDef;
  /** @deprecated target.kind==="status" に統合。読み込み専用 */
  targetDebuffFilter?: DebuffFilterTag[];
  /** damage / heal / dot 用（HoT tick 非対象） */
  damageIncrease?: DamageIncreaseSpec;
  /** damage / dot 用 */
  defenseIgnore?: DefenseIgnoreSpec;
  /** 対象フィルタ（barrier 付与等）。全成立で対象に適用 */
  effectConditions?: FireCondition[];
}

export interface SkillHitTarget {
  unit: CombatantState;
  powerMultiplierOverride?: number;
}

export interface SkillHitWave {
  hitIndex: number;
  targets: SkillHitTarget[];
}

export interface SkillEffectResolution {
  waves: SkillHitWave[];
  /** 設定時: wave を battle 時間で均等分散適用 */
  spreadDurationSec?: number;
}

export interface PendingSkillHitTarget {
  targetId: string;
  powerMultiplierOverride?: number;
}

export interface PendingSkillHit {
  applyAtBattleSec: number;
  actorId: string;
  skillId: string;
  skillName: string;
  effectDef: SkillEffectDef;
  effectIndex: number;
  slotKind: SkillSlotKind;
  hitIndex: number;
  /** chain/pierce 等: VFX セグメント起点 */
  vfxSourceId?: string;
  targets: PendingSkillHitTarget[];
}

export interface DamageSkillEffect extends SkillEffectCommon {
  type: "damage";
  /** 省略時 = actor.traits.damageType */
  damageType?: DamageType;
  amount: ResourceAmountSpec;
  /** 与ダメ成功時の追加 threat（固定）。basic には付けない */
  threatBurstFlat?: number;
  /** 与ダメ成功時の追加 threat（appliedDamage × scale）。basic には付けない */
  threatBurstScale?: number;
}

export interface HealSkillEffect extends SkillEffectCommon {
  type: "heal";
  healSubKind?: HealSubKind;
  amount?: ResourceAmountSpec;
  durationSec?: number;
  dispelTags?: DebuffFilterTag[];
  dispelCount?: number;
  dispelPriority?: DispelPriority;
  /** herbalPotency: HoT 付与時に加算するスタック数 */
  stackOnApply?: number;
  /** herbalPotencyConsume 後: 消費スタック数で効果量を乗算 */
  potencyStackScale?: boolean;
  /** HUD 表示名（濃縮薬効など） */
  buffDisplayName?: string;
}

export interface BuffSkillEffect extends SkillEffectCommon {
  type: "buff";
  buffSubKind?: BuffSubKind;
  buffStat?: BuffTargetKind | BuffTargetKind[];
  buffMultiplier?: number;
  buffFlatBonus?: number;
  buffDurationSec?: number;
  chance?: number;
  /** damageDelay: 後払いにする被ダメ割合（0.5 = 50%） */
  ratio?: number;
  /** wardBarrier: 障壁スタック数 */
  stacks?: number;
  /** wardBarrier: 被ダメ倍率（0.1 = 9 割軽減） */
  damageReductionRatio?: number;
  amount?: ResourceAmountSpec;
  barrierStack?: boolean;
}

export interface BasicAttackTransformSkillEffect extends SkillEffectCommon {
  type: "basicAttackTransform";
  buffDurationSec?: number;
  hitCountMultiplier?: number;
  primaryEffectOverride?: SkillEffectDef;
  primaryPatch?: BasicAttackTransformPrimaryPatch;
  appendEffects?: SkillEffectDef[];
}

export interface DebuffSkillEffect extends SkillEffectCommon {
  type: "debuff";
  debuffSubKind?: DebuffSubKind;
  debuffStat?: StatusEffectStat | StatusEffectStat[];
  debuffMultiplier?: number;
  debuffFlatBonus?: number;
  debuffDurationSec?: number;
  durationSec?: number;
  /** DoT 用（ResourceAmountSpec）。未指定時は powerMultiplier */
  amount?: ResourceAmountSpec;
  powerMultiplier?: number;
  damageType?: DamageType;
}

/** @deprecated 読み込み互換。正規化後は HealSkillEffect + healSubKind: hot */
export interface HotSkillEffect extends SkillEffectCommon {
  type: "hot";
  durationSec: number;
  amount: ResourceAmountSpec;
}

export interface BarrierSkillEffect extends SkillEffectCommon {
  type: "barrier";
  amount: ResourceAmountSpec;
  /** true = 既存に加算。false/未指定 = max(既存, grant) */
  barrierStack?: boolean;
}

export interface DotSkillEffect extends SkillEffectCommon {
  type: "dot";
  durationSec: number;
  amount?: ResourceAmountSpec;
  /** @deprecated amount 未指定時の後方互換 */
  powerMultiplier?: number;
  damageType?: DamageType;
}

export interface MoveSkillEffect extends SkillEffectCommon {
  type: "move";
  moveDurationSec: number;
  moveMode?: MoveMode;
  /** toAnchor 時: anchor からの px（−=味方側、+=敵背後）。未指定=0 */
  anchorOffsetPx?: number;
}

export interface StunSkillEffect extends SkillEffectCommon {
  type: "stun";
  durationSec: number;
}

export interface KnockbackSkillEffect extends SkillEffectCommon {
  type: "knockback";
  distancePx: number;
}

export interface DispelSkillEffect extends SkillEffectCommon {
  type: "dispel";
  dispelTags?: DebuffFilterTag[];
  dispelCount: number;
  dispelPriority?: DispelPriority;
}

export interface BlockSkillEffect extends SkillEffectCommon {
  type: "block";
  blockChance: number;
  durationSec: number;
}

export type CounterResponseKind =
  | "damage"
  | "debuff"
  | "dot"
  | "stun"
  | "knockback";

export type CounterResponseDef =
  | {
      kind: "damage";
      amount: ResourceAmountSpec;
      damageType?: DamageType;
    }
  | {
      kind: "debuff";
      debuffStat: StatusEffectStat | StatusEffectStat[];
      debuffMultiplier?: number;
      debuffFlatBonus?: number;
      debuffDurationSec: number;
    }
  | {
      kind: "dot";
      durationSec: number;
      powerMultiplier: number;
      damageType?: DamageType;
      damageIncrease?: DamageIncreaseSpec;
      defenseIgnore?: DefenseIgnoreSpec;
    }
  | {
      kind: "stun";
      durationSec: number;
    }
  | {
      kind: "knockback";
      distancePx: number;
    };

export interface CounterSkillEffect extends SkillEffectCommon {
  type: "counter";
  chance?: number;
  responses: CounterResponseDef[];
  durationSec: number;
  counterMelee?: boolean;
  counterRanged?: boolean;
}

export interface ConditionalSkillEffect extends AnimPhaseFields {
  type: "conditionalEffect";
  /** AND 条件。全成立で thenEffects、未成立時 elseEffects */
  conditions: FireCondition[];
  thenEffects: SkillEffectDef[];
  elseEffects: SkillEffectDef[];
  waitAfterSec?: number;
  anim?: SkillEffectAnimId;
  applyFrame?: number;
  vfx?: SkillVfxDef;
  hitVfx?: SkillVfxDef;
}

export interface HerbalPotencyConsumeSkillEffect extends SkillEffectCommon {
  type: "herbalPotencyConsume";
}

export interface BlockResonanceConsumeSkillEffect extends SkillEffectCommon {
  type: "blockResonanceConsume";
}

export type SkillEffectDef =
  | DamageSkillEffect
  | HealSkillEffect
  | BuffSkillEffect
  | DebuffSkillEffect
  | DotSkillEffect
  | BarrierSkillEffect
  | MoveSkillEffect
  | StunSkillEffect
  | KnockbackSkillEffect
  | DispelSkillEffect
  | BlockSkillEffect
  | CounterSkillEffect
  | BasicAttackTransformSkillEffect
  | ConditionalSkillEffect
  | HerbalPotencyConsumeSkillEffect
  | BlockResonanceConsumeSkillEffect;

/** @deprecated JSON 読み込み互換。正規化後は HealSkillEffect */
export type LegacyHotSkillEffect = HotSkillEffect;

export interface ActiveSkillDef {
  id: string;
  name: string;
  /** 未指定時は所属クラス role からプレースホルダー。PNG は assets/skill-icons/{iconKey}.png */
  iconKey?: string;
  /** 発動条件（アクティブ）。未指定時は legacy interval を time として解釈 */
  trigger?: SkillTrigger;
  /** @deprecated レガシー JSON 互換。parse 時 trigger へ昇格 */
  interval?: number;
  effect: SkillEffectDef[];
  allowedClassIds?: ClassId[];
  /** 未指定時は VFX なし */
  vfx?: SkillVfxDef;
  /** 停止時間（秒）。省略/0 = 即時。アニメ長に合わせて設定 */
  useDurationSec?: number;
  /** 発動ゲート。省略 = immediate */
  firePolicy?: FirePolicy;
  /** firePolicy=smart 時の AND/OR 条件（省略 = all） */
  fireConditions?: FireCondition[];
  /** smart 条件の結合。省略 = all（AND） */
  fireConditionMatch?: "all" | "any";
  /** smart 発動待ちの最大秒（経過後は条件無視で発動） */
  fireTimeoutSec?: number;
  /** 多段チャージ上限。省略 = 1 */
  maxCharges?: number;
  /** blockResonanceConsume: 態勢の基礎持続秒（+消費 stack） */
  blockResonanceStanceDurationBaseSec?: number;
  /** blockResonanceConsume: 態勢中 stack あたりの被ダメ軽減率 */
  blockResonanceStanceDamageTakenPerStack?: number;
  /** blockResonanceConsume: 態勢中 stack あたりの DEF 倍率加算 */
  blockResonanceStanceDefPerStack?: number;
  /** blockResonanceConsume: 態勢中 stack あたりの block 率加算 */
  blockResonanceStanceBlockPerStack?: number;
  /** blockResonanceConsume: 態勢中ブロック成功時の範囲ダメージ */
  blockResonanceOnBlockDamage?: ResourceAmountSpec;
  /** blockResonanceConsume: 態勢中ブロック成功時の範囲半径（px） */
  blockResonanceOnBlockKnockbackRadiusPx?: number;
  /** blockResonanceConsume: 態勢中ブロック成功時のノックバック距離（px） */
  blockResonanceOnBlockKnockbackDistancePx?: number;
}

export interface EnemyTemplate extends CombatStats {
  id: string;
  displayName: string;
  /** 撃破時に生存味方全員が得る EXP */
  exp: number;
  /** 未指定時は `{id}_basic_attack` */
  basicAttackSkillId: string;
  traits: NormalizedEntityTraits;
  /** 通常攻撃 CD（基本攻撃 interval への倍率）。未指定時は normal */
  attackSpeedTier?: AttackSpeedTier;
  passiveSkillIds?: string[];
  activeSkillIds?: string[];
}

export interface StageWaveEnemy {
  templateId: string;
  /** スポーン X（px） */
  spawnX: number;
}

export interface StageWave {
  enemies: StageWaveEnemy[];
}

export interface StageDef {
  id: string;
  displayName: string;
  waves: StageWave[];
}

export interface PartyMemberDef {
  classId: ClassId;
  build: CharacterBuild;
}

export interface PartyDef {
  name: string;
  members: PartyMemberDef[];
}

export interface SkillRegistry {
  passives: Record<string, PassiveSkillDef>;
  actives: Record<string, ActiveSkillDef>;
}

export interface GameData {
  /** classes.json の配列順（バランス表・編成クラス一覧の並び） */
  classOrder: ClassId[];
  classRegistry: Record<ClassId, ClassPreset>;
  skillRegistry: SkillRegistry;
  enemyRegistry: Record<string, EnemyTemplate>;
  stages: StageDef[];
  parties: Record<string, PartyDef>;
}

export type BattlePhase = "idle" | "running" | "victory" | "defeat";

export type { RuntimeBattlePhase } from "./battlePhase.ts";

export interface CombatantSnapshot {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  barrierHp: number;
  atk: number;
  def: number;
  reg: number;
  role?: Role;
  rangePx: number;
  /** 現在の実効射程（effect.range も含めた最大値） */
  effectiveRangePx: number;
  damageType: DamageType;
  basicAttackVfx?: SkillVfxDef;
  spriteKey: string;
  iconKey: string;
  formationRow: FormationRow;
  isEnemy: boolean;
  battleX: number;
  visualX: number;
  /** entity body の move 再生（自動接近・PartyDeploy・スキル move 等） */
  bodyAnimMarching: boolean;
  /** 味方のみ: フィールド上に death スプライトを描くか */
  corpseVisible?: boolean;
  /** 味方のみ: デバッグ用ヘイト */
  threat?: number;
  baseThreat?: number;
  partySlotIndex?: number;
  /** 味方のみ: 停止時間（useDurationSec）中 */
  useLocked?: boolean;
  statusEffects: StatusEffect[];
  activeCooldowns: {
    skillId: string;
    remaining: number;
    triggerKind: SkillTriggerKind;
    triggerValue: number;
    slotIndex: number;
    storedCharges?: number;
    maxCharges?: number;
    fireHold?: boolean;
    activeEffectRemaining?: number;
    activeEffectTotal?: number;
  }[];
}

export interface BattleSnapshot {
  phase: BattlePhase;
  /** 戦闘フィールド FSM（battle-field.md §4.1） */
  runtimePhase: import("./battlePhase.ts").RuntimeBattlePhase;
  engaged: boolean;
  /** 0-based。表示は +1 */
  waveIndex: number;
  waveCount: number;
  worldOffsetX: number;
  /** Wave 開始前の告知オーバーレイ表示中（PartyDeploy より前） */
  waveAnnouncementActive: boolean;
  /** waveAnnouncementActive 時の経過 ms（描画アニメ用） */
  waveAnnouncementElapsedMs: number;
  /** 各 Wave 開始: 味方が左外から初期位置へ移動中 */
  partyDeployActive: boolean;
  /** PartyDeploy 到達済み（接敵待ち） */
  partyDeploySettled: boolean;
  /** @deprecated partyDeployActive を使用 */
  formationResetActive: boolean;
  alliesOffScreen: boolean;
  /** Victory: タイマー基準でフェード（画面外退出待ちの早期 fade なし） */
  victoryUseTimerFade: boolean;
  /** Victory（全員生存）: 退出 march 完了までオーバーレイ非表示 */
  victoryAwaitExitMarch: boolean;
  /** プレイヤー側ユニット（ランタイム正本） */
  players: CombatantSnapshot[];
  /** @deprecated players */
  allies: CombatantSnapshot[];
  enemies: CombatantSnapshot[];
}
