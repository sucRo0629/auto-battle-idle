export type Role = "defender" | "attacker" | "supporter";
export type ClassId = string;
export type FormationRow = "front" | "back";

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
  res: number;
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

/** locale キー付き UI 文案（v1 表示は ja 固定） */
export interface ClassLocaleText {
  ja: string;
  en?: string;
}

/** 編成 UI 概要向けの戦闘傾向タグ（スキル名の再掲はしない） */
export interface ClassFeatureTags {
  ja: string[];
  en?: string[];
}

export interface ClassPreset extends CombatStats {
  id: ClassId;
  role: Role;
  displayName: string;
  /** 英語職名（UI ルビ上段。表示リファクタ時に使用） */
  epithetEn?: string;
  /** 編成 UI 向けクラス要約（数文。全クラス必須） */
  summary?: ClassLocaleText;
  /** 編成 UI 概要の短い戦闘傾向タグ（任意） */
  featureTags?: ClassFeatureTags;
  /** クラスマスタの前衛/後衛（classes.json 正本） */
  formationRow?: FormationRow;
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
  /**
   * R5+: 使用可能戦闘方式 ID（2件固定）。
   * 未指定 = legacy（module 経路なし。attackSpeedTier + basicAttackSkillId を使用）。
   */
  combatModuleIds?: [string, string];
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
  | "lowestResEnemy"
  | "highestResEnemy"
  | "highestHpEnemy"
  | "farthestEnemy"
  | "debuffedEnemy"
  | "allAllies"
  | "allEnemies";

export type TargetSide = "ally" | "enemy";
export type TargetDistanceOrder = "nearest" | "farthest" | "selfOrigin";
export type TargetStat = "hp" | "maxHp" | "atk" | "def" | "res" | "barrier";
export type TargetStatOrder = "highest" | "lowest" | "ratio";

/**
 * stat 対象の不足閾値（R12g-d4）。
 * 候補は compareStat(stat) が閾値未満のユニットのみ（十分な資源は除外 → 対象なし可）。
 */
export type TargetStatRequireBelow =
  | { kind: "flat"; flatAmount: number }
  | { kind: "maxHpRatio"; ratio: number };

/** バフフィルタタグ（gameDataSchema.BUFF_FILTER_TAGS と同期） */
export type BuffFilterTag = StatBuffTarget | "hot" | "block" | "evasion";

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
  | {
      kind: "clusterCenter";
      side: TargetSide;
    }
  | {
      kind: "stat";
      side: TargetSide;
      stat: TargetStat;
      order: TargetStatOrder;
      /** 同一スキル内の先行 effect 命中プール内だけで stat 選定 */
      poolFromEffectIndex?: number;
      /**
       * 閾値未満の候補のみ選定（結界師 M2: Barrier 不足）。
       * 全候補が十分なら対象なし。
       */
      requireBelow?: TargetStatRequireBelow;
    }
  | {
      kind: "attackType";
      physical?: boolean;
      magic?: boolean;
      melee?: boolean;
      ranged?: boolean;
      /** 指定 role のユニットをプール外にする（任意） */
      excludeRoles?: Role[];
    }
  | {
      kind: "status";
      side?: TargetSide;
      debuffTags?: DebuffFilterTag[];
      buffTags?: BuffFilterTag[];
    }
  | {
      kind: "danger";
      side: TargetSide;
      maxTargets: number;
      windowSec: number;
    };

/** 効果のターゲット形状。未指定は single */
export type TargetShape =
  | "single"
  | "aoe"
  | "multiLock"
  | "pierce"
  | "chain"
  | "scatter"
  | "poolEach";

/** §5.7 効果範囲の形式（authoring / 表示の正本。runtime は legacy targetShape 経由） */
export type EffectRangeForm = "single" | "point" | "area" | "around" | "forward";
export type EffectApplyMode = "instant" | "progress" | "persist" | "barrage";
export type EffectMaxTargets = number | "all";
export interface EffectRangeSpec {
  form: EffectRangeForm;
  /** Distance N in px when form needs N. Optional if using skill range instead for forward. */
  distancePx?: number;
  applyMode: EffectApplyMode;
  maxTargets?: EffectMaxTargets;
  /** For multi-hit / multiLock migration */
  hitCount?: number;
  /** undershoot refill same target — multiLock default true */
  refillSameTargetOnShortfall?: boolean;
}

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
  | { kind: "selfHp"; maxHpRatio: number; compare?: HpRatioCompare }
  | { kind: "allyDamaged" }
  | { kind: "waveStart" }
  | { kind: "finalWaveStart" }
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
  | { kind: "blockResonanceStacks"; min: number }
  | { kind: "hasDot" };

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
  /** Stage ids cleared at least once (release flow only; not used for unlock / progression). */
  clearedStageIds?: string[];
}

export interface SaveGameState {
  version: number;
  stageProgress: StageProgress;
  party: PartySlotState[];
  unlockedClassIds: ClassId[];
}

/** DoT フレーバー種別（tick 式は overlay dot 共通） */
export type DotFlavor = "bleed" | "poison" | "seedFlame" | "blazingFlame";

export interface StatusEffect {
  id: string;
  kind: "buff" | "debuff" | "cc";
  /** buff/debuff 用（stat 系） */
  stat?: StatBuffTarget;
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
    | "invulnerable"
    | "lastStandGuts"
    | "arenaDominance"
    | "arenaMark"
    | "windMark"
    | "earthMark"
    | "ballistaMark"
    | "nextOutgoingDamage"
    | "allyAttackFollowUp"
    | "poisonWeapon"
    | "duelistPride"
    | "dfPaladinM1Protection"
    | "dfPaladinM2Protection";
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
  /** block overlay: 魔法直接ダメージも block 対象 */
  blocksMagic?: boolean;
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
  /** allyAttackFollowUp overlay: 近傍味方 basic 追撃の半径（px） */
  allyFollowUpRadiusPx?: number;
  /** allyAttackFollowUp overlay: 追撃 basic 命中時の DEF debuff 倍率 */
  followUpDefDebuffMultiplier?: number;
  /** allyAttackFollowUp overlay: DEF debuff 持続（秒） */
  followUpDefDebuffDurationSec?: number;
  /** wardBarrier overlay: 残スタック数 */
  stacks?: number;
  /** HUD / ログ用の表示名（未指定時は overlay / stat から解決） */
  displayName?: string;
  /** DoT overlay のフレーバー種別（未指定 = generic dot） */
  dotFlavor?: DotFlavor;
  /** dot overlay: tick ダメ倍率（圧縮等の累積） */
  dotTickDamageMul?: number;
  /** dot overlay: Hunter dotCompress 対象外 */
  dotCompressImmune?: boolean;
  /** blazingFlame dot: stack ごとの被魔法ダメ加算（付与時コピー） */
  blazingFlameMagicTakenPerStack?: number;
  /** dfPaladinM2Protection overlay: 魔法被ダメ追加倍率（全属性軽減とは別乗算） */
  dfPaladinM2MagicTakenMultiplier?: number;
  /**
   * damageTaken 軽減/増加の適用属性。未指定 = 全属性。
   * R12g-d1: 鉄衛士 M1 物理堅守用。
   */
  damageTakenDamageTypes?: DamageType[];
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
  | "res"
  | "attackSpeed"
  | "moveSpeed";

/** 被ダメージ倍率（StatusEffectStat とは別系統） */
export type DamageTakenStat = "damageTaken";

/** stat buff/debuff の対象（スキル buffStat/debuffStat・StatusEffect.stat） */
export type StatBuffTarget = StatusEffectStat | DamageTakenStat;

/** stat buff: ステごとの倍率/固定値。2件以上は正本、1件は buffStat レガシーでも可 */
export interface StatBuffModifierEntry {
  stat: StatBuffTarget;
  multiplier?: number;
  flatBonus?: number;
}

/** デバフフィルタタグ（gameDataSchema.DEBUFF_FILTER_TAGS と同期） */
export type DebuffFilterTag =
  | StatBuffTarget
  | "dot"
  | "bleed"
  | "poison"
  | "stun"
  | "seedFlame";

/** デバフ解除の優先順位（dispelCount > 0 のとき） */
export type DispelPriority = "longest" | "strongest";

export type DamageIncreaseCondition =
  | {
      kind: "debuff";
      tags: DebuffFilterTag[];
      selfAppliedOnly?: boolean;
    }
  | { kind: "targetHp"; maxHpRatio: number }
  | { kind: "hasDot" }
  | {
      kind: "attackType";
      physical?: boolean;
      magic?: boolean;
      melee?: boolean;
      ranged?: boolean;
      /** 指定 role のユニットを条件対象外にする（任意） */
      excludeRoles?: Role[];
    };

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
  | "damageDelay"
  | "allyAttackFollowUp";

/** 通常攻撃変形 — primary effect への部分パッチ */
export interface BasicAttackTransformPrimaryPatch {
  damageType?: DamageType;
  amount?: Partial<ResourceAmountSpec>;
  target?: TargetSpec;
  targetShape?: TargetShape;
  aoeRadiusPx?: number;
  hitCount?: number;
  hitDurationSec?: number;
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

export type BuffTargetKind = StatBuffTarget | "evasion" | "block";

export interface DefenseIgnoreDefSpec {
  mode: "flat" | "percent";
  amount: number;
}

export interface DefenseIgnoreResSpec {
  percent: number;
}

export interface DefenseIgnoreSpec {
  /** 発動確率（0–1）。未指定 = 1 */
  chance?: number;
  def?: DefenseIgnoreDefSpec;
  res?: DefenseIgnoreResSpec;
}

const STATUS_EFFECT_STAT_VALUES: readonly StatusEffectStat[] = [
  "hp",
  "atk",
  "def",
  "res",
  "attackSpeed",
  "moveSpeed",
];

const STAT_BUFF_TARGET_VALUES: readonly StatBuffTarget[] = [
  ...STATUS_EFFECT_STAT_VALUES,
  "damageTaken",
];

export function isStatusEffectStat(value: string): value is StatusEffectStat {
  return (STATUS_EFFECT_STAT_VALUES as readonly string[]).includes(value);
}

export function isStatBuffTarget(value: string): value is StatBuffTarget {
  return (STAT_BUFF_TARGET_VALUES as readonly string[]).includes(value);
}

export function filterStatusEffectStats(
  stat: BuffTargetKind | BuffTargetKind[] | undefined
): StatusEffectStat[] {
  const list = Array.isArray(stat) ? stat : stat !== undefined ? [stat] : [];
  return list.filter((entry): entry is StatusEffectStat =>
    isStatusEffectStat(entry)
  );
}

export function filterStatBuffTargets(
  stat: BuffTargetKind | BuffTargetKind[] | undefined
): StatBuffTarget[] {
  const list = Array.isArray(stat) ? stat : stat !== undefined ? [stat] : [];
  return list.filter((entry): entry is StatBuffTarget =>
    isStatBuffTarget(entry)
  );
}

export function asStatBuffTargetList(
  stat: StatBuffTarget | StatBuffTarget[] | undefined
): StatBuffTarget[] {
  if (!stat) return [];
  return Array.isArray(stat) ? stat : [stat];
}

/** @deprecated use asStatBuffTargetList */
export function asStatusEffectStatList(
  stat: StatBuffTarget | StatBuffTarget[] | undefined
): StatBuffTarget[] {
  return asStatBuffTargetList(stat);
}

/** runtime-only: FrontlineOwner から除外する一時アクセス（シリアライズしない） */
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
  /** 接敵中: battleX 基準線からのレーンずれ（接敵開始時に固定） */
  engagedBattleLaneX?: number;
  /** 近接敵: 最前列からの奥行きスロット（接敵開始時に固定、0=最前列） */
  engagedMeleeDepthSlot?: number;
  /** 遠距離敵: DisplayAnchor（描画・VFX 基準プレイヤー id。接敵開始時に固定） */
  engagedDisplayAnchorPlayerId?: string;
  /** 味方: Wave 中の death スプライト表示。Wave 移行で false（HP0・HUD は維持） */
  corpseVisible: boolean;
  /** 敵のみ: ステージ配置のスポーン battleX */
  spawnX?: number;
  /** 敵 dead: 死亡時に固定する battleX */
  corpseBattleAnchorX?: number;
  /** runtime-only: 背後滞在など一時アクセス。`isPlayerRearAssaultAccess` battle context の入力 */
  accessState?: CombatantAccessState;
  /**
   * runtime-only: rear assault 中の背後追従オフセット（px）。
   * いま背後にいる敵（なければ `getEnemyContactX`）+ `rearAssaultHoldOffsetPx` を背後停止目標にする
   * （絶対 battleX 固定はしない）。
   */
  rearAssaultHoldOffsetPx?: number;
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
  /** herbalPotency: 蓄積タイマー残秒（`herbalPotencyAccumulateSec`、未指定 3 秒） */
  herbalPotencyAccumTickSec?: number;
  /** herbalPotency: 到達済み体質段階（active_4 消費後も維持） */
  herbalPotencyConstitutionTier?: number;
  /** blockResonance: 減衰タイマー残秒 */
  blockResonanceDecayTickSec?: number;
  /** lastStandInvulnerable: Wave 内 1 回消費済み */
  lastStandInvulnerableUsed?: boolean;
  /** lastStandRecovery: Wave 内 1 回消費済み */
  lastStandRecoveryUsed?: boolean;
  /** lastStandGuts: Wave 内 1 回消費済み */
  lastStandGutsUsed?: boolean;
  /** lowHpCover: Wave 内の残り肩代わり回数（闘技士のみ） */
  coverRedirectsRemaining?: number;
  /** Wave 内の残り発動回数（passiveId → 残数） */
  passiveWaveRemainingTriggers?: Record<string, number>;
  /** arenaDominance 等: Stage 内の残り発動回数（skillId → 残数） */
  activeStageRemainingTriggers?: Record<string, number>;
  /** idleAtkRamp: 前回攻撃からの経過秒（攻撃で 0 にリセット） */
  idleAtkRampElapsedSec?: number;
  /** grantNextOutgoingDamage: 次の与ダメ倍率（装填完了後に armed） */
  nextOutgoingDamageCharge?: {
    multiplier: number;
    armed: boolean;
    skillId?: string;
  };
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
  | "targetHpRatioDamageScale"
  | "idleAtkRamp"
  | "ballistaMark"
  | "healReservation"
  | "barrierBreakRegen"
  | "barrierDepletionHeal"
  | "skillAmountOverride"
  | "skillPropertyOverride"
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
  | "frontBlockAura"
  | "lastStandRecovery"
  | "lowHpCover"
  | "lastStandGuts"
  | "bloodlustDuelist"
  | "duelistPride"
  | "ignoredDefBonusDamage"
  | "bonusBasicAttackOnHit"
  | "dotCompressAssist"
  | "allyBasicAttackDotProc"
  | "dotDurationMultiplierOnApply"
  | "dottedEnemyHealReceivedDebuff"
  | "conditionalEnemyDamageTakenAura"
  | "seedFlameOnActiveHit"
  | "bonusActiveOnHit"
  | "blazingFlameDetonate"
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
  /** damageReduction: ダメージ軽減率（0.2 = 20% 軽減） */
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
  /** ignoredDefBonusDamage: 無視した DEF 量 × scale を追加物理ダメ */
  ignoredDefBonusScale?: number;
  /** bonusBasicAttackOnHit: 追加 basic Hit を発火する対象 HP 比率上限（未指定 0.3） */
  bonusBasicAttackHpRatio?: number;
  /** bonusBasicAttackOnHit: 非空なら全条件 AND。HP ゲートは bonusBasicAttackHpRatio 明示時のみ */
  bonusBasicAttackConditions?: DamageIncreaseCondition[];
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
  buffStatModifiers?: StatBuffModifierEntry[];
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
  debuffStat?: StatBuffTarget | StatBuffTarget[];
  debuffMultiplier?: number;
  debuffFlatBonus?: number;
  /** stat debuff 持続（秒）。aura 未指定時は無限、定期発動時は必須 */
  debuffDurationSec?: number;
  /** dot debuff 持続（秒） */
  debuffDotDurationSec?: number;
  debuffDotAmount?: ResourceAmountSpec;
  debuffDotDamageType?: DamageType;
  debuffDotFlavor?: DotFlavor;
  /** stun debuff 持続（秒） */
  debuffStunDurationSec?: number;
  /** @deprecated 時間間隔トリガーは廃止。読み込み時に除去される。 */
  intervalSec?: number;
  /** hot / buff / debuff / periodicDispel: Stage/Wave 開始時発動。未指定 = 常時（barrier は未指定 = stageStart） */
  periodicTrigger?: PassivePeriodicTriggerKind;
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
  /** counter: 被弾トリガー。未指定 = 自己被弾 */
  counterTrigger?: PassiveCounterTriggerKind;
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
  /** targetHpRatioDamageScale: 対象 HP 割合に応じた与ダメ倍率の上限（1 超） */
  damageScaleMax?: number;
  /** targetHpRatioDamageScale: この HP 割合以下で倍率 1.0（0〜1、1 未満） */
  minScaleAtHpRatio?: number;
  /** idleAtkRamp: 最大蓄積までの秒 */
  rampToMaxSec?: number;
  /** idleAtkRamp: 攻撃速度低下なし時の ATK 倍率上限 */
  atkMulMin?: number;
  /** idleAtkRamp: 最大攻撃速度低下時の ATK 倍率上限 */
  atkMulMax?: number;
  /** idleAtkRamp: severity 補間の基準 attackSpeed 倍率 */
  fullRampAttackSpeedMul?: number;
  /** ballistaMark: マーク着弾位置からの飛散半径（px） */
  ballistaMarkSplashRadiusPx?: number;
  /** ballistaMark: 飛散ダメージ倍率（実ダメに対する割合） */
  ballistaMarkSplashDamageScale?: number;
  /** ballistaMark: 自身 attackSpeed debuff 倍率 */
  ballistaMarkSelfAttackSpeedMul?: number;
  /** healReservation: 付与時の対象 HP 割合上限（この割合以下を回復したとき 1 スタック） */
  grantOnHealMaxHpRatio?: number;
  /** healReservation: スタック持続秒 */
  stackDurationSec?: number;
  /** healReservation: 被ダメ後に発動する HP 割合上限 */
  triggerHpRatio?: number;
  /** healReservation: 発動時回復量（source ATK 基準） */
  healAmount?: ResourceAmountSpec;
  /** healReservation / frontBlockAura: 付与バフの表示名 */
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
  /** herbalPotency: aura HoT の tick 間隔（秒）。未指定 = 1 */
  herbalPotencyHotTickSec?: number;
  /** herbalPotency: 薬効 stack 蓄積間隔（秒）。未指定 = 3 */
  herbalPotencyAccumulateSec?: number;
  /** herbalPotency: 体質段階の stack 閾値（passive_4） */
  herbalPotencyConstitutionThresholds?: number[];
  /** herbalPotency: 体質段階ごとの hp 乗算（閾値と同順） */
  herbalPotencyConstitutionHpMultipliers?: number[];
  /** herbalPotency: 体質段階バフの HUD 表示名（未指定 = 「頑健」） */
  herbalPotencyConstitutionDisplayName?: string;
  /** blockResonance: スタック上限 */
  blockResonanceMaxStacks?: number;
  /** blockResonance: stack ごとのダメージ軽減率（0.03 = 3%/stack） */
  blockResonanceDamageTakenPerStack?: number;
  /** blockResonance: stack 減衰間隔（秒） */
  blockResonanceDecayIntervalSec?: number;
  /** frontBlockAura: 魔法直接ダメージも block 対象にする */
  frontBlockAuraMagicBlock?: boolean;
  /** frontBlockAura: 周囲 aura 半径（px）。未指定 = 50 */
  frontBlockAuraRadiusPx?: number;
  /** lastStandRecovery: 発動時 HP 比率（maxHp 基準） */
  lastStandRecoveryHpRatio?: number;
  /** lastStandRecovery: 自己 damageTaken 倍率 */
  lastStandRecoverySelfDamageTakenMultiplier?: number;
  /** lastStandRecovery: 周囲味方 damageTaken 倍率 */
  lastStandRecoveryFrontAllyDamageTakenMultiplier?: number;
  /** lastStandRecovery: 周囲 DR aura 半径（px）。未指定 = 50 */
  lastStandRecoveryFrontAllyAuraRadiusPx?: number;
  /** lastStandRecovery: DR 持続秒 */
  lastStandRecoveryDurationSec?: number;
  /** lowHpCover: 肩代わり対象の HP 割合上限（未指定 = 0.35） */
  coverHpRatioThreshold?: number;
  /** lowHpCover: Wave 内肩代わり上限（未指定 = 3） */
  coverWaveLimit?: number;
  /** lastStandGuts: 最低 HP 維持秒（未指定 = 4） */
  lastStandGutsDurationSec?: number;
  /** lastStandGuts: 終了時 stun 秒（未指定 = 1.5） */
  lastStandGutsEndStunSec?: number;
  /** lastStandGuts: 終了時ノックバック px（未指定 = 15） */
  lastStandGutsEndKnockbackPx?: number;
  /** dotCompressAssist: 基準圧縮倍率（残り duration 乗算） */
  dotCompressRatio?: number;
  /** dotDurationMultiplierOnApply: 味方 dot 付与時 duration 倍率 */
  dotDurationMultiplierOnApply?: number;
  /** dottedEnemyHealReceivedDebuff: dot 中敵の被回復倍率 */
  dottedEnemyHealReceivedMultiplier?: number;
  /** conditionalEnemyDamageTakenAura: 条件成立時の敵被ダメ倍率 */
  enemyDamageTakenMultiplier?: number;
  /** conditionalEnemyDamageTakenAura: AND 条件 */
  auraConditions?: DamageIncreaseCondition[];
  /** bonusActiveOnHit: 追撃する active スキル ID */
  bonusActiveSkillId?: string;
  /** blazingFlameDetonate: 爆発後の種火 spread 半径（px） */
  blazingFlameDetonateSpreadRadiusPx?: number;
  /** blazingFlameDetonate: 消費種火 1 stack あたりの N（ATK 倍率） */
  blazingFlameDetonatePerSeedScale?: number;
  /** blazingFlameDetonate: 爆発ダメ倍率 */
  blazingFlameDetonateMultiplier?: number;
  /** blazingFlameDetonate: 熾火 stack 上限解除（P4） */
  blazingFlameUncap?: boolean;
  /** seedFlameOnActiveHit: 種火 stack 上限（未指定 = 5） */
  seedFlameMaxStacks?: number;
  /** seedFlameOnActiveHit: 種火 overlay 持続（秒。未指定 = 10） */
  seedFlameDurationSec?: number;
  /** seedFlameOnActiveHit: 種火 DoT tick = 付与者 ATK × scale（未指定 = 0.05） */
  seedFlameDotAtkScale?: number;
  /** seedFlameOnActiveHit: 熾火 DoT tick = 付与者 ATK × scale（未指定 = 0.35） */
  blazingFlameDotAtkScale?: number;
  /** seedFlameOnActiveHit: 熾火 stack ごとの被魔法ダメ加算（未指定 = 0.1） */
  blazingFlameMagicTakenPerStack?: number;
  /** seedFlameOnActiveHit: P4 未習得時の熾火 stack 上限（未指定 = 1） */
  blazingFlameMaxStacksDefault?: number;
  /** bloodlustDuelist: block 率（未指定 = 0.05） */
  bloodlustBlockChance?: number;
  /** bloodlustDuelist: DEF バフ（maxBuffAtHpRatio / buffMultiplierMax） */
  bloodlustDefMaxBuffAtHpRatio?: number;
  bloodlustDefBuffMultiplierMax?: number;
  /** bloodlustDuelist: ATK バフ */
  bloodlustAtkMaxBuffAtHpRatio?: number;
  bloodlustAtkBuffMultiplierMax?: number;
  /** bloodlustDuelist: ATK バフの指数カーブ（未指定 = 1 = 線形） */
  bloodlustAtkBuffCurveExponent?: number;
  /** duelistPride: 被回復抑制の HP 下限（未指定 = 0.5） */
  prideHpRatioMin?: number;
  /** duelistPride: 被回復倍率（未指定 = 0.25） */
  prideHealMultiplier?: number;
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
  /** @deprecated 読み込み互換（正規化後は heal + healSubKind: hot） */
  | "hot"
  | "herbalPotencyConsume"
  | "blockResonanceConsume"
  | "enemyReelIn"
  | "arenaDominance"
  | "grantNextOutgoingDamage"
  | "placedField"
  | "dotCompress"
  | "dotExtend"
  | "dotHarvest"
  | "poisonSpread";

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

export interface SkillEffectCommon extends AnimPhaseFields {
  /** 省略時は ActiveSkillDef の共通ターゲットを継承（未設定なら読み込み既定） */
  target?: TargetSpec;
  /** @deprecated 読み込み専用。正規化後は target のみ使用 */
  targetRule?: TargetRule;
  /**
   * §5.7 効果範囲（authoring 正本）。
   * runtime は normalize で同期した legacy `targetShape` を使用する。
   */
  effectRange?: EffectRangeSpec;
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

/** アクティブスキル直下の共通ターゲット（effect が省略時に継承） */
export type SkillSharedTargetingFields = Partial<
  Pick<
    SkillEffectCommon,
    | "target"
    | "targetRule"
    | "effectRange"
    | "targetShape"
    | "range"
    | "aoeRadiusPx"
    | "hitCount"
    | "hitDurationSec"
    | "piercePowerStepMultiplier"
    | "piercePowerStepMode"
    | "pierceDurationSec"
    | "chainCount"
    | "chainMaxDistancePx"
    | "chainPowerStepMultiplier"
    | "chainPowerStepMode"
    | "chainDurationSec"
    | "scatterRadiusPx"
    | "scatterSpreadRadiusPx"
    | "scatterHitCount"
    | "scatterDurationSec"
    | "scatterSpreadRate"
  >
>;

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
  /** bonusBasicAttackOnHit 由来 Hit — 再帰発火を抑止 */
  suppressBonusBasicAttack?: boolean;
  /** allyAttackFollowUp 由来 Hit — 再帰追撃を抑止 */
  suppressAllyAttackFollowUp?: boolean;
  /** bonusActiveOnHit 由来 Hit — P3 再帰を抑止 */
  suppressBonusActiveOnHit?: boolean;
}

export interface DamageSkillEffect extends SkillEffectCommon {
  type: "damage";
  /** 省略時 = actor.traits.damageType */
  damageType?: DamageType;
  amount: ResourceAmountSpec;
  /** barrierHp 吸収をスキップ */
  pierceBarrier?: boolean;
  /** wardBarrier 軽減をスキップ */
  pierceWard?: boolean;
  /** 物理 block 判定をスキップ */
  pierceBlock?: boolean;
  /** resolveDamage 内で damageTakenMul を 1.0 として計算 */
  ignoreDamageTakenReduction?: boolean;
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
  buffStatModifiers?: StatBuffModifierEntry[];
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
  /** allyAttackFollowUp: 近傍味方 basic 追撃の半径（px。未指定 70） */
  allyFollowUpRadiusPx?: number;
  /** allyAttackFollowUp: 追撃 basic 命中時の DEF debuff 倍率（未指定 0.95） */
  followUpDefDebuffMultiplier?: number;
  /** allyAttackFollowUp: DEF debuff 持続秒（未指定 5） */
  followUpDefDebuffDurationSec?: number;
  /**
   * buffStat が damageTaken のとき、軽減/増加を適用する属性。
   * 未指定 = 全属性。R12g-d1 鉄衛士 M1。
   */
  damageTakenDamageTypes?: DamageType[];
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
  debuffStat?: StatBuffTarget | StatBuffTarget[];
  debuffMultiplier?: number;
  debuffFlatBonus?: number;
  debuffDurationSec?: number;
  durationSec?: number;
  /** DoT 用（ResourceAmountSpec）。未指定時は powerMultiplier */
  amount?: ResourceAmountSpec;
  powerMultiplier?: number;
  damageType?: DamageType;
  /** debuff dot 用フレーバー（未指定 = generic dot） */
  dotFlavor?: DotFlavor;
  /** HUD 表示名（出血・毒など） */
  buffDisplayName?: string;
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
  dotFlavor?: DotFlavor;
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

/** パッシブ counter の被弾トリガー。未指定 = 自己被弾 */
export type PassiveCounterTriggerKind = "selfDamaged" | "frontAllyDamaged";

export type CounterResponseDef =
  | {
      kind: "damage";
      amount: ResourceAmountSpec;
      damageType?: DamageType;
    }
  | {
      kind: "debuff";
      debuffStat: StatBuffTarget | StatBuffTarget[];
      debuffMultiplier?: number;
      debuffFlatBonus?: number;
      debuffDurationSec: number;
    }
  | {
      kind: "dot";
      durationSec: number;
      powerMultiplier: number;
      damageType?: DamageType;
      dotFlavor?: DotFlavor;
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

export interface EnemyReelInSkillEffect extends SkillEffectCommon {
  type: "enemyReelIn";
}

export interface ArenaDominanceSkillEffect extends SkillEffectCommon {
  type: "arenaDominance";
  durationSec?: number;
  nonMarkDamageMultiplier?: number;
}

export interface GrantNextOutgoingDamageSkillEffect extends SkillEffectCommon {
  type: "grantNextOutgoingDamage";
  nextOutgoingDamageMultiplier?: number;
}

export interface PlacedFieldSkillEffect extends SkillEffectCommon {
  type: "placedField";
  fieldRadiusPx: number;
  fieldDurationSec: number;
  stayTickIntervalSec?: number;
  /** 滞在 tick ごとに dotCompress 比率へ加算（A3 等） */
  stayCompressRatioBonusPerTick?: number;
  enterEffects?: SkillEffectDef[];
  stayEffects?: SkillEffectDef[];
}

export interface DotCompressSkillEffect extends SkillEffectCommon {
  type: "dotCompress";
  compressRatio: number;
}

export interface DotExtendSkillEffect extends SkillEffectCommon {
  type: "dotExtend";
  extendRatio: number;
}

export interface DotHarvestSkillEffect extends SkillEffectCommon {
  type: "dotHarvest";
  harvestRatio: number;
}

export interface PoisonSpreadSkillEffect extends SkillEffectCommon {
  type: "poisonSpread";
  spreadRadiusPx: number;
  spreadDurationRatio: number;
  dotFlavor?: DotFlavor;
}

/** 地点指定持続範囲のランタイム实例 */
export interface PlacedFieldInstance {
  id: string;
  sourceId: string;
  skillId: string;
  effectIndex: number;
  centerX: number;
  radiusPx: number;
  remainingSec: number;
  stayTickIntervalSec: number;
  stayTickAccumulator: number;
  stayCompressRatioBonus: number;
  stayCompressRatioBonusPerTick?: number;
  enterEffects: SkillEffectDef[];
  stayEffects: SkillEffectDef[];
  enteredUnitIds: Set<string>;
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
  | BlockResonanceConsumeSkillEffect
  | EnemyReelInSkillEffect
  | ArenaDominanceSkillEffect
  | GrantNextOutgoingDamageSkillEffect
  | PlacedFieldSkillEffect
  | DotCompressSkillEffect
  | DotExtendSkillEffect
  | DotHarvestSkillEffect
  | PoisonSpreadSkillEffect;

/** @deprecated JSON 読み込み互換。正規化後は HealSkillEffect */
export type LegacyHotSkillEffect = HotSkillEffect;

/** 通常攻撃の近接/遠隔分類（damage basic / combat module のみ。heal-only は未設定） */
export type AttackMethod = 'melee' | 'ranged';

/** 戦闘方式の実行定義。ActiveSkillDef の effect / 共有ターゲット形状のみ（trigger は module 側 attackIntervalSec） */
export interface CombatModuleActionDef extends SkillSharedTargetingFields {
  effect: SkillEffectDef[];
  /** damage 系 module のみ。heal / buff module は未設定 */
  attackMethod?: AttackMethod;
}

/**
 * CombatModule 専用の Hit トリガー / 選択中永続効果等（大規模汎用 trigger DSL ではない）。
 * R12g-d1: 鉄衛士 M1 物理軽減・M2 固定自己回復の所有者。
 * R12g-d2: 護法士 M1 前線防護・M2 危険対象防護の所有者。
 */
export type CombatModuleRuntimeEffect =
  | {
      kind: 'healOnEnemyAttackHpHit';
      /** Hit ごとの固定自己回復量（> 0）。R12i で調整 */
      flatAmount: number;
    }
  | {
      kind: 'physicalDamageTakenReduction';
      /**
       * 物理被ダメ倍率（0 < takenMultiplier ≤ 1 が軽減）。
       * 選択中は永続。R12i で調整。
       */
      takenMultiplier: number;
    }
  | {
      kind: 'protectFrontlineAllies';
      /** 前線（formationRow: front）味方の上限人数（>= 1）。自身が前線なら含む */
      maxTargets: number;
      /** 魔法被ダメ倍率（0 < value ≤ 1）。R12i で調整 */
      magicDamageTakenMultiplier: number;
      /** 任意。弱い全属性被ダメ倍率（0 < value ≤ 1）。省略時は魔法のみ */
      allDamageTakenMultiplier?: number;
    }
  | {
      kind: 'protectDangerTarget';
      /** danger TargetSpec.maxTargets（護法士 M2 は 1） */
      maxTargets: number;
      /** danger TargetSpec.windowSec（>= 0） */
      windowSec: number;
      /** 全属性被ダメ倍率（0 < value ≤ 1）。R12i で調整 */
      allDamageTakenMultiplier: number;
      /** 魔法追加被ダメ倍率（0 < value ≤ 1）。全属性とは別乗算。R12i で調整 */
      magicDamageTakenMultiplier: number;
      /** 防護 duration 秒（> 0）。signal 0 時は満了まで残す */
      durationSec: number;
    };

/** R5 最小戦闘方式。R5c で ActiveSkillDef へ合成し basic スロットで実行 */
export interface CombatModuleDef {
  id: string;
  classId: ClassId;
  displayName: string;
  description: string;
  /** 秒単位攻撃間隔（初回 CD・継続周期の正本候補。R5c で SkillExecutor 接続） */
  attackIntervalSec: number;
  action: CombatModuleActionDef;
  /** 任意。通常 action では表現しない被 Hit リアクション等 */
  runtimeEffect?: CombatModuleRuntimeEffect;
}

/** R5 最小縦切りの module 対象兵科（4 兵科 × 2 方式）。R12g 追加兵科は modules JSON 側で editor 発見 */
export const R5_COMBAT_MODULE_CLASS_IDS = [
  'df_guardian',
  'at_swordsman',
  'at_sorcerer',
  'sp_cleric',
] as const;

export type R5CombatModuleClassId = (typeof R5_COMBAT_MODULE_CLASS_IDS)[number];

export interface ActiveSkillDef extends SkillSharedTargetingFields {
  id: string;
  name: string;
  /** damage 系通常攻撃のみ。heal-only basic は未設定 */
  attackMethod?: AttackMethod;
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
  /** SkillHold 中に自動接近も停止する。省略 = false */
  useDurationPauseApproach?: boolean;
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
  /** blockResonanceConsume: 態勢中 stack あたりのダメージ軽減率 */
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
  /** arenaDominance 等: Stage 内発動上限（未指定 = 無制限） */
  stageTriggerLimit?: number;
  /** arenaDominance: 効果持続秒（未指定 = 15） */
  arenaDominanceDurationSec?: number;
  /** arenaDominance: マーク以外の敵からの被ダメ倍率（未指定 = 0.5） */
  arenaDominanceNonMarkDamageMultiplier?: number;
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
  /** Wave 単位の敵編成（任意）。未指定時は legacy `enemies` または stage 直下 `enemyGroups` に委譲。 */
  enemyGroups?: StageEnemyGroup[];
  /** R12h: この Wave の準備開始時に一度付与する作戦ポイント。未指定は legacy fallback。 */
  prepResourceGrant?: number;
}

/** ステージ直下の敵編成グループ（v0.3.2）。1 group = 同一 classId の複数体。 */
export interface StageEnemyGroup {
  classId: ClassId;
  count: number;
  hpScale?: number;
  atkScale?: number;
  defScale?: number;
  resScale?: number;
  /** group 内全 Combatant が使用する combat module（未指定 = class.combatModuleIds[0]） */
  selectedCombatModuleId?: string;
}

/**
 * enemyGroups 展開後の 1 体分スポーン仕様（CombatantState 生成前の中間表現）。
 * Phase B1: 配置・stats 計算は含まない。
 */
export interface ResolvedEnemySpawnSpec {
  classId: ClassId;
  /**
   * 内部互換用（`ENEMY_GROUP_BASE_LEVEL`）。強さは level ではなく scale + 基礎ステ。
   * `stage.recommendedLevel` は参照しない（廃止方向 / legacy UI 用フィールド）。
   */
  level: number;
  hpScale?: number;
  atkScale?: number;
  defScale?: number;
  resScale?: number;
  /** enemyGroups 配列内の 0-based インデックス */
  groupIndex: number;
  /** 同一 group 内の 0-based インデックス */
  indexInGroup: number;
  /** 元 StageEnemyGroup.count */
  groupCount: number;
  /** 元 StageEnemyGroup.selectedCombatModuleId（group 内共有） */
  selectedCombatModuleId?: string;
  /** CombatantState.id 等の安定キー生成用（`g{groupIndex}_i{indexInGroup}`） */
  spawnUnitKey: string;
}

export interface StageDef {
  id: string;
  displayName: string;
  waves: StageWave[];
  /**
   * legacy — 想定レベル / Level Sync / ☆ 用。
   * 新仕様 Stage では不要・未設定可。敵ステ算出には使わない（scale + 基礎ステ）。
   */
  recommendedLevel?: number;
  /** クラスベース敵編成。体験版は 1 stage = 1 配列 = wave 0 相当。 */
  enemyGroups?: StageEnemyGroup[];
  /** 初回クリア時に save.unlockedClassIds へ merge する classId（任意・重複は除去） */
  unlockClassIdsOnClear?: ClassId[];
  /** ステージ詳細に表示する任意の編成ヒント（日本語・experience spotlight 用） */
  formationHintJa?: string;
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

/** 作戦内パッシブ候補 catalog（`data/operation-passive-catalog.json`） */
export interface OperationPassiveCatalogDef {
  /** Fallback base cost when passive missing from costUnlockLevelByPassiveId */
  passiveAcquireCost: number;
  waveClearResourceGrant: number;
  /** Added cost per already-acquired operation passive on the same class/slot */
  sameClassStackStep: number;
  /** unlockLevel band → base cost. Keys "0","10","20" */
  unlockLevelCostTable: Record<string, number>;
  /** Cost-tier unlockLevel per passive id (NOT a party Lv gate) */
  costUnlockLevelByPassiveId: Record<string, number>;
  candidatesByClass: Record<string, string[]>;
}

export interface GameData {
  /** classes.json の配列順（バランス表・編成クラス一覧の並び） */
  classOrder: ClassId[];
  classRegistry: Record<ClassId, ClassPreset>;
  /** combat-modules/*.json を id で索引 */
  combatModuleRegistry: Record<string, CombatModuleDef>;
  skillRegistry: SkillRegistry;
  enemyRegistry: Record<string, EnemyTemplate>;
  stages: StageDef[];
  parties: Record<string, PartyDef>;
  /** 作戦内パッシブ候補・付与条件（R8/R9d） */
  operationPassiveCatalog: OperationPassiveCatalogDef;
}

export type BattlePhase = "idle" | "running" | "victory" | "defeat";

export type { RuntimeBattlePhase } from "./battlePhase.ts";

export type {
  DamageAppliedAttackKind,
  DamageAppliedCallback,
  DamageAppliedCallbackMeta,
  DamageAppliedEvent,
  DamagePipelineSourceKind,
} from "./damageAppliedEvent.ts";

export type BattleXDebugTraceReason =
  | "approach"
  | "skillMove"
  | "knockback"
  | "enemyReelIn"
  | "overlap"
  | "deploy"
  | "victoryExit"
  | "layoutBake"
  | "corpseAnchor"
  | "sync"
  | "unknown";

export interface BattleXDebugTraceEntry {
  unitId: string;
  unitName: string;
  isEnemy: boolean;
  phase: BattlePhase | string;
  runtimePhase: import("./battlePhase.ts").RuntimeBattlePhase;
  reason: BattleXDebugTraceReason;
  beforeX: number;
  afterX: number;
  deltaX: number;
  battleTimeSec: number;
  tickIndex: number;
  warning: boolean;
  details?: {
    approachTargetX?: number;
    shouldSkipEngagedAutoApproach?: boolean;
    priorityHealTargetId?: string;
    frontlineContactX?: number;
    frontlineOwnerIds?: string;
    healWithholdReason?: string;
    bodyAnimMarching?: boolean;
    isActorUseLocked?: boolean;
    isActorInSkillMotion?: boolean;
    isActorAnimLocked?: boolean;
  };
}

export interface CombatantSnapshot {
  id: string;
  name: string;
  /** 敵 HUD groupBy 用。敵は template id、味方は class id。 */
  classId?: ClassId;
  /** 将来: ステージ固有の敵種別。未指定時は classId を group key に使う。 */
  enemyTypeId?: string;
  hp: number;
  maxHp: number;
  /** バフ/debuff 前の MaxHP（`maxHp` は実効値） */
  baseMaxHp: number;
  barrierHp: number;
  atk: number;
  def: number;
  res: number;
  role?: Role;
  rangePx: number;
  /** 解決済み通常攻撃の attackMethod（描画タイブレーク用） */
  basicAttackMethod?: AttackMethod;
  /** 現在の実効射程（effect.range も含めた最大値） */
  effectiveRangePx: number;
  damageType: DamageType;
  basicAttackVfx?: SkillVfxDef;
  spriteKey: string;
  iconKey: string;
  formationRow: FormationRow;
  isEnemy: boolean;
  battleX: number;
  /** 戦闘向き: 味方 +1 / −1（背後の AttackTarget へ向けるとき反転） */
  facingSign?: number;
  /** entity body の move 再生（自動接近・PartyDeploy・スキル move 等） */
  bodyAnimMarching: boolean;
  /** 味方のみ: フィールド上に death スプライトを描くか */
  corpseVisible?: boolean;
  partySlotIndex?: number;
  /** 味方のみ: 停止時間（useDurationSec）中 */
  useLocked?: boolean;
  /**
   * 解決済み通常行動 skillId（'basic' slot）。CombatModule 兵科は module ID。
   * HUD / ステータス表示が runtime と同一判定で CombatModule 兵科を識別するための read-only 情報。
   */
  basicSkillId?: string;
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
    stageTriggerExhausted?: boolean;
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
  /** R8f: 作戦内範囲 buff の 1 次元帯（判定と同一 battleX / radius） */
  allyRangePassiveBands: import("./allyRangePassiveBands.ts").AllyRangePassiveBand[];
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
  /** 中間 Wave 終了後: 次 Wave 開始待機（R6b） */
  awaitingNextWave: boolean;
  /** プレイヤー側ユニット（ランタイム正本） */
  players: CombatantSnapshot[];
  /** @deprecated players */
  allies: CombatantSnapshot[];
  enemies: CombatantSnapshot[];
  /** verify/debug 表示用。通常 snapshot には含めない。 */
  battleXDebugTrace?: BattleXDebugTraceEntry[];
  /** verify/debug: 直近 tick の battleX 更新内訳のみ。 */
  battleXDebugTickTrace?: BattleXDebugTraceEntry[];
  /** verify/debug: replay UI 用 tick メタデータ。 */
  battleXDebugTickMeta?: {
    tickIndex: number;
    battleTimeSec: number;
  };
}
