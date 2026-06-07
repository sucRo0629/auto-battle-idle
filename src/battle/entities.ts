import type {
  CharacterBuild,
  ClassPreset,
  CombatantState,
  EnemyTemplate,
  GameData,
  PartyMemberDef,
  PartyMemberState,
  SkillCooldown,
} from './types.ts';
import { DEFAULT_MELEE_RANGE_PX } from './types.ts';
import {
  resolveClassIconKey,
  resolveClassSpriteKey,
} from './classVisuals.ts';
import {
  computeStatsAtLevel,
  type LevelCurvesConfig,
} from '../progression/levelGrowth.ts';

let idCounter = 0;

function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${idCounter}`;
}

export function resetEntityIdCounter(): void {
  idCounter = 0;
}

function createCooldowns(
  basicSkillId: string,
  build: CharacterBuild,
): SkillCooldown[] {
  const cooldowns: SkillCooldown[] = [
    { skillId: basicSkillId, remaining: 0, slotKind: 'basic' },
  ];
  for (let i = 0; i < build.equippedActiveSlots.length; i++) {
    const skillId = build.equippedActiveSlots[i];
    if (skillId) {
      cooldowns.push({
        skillId,
        remaining: 0,
        slotKind: 'active',
        slotIndex: i,
      });
    }
  }
  return cooldowns;
}

export function createAllyFromMember(
  member: PartyMemberDef | PartyMemberState,
  classPreset: ClassPreset,
  curves?: LevelCurvesConfig,
): CombatantState {
  const stats =
    curves && 'progress' in member
      ? computeStatsAtLevel(
          classPreset,
          member.classId,
          member.progress.level,
          curves,
        )
      : {
          maxHp: classPreset.maxHp,
          atk: classPreset.atk,
          def: classPreset.def,
          reg: classPreset.reg,
        };

  return {
    id: nextId(classPreset.id),
    name: classPreset.displayName,
    role: classPreset.role,
    classId: classPreset.id,
    formationRow: classPreset.formationRow,
    traits: {
      ...classPreset.traits,
      rangePx: classPreset.traits.rangePx ?? DEFAULT_MELEE_RANGE_PX,
    },
    build: structuredClone(member.build),
    maxHp: stats.maxHp,
    atk: stats.atk,
    def: stats.def,
    reg: stats.reg,
    hp: stats.maxHp,
    isAlive: true,
    cooldowns: createCooldowns(classPreset.basicAttackSkillId, member.build),
    statusEffects: [],
    spriteKey: resolveClassSpriteKey(classPreset),
    iconKey: resolveClassIconKey(classPreset),
    isEnemy: false,
    visualX: 0,
  };
}

export function createAlliesFromPartyState(
  gameData: GameData,
  party: PartyMemberState[],
  curves: LevelCurvesConfig,
): CombatantState[] {
  return party.map((member) => {
    const preset = gameData.classRegistry[member.classId];
    if (!preset) {
      throw new Error(`Class not found: ${member.classId}`);
    }
    return createAllyFromMember(member, preset, curves);
  });
}

export function createAlliesFromParty(
  gameData: GameData,
  partyId: string,
): CombatantState[] {
  const party = gameData.parties[partyId];
  if (!party) {
    throw new Error(`Party not found: ${partyId}`);
  }
  return party.members.map((member) => {
    const preset = gameData.classRegistry[member.classId];
    if (!preset) {
      throw new Error(`Class not found: ${member.classId}`);
    }
    return createAllyFromMember(member, preset);
  });
}

export function createEnemyFromTemplate(
  template: EnemyTemplate,
  spawnX: number,
): CombatantState {
  const skillIds = template.activeSkillIds ?? [];
  const equipped = skillIds.slice(0, 1);
  const build: CharacterBuild = {
    learnedPassiveIds: [],
    learnedActiveIds: [...skillIds],
    equippedActiveSlots: equipped,
  };
  const cooldowns: SkillCooldown[] = equipped.map((skillId, i) => ({
    skillId,
    remaining: 0,
    slotKind: 'active',
    slotIndex: i,
  }));
  return {
    id: nextId(template.id),
    name: template.displayName,
    role: 'attacker',
    classId: template.id,
    formationRow: 'front',
    traits: {
      attackRange: 'melee',
      rangePx: template.rangePx ?? DEFAULT_MELEE_RANGE_PX,
    },
    build,
    maxHp: template.maxHp,
    atk: template.atk,
    def: template.def,
    reg: template.reg,
    hp: template.maxHp,
    isAlive: true,
    cooldowns,
    statusEffects: [],
    spriteKey: template.spriteKey,
    iconKey: 'default',
    isEnemy: true,
    visualX: spawnX,
    spawnX,
  };
}

export function createEnemiesForStage(
  gameData: GameData,
  stageId: string,
  waveIndex = 0,
): CombatantState[] {
  const stage = gameData.stages.find((s) => s.id === stageId);
  if (!stage || stage.waves.length === 0) {
    throw new Error(`Stage not found: ${stageId}`);
  }
  const wave = stage.waves[waveIndex];
  if (!wave) {
    throw new Error(`Wave not found: ${stageId} wave ${waveIndex}`);
  }
  return wave.enemies.map(({ templateId, spawnX }) => {
    const template = gameData.enemyRegistry[templateId];
    if (!template) {
      throw new Error(`Enemy template not found: ${templateId}`);
    }
    return createEnemyFromTemplate(template, spawnX);
  });
}

export function healAllAllies(allies: CombatantState[]): void {
  for (const ally of allies) {
    ally.hp = ally.maxHp;
    ally.isAlive = true;
    ally.statusEffects = [];
  }
}
