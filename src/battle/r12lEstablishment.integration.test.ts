/**
 * R12l 作業単位2 — 新仕様成立確認（BattleEngine + 実 GameData production 経路）。
 * BattleEngine 処理の複製はしない。種火 Wave 消去は wipe→exit march→awaitingNextWave を通す。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import levelCurvesJson from '../../data/levelCurves.json';
import { OperationAcquiredPassives } from '../game/operationAcquiredPassives.ts';
import { createMemberFromClass } from '../progression/partyCompose.ts';
import { loadLevelCurves } from '../progression/levelGrowth.ts';
import { createDefaultSave } from '../progression/victoryRewards.ts';
import { BattleEngine } from './BattleEngine.ts';
import { getEmberIgnitionStacks } from './emberIgnition.ts';
import { loadGameData } from './data/loadGameData.ts';
import {
  createAlliesFromPartyState,
  createAllyFromMember,
  createEnemyFromClassGroup,
  resetEntityIdCounter,
} from './entities.ts';
import {
  applyDirectHealBatchWithExcess,
  resolveHealActionScopeFromTargetShape,
} from './instantHealExcess.ts';
import { PartyCombatModuleSelection } from './partyCombatModuleSelection.ts';
import { initializeSkillCooldowns } from './skillTrigger.ts';
import {
  asBattleEngineInternals,
  killAllEnemies,
  waitForEngaged,
} from './test/battleFieldSpec.harness.ts';
import type {
  CombatantState,
  GameData,
  PartySlotState,
} from './types.ts';

const levelCurves = loadLevelCurves(levelCurvesJson);

const CLASS_BODY_PASSIVE: Record<string, string> = {
  df_guardian: 'df_guardian_passive_1',
  at_swordsman: 'at_swordsman_passive_2',
  at_sorcerer: 'at_sorcerer_passive_1',
  sp_cleric: 'sp_cleric_passive_1',
};

const MODULE = {
  sorcererM1: 'at_sorcerer_mod_focus',
  clericM2: 'sp_cleric_mod_party_mend',
} as const;

function createEngine(
  gameData: GameData,
  options?: {
    stageId?: string;
    getSelectedCombatModuleId?: (slotIndex: number) => string | undefined;
    getAcquiredOperationPassiveIds?: (slotIndex: number) => readonly string[];
  },
): BattleEngine {
  const save = createDefaultSave(gameData, 'demo');
  save.stageProgress.currentStageId = options?.stageId ?? '1';
  return new BattleEngine(
    gameData,
    levelCurves,
    () => save.party,
    () => save.stageProgress.currentStageId,
    {
      getSelectedCombatModuleId: options?.getSelectedCombatModuleId,
      getAcquiredOperationPassiveIds: options?.getAcquiredOperationPassiveIds,
    },
  );
}

function runUnitSkills(engine: BattleEngine, actors: CombatantState[]): void {
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
): void {
  const internals = asBattleEngineInternals(engine);
  internals.players = players;
  internals.enemies = enemies;
}

function readyBasicCd(unit: CombatantState, skillId?: string): void {
  const basic = unit.cooldowns.find((cd) => cd.slotKind === 'basic');
  if (!basic) return;
  if (skillId) basic.skillId = skillId;
  basic.remaining = 0;
}

function makeAlly(
  gameData: GameData,
  classId: string,
  moduleId: string | undefined,
  partial: Partial<CombatantState> & { id: string },
): CombatantState {
  const preset = gameData.classRegistry[classId]!;
  const member = createMemberFromClass(classId, gameData);
  const unit = createAllyFromMember(
    member,
    preset,
    levelCurves,
    gameData,
    moduleId,
  );
  Object.assign(unit, partial);
  initializeSkillCooldowns(unit, gameData.skillRegistry.actives);
  if (moduleId) readyBasicCd(unit, moduleId);
  else readyBasicCd(unit);
  return unit;
}

function makeEnemySorcerer(
  gameData: GameData,
  moduleId: string,
  partial: Partial<CombatantState> & { id: string },
): CombatantState {
  const preset = gameData.classRegistry.at_sorcerer!;
  const enemy = createEnemyFromClassGroup(
    {
      classId: 'at_sorcerer',
      level: 10,
      selectedCombatModuleId: moduleId,
      groupIndex: 0,
      indexInGroup: 0,
      groupCount: 1,
      spawnUnitKey: 'g0_i0',
    },
    preset,
    gameData,
    levelCurves,
  );
  Object.assign(enemy, partial, { isEnemy: true });
  initializeSkillCooldowns(enemy, gameData.skillRegistry.actives);
  readyBasicCd(enemy, moduleId);
  return enemy;
}

describe('R12l establishment (production path)', () => {
  beforeEach(() => {
    resetEntityIdCounter();
  });

  it('4兵科は兵科本体パッシブのみを常時持ち、作戦取得は対象 slot にだけ注入される', () => {
    const gameData = loadGameData();
    const party: PartySlotState[] = [
      createMemberFromClass('df_guardian', gameData),
      createMemberFromClass('at_swordsman', gameData),
      createMemberFromClass('at_sorcerer', gameData),
      createMemberFromClass('sp_cleric', gameData),
    ];

    for (const member of party) {
      const bodyId = CLASS_BODY_PASSIVE[member!.classId];
      expect(member!.build.learnedPassiveIds).toEqual([bodyId]);
    }

    const acquired = new OperationAcquiredPassives();
    expect(
      acquired.tryAddAcquiredPassiveId(2, 'at_sorcerer_op_res_ignore_up'),
    ).toBe(true);
    const selection = new PartyCombatModuleSelection();
    selection.setSelectedCombatModuleId(2, MODULE.sorcererM1);

    const allies = createAlliesFromPartyState(
      gameData,
      party,
      levelCurves,
      (slot) => selection.getSelectedCombatModuleId(slot),
      (slot) => acquired.getAcquiredPassiveIds(slot),
    );

    expect(allies[0]!.build.learnedPassiveIds).toEqual([
      CLASS_BODY_PASSIVE.df_guardian,
    ]);
    expect(allies[1]!.build.learnedPassiveIds).toEqual([
      CLASS_BODY_PASSIVE.at_swordsman,
    ]);
    expect(allies[2]!.build.learnedPassiveIds).toEqual([
      CLASS_BODY_PASSIVE.at_sorcerer,
      'at_sorcerer_op_res_ignore_up',
    ]);
    expect(allies[3]!.build.learnedPassiveIds).toEqual([
      CLASS_BODY_PASSIVE.sp_cleric,
    ]);
    expect(party[2]!.build.learnedPassiveIds).toEqual([
      CLASS_BODY_PASSIVE.at_sorcerer,
    ]);
  });

  it('CombatModule Hit で種火が付き、発火後は再付与されず、旧 active Hit では付かない', () => {
    const gameData = loadGameData();
    const engine = createEngine(gameData);
    const sorcerer = makeAlly(gameData, 'at_sorcerer', MODULE.sorcererM1, {
      id: 'ally_sorcerer',
      battleX: 80,
      atk: 100,
      res: 0,
    });
    const target = makeAlly(gameData, 'df_guardian', undefined, {
      id: 'enemy_tank',
      isEnemy: true,
      battleX: 160,
      hp: 5000,
      maxHp: 5000,
      def: 0,
      res: 0,
    });
    setEngineUnits(engine, [sorcerer], [target]);

    for (let i = 0; i < 4; i++) {
      readyBasicCd(sorcerer, MODULE.sorcererM1);
      runUnitSkills(engine, [sorcerer]);
    }
    expect(getEmberIgnitionStacks(target)).toBe(4);

    const hpBeforeIgnition = target.hp;
    readyBasicCd(sorcerer, MODULE.sorcererM1);
    runUnitSkills(engine, [sorcerer]);
    expect(getEmberIgnitionStacks(target)).toBe(0);
    expect(target.hp).toBeLessThan(hpBeforeIgnition);

    readyBasicCd(sorcerer, MODULE.sorcererM1);
    runUnitSkills(engine, [sorcerer]);
    expect(getEmberIgnitionStacks(target)).toBe(1);

    const stacksBeforeLegacy = getEmberIgnitionStacks(target);
    const activeCd = sorcerer.cooldowns.find((cd) => cd.slotKind === 'active');
    if (activeCd && gameData.skillRegistry.actives[activeCd.skillId]) {
      activeCd.remaining = 0;
      activeCd.storedCharges = 1;
      runUnitSkills(engine, [sorcerer]);
      expect(getEmberIgnitionStacks(target)).toBe(stacksBeforeLegacy);
    } else {
      readyBasicCd(sorcerer, 'at_sorcerer_basic_attack');
      runUnitSkills(engine, [sorcerer]);
      expect(getEmberIgnitionStacks(target)).toBe(stacksBeforeLegacy);
    }
  });

  it('敵側魔術師の CombatModule Hit でも種火・発火が動く', () => {
    const gameData = loadGameData();
    const engine = createEngine(gameData);
    const ally = makeAlly(gameData, 'df_guardian', undefined, {
      id: 'ally',
      battleX: 100,
      hp: 5000,
      maxHp: 5000,
      def: 0,
      res: 0,
    });
    const enemySorcerer = makeEnemySorcerer(gameData, MODULE.sorcererM1, {
      id: 'enemy_sorcerer',
      battleX: 180,
      atk: 120,
    });
    expect(enemySorcerer.build.learnedPassiveIds).toContain(
      'at_sorcerer_passive_1',
    );
    setEngineUnits(engine, [ally], [enemySorcerer]);

    for (let i = 0; i < 5; i++) {
      readyBasicCd(enemySorcerer, MODULE.sorcererM1);
      runUnitSkills(engine, [enemySorcerer]);
    }
    expect(getEmberIgnitionStacks(ally)).toBe(0);
    expect(ally.hp).toBeLessThan(5000);
  });

  it('Wave 終了経路で種火が消え、次 Wave で不撓の誓いフラグがリセットされる', () => {
    const gameData = loadGameData();
    const stage = gameData.stages.find((s) => s.id === '1');
    expect((stage?.waves.length ?? 0) >= 2).toBe(true);

    const engine = createEngine(gameData, { stageId: '1' });
    engine.startBattle();
    waitForEngaged(engine);

    const { players } = asBattleEngineInternals(engine);
    const ally = players[0]!;
    const enemySorcerer = makeEnemySorcerer(gameData, MODULE.sorcererM1, {
      id: 'wave_enemy_sorcerer',
      battleX: ally.battleX + 40,
      atk: 100,
    });
    asBattleEngineInternals(engine).enemies = [enemySorcerer];

    for (let i = 0; i < 3; i++) {
      readyBasicCd(enemySorcerer, MODULE.sorcererM1);
      runUnitSkills(engine, [enemySorcerer]);
    }
    expect(getEmberIgnitionStacks(ally)).toBeGreaterThan(0);
    ally.lastStandInvulnerableUsed = true;

    killAllEnemies(engine);
    // reachAwaitingNextWave は再 waitForEngaged するため、wipe 後は直接 tick する
    let awaiting = false;
    for (let i = 0; i < 200_000; i++) {
      engine.tick(1 / 60);
      const snap = engine.getSnapshot();
      if (snap.awaitingNextWave) {
        awaiting = true;
        break;
      }
      if (snap.phase === 'victory' || snap.phase === 'defeat') {
        throw new Error(`battle ended (${snap.phase}) instead of awaiting next wave`);
      }
    }
    expect(awaiting).toBe(true);
    expect(getEmberIgnitionStacks(ally)).toBe(0);

    expect(engine.startNextWave()).toBe(true);
    const afterPlayers = asBattleEngineInternals(engine).players;
    for (const p of afterPlayers) {
      expect(p.lastStandInvulnerableUsed).toBeUndefined();
    }
  });

  it('範囲回復 Module は実対象1人でも healActionScope=multi（転送率25%）', () => {
    const gameData = loadGameData();
    const module = gameData.combatModuleRegistry[MODULE.clericM2]!;
    expect(module).toBeDefined();
    const scope = resolveHealActionScopeFromTargetShape(
      module.action.targetShape,
      module.action.effectRange?.form,
    );
    expect(scope).toBe('multi');

    const redirect = gameData.skillRegistry.passives.sp_cleric_passive_3!;
    expect(redirect.effect).toBe('excessHealRedirect');
    expect(redirect.redirectScaleMulti).toBe(0.25);
    expect(redirect.redirectScale).toBe(0.5);

    // 兵科本体の回復補正を外し、転送率だけを測る
    const healer = makeAlly(gameData, 'sp_cleric', MODULE.clericM2, {
      id: 'cleric',
      atk: 200,
    });
    healer.build.learnedPassiveIds = ['sp_cleric_passive_3'];
    const primary = makeAlly(gameData, 'df_guardian', undefined, {
      id: 'primary',
      hp: 90,
      maxHp: 100,
    });
    primary.build.learnedPassiveIds = [];
    const ally = makeAlly(gameData, 'at_swordsman', undefined, {
      id: 'ally',
      hp: 40,
      maxHp: 100,
    });
    ally.build.learnedPassiveIds = [];

    const multi = applyDirectHealBatchWithExcess(
      healer,
      [{ target: primary, attemptedHeal: 30 }],
      [healer, primary, ally],
      gameData.skillRegistry.passives,
      { allowRedirect: true, healActionScope: 'multi' },
    );
    const single = applyDirectHealBatchWithExcess(
      healer,
      [{ target: { ...primary, hp: 90, maxHp: 100, barrierHp: 0 }, attemptedHeal: 30 }],
      [
        healer,
        { ...primary, hp: 90, maxHp: 100, barrierHp: 0 },
        { ...ally, hp: 40, maxHp: 100, barrierHp: 0 },
      ],
      gameData.skillRegistry.passives,
      { allowRedirect: true, healActionScope: 'single' },
    );
    // excess 20 → multi 25% = 5 / single 50% = 10
    expect(multi.redirectAmount).toBe(5);
    expect(single.redirectAmount).toBe(10);
    expect(scope).toBe('multi');
  });
});

describe('R12l establishment (acquire uniqueness)', () => {
  it('同じパッシブを再取得できず、sameClassStackStep=0', () => {
    const gameData = loadGameData();
    expect(gameData.operationPassiveCatalog.sameClassStackStep).toBe(0);

    const acquired = new OperationAcquiredPassives();
    const passiveId = 'at_sorcerer_op_interval_reduction';
    expect(acquired.tryAddAcquiredPassiveId(0, passiveId)).toBe(true);
    expect(acquired.tryAddAcquiredPassiveId(0, passiveId)).toBe(false);
    expect(acquired.getAcquiredPassiveIds(0)).toEqual([passiveId]);
  });
});
