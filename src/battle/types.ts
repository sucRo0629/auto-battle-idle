export type Role = "defender" | "attacker" | "supporter";
export type ClassId = string;
export type FormationRow = "front" | "middle" | "back";
export type AttackRange = "melee" | "ranged";

/** 近接の rangePx 未指定時（px） */
export const DEFAULT_MELEE_RANGE_PX = 45;
/** 遠隔の rangePx 未指定時フォールバック（px） */
export const DEFAULT_RANGED_RANGE_PX = 120;

export interface ClassTraits {
  attackRange: AttackRange;
  /** 攻撃可能距離（px）。近接で未指定時は DEFAULT_MELEE_RANGE_PX */
  rangePx?: number;
}

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
  formationRow: FormationRow;
  traits: ClassTraits;
  /** 未指定時は role / attackRange からプレースホルダーを使用 */
  spriteKey?: string;
  /** 未指定時は role / attackRange からプレースホルダーを使用 */
  iconKey?: string;
  basicAttackSkillId: string;
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
  | "highestAtkEnemy"
  | "lowestDefEnemy"
  | "highestDefEnemy"
  | "lowestRegEnemy"
  | "highestRegEnemy"
  | "highestHpEnemy"
  | "farthestEnemy";

/** 効果のターゲット形状。未指定は single */
export type TargetShape =
  | "single"
  | "aoe"
  | "multiLock"
  | "pierce"
  | "chain"
  | "scatter";

export type PowerStepMode = "multiply" | "divide";

/** heal / hot / barrier 共用の効果量種別 */
export type ResourceAmountKind = "atkBased" | "flat" | "percentMaxHp";

export interface ResourceAmountSpec {
  kind: ResourceAmountKind;
  /** atkBased — 使用者 effectiveAtk + passive healBonus を基準 */
  atkAdd?: number;
  /** 未指定時 1（旧 powerMultiplier 互換） */
  atkMultiply?: number;
  /** 未指定時 1 */
  atkDivide?: number;
  /** 未指定時 0 */
  atkSubtract?: number;
  /** flat */
  flatAmount?: number;
  /** 0〜1、percentMaxHp — 対象 maxHp 基準 */
  percentOfMaxHp?: number;
}

export interface Combatant extends CombatStats {
  id: string;
  name: string;
  hp: number;
  isAlive: boolean;
}

export type SkillSlotKind = "basic" | "active";

export interface SkillCooldown {
  skillId: string;
  remaining: number;
  slotKind: SkillSlotKind;
  slotIndex?: number;
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
  kind: "buff" | "debuff";
  /** buff/debuff 用（stat 系） */
  stat?: StatusEffectStat;
  /** HoT/DoT バッジ用 */
  overlay?: "hot" | "dot";
  /** HoT tick 量（ResourceAmountSpec） */
  amount?: ResourceAmountSpec;
  /** HoT/DoT tick 量（旧 JSON 互換） */
  powerMultiplier?: number;
  /** HoT/DoT 付与者 */
  sourceId?: string;
  skillId?: string;
  damageType?: DamageType;
  /** 次 tick までの残秒（1 秒間隔） */
  tickSec?: number;
  multiplier: number;
  /** 正の量。符号は kind から決定 */
  flatBonus?: number;
  /** 付与時の効果時間（秒） */
  durationSec: number;
  remainingSec: number;
}

export type StatusEffectStat = "atk" | "def" | "reg" | "damageTaken";

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
  visualX: number;
  /** 敵のみ: ステージ配置のスポーン X */
  spawnX?: number;
}

export type PassiveEffectKind =
  | "damageMultiplier"
  | "damageTakenMultiplier"
  | "healBonus"
  | "targetRuleOverride"
  | "evasionChance"
  | "activeCooldownRate";

export interface PassiveSkillDef {
  id: string;
  name: string;
  effect: PassiveEffectKind;
  targetRuleOverride?: TargetRule;
  damageMultiplier?: number;
  damageTakenMultiplier?: number;
  healBonus?: number;
  evasionChance?: number;
  activeCooldownRate?: number;
}

export type SkillEffectKind =
  | "damage"
  | "heal"
  | "buff"
  | "debuff"
  | "hot"
  | "dot"
  | "barrier";
export type DamageType = "physical" | "magic";

/** スキル演出プリセット ID（render 層が描画。将来 skills.json の vfx で指定） */
export type SkillVfxPresetId = "slash" | "orb" | "arrow" | "healRise";

/** スキルごとの演出定義（skills.json に optional で載せる想定） */
export interface SkillVfxDef {
  preset: SkillVfxPresetId;
  /** arrow プリセット: 放物線軌道 */
  arc?: boolean;
  /** 演出時間（ms）。未指定時はプリセット既定 */
  durationMs?: number;
}

interface SkillEffectCommon {
  targetRule: TargetRule;
  /** 未指定は single（単体） */
  targetShape?: TargetShape;
  /** aoe 時必須: anchor から ±px */
  aoeRadiusPx?: number;
  /** multiLock 時必須: ヒット回数（>= 2） */
  hitCount?: number;
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
  /** scatter 時必須 */
  scatterRadiusPx?: number;
  scatterHitCount?: number;
  scatterDurationSec?: number;
  /** 0〜1。0 = anchor 中心固定 */
  scatterSpreadRate?: number;
  type: SkillEffectKind;
  /** 命中判定・VFX 共用（px）。未指定 = 使用者 traits.rangePx */
  range?: number;
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
  slotKind: SkillSlotKind;
  hitIndex: number;
  targets: PendingSkillHitTarget[];
}

export interface DamageSkillEffect extends SkillEffectCommon {
  type: "damage";
  damageType: DamageType;
  powerMultiplier: number;
}

export interface HealSkillEffect extends SkillEffectCommon {
  type: "heal";
  amount: ResourceAmountSpec;
}

export interface BuffSkillEffect extends SkillEffectCommon {
  type: "buff";
  buffStat: StatusEffectStat | StatusEffectStat[];
  buffMultiplier?: number;
  buffFlatBonus?: number;
  buffDurationSec: number;
}

export interface DebuffSkillEffect extends SkillEffectCommon {
  type: "debuff";
  debuffStat: StatusEffectStat | StatusEffectStat[];
  debuffMultiplier?: number;
  debuffFlatBonus?: number;
  debuffDurationSec: number;
}

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
  powerMultiplier: number;
  damageType?: DamageType;
}

export type SkillEffectDef =
  | DamageSkillEffect
  | HealSkillEffect
  | BuffSkillEffect
  | DebuffSkillEffect
  | HotSkillEffect
  | DotSkillEffect
  | BarrierSkillEffect;

export interface ActiveSkillDef {
  id: string;
  name: string;
  interval: number;
  effect: SkillEffectDef[];
  allowedClassIds?: ClassId[];
  /** 未指定時は role / attackRange 等からプレースホルダー VFX を自動選択 */
  vfx?: SkillVfxDef;
}

export interface EnemyTemplate extends CombatStats {
  id: string;
  displayName: string;
  /** 撃破時に生存味方全員が得る EXP */
  exp: number;
  spriteKey: string;
  basicAttackSkillId: string;
  /** 通常攻撃 CD（基本攻撃 interval への倍率）。未指定時は normal */
  attackSpeedTier?: AttackSpeedTier;
  passiveSkillIds?: string[];
  activeSkillIds?: string[];
  /** 未指定時は melee */
  attackRange?: AttackRange;
  /** 攻撃可能距離（px）。未指定時は近接デフォルト */
  rangePx?: number;
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
  classRegistry: Record<ClassId, ClassPreset>;
  skillRegistry: SkillRegistry;
  enemyRegistry: Record<string, EnemyTemplate>;
  stages: StageDef[];
  parties: Record<string, PartyDef>;
}

export type BattlePhase = "idle" | "running" | "victory" | "defeat";

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
  attackRange: AttackRange;
  spriteKey: string;
  iconKey: string;
  formationRow: FormationRow;
  isEnemy: boolean;
  visualX: number;
  statusEffects: StatusEffect[];
  activeCooldowns: {
    skillId: string;
    remaining: number;
    interval: number;
    slotIndex: number;
  }[];
}

export interface BattleSnapshot {
  phase: BattlePhase;
  engaged: boolean;
  worldOffsetX: number;
  alliesOffScreen: boolean;
  allies: CombatantSnapshot[];
  enemies: CombatantSnapshot[];
}
