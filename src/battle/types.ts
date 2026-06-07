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
  starterPassiveIds: string[];
  starterActiveIds: string[];
}

export type TargetRule =
  | "closestAlly"
  | "frontEnemy"
  | "lowestHpEnemy"
  | "mostDamagedAlly";

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
  slotIndex?: 0 | 1;
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
  stat: "atk" | "def" | "damageTaken";
  multiplier: number;
  remainingSec: number;
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

export type SkillEffectKind = "damage" | "heal" | "buff" | "debuff";
export type DamageType = "physical" | "magic";

export interface ActiveSkillDef {
  id: string;
  name: string;
  interval: number;
  targetRule: TargetRule;
  effect: SkillEffectKind;
  damageType?: DamageType;
  powerMultiplier?: number;
  buffStat?: StatusEffect["stat"];
  buffMultiplier?: number;
  buffDurationSec?: number;
  debuffStat?: StatusEffect["stat"];
  debuffMultiplier?: number;
  debuffDurationSec?: number;
  range: AttackRange;
  allowedRoles?: Role[];
  allowedClassIds?: ClassId[];
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
  role?: Role;
  spriteKey: string;
  iconKey: string;
  formationRow: FormationRow;
  isEnemy: boolean;
  visualX: number;
  activeCooldowns: {
    skillId: string;
    remaining: number;
    interval: number;
    slotIndex: 0 | 1;
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
