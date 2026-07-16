import { describe, expect, it, beforeEach, vi } from 'vitest';
import levelCurvesJson from '../../data/levelCurves.json';
import { BattleEngine } from './BattleEngine.ts';
import { getEffectiveDef } from './combatMath.ts';
import { loadGameData } from './data/loadGameData.ts';
import {
  createAllyFromMember,
  createEnemyFromClassGroup,
  resetEntityIdCounter,
} from './entities.ts';
import { expandEnemyGroups } from './enemyGroupSpawn.ts';
import { syncBuffAuras } from './passiveEffects.ts';
import { loadLevelCurves } from '../progression/levelGrowth.ts';
import { resolveLearnedSkills } from '../progression/skillUnlocks.ts';
import { createDefaultSave } from '../progression/victoryRewards.ts';
import { initializeSkillCooldowns } from './skillTrigger.ts';
import { SkillExecutor } from './skills/SkillExecutor.ts';
import type { CombatantState, GameData, StageDef } from './types.ts';
import { R5_COMBAT_MODULE_CLASS_IDS } from './types.ts';

const levelCurves = loadLevelCurves(levelCurvesJson);

function mockMemberAtLevel(classId: string, level: number, gameData: GameData) {
  const preset = gameData.classRegistry[classId]!;
  const learned = resolveLearnedSkills(preset, level, gameData.skillRegistry);
  return {
    classId,
    build: {
      learnedPassiveIds: [...learned.learnedPassiveIds],
      learnedActiveIds: [...learned.learnedActiveIds],
      equippedActiveSlots: [...learned.learnedActiveIds],
    },
    progress: { level, exp: 0 },
  };
}

function createMinimalEngine(gameData: GameData = loadGameData()) {
  const save = createDefaultSave(gameData, 'demo');
  return new BattleEngine(
    gameData,
    levelCurves,
    () => save.party,
    () => save.stageProgress.currentStageId,
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

function mockTargetEnemy(id: string, battleX: number): CombatantState {
  return {
    id,
    name: 'enemy',
    hp: 500,
    maxHp: 500,
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
    battleX,
    corpseVisible: true,
  };
}

function stageWithEnemyGroup(classId: string, level = 10): StageDef {
  return {
    id: 'legacy_active_suppression_enemy',
    displayName: 'legacy active suppression enemy',
    recommendedLevel: level,
    enemyGroups: [{ classId, count: 1 }],
    waves: [{ enemies: [] }],
  };
}

describe('R9.5a combat module legacy active suppression', () => {
  beforeEach(() => {
    resetEntityIdCounter();
  });

  it.each(R5_COMBAT_MODULE_CLASS_IDS.map((classId) => ({ classId })))(
    'does not register legacy active cooldowns for $classId',
    ({ classId }) => {
      const gameData = loadGameData();
      const preset = gameData.classRegistry[classId]!;
      const member = mockMemberAtLevel(classId, 10, gameData);
      expect(member.build.learnedActiveIds.length).toBeGreaterThan(0);

      const ally = createAllyFromMember(
        member,
        preset,
        levelCurves,
        gameData,
      );
      const activeCds = ally.cooldowns.filter((cd) => cd.slotKind === 'active');
      expect(activeCds).toHaveLength(0);
      expect(ally.cooldowns.some((cd) => cd.slotKind === 'basic')).toBe(true);
    },
  );

  it('runs module basic but never legacy actives for df_guardian over simulated combat', () => {
    const gameData = loadGameData();
    const preset = gameData.classRegistry.df_guardian!;
    const member = mockMemberAtLevel('df_guardian', 10, gameData);
    const ally = createAllyFromMember(
      member,
      preset,
      levelCurves,
      gameData,
    );
    initializeSkillCooldowns(ally, gameData.skillRegistry.actives);
    ally.battleX = 100;

    const enemy = mockTargetEnemy('enemy', 150);
    placeEnemyInBasicRange(ally, enemy);

    const engine = createMinimalEngine(gameData);
    const internals = engine as unknown as {
      players: CombatantState[];
      enemies: CombatantState[];
      executor: SkillExecutor;
    };
    internals.players = [ally];
    internals.enemies = [enemy];

    const legacyActiveIds = new Set(member.build.learnedActiveIds);
    const activeExecutions: string[] = [];
    const basicExecutions: string[] = [];
    const originalTryExecute = internals.executor.tryExecute.bind(
      internals.executor,
    );
    vi.spyOn(internals.executor, 'tryExecute').mockImplementation(
      (actor, cd, allies, enemies) => {
        const fired = originalTryExecute(actor, cd, allies, enemies);
        if (!fired) return false;
        if (cd.slotKind === 'active' && legacyActiveIds.has(cd.skillId)) {
          activeExecutions.push(cd.skillId);
        }
        if (cd.slotKind === 'basic') {
          basicExecutions.push(cd.skillId);
        }
        return fired;
      },
    );

    for (let i = 0; i < 120; i++) {
      tickCooldowns(engine, [ally], 0.5);
      runUnitSkills(engine, [ally]);
    }

    expect(basicExecutions.length).toBeGreaterThan(0);
    expect(basicExecutions.every((id) => id === 'df_guardian_mod_nearest_strike')).toBe(
      true,
    );
    expect(activeExecutions).toEqual([]);
  });

  it('keeps legacy active runtime for non-module class df_duelist', () => {
    const gameData = loadGameData();
    const preset = gameData.classRegistry.df_duelist!;
    expect(preset.combatModuleIds).toBeUndefined();
    const member = mockMemberAtLevel('df_duelist', 20, gameData);
    const ally = createAllyFromMember(
      member,
      preset,
      levelCurves,
      gameData,
    );
    initializeSkillCooldowns(ally, gameData.skillRegistry.actives);

    const activeCds = ally.cooldowns.filter((cd) => cd.slotKind === 'active');
    expect(activeCds.length).toBeGreaterThan(0);

    for (const cd of activeCds) {
      cd.remaining = 0;
    }
    ally.battleX = 100;
    const enemy = mockTargetEnemy('enemy', 150);
    placeEnemyInBasicRange(ally, enemy);

    const engine = createMinimalEngine(gameData);
    const internals = engine as unknown as {
      players: CombatantState[];
      enemies: CombatantState[];
      executor: SkillExecutor;
    };
    internals.players = [ally];
    internals.enemies = [enemy];

    const legacyActiveIds = new Set(member.build.learnedActiveIds);
    const activeExecutions: string[] = [];
    const originalTryExecute = internals.executor.tryExecute.bind(
      internals.executor,
    );
    vi.spyOn(internals.executor, 'tryExecute').mockImplementation(
      (actor, cd, allies, enemies) => {
        const fired = originalTryExecute(actor, cd, allies, enemies);
        if (fired && cd.slotKind === 'active' && legacyActiveIds.has(cd.skillId)) {
          activeExecutions.push(cd.skillId);
        }
        return fired;
      },
    );

    runUnitSkills(engine, [ally]);
    expect(activeExecutions.length).toBeGreaterThan(0);
  });

  it('suppresses legacy actives for module class df_paladin', () => {
    const gameData = loadGameData();
    const preset = gameData.classRegistry.df_paladin!;
    expect(preset.combatModuleIds).toHaveLength(2);
    const member = mockMemberAtLevel('df_paladin', 20, gameData);
    const ally = createAllyFromMember(
      member,
      preset,
      levelCurves,
      gameData,
    );
    initializeSkillCooldowns(ally, gameData.skillRegistry.actives);
    const activeCds = ally.cooldowns.filter((cd) => cd.slotKind === 'active');
    expect(activeCds).toHaveLength(0);
  });

  it('keeps learned passives effective for module class df_guardian', () => {
    const gameData = loadGameData();
    const preset = gameData.classRegistry.df_guardian!;
    const member = mockMemberAtLevel('df_guardian', 10, gameData);
    expect(member.build.learnedPassiveIds).toContain('df_guardian_passive_2');

    const ally = createAllyFromMember(
      member,
      preset,
      levelCurves,
      gameData,
    );
    expect(ally.build.learnedPassiveIds).toContain('df_guardian_passive_2');

    syncBuffAuras(
      [ally],
      [],
      gameData.skillRegistry.passives,
      gameData,
    );
    expect(getEffectiveDef(ally)).toBeGreaterThan(ally.def);
  });

  it('suppresses legacy actives for enemy selectedCombatModuleId path', () => {
    const gameData = loadGameData();
    const preset = gameData.classRegistry.at_sorcerer!;
    const stage = stageWithEnemyGroup('at_sorcerer');
    const spec = expandEnemyGroups(stage)[0]!;
    const enemy = createEnemyFromClassGroup(
      spec,
      preset,
      gameData,
      levelCurves,
    );
    initializeSkillCooldowns(enemy, gameData.skillRegistry.actives);
    expect(enemy.cooldowns.filter((cd) => cd.slotKind === 'active')).toHaveLength(
      0,
    );
    expect(enemy.build.learnedActiveIds.length).toBeGreaterThan(0);

    enemy.battleX = 200;
    const ally = mockTargetEnemy('ally_target', 100);
    ally.isEnemy = false;
    ally.role = 'attacker';
    ally.traits.rangePx = 200;

    const engine = createMinimalEngine(gameData);
    const internals = engine as unknown as {
      players: CombatantState[];
      enemies: CombatantState[];
      executor: SkillExecutor;
    };
    internals.players = [ally];
    internals.enemies = [enemy];

    const legacyActiveIds = new Set(enemy.build.learnedActiveIds);
    const activeExecutions: string[] = [];
    const basicExecutions: string[] = [];
    const originalTryExecute = internals.executor.tryExecute.bind(
      internals.executor,
    );
    vi.spyOn(internals.executor, 'tryExecute').mockImplementation(
      (actor, cd, allies, enemies) => {
        const fired = originalTryExecute(actor, cd, allies, enemies);
        if (!fired) return false;
        if (cd.slotKind === 'active' && legacyActiveIds.has(cd.skillId)) {
          activeExecutions.push(cd.skillId);
        }
        if (cd.slotKind === 'basic') {
          basicExecutions.push(cd.skillId);
        }
        return fired;
      },
    );

    const basicCd = enemy.cooldowns.find((cd) => cd.slotKind === 'basic')!;
    basicCd.remaining = 0;

    for (let i = 0; i < 60; i++) {
      tickCooldowns(engine, [enemy], 0.5);
      runUnitSkills(engine, [enemy]);
    }

    expect(basicExecutions.length).toBeGreaterThan(0);
    expect(basicExecutions.every((id) => id === 'at_sorcerer_mod_single_bolt')).toBe(
      true,
    );
    expect(activeExecutions).toEqual([]);
  });
});
