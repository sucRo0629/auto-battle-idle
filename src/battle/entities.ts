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
  StageEnemyGroup,
} from './types.ts';
import { resolveEnemySpawnBattleX } from './battleConstants.ts';
import { resolveClassFormationRow } from './partyFormation.ts';
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
import { syncIronGuardianModuleStatusEffects } from './ironGuardianM2.ts';
import {
  computeStatsAtLevel,
  type LevelCurvesConfig,
} from '../progression/levelGrowth.ts';
import { resolveRuntimeActiveSkillIds } from '../progression/battleActiveSkills.ts';
import {
  validatePartyClassIds,
  type PartyValidationResult,
} from '../progression/partyCompose.ts';
import {
  getUnlockedActiveSlotCount,
  getUnlockedSkillSlotCount,
  MAX_ACTIVE_SLOTS,
} from '../progression/skillBuild.ts';
import { resolveLearnedSkills } from '../progression/skillUnlocks.ts';
import { resolveBasicAttackSkillIdFromGameData } from './data/resolveCombatModuleBasic.ts';
import { mergeOperationPassivesIntoBuild } from './mergeOperationPassivesIntoBuild.ts';

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
  selectedCombatModuleId?: string | null,
): CombatantState {
  const basicSkillId =
    gameData !== undefined
      ? resolveBasicAttackSkillIdFromGameData(
          classPreset,
          gameData,
          selectedCombatModuleId,
        )
      : classPreset.basicAttackSkillId;
  const activeSkillIds =
    gameData && 'progress' in member
      ? resolveRuntimeActiveSkillIds(
          member.build,
          getUnlockedActiveSlotCount(member, gameData),
          basicSkillId,
          gameData.combatModuleRegistry,
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
          res: classPreset.res,
        };

  const combatant: CombatantState = {
    id: nextId(classPreset.id),
    name: classPreset.displayName,
    role: classPreset.role,
    classId: classPreset.id,
    formationRow: resolveClassFormationRow(
      classPreset.role,
      classPreset.formationRow,
    ),
    traits: copyTraits(classPreset.traits),
    build: structuredClone(member.build),
    maxHp: stats.maxHp,
    atk: stats.atk,
    def: stats.def,
    res: stats.res,
    hp: stats.maxHp,
    barrierHp: 0,
    isAlive: true,
    cooldowns: createCooldowns(
      basicSkillId,
      member.build,
      activeSkillIds,
    ),
    statusEffects: [],
    spriteKey: resolveClassSpriteKey(classPreset, gameData.skillRegistry),
    iconKey: resolveClassIconKey(classPreset, gameData.skillRegistry),
    isEnemy: false,
    battleX: 0,
    corpseVisible: true,
  };
  if (gameData !== undefined) {
    syncIronGuardianModuleStatusEffects(
      combatant,
      gameData.combatModuleRegistry,
    );
  }
  return combatant;
}

function copyTraits(traits: NormalizedEntityTraits): NormalizedEntityTraits {
  return copyNormalizedTraits(traits);
}

export class PartyDuplicateClassError extends Error {
  readonly reason = 'duplicateClass' as const;

  constructor(public readonly validation: PartyValidationResult) {
    super(
      validation.duplicateClassId
        ? `Party contains duplicate classId: ${validation.duplicateClassId}`
        : 'Party contains duplicate classId',
    );
  }
}

export function createAlliesFromPartyState(
  gameData: GameData,
  party: PartySlotState[],
  curves: LevelCurvesConfig,
  getSelectedCombatModuleId?: (slotIndex: number) => string | undefined,
  getAcquiredOperationPassiveIds?: (slotIndex: number) => readonly string[],
): CombatantState[] {
  const validation = validatePartyClassIds(party);
  if (!validation.ok) {
    throw new PartyDuplicateClassError(validation);
  }
  const allies: CombatantState[] = [];
  party.forEach((member, slotIndex) => {
    if (!member) return;
    const preset = gameData.classRegistry[member.classId];
    if (!preset) {
      throw new Error(`Class not found: ${member.classId}`);
    }
    const ally = {
      ...createAllyFromMember(
        member,
        preset,
        curves,
        gameData,
        getSelectedCombatModuleId?.(slotIndex),
      ),
      partySlotIndex: slotIndex,
    };
    mergeOperationPassivesIntoBuild(
      ally.build,
      member.classId,
      getAcquiredOperationPassiveIds?.(slotIndex) ?? [],
      gameData.skillRegistry.passives,
      gameData.operationPassiveCatalog,
    );
    allies.push(ally);
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
    return createAllyFromMember(member, preset, undefined, gameData);
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
    res: template.res,
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
  const basicSkillId = resolveBasicAttackSkillIdFromGameData(
    classPreset,
    gameData,
    spec.selectedCombatModuleId,
  );
  const activeSkillIds = resolveRuntimeActiveSkillIds(
    build,
    unlockedSlots,
    basicSkillId,
    gameData.combatModuleRegistry,
  );
  const battleX = resolveEnemySpawnBattleX(spawnOffset);
  const cooldowns = createCooldowns(
    basicSkillId,
    build,
    activeSkillIds,
  );

  const combatant: CombatantState = {
    id: nextId(classPreset.id),
    name: classPreset.displayName,
    role: classPreset.role,
    classId: classPreset.id,
    formationRow: resolveClassFormationRow(
      classPreset.role,
      classPreset.formationRow,
    ),
    traits: copyTraits(classPreset.traits),
    build,
    maxHp: stats.maxHp,
    atk: stats.atk,
    def: stats.def,
    res: stats.res,
    hp: stats.maxHp,
    barrierHp: 0,
    isAlive: true,
    cooldowns,
    statusEffects: [],
    spriteKey: resolveClassSpriteKey(classPreset, gameData.skillRegistry),
    iconKey: resolveClassIconKey(classPreset, gameData.skillRegistry),
    isEnemy: true,
    battleX,
    spawnX: spawnOffset,
    corpseVisible: true,
  };
  syncIronGuardianModuleStatusEffects(
    combatant,
    gameData.combatModuleRegistry,
  );
  return combatant;
}

function createEnemiesFromEnemyGroups(
  stage: NonNullable<GameData['stages'][number]>,
  gameData: GameData,
  curves: LevelCurvesConfig,
  enemyGroups?: StageEnemyGroup[],
): CombatantState[] {
  const specs = expandEnemyGroups(
    enemyGroups !== undefined ? { ...stage, enemyGroups } : stage,
  );
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

  const wave = stage.waves[waveIndex];
  const waveEnemyGroups = wave?.enemyGroups;
  if (waveEnemyGroups && waveEnemyGroups.length > 0) {
    if (!wave) {
      throw new Error(`Wave not found: ${stageId} wave ${waveIndex}`);
    }
    if (!levelCurves) {
      throw new Error(
        `levelCurves is required for enemyGroups spawn (stage: ${stageId}, wave: ${waveIndex})`,
      );
    }
    return createEnemiesFromEnemyGroups(
      stage,
      gameData,
      levelCurves,
      waveEnemyGroups,
    );
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
