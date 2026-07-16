import { beforeEach, describe, expect, it } from 'vitest';
import levelCurvesJson from '../../data/levelCurves.json';
import { BattleEngine } from './BattleEngine.ts';
import { loadGameData } from './data/loadGameData.ts';
import { createAllyFromMember, resetEntityIdCounter } from './entities.ts';
import { loadLevelCurves } from '../progression/levelGrowth.ts';
import { createDefaultSave } from '../progression/victoryRewards.ts';
import { initializeSkillCooldowns } from './skillTrigger.ts';
import type { DamageAppliedEvent } from './damageAppliedEvent.ts';
import type { CombatantState, GameData, StageDef } from './types.ts';
import {
  DF_GUARDIAN_M2_COMBAT_MODULE_ID,
  getResolvedBasicCombatModuleId,
  resolveIronGuardianM2SelfHealFlatAmount,
} from './ironGuardianM2.ts';

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

function createEngine(gameData: GameData, options?: {
  stageId?: string;
  selectedGuardianModuleId?: string;
  onDamageEvent?: (event: DamageAppliedEvent) => void;
}) {
  const save = createDefaultSave(gameData, 'demo');
  if (options?.stageId) {
    save.stageProgress.currentStageId = options.stageId;
  }
  return new BattleEngine(
    gameData,
    levelCurves,
    () => save.party,
    () => save.stageProgress.currentStageId,
    {
      getSelectedCombatModuleId: (slotIndex) =>
        slotIndex === 0 ? options?.selectedGuardianModuleId : undefined,
      onDamageApplied: (_actor, _target, _amount, meta) => {
        if (meta?.event) options?.onDamageEvent?.(meta.event);
      },
    },
  );
}

function runUnitSkills(engine: BattleEngine, actors: CombatantState[]) {
  (
    engine as unknown as {
      runUnitSkills: (actors: CombatantState[]) => void;
    }
  ).runUnitSkills(actors);
}

function setEngineUnits(
  engine: BattleEngine,
  players: CombatantState[],
  enemies: CombatantState[],
) {
  const internals = engine as unknown as {
    players: CombatantState[];
    enemies: CombatantState[];
  };
  internals.players = players;
  internals.enemies = enemies;
}

function createGuardian(
  gameData: GameData,
  moduleId: string,
  isEnemy = false,
): CombatantState {
  const preset = gameData.classRegistry.df_guardian!;
  const guardian = createAllyFromMember(
    mockMember('df_guardian'),
    preset,
    levelCurves,
    gameData,
    moduleId,
  );
  guardian.isEnemy = isEnemy;
  guardian.id = isEnemy ? 'enemy_guardian' : 'ally_guardian';
  guardian.hp = 220;
  guardian.maxHp = 260;
  guardian.atk = 80;
  guardian.def = 0;
  guardian.res = 0;
  guardian.battleX = isEnemy ? 220 : 100;
  initializeSkillCooldowns(guardian, gameData.skillRegistry.actives);
  return guardian;
}

function createSwordsman(
  gameData: GameData,
  isEnemy = true,
  id = 'attacker',
): CombatantState {
  const preset = gameData.classRegistry.at_swordsman!;
  const unit = createAllyFromMember(
    mockMember('at_swordsman'),
    preset,
    levelCurves,
    gameData,
  );
  unit.id = id;
  unit.isEnemy = isEnemy;
  unit.atk = 220;
  unit.def = 0;
  unit.res = 0;
  unit.battleX = isEnemy ? 120 : 100;
  initializeSkillCooldowns(unit, gameData.skillRegistry.actives);
  const basic = unit.cooldowns.find((cd) => cd.slotKind === 'basic');
  if (basic) basic.remaining = 0;
  return unit;
}

describe('ironGuardianM2 integration (R12g-b3)', () => {
  beforeEach(() => {
    resetEntityIdCounter();
  });

  it('M2 selected: skill hit damage heals in same damage path (ally + enemy symmetry)', () => {
    const gameData = loadGameData();
    const m2Heal = resolveIronGuardianM2SelfHealFlatAmount(
      gameData.combatModuleRegistry,
    );
    expect(m2Heal).toBeDefined();
    const events: DamageAppliedEvent[] = [];
    const engine = createEngine(gameData, {
      onDamageEvent: (event) => events.push(event),
    });

    const allyGuardian = createGuardian(gameData, DF_GUARDIAN_M2_COMBAT_MODULE_ID, false);
    const enemyAttacker = createSwordsman(gameData, true, 'enemy_attacker');
    enemyAttacker.atk = 120;
    enemyAttacker.battleX = allyGuardian.battleX + 5;
    setEngineUnits(engine, [allyGuardian], [enemyAttacker]);
    const beforeAllyHp = allyGuardian.hp;
    runUnitSkills(engine, [enemyAttacker]);
    const afterAllyHp = allyGuardian.hp;
    const allyHit = events.find(
      (event) => event.targetId === allyGuardian.id && event.sourceKind === 'skillHit' && event.hpDamage > 0,
    );
    expect(allyHit).toBeDefined();
    if (allyHit) {
      expect(afterAllyHp).toBe(
        beforeAllyHp - allyHit.hpDamage + m2Heal!,
      );
    }

    const enemyGuardian = createGuardian(gameData, DF_GUARDIAN_M2_COMBAT_MODULE_ID, true);
    const allyAttacker = createSwordsman(gameData, false, 'ally_attacker');
    allyAttacker.battleX = enemyGuardian.battleX - 5;
    setEngineUnits(engine, [allyAttacker], [enemyGuardian]);
    allyAttacker.atk = 120;
    const beforeEnemyHp = enemyGuardian.hp;
    runUnitSkills(engine, [allyAttacker]);
    const enemyHit = events
      .filter((event) => event.targetId === enemyGuardian.id && event.sourceKind === 'skillHit' && event.hpDamage > 0)
      .at(-1);
    expect(enemyHit).toBeDefined();
    if (enemyHit) {
      expect(enemyGuardian.hp).toBe(
        beforeEnemyHp - enemyHit.hpDamage + m2Heal!,
      );
    }
  });

  it('M1 selected does not self-heal for same incoming hit', () => {
    const gameData = loadGameData();
    const engine = createEngine(gameData);
    const m1Guardian = createGuardian(gameData, 'df_guardian_mod_nearest_strike', false);
    const enemyAttacker = createSwordsman(gameData, true);
    enemyAttacker.battleX = m1Guardian.battleX + 5;
    setEngineUnits(engine, [m1Guardian], [enemyAttacker]);
    const beforeHp = m1Guardian.hp;
    runUnitSkills(engine, [enemyAttacker]);
    expect(m1Guardian.hp).toBeLessThan(beforeHp);
  });

  it('multi-hit triggers exactly once per hit; barrier-only, lethal, and dotTick do not trigger', () => {
    const gameData = loadGameData();
    const m2Heal = resolveIronGuardianM2SelfHealFlatAmount(
      gameData.combatModuleRegistry,
    )!;
    const events: DamageAppliedEvent[] = [];
    const engine = createEngine(gameData, {
      onDamageEvent: (event) => events.push(event),
    });
    const guardian = createGuardian(gameData, DF_GUARDIAN_M2_COMBAT_MODULE_ID, false);
    const sorcererPreset = gameData.classRegistry.at_sorcerer!;
    const enemySorcerer = createAllyFromMember(
      mockMember('at_sorcerer'),
      sorcererPreset,
      levelCurves,
      gameData,
      'at_sorcerer_mod_chain',
    );
    enemySorcerer.id = 'enemy_sorcerer';
    enemySorcerer.isEnemy = true;
    enemySorcerer.atk = 120;
    enemySorcerer.def = 0;
    enemySorcerer.res = 0;
    enemySorcerer.battleX = guardian.battleX + 5;
    initializeSkillCooldowns(enemySorcerer, gameData.skillRegistry.actives);
    enemySorcerer.cooldowns.find((cd) => cd.slotKind === 'basic')!.remaining = 0;
    setEngineUnits(engine, [guardian], [enemySorcerer]);

    const beforeMultiHit = guardian.hp;
    runUnitSkills(engine, [enemySorcerer]);
    const afterMultiHit = guardian.hp;
    const skillHitEvents = events.filter((event) => event.sourceKind === 'skillHit' && event.hpDamage > 0);
    expect(skillHitEvents.length).toBe(2);
    const multiHitDamage = skillHitEvents.reduce((sum, event) => sum + event.hpDamage, 0);
    expect(afterMultiHit).toBe(
      beforeMultiHit - multiHitDamage + m2Heal * 2,
    );

    guardian.hp = 220;
    guardian.barrierHp = 999;
    events.length = 0;
    enemySorcerer.cooldowns.find((cd) => cd.slotKind === 'basic')!.remaining = 0;
    runUnitSkills(engine, [enemySorcerer]);
    expect(events.some((event) => event.hpDamage === 0 && event.barrierDamage > 0)).toBe(true);
    expect(guardian.hp).toBe(220);

    guardian.hp = 20;
    guardian.barrierHp = 0;
    events.length = 0;
    enemySorcerer.cooldowns.find((cd) => cd.slotKind === 'basic')!.remaining = 0;
    runUnitSkills(engine, [enemySorcerer]);
    expect(events.some((event) => event.lethal)).toBe(true);
    expect(guardian.isAlive).toBe(false);
    expect(guardian.hp).toBe(0);

    guardian.isAlive = true;
    guardian.hp = 220;
    guardian.maxHp = 260;
    guardian.statusEffects.push({
      id: 'dot_tick',
      kind: 'debuff',
      overlay: 'dot',
      multiplier: 1,
      durationSec: 3,
      remainingSec: 3,
      tickSec: 0,
      amount: { kind: 'flat', flatAmount: 15 },
      sourceId: enemySorcerer.id,
      skillId: 'at_sorcerer_active_1',
    });
    events.length = 0;
    (
      engine as unknown as {
        tickStatusEffects: (deltaSec: number) => void;
      }
    ).tickStatusEffects(1);
    expect(events.some((event) => event.sourceKind === 'dotTick')).toBe(true);
    expect(guardian.hp).toBeLessThan(220);
  });

  it('resolved basic module id remains stable across cooldown reset and wave respawn', () => {
    const gameData = loadGameData();
    const stageId = 'm2_selection_stability_stage';
    const stage: StageDef = {
      id: stageId,
      displayName: 'M2 stability',
      recommendedLevel: 10,
      enemyGroups: [{ classId: 'df_paladin', count: 1 }],
      waves: [
        { enemies: [] },
        { enemies: [] },
      ],
    };
    gameData.stages = [...gameData.stages.filter((s) => s.id !== stageId), stage];
    const engine = createEngine(gameData, {
      stageId,
      selectedGuardianModuleId: DF_GUARDIAN_M2_COMBAT_MODULE_ID,
    });
    engine.startBattle();

    const internals = engine as unknown as {
      players: CombatantState[];
    };
    const guardian = internals.players.find((unit) => unit.classId === 'df_guardian')!;
    expect(getResolvedBasicCombatModuleId(guardian)).toBe(DF_GUARDIAN_M2_COMBAT_MODULE_ID);
    const basicCd = guardian.cooldowns.find((cd) => cd.slotKind === 'basic')!;
    expect(basicCd.skillId).toBe(DF_GUARDIAN_M2_COMBAT_MODULE_ID);
    basicCd.remaining = 0;
    initializeSkillCooldowns(guardian, gameData.skillRegistry.actives);
    expect(basicCd.skillId).toBe(DF_GUARDIAN_M2_COMBAT_MODULE_ID);
    guardian.statusEffects.push({
      id: 'stun_for_selection_stability',
      kind: 'debuff',
      overlay: 'stun',
      multiplier: 1,
      durationSec: 2,
      remainingSec: 2,
      sourceId: 'test',
    });
    (
      engine as unknown as {
        tickCooldowns: (units: CombatantState[], deltaSec: number) => void;
      }
    ).tickCooldowns([guardian], 1);
    expect(getResolvedBasicCombatModuleId(guardian)).toBe(DF_GUARDIAN_M2_COMBAT_MODULE_ID);

    (
      engine as unknown as {
        prepareAlliesForNextWave: () => void;
      }
    ).prepareAlliesForNextWave();
    const guardianAfterRespawn =
      (engine as unknown as { players: CombatantState[] }).players.find(
        (unit) => unit.classId === 'df_guardian',
      )!;
    expect(getResolvedBasicCombatModuleId(guardianAfterRespawn)).toBe(
      DF_GUARDIAN_M2_COMBAT_MODULE_ID,
    );
  });
});
