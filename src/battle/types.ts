export type Role = "defender" | "attacker" | "supporter";
export type ClassId = string;
export type FormationRow = "front" | "middle" | "back";
/** 遠隔攻撃とみなす traits.rangePx の境界（px）。`> RANGED_ATTACK_THRESHOLD_PX` が遠隔帯 */
export const RANGED_ATTACK_THRESHOLD_PX = 50;
/** 近接帯の上限（px）。rangePx <= RANGED_ATTACK_THRESHOLD_PX */
export const MELEE_RANGE_MAX_PX = RANGED_ATTACK_THRESHOLD_PX;

export function isMeleeRangePx(rangePx: number): boolean {
  return rangePx <= RANGED_ATTACK_THRESHOLD_PX;
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
} from './battleConstants.ts';

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
  basicAttackVfx: SkillVfxDef;
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
  /** 1行フレーバーテキスト */
  flavorJa?: string;
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
    };

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
  /** セット済みアクティブスキル ID（JSON キー名は歴史的に equippedActiveSlots） */
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
    | "block"
    | "counter"
    | "evasion"
    | "damageTakenToHeal";
  /** damageTakenToHeal overlay: 被ダメの回復割合（0.1 = 10%） */
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
}

export type StatusEffectStat =
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

export type SpecialEffectApplyTo = "damage" | "heal";

export type HealSubKind = "instant" | "hot" | "dispel";
export type BuffSubKind =
  | "stat"
  | "barrier"
  | "block"
  | "evasion"
  | "damageTakenToHeal";
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
  def?: DefenseIgnoreDefSpec;
  reg?: DefenseIgnoreRegSpec;
}

export function asStatusEffectStatList(
  stat: StatusEffectStat | StatusEffectStat[] | undefined,
): StatusEffectStat[] {
  if (!stat) return [];
  return Array.isArray(stat) ? stat : [stat];
}

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
  /** 接敵中: battleX 基準線からの描画レーンずれ（接敵開始時に固定） */
  engagedVisualLaneX?: number;
  /** 近接敵: 最前列からの奥行きスロット（接敵開始時に固定、0=最前列） */
  engagedMeleeVisualSlot?: number;
  /** 遠距離敵: 描画アンカー用の狙いプレイヤー id（接敵開始時に固定） */
  engagedVisualTargetPlayerId?: string;
  /** @deprecated engagedVisualTargetPlayerId */
  engagedVisualTargetAllyId?: string;
  /** 味方: Wave 中の death スプライト表示。Wave 移行で false（HP0・HUD は維持） */
  corpseVisible: boolean;
  /** 敵のみ: ステージ配置のスポーン battleX */
  spawnX?: number;
  /** 敵 dead: 死亡時 screen X 固定（battleX = anchor - combatCameraX） */
  corpseScreenAnchorX?: number;
  /** 味方のみ: 敵 AI ヘイト（ランタイム） */
  threat?: number;
  /** 味方のみ: 減衰の目標ヘイト */
  baseThreat?: number;
}

export type PassiveEffectKind =
  | "targetRuleOverride"
  | "damageTakenToHeal"
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
  | "skillAmountOverride"
  | "skillPropertyOverride"
  /** @deprecated 読み込み互換 */
  | "evasionChance"
  | "block"
  | "counterChance"
  | "damageIncrease"
  | "healReceivedIncrease"
  | "extendSelfAppliedDebuff"
  /** @deprecated 読み込み互換（正規化後は heal + healSubKind: hot） */
  | "hot";

export function isPassiveHot(passive: PassiveSkillDef): boolean {
  if (passive.effect === "heal") {
    return (passive.healSubKind ?? "hot") === "hot";
  }
  return passive.effect === "hot";
}

export type TargetRuleOverrideApplyTo = "enemy" | "ally";

export type PassivePeriodicTriggerKind = "interval" | "stageStart" | "waveStart";

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
  /** buff: block / evasion / counter / defenseIgnore 用（0–1） */
  chance?: number;
  ratio?: number;
  hotAmount?: ResourceAmountSpec;
  /** buff + barrier: 付与量 */
  barrierAmount?: ResourceAmountSpec;
  /** buff + barrier: true で既存バリアに加算 */
  barrierStack?: boolean;
  hotTargetRule?: TargetSpec;
  /** hot: 付与 HoT の効果時間（秒）。0 または未指定 = 無限 */
  hotDurationSec?: number;
  /** damageReduction: 被ダメ軽減率（0.2 = 20% 軽減） */
  damageReductionPercent?: number;
  damageReductionTargetRule?: TargetSpec;
  barrierScale?: number;
  perExtraTargetScale?: number;
  maxExtraTargets?: number;
  specialEffectApplyTo?: SpecialEffectApplyTo;
  specialEffect?: SpecialEffectSpec;
  defenseIgnore?: DefenseIgnoreSpec;
  buffSubKind?: BuffSubKind;
  buffTargetRule?: TargetSpec;
  buffMultiplier?: number;
  buffFlatBonus?: number;
  debuffSubKind?: DebuffSubKind;
  debuffTargetRule?: TargetSpec;
  debuffStat?: StatusEffectStat | StatusEffectStat[];
  debuffMultiplier?: number;
  debuffFlatBonus?: number;
  intervalSec?: number;
  /** hot / periodicDispel: 定期発動条件。未指定かつ intervalSec あり = interval。hot で両方未指定 = 常時 aura */
  periodicTrigger?: PassivePeriodicTriggerKind;
  dispelTargetRule?: TargetSpec;
  dispelTags?: DebuffFilterTag[];
  dispelCount?: number;
  dispelPriority?: DispelPriority;
  /** counter: 反撃内容 */
  counterResponses?: CounterResponseDef[];
  /** counter: 反撃発動射程（px）。未指定 = 持有者 traits.rangePx */
  counterRange?: number;
  /** buff / selfHpRatioBuff: 対象 stat */
  buffStat?: BuffTargetKind | BuffTargetKind[];
  /** selfHpRatioBuff: 最大倍率（満タン時は 1 = 中立） */
  buffMultiplierMax?: number;
  /** selfHpRatioBuff: 最大固定加算 */
  buffFlatBonusMax?: number;
  /** selfHpRatioBuff: この HP 割合以下で最大バフ（0〜1、1 未満） */
  maxBuffAtHpRatio?: number;
  /** excessHealToBarrier: 余剰変換の対象（未指定 = outgoing のみ） */
  excessHealSources?: Array<"outgoing" | "incoming">;
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
  | "counter";

export type MoveMode = "engage" | "toAnchor" | "behindTarget";
export type DamageType = "physical" | "magic";

/** スキル演出プリセット ID（render 層が描画。将来 skills.json の vfx で指定） */
export type SkillVfxPresetId =
  | "slash"
  | "slashHit"
  | "orb"
  | "arrow"
  | "healRise"
  | "chainLightning"
  | "impale";

/** スキルごとの演出定義（skills.json に optional で載せる想定） */
export interface SkillVfxDef {
  preset: SkillVfxPresetId;
  /** arrow プリセット: 放物線軌道 */
  arc?: boolean;
  /** 演出時間（ms）。未指定時はプリセット既定 */
  durationMs?: number;
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

interface SkillEffectCommon {
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
  /** 未指定時はスキル vfx → 既定プリセット（damage/heal 等のみ） */
  vfx?: SkillVfxDef;
  /** @deprecated target.kind==="status" に統合。読み込み専用 */
  targetDebuffFilter?: DebuffFilterTag[];
  /** damage / heal / dot 用（HoT tick 非対象） */
  damageIncrease?: DamageIncreaseSpec;
  /** damage / dot 用 */
  defenseIgnore?: DefenseIgnoreSpec;
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
  /** staged chain: 飛行 VFX 開始時刻 */
  vfxStartAtBattleSec?: number;
  /** staged chain: 1 レグの飛行時間（秒） */
  travelDurationSec?: number;
  /** staged chain: セグメント総数 */
  segmentCount?: number;
  /** tick 用: VFX 開始済み */
  vfxSpawned?: boolean;
}

export interface DamageSkillEffect extends SkillEffectCommon {
  type: "damage";
  /** 省略時 = actor.traits.damageType */
  damageType?: DamageType;
  amount: ResourceAmountSpec;
}

export interface HealSkillEffect extends SkillEffectCommon {
  type: "heal";
  healSubKind?: HealSubKind;
  amount?: ResourceAmountSpec;
  durationSec?: number;
  dispelTags?: DebuffFilterTag[];
  dispelCount?: number;
  dispelPriority?: DispelPriority;
}

export interface BuffSkillEffect extends SkillEffectCommon {
  type: "buff";
  buffSubKind?: BuffSubKind;
  buffStat?: BuffTargetKind | BuffTargetKind[];
  buffMultiplier?: number;
  buffFlatBonus?: number;
  buffDurationSec?: number;
  chance?: number;
  /** damageTakenToHeal: 被ダメの回復割合（0.1 = 10%） */
  ratio?: number;
  amount?: ResourceAmountSpec;
  barrierStack?: boolean;
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
  /** true = 既存に加算。false/未指定 = 置換 */
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
  behindOffsetPx?: number;
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
  | CounterSkillEffect;

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
  /** 未指定時は role / attackRange 等からプレースホルダー VFX を自動選択 */
  vfx?: SkillVfxDef;
  /** 停止時間（秒）。省略/0 = 即時。アニメ長に合わせて設定 */
  useDurationSec?: number;
  /** 発動ゲート。省略 = immediate */
  firePolicy?: FirePolicy;
  /** firePolicy=smart 時の AND 条件 */
  fireConditions?: FireCondition[];
  /** smart 発動待ちの最大秒（経過後は条件無視で発動） */
  fireTimeoutSec?: number;
  /** 多段チャージ上限。省略 = 1 */
  maxCharges?: number;
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

export type { RuntimeBattlePhase } from './battlePhase.ts';

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
  damageType: DamageType;
  basicAttackVfx: SkillVfxDef;
  spriteKey: string;
  iconKey: string;
  formationRow: FormationRow;
  isEnemy: boolean;
  battleX: number;
  visualX: number;
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
  runtimePhase: import('./battlePhase.ts').RuntimeBattlePhase;
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
