import type {
  CharacterBuild,
  ClassPreset,
  CombatantState,
  EnemyTemplate,
  GameData,
  PartyMemberDef,
  PartyMemberState,
  PartySlotState,
  ResolvedEnemySpawnSpec,
  SkillCooldown,
} from './types.ts';
import { resolveEnemySpawnBattleX } from './battleConstants.ts';
import { copyNormalizedTraits } from './data/entityTraits.ts';
import type { NormalizedEntityTraits } from './types.ts';
import {
  applyEnemyStatScales,
  expandEnemyGroups,
} from './enemyGroupSpawn.ts';
import { resolveEnemyGroupSpawnX } from './enemyFormation.ts';
import {
  resolveClassIconKey,
  resolveClassSpriteKey,
  resolveEnemySpriteKey,
} from '../render/entityVisuals.ts';
import {
  computeStatsAtLevel,
  type LevelCurvesConfig,
} from '../progression/levelGrowth.ts';
import { resolveBattleActiveSkillIds } from '../progression/battleActiveSkills.ts';
import {
  getUnlockedActiveSlotCount,
  getUnlockedSkillSlotCount,
  MAX_ACTIVE_SLOTS,
} from '../progression/skillBuild.ts';
import { resolveLearnedSkills } from '../progression/skillUnlocks.ts';

let idCounter = 0;

function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${idCounter}`;
}

export function resetEntityIdCounter(): void {
  idCounter = 0;
}

export function createCooldowns(
  basicSkillId: string,
  build: CharacterBuild,
  activeSkillIds: string[],
): SkillCooldown[] {
  const cooldowns: SkillCooldown[] = [
    { skillId: basicSkillId, remaining: 0, slotKind: 'basic' },
  ];
  activeSkillIds.forEach((skillId, index) => {
    if (!skillId) return;
    cooldowns.push({
      skillId,
      remaining: 0,
      slotKind: 'active',
      slotIndex: index,
      storedCharges: 0,
    });
  });
  return cooldowns;
}

export function createAllyFromMember(
  member: PartyMemberDef | PartyMemberState,
  classPreset: ClassPreset,
  curves?: LevelCurvesConfig,
  gameData?: GameData,
): CombatantState {
  const activeSkillIds =
    gameData && 'progress' in member
      ? resolveBattleActiveSkillIds(
          member.build,
          getUnlockedActiveSlotCount(member, gameData),
        )
      : member.build.learnedActiveIds.slice(0, MAX_ACTIVE_SLOTS);
  const stats =
    curves && 'progress' in member
      ? computeStatsAtLevel(
          classPreset,
          classPreset,
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
    traits: copyTraits(classPreset.traits),
    build: structuredClone(member.build),
    maxHp: stats.maxHp,
    atk: stats.atk,
    def: stats.def,
    reg: stats.reg,
    hp: stats.maxHp,
    barrierHp: 0,
    isAlive: true,
    cooldowns: createCooldowns(
      classPreset.basicAttackSkillId,
      member.build,
      activeSkillIds,
    ),
    statusEffects: [],
    spriteKey: resolveClassSpriteKey(classPreset),
    iconKey: resolveClassIconKey(classPreset),
    isEnemy: false,
    battleX: 0,
    corpseVisible: true,
  };
}

function copyTraits(traits: NormalizedEntityTraits): NormalizedEntityTraits {
  return copyNormalizedTraits(traits);
}

export function createAlliesFromPartyState(
  gameData: GameData,
  party: PartySlotState[],
  curves: LevelCurvesConfig,
): CombatantState[] {
  const allies: CombatantState[] = [];
  party.forEach((member, slotIndex) => {
    if (!member) return;
    const preset = gameData.classRegistry[member.classId];
    if (!preset) {
      throw new Error(`Class not found: ${member.classId}`);
    }
    allies.push({
      ...createAllyFromMember(member, preset, curves, gameData),
      partySlotIndex: slotIndex,
    });
  });
  return allies;
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
  spawnOffset: number,
): CombatantState {
  const battleX = resolveEnemySpawnBattleX(spawnOffset);
  const activeSkillIds = template.activeSkillIds ?? [];
  const build: CharacterBuild = {
    learnedPassiveIds: template.passiveSkillIds ?? [],
    learnedActiveIds: [...activeSkillIds],
    equippedActiveSlots: [...activeSkillIds],
  };
  const cooldowns = createCooldowns(
    template.basicAttackSkillId,
    build,
    activeSkillIds,
  );
  return {
    id: nextId(template.id),
    name: template.displayName,
    role: 'attacker',
    classId: template.id,
    formationRow: 'front',
    traits: enemyTraitsFromTemplate(template),
    build,
    maxHp: template.maxHp,
    atk: template.atk,
    def: template.def,
    reg: template.reg,
    hp: template.maxHp,
    barrierHp: 0,
    isAlive: true,
    cooldowns,
    statusEffects: [],
    spriteKey: resolveEnemySpriteKey(template),
    iconKey: 'default',
    isEnemy: true,
    battleX,
    spawnX: spawnOffset,
    corpseVisible: true,
  };
}

function enemyTraitsFromTemplate(
  template: EnemyTemplate,
): NormalizedEntityTraits {
  return copyNormalizedTraits(template.traits);
}

/** Phase B2+: enemyGroups 中間スペックから CombatantState を生成 */
export function createEnemyFromClassGroup(
  spec: ResolvedEnemySpawnSpec,
  classPreset: ClassPreset,
  gameData: GameData,
  curves: LevelCurvesConfig,
  spawnOffset = 0,
): CombatantState {
  const baseStats = computeStatsAtLevel(
    classPreset,
    classPreset,
    spec.level,
    curves,
  );
  const stats = applyEnemyStatScales(baseStats, spec);
  const learned = resolveLearnedSkills(
    classPreset,
    spec.level,
    gameData.skillRegistry,
  );
  const unlockedSlots = getUnlockedSkillSlotCount(spec.level);
  const build: CharacterBuild = {
    learnedPassiveIds: [...learned.learnedPassiveIds],
    learnedActiveIds: [...learned.learnedActiveIds],
    equippedActiveSlots: [],
  };
  const activeSkillIds = resolveBattleActiveSkillIds(build, unlockedSlots);
  const battleX = resolveEnemySpawnBattleX(spawnOffset);
  const cooldowns = createCooldowns(
    classPreset.basicAttackSkillId,
    build,
    activeSkillIds,
  );

  return {
    id: nextId(classPreset.id),
    name: classPreset.displayName,
    role: classPreset.role,
    classId: classPreset.id,
    formationRow: classPreset.formationRow,
    traits: copyTraits(classPreset.traits),
    build,
    maxHp: stats.maxHp,
    atk: stats.atk,
    def: stats.def,
    reg: stats.reg,
    hp: stats.maxHp,
    barrierHp: 0,
    isAlive: true,
    cooldowns,
    statusEffects: [],
    spriteKey: resolveClassSpriteKey(classPreset),
    iconKey: resolveClassIconKey(classPreset),
    isEnemy: true,
    battleX,
    spawnX: spawnOffset,
    corpseVisible: true,
  };
}

function createEnemiesFromEnemyGroups(
  stage: NonNullable<GameData['stages'][number]>,
  gameData: GameData,
  curves: LevelCurvesConfig,
): CombatantState[] {
  const specs = expandEnemyGroups(stage);
  const spawnXByKey = resolveEnemyGroupSpawnX(specs, (classId) => {
    const preset = gameData.classRegistry[classId];
    if (!preset) {
      throw new Error(`Class not found for enemy group: ${classId}`);
    }
    return preset.traits.rangePx;
  });
  return specs.map((spec) => {
    const preset = gameData.classRegistry[spec.classId];
    if (!preset) {
      throw new Error(`Class not found for enemy group: ${spec.classId}`);
    }
    const spawnOffset = spawnXByKey.get(spec.spawnUnitKey) ?? 0;
    return createEnemyFromClassGroup(
      spec,
      preset,
      gameData,
      curves,
      spawnOffset,
    );
  });
}

export function createEnemiesForStage(
  gameData: GameData,
  stageId: string,
  waveIndex = 0,
  levelCurves?: LevelCurvesConfig,
): CombatantState[] {
  const stage = gameData.stages.find((s) => s.id === stageId);
  if (!stage || stage.waves.length === 0) {
    throw new Error(`Stage not found: ${stageId}`);
  }

  if (stage.enemyGroups) {
    if (waveIndex !== 0) {
      return [];
    }
    if (!levelCurves) {
      throw new Error(
        `levelCurves is required for enemyGroups spawn (stage: ${stageId})`,
      );
    }
    return createEnemiesFromEnemyGroups(stage, gameData, levelCurves);
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

export function resetPerWaveCombatantFlags(allies: CombatantState[]): void {
  for (const ally of allies) {
    delete ally.barrierBreakRegenUsed;
    delete ally.barrierDepletionHealUsed;
    delete ally.lastStandInvulnerableUsed;
    delete ally.lastStandRecoveryUsed;
    delete ally.lastStandGutsUsed;
  }
}

export function healAllAllies(allies: CombatantState[]): void {
  for (const ally of allies) {
    ally.hp = ally.maxHp;
    ally.barrierHp = 0;
    ally.isAlive = true;
    ally.corpseVisible = true;
    ally.statusEffects = [];
  }
}

/** Wave 移行: 倒れた味方のフィールド表示だけ消す（戦闘状態は維持） */
export function hideFallenAllyCorpses(allies: CombatantState[]): void {
  for (const ally of allies) {
    if (!ally.isAlive) {
      ally.corpseVisible = false;
    }
  }
}
