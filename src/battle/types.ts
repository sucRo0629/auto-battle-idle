export type Role = 'defender' | 'attacker' | 'supporter';
export type ClassId = string;
export type FormationRow = 'front' | 'middle' | 'back';
export type AttackRange = 'melee' | 'ranged';

export interface ClassTraits {
  attackRange: AttackRange;
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
  spriteKey: string;
  basicAttackSkillId: string;
  starterPassiveIds: string[];
  starterActiveIds: string[];
}

export type TargetRule =
  | 'closestAlly'
  | 'frontEnemy'
  | 'lowestHpEnemy'
  | 'mostDamagedAlly';

export interface Combatant extends CombatStats {
  id: string;
  name: string;
  hp: number;
  isAlive: boolean;
}

export type SkillSlotKind = 'basic' | 'active';

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

export interface StatusEffect {
  id: string;
  kind: 'buff' | 'debuff';
  stat: 'atk' | 'def' | 'damageTaken';
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
  isEnemy: boolean;
}

export interface PassiveSkillDef {
  id: string;
  name: string;
  targetRuleOverride?: TargetRule;
  damageMultiplier?: number;
  damageTakenMultiplier?: number;
  healBonus?: number;
  evasionChance?: number;
  activeCooldownRate?: number;
}

export type SkillEffectKind = 'damage' | 'heal' | 'buff' | 'debuff';
export type DamageType = 'physical' | 'magic';

export interface ActiveSkillDef {
  id: string;
  name: string;
  interval: number;
  targetRule: TargetRule;
  effect: SkillEffectKind;
  damageType?: DamageType;
  powerMultiplier?: number;
  buffStat?: StatusEffect['stat'];
  buffMultiplier?: number;
  buffDurationSec?: number;
  debuffStat?: StatusEffect['stat'];
  debuffMultiplier?: number;
  debuffDurationSec?: number;
  range: AttackRange;
  allowedRoles?: Role[];
  allowedClassIds?: ClassId[];
}

export interface EnemyTemplate extends CombatStats {
  id: string;
  displayName: string;
  spriteKey: string;
  activeSkillIds: string[];
}

export interface StageWave {
  enemies: { templateId: string }[];
}

export interface StageDef {
  id: string;
  displayName: string;
  expReward: number;
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

export type BattlePhase = 'idle' | 'running' | 'victory' | 'defeat';

export interface CombatantSnapshot {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  role?: Role;
  spriteKey: string;
  formationRow: FormationRow;
  isEnemy: boolean;
  activeCooldowns: { skillId: string; remaining: number }[];
}

export interface BattleSnapshot {
  phase: BattlePhase;
  worldOffsetX: number;
  allies: CombatantSnapshot[];
  enemies: CombatantSnapshot[];
}
