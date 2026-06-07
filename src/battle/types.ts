export type Role = "defender" | "attacker" | "supporter";
export type ClassId = string;
export type FormationRow = "front" | "middle" | "back";
export type AttackRange = "melee" | "ranged";

/** 近接の rangePx 未指定時（px） */
export const DEFAULT_MELEE_RANGE_PX = 45;

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
  /** skills[level=0] から導出 */
  starterPassiveIds: string[];
  starterActiveIds: string[];
  /** skills[] 全 ID（検証・装備可否） */
  classSkillIds: string[];
}

export type TargetRule =
  | "closestAlly"
  | "frontEnemy"
  | "lowestHpEnemy"
  | "mostDamagedAlly"
  | "self";

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
  equippedActiveSlots: string[];
}

export interface CharacterProgress {
  level: number;
  exp: number;
}

export interface PartyMemberState {
  classId: ClassId;
  progress: CharacterProgress;
  build: CharacterBuild;
}

export interface StageProgress {
  currentStageId: string;
  totalClears: number;
}

export interface SaveGameState {
  version: number;
  stageProgress: StageProgress;
  party: PartyMemberState[];
}

export interface StatusEffect {
  id: string;
  kind: "buff" | "debuff";
  /** buff/debuff 用（stat 系） */
  stat?: StatusEffectStat;
  /** HoT/DoT バッジ用 */
  overlay?: "hot" | "dot";
  /** HoT/DoT tick 量（スキル powerMultiplier） */
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
  role: Role;
  classId: ClassId;
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
  | "dot";
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
  type: SkillEffectKind;
  /** 射程が必要な効果のみ（px） */
  range?: number;
}

export interface DamageSkillEffect extends SkillEffectCommon {
  type: "damage";
  damageType: DamageType;
  powerMultiplier: number;
}

export interface HealSkillEffect extends SkillEffectCommon {
  type: "heal";
  powerMultiplier: number;
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
  powerMultiplier: number;
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
  | DotSkillEffect;

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
  activeSkillIds?: string[];
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
