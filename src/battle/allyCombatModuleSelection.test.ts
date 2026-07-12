import { describe, expect, it, beforeEach, vi } from 'vitest';
import levelCurvesJson from '../../data/levelCurves.json';
import { BattleEngine } from './BattleEngine.ts';
import { loadGameData } from './data/loadGameData.ts';
import {
  createAllyFromMember,
  createAlliesFromPartyState,
  createEnemyFromClassGroup,
  resetEntityIdCounter,
} from './entities.ts';
import { expandEnemyGroups } from './enemyGroupSpawn.ts';
import { loadLevelCurves } from '../progression/levelGrowth.ts';
import { createDefaultSave } from '../progression/victoryRewards.ts';
import { PartyCombatModuleSelection } from './partyCombatModuleSelection.ts';
import { initializeSkillCooldowns, resetCooldownAfterFire } from './skillTrigger.ts';
import { SkillExecutor } from './skills/SkillExecutor.ts';
import { SkillSequenceRunner } from './skills/skillSequence.ts';
import type {
  BattleEventListener,
  CombatantState,
  GameData,
  PartySlotState,
  StageDef,
} from './types.ts';
import { R5_COMBAT_MODULE_CLASS_IDS } from './types.ts';

const levelCurves = loadLevelCurves(levelCurvesJson);

function mockMember(classId: string) {
  return {
    classId,
    build: {
      learnedPassiveIds: [],
      learnedActiveIds: [],
      equippedActiveSlots: [],
    },
    progress: { level: 10, exp: 0 },
  };
}

function createEngineWithSelection(
  gameData: GameData,
  selection: PartyCombatModuleSelection,
  party: PartySlotState[],
) {
  const save = createDefaultSave(gameData, 'demo');
  return new BattleEngine(
    gameData,
    levelCurves,
    () => party,
    () => save.stageProgress.currentStageId,
    {
      getSelectedCombatModuleId: (slotIndex) =>
        selection.getSelectedCombatModuleId(slotIndex),
    },
  );
}

function tickCooldowns(
  engine: BattleEngine,
  units: CombatantState[],
  deltaTime: number,
): void {
  (
    engine as unknown as {
      tickCooldowns: (units: CombatantState[], deltaTime: number) => void;
    }
  ).tickCooldowns(units, deltaTime);
}

function runUnitSkills(engine: BattleEngine, actors: CombatantState[]): void {
  (
    engine as unknown as {
      runUnitSkills: (actors: CombatantState[]) => void;
    }
  ).runUnitSkills(actors);
}

function placeEnemyInBasicRange(
  actor: CombatantState,
  enemy: CombatantState,
): void {
  enemy.battleX = actor.battleX + Math.max(1, actor.traits.rangePx - 1);
}

function createSkillExecutor(
  gameData: GameData,
  allies: CombatantState[],
  enemies: CombatantState[],
) {
  const events: Parameters<BattleEventListener>[0][] = [];
  const runner = new SkillSequenceRunner();
  const executor = new SkillExecutor(gameData, (event) => events.push(event), {
    getSequenceRunner: () => runner,
    getBattleTimeSec: () => 0,
    getAllCombatants: () => [...allies, ...enemies],
  });
  return { executor, events, runner };
}

function stageWithEnemyGroup(classId: string, level = 10): StageDef {
  return {
    id: 'module_enemy_test',
    displayName: 'module enemy test',
    recommendedLevel: level,
    enemyGroups: [{ classId, count: 1 }],
    waves: [{ enemies: [] }],
  };
}

describe('ally combat module selection (R5d)', () => {
  beforeEach(() => {
    resetEntityIdCounter();
  });

  it('1. unspecified ally uses module A (combatModuleIds[0])', () => {
    const gameData = loadGameData();
    const preset = gameData.classRegistry.df_guardian!;
    const ally = createAllyFromMember(
      mockMember('df_guardian'),
      preset,
      levelCurves,
      gameData,
    );
    const basicCd = ally.cooldowns.find((cd) => cd.slotKind === 'basic');
    expect(basicCd?.skillId).toBe('df_guardian_mod_nearest_strike');
  });

  it('2. ally with module B selection uses module B', () => {
    const gameData = loadGameData();
    const preset = gameData.classRegistry.at_swordsman!;
    const ally = createAllyFromMember(
      mockMember('at_swordsman'),
      preset,
      levelCurves,
      gameData,
      'at_swordsman_mod_pierce_slash',
    );
    const basicCd = ally.cooldowns.find((cd) => cd.slotKind === 'basic');
    expect(basicCd?.skillId).toBe('at_swordsman_mod_pierce_slash');
  });

  it('3. module B attackIntervalSec is applied to initial cooldown', () => {
    const gameData = loadGameData();
    const preset = gameData.classRegistry.df_guardian!;
    const moduleB = gameData.combatModuleRegistry.df_guardian_mod_guard_focus;
    const ally = createAllyFromMember(
      mockMember('df_guardian'),
      preset,
      levelCurves,
      gameData,
      moduleB.id,
    );
    initializeSkillCooldowns(ally, gameData.skillRegistry.actives);
    const basicCd = ally.cooldowns.find((cd) => cd.slotKind === 'basic')!;
    expect(basicCd.remaining).toBe(moduleB.attackIntervalSec);
    expect(basicCd.remaining).toBe(3);
  });

  it('4. post-fire cooldown cycle uses module B interval', () => {
    const gameData = loadGameData();
    const preset = gameData.classRegistry.at_sorcerer!;
    const moduleBId = 'at_sorcerer_mod_twin_bolt';
    const interval =
      gameData.combatModuleRegistry[moduleBId].attackIntervalSec;

    const ally = createAllyFromMember(
      mockMember('at_sorcerer'),
      preset,
      levelCurves,
      gameData,
      moduleBId,
    );
    initializeSkillCooldowns(ally, gameData.skillRegistry.actives);
    ally.battleX = 100;

    const enemy: CombatantState = {
      id: 'enemy',
      name: 'enemy',
      hp: 200,
      maxHp: 200,
      atk: 10,
      def: 5,
      res: 0,
      isAlive: true,
      role: 'attacker',
      classId: 'df_paladin',
      formationRow: 'front',
      traits: { rangePx: 30, damageType: 'physical' },
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
      cooldowns: [],
      statusEffects: [],
      barrierHp: 0,
      spriteKey: 'placeholder',
      iconKey: 'placeholder',
      isEnemy: true,
      battleX: 200,
      corpseVisible: true,
    };
    placeEnemyInBasicRange(ally, enemy);

    const engine = createEngineWithSelection(
      gameData,
      new PartyCombatModuleSelection(),
      [mockMember('at_sorcerer')],
    );
    const { executor } = createSkillExecutor(gameData, [ally], [enemy]);
    const basicCd = ally.cooldowns.find((cd) => cd.slotKind === 'basic')!;

    tickCooldowns(engine, [ally], interval);
    expect(basicCd.remaining).toBe(0);
    expect(executor.tryExecute(ally, basicCd, [ally], [enemy])).toBe(true);
    expect(basicCd.remaining).toBe(interval);

    tickCooldowns(engine, [ally], interval);
    expect(basicCd.remaining).toBe(0);
  });

  it('5. invalid module ID for class falls back to module A', () => {
    const gameData = loadGameData();
    const preset = gameData.classRegistry.sp_cleric!;
    const ally = createAllyFromMember(
      mockMember('sp_cleric'),
      preset,
      levelCurves,
      gameData,
      'missing_module',
    );
    expect(ally.cooldowns.find((cd) => cd.slotKind === 'basic')?.skillId).toBe(
      'sp_cleric_mod_single_mend',
    );
  });

  it('6. other class module ID falls back to module A', () => {
    const gameData = loadGameData();
    const preset = gameData.classRegistry.sp_cleric!;
    const ally = createAllyFromMember(
      mockMember('sp_cleric'),
      preset,
      levelCurves,
      gameData,
      'df_guardian_mod_guard_focus',
    );
    expect(ally.cooldowns.find((cd) => cd.slotKind === 'basic')?.skillId).toBe(
      'sp_cleric_mod_single_mend',
    );
  });

  it('7. legacy class keeps synthesized legacy basic skill id', () => {
    const gameData = loadGameData();
    const preset = gameData.classRegistry.df_paladin!;
    const ally = createAllyFromMember(
      mockMember('df_paladin'),
      preset,
      levelCurves,
      gameData,
      'df_guardian_mod_nearest_strike',
    );
    expect(ally.cooldowns.find((cd) => cd.slotKind === 'basic')?.skillId).toBe(
      'df_paladin_basic_attack',
    );
  });

  it('8. same class in different party slots can hold independent selections', () => {
    const gameData = loadGameData();
    const selection = new PartyCombatModuleSelection();
    selection.setSelectedCombatModuleId(0, 'df_guardian_mod_nearest_strike');
    selection.setSelectedCombatModuleId(1, 'df_guardian_mod_guard_focus');

    const party: PartySlotState[] = [
      mockMember('df_guardian'),
      mockMember('df_guardian'),
      null,
      null,
    ];
    const allies = createAlliesFromPartyState(
      gameData,
      party,
      levelCurves,
      (slotIndex) => selection.getSelectedCombatModuleId(slotIndex),
    );

    expect(allies[0]?.cooldowns.find((cd) => cd.slotKind === 'basic')?.skillId).toBe(
      'df_guardian_mod_nearest_strike',
    );
    expect(allies[1]?.cooldowns.find((cd) => cd.slotKind === 'basic')?.skillId).toBe(
      'df_guardian_mod_guard_focus',
    );
  });

  it('9. syncPartyBuilds updates basic skillId after module selection change', () => {
    const gameData = loadGameData();
    const selection = new PartyCombatModuleSelection();
    const party: PartySlotState[] = [mockMember('at_swordsman'), null, null, null];
    const engine = createEngineWithSelection(gameData, selection, party);

    engine.restartBattle();
    const internals = engine as unknown as {
      phase: string;
      players: CombatantState[];
      syncPartyBuilds: () => void;
    };
    internals.phase = 'running';

    const ally = internals.players[0]!;
    expect(ally.cooldowns.find((cd) => cd.slotKind === 'basic')?.skillId).toBe(
      'at_swordsman_mod_single_slash',
    );

    selection.setSelectedCombatModuleId(0, 'at_swordsman_mod_pierce_slash');
    internals.syncPartyBuilds();

    expect(ally.cooldowns.find((cd) => cd.slotKind === 'basic')?.skillId).toBe(
      'at_swordsman_mod_pierce_slash',
    );
    initializeSkillCooldowns(ally, gameData.skillRegistry.actives);
    expect(
      ally.cooldowns.find((cd) => cd.slotKind === 'basic')?.remaining,
    ).toBe(3);
  });

  it('10. does not double-fire legacy basic or both module A/B in runUnitSkills', () => {
    const gameData = loadGameData();
    const preset = gameData.classRegistry.df_guardian!;
    const ally = createAllyFromMember(
      mockMember('df_guardian'),
      preset,
      levelCurves,
      gameData,
      'df_guardian_mod_guard_focus',
    );
    initializeSkillCooldowns(ally, gameData.skillRegistry.actives);
    const basicCd = ally.cooldowns.find((cd) => cd.slotKind === 'basic')!;
    basicCd.remaining = 0;
    ally.battleX = 100;

    const enemy: CombatantState = {
      id: 'enemy',
      name: 'enemy',
      hp: 200,
      maxHp: 200,
      atk: 10,
      def: 5,
      res: 0,
      isAlive: true,
      role: 'attacker',
      classId: 'df_paladin',
      formationRow: 'front',
      traits: { rangePx: 30, damageType: 'physical' },
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
      cooldowns: [],
      statusEffects: [],
      barrierHp: 0,
      spriteKey: 'placeholder',
      iconKey: 'placeholder',
      isEnemy: true,
      battleX: 150,
      corpseVisible: true,
    };

    const engine = createEngineWithSelection(
      gameData,
      new PartyCombatModuleSelection(),
      [mockMember('df_guardian')],
    );
    const internals = engine as unknown as {
      players: CombatantState[];
      enemies: CombatantState[];
      executor: SkillExecutor;
    };
    internals.players = [ally];
    internals.enemies = [enemy];

    const firedSkillIds: string[] = [];
    const originalTryExecute = internals.executor.tryExecute.bind(
      internals.executor,
    );
    vi.spyOn(internals.executor, 'tryExecute').mockImplementation(
      (actor, cd, allies, enemies) => {
        const fired = originalTryExecute(actor, cd, allies, enemies);
        if (fired && cd.slotKind === 'basic') {
          firedSkillIds.push(cd.skillId);
        }
        return fired;
      },
    );

    placeEnemyInBasicRange(ally, enemy);
    runUnitSkills(engine, [ally]);

    expect(firedSkillIds).toEqual(['df_guardian_mod_guard_focus']);
    expect(firedSkillIds).not.toContain(preset.basicAttackSkillId);
    expect(firedSkillIds).not.toContain('df_guardian_mod_nearest_strike');
  });

  it('11. enemies are unaffected by ally module selection and keep module A', () => {
    const gameData = loadGameData();
    const selection = new PartyCombatModuleSelection();
    selection.setSelectedCombatModuleId(0, 'df_guardian_mod_guard_focus');

    const preset = gameData.classRegistry.at_sorcerer!;
    const stage = stageWithEnemyGroup('at_sorcerer');
    const spec = expandEnemyGroups(stage)[0]!;
    const enemy = createEnemyFromClassGroup(
      spec,
      preset,
      gameData,
      levelCurves,
    );

    expect(enemy.cooldowns.find((cd) => cd.slotKind === 'basic')?.skillId).toBe(
      'at_sorcerer_mod_single_bolt',
    );
    expect(enemy.cooldowns.find((cd) => cd.slotKind === 'basic')?.skillId).not.toBe(
      'at_sorcerer_mod_twin_bolt',
    );
  });

  it('covers all R5 classes with A/B resolution', () => {
    const gameData = loadGameData();
    const moduleBByClass: Record<string, string> = {
      df_guardian: 'df_guardian_mod_guard_focus',
      at_swordsman: 'at_swordsman_mod_pierce_slash',
      at_sorcerer: 'at_sorcerer_mod_twin_bolt',
      sp_cleric: 'sp_cleric_mod_party_mend',
    };

    for (const classId of R5_COMBAT_MODULE_CLASS_IDS) {
      const preset = gameData.classRegistry[classId]!;
      const moduleA = preset.combatModuleIds?.[0];
      const moduleB = moduleBByClass[classId];

      const allyA = createAllyFromMember(
        mockMember(classId),
        preset,
        levelCurves,
        gameData,
      );
      expect(allyA.cooldowns.find((cd) => cd.slotKind === 'basic')?.skillId).toBe(
        moduleA,
      );

      const allyB = createAllyFromMember(
        mockMember(classId),
        preset,
        levelCurves,
        gameData,
        moduleB,
      );
      expect(allyB.cooldowns.find((cd) => cd.slotKind === 'basic')?.skillId).toBe(
        moduleB,
      );
    }
  });

  it('resetCooldownAfterFire uses selected module B attackIntervalSec', () => {
    const gameData = loadGameData();
    const skill = gameData.skillRegistry.actives.at_swordsman_mod_pierce_slash!;
    const cd = { skillId: skill.id, remaining: 0, slotKind: 'basic' as const };
    resetCooldownAfterFire(cd, skill);
    expect(cd.remaining).toBe(
      gameData.combatModuleRegistry.at_swordsman_mod_pierce_slash
        .attackIntervalSec,
    );
    expect(cd.remaining).toBe(3);
  });

  it('PartyCombatModuleSelection API clears to default', () => {
    const selection = new PartyCombatModuleSelection();
    selection.setSelectedCombatModuleId(0, 'at_sorcerer_mod_twin_bolt');
    expect(selection.getSelectedCombatModuleId(0)).toBe('at_sorcerer_mod_twin_bolt');

    selection.clearSelectedCombatModuleId(0);
    expect(selection.getSelectedCombatModuleId(0)).toBeUndefined();

    selection.setSelectedCombatModuleId(0, 'at_sorcerer_mod_twin_bolt');
    selection.resetToDefault(0);
    expect(selection.getSelectedCombatModuleId(0)).toBeUndefined();
  });

  it('syncPartyBuilds re-initializes cooldowns when module changes (old CD state does not linger)', () => {
    const gameData = loadGameData();
    const selection = new PartyCombatModuleSelection();
    const party: PartySlotState[] = [mockMember('df_guardian'), null, null, null];
    const engine = createEngineWithSelection(gameData, selection, party);
    engine.restartBattle();

    const internals = engine as unknown as {
      phase: string;
      players: CombatantState[];
      syncPartyBuilds: () => void;
    };
    internals.phase = 'running';
    const ally = internals.players[0]!;
    const basicCd = ally.cooldowns.find((cd) => cd.slotKind === 'basic')!;
    basicCd.remaining = 0.5;

    selection.setSelectedCombatModuleId(0, 'df_guardian_mod_guard_focus');
    internals.syncPartyBuilds();
    initializeSkillCooldowns(ally, gameData.skillRegistry.actives);

    const syncedBasicCd = ally.cooldowns.find((cd) => cd.slotKind === 'basic')!;
    expect(syncedBasicCd.skillId).toBe('df_guardian_mod_guard_focus');
    expect(syncedBasicCd.remaining).toBe(3);
  });
});
