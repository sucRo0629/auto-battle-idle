import { beforeEach, describe, expect, it } from 'vitest';
import levelCurvesJson from '../../data/levelCurves.json';
import { BattleEngine } from './BattleEngine.ts';
import { resolveDamage } from './combatMath.ts';
import { loadGameData } from './data/loadGameData.ts';
import { createAllyFromMember, resetEntityIdCounter } from './entities.ts';
import { loadLevelCurves } from '../progression/levelGrowth.ts';
import { createDefaultSave } from '../progression/victoryRewards.ts';
import { initializeSkillCooldowns } from './skillTrigger.ts';
import { buildDangerTargetingRuntime } from './skills/targeting.ts';
import type {
  CombatantState,
  PendingSkillHit,
  SkillEffectDef,
  StageDef,
} from './types.ts';
import {
  DF_PALADIN_M2_COMBAT_MODULE_ID,
  DF_PALADIN_M2_PROTECTION_OVERLAY,
  clearDfPaladinM2RuntimeState,
  executeDfPaladinM2DangerProtection,
  hasDfPaladinM2ProtectionFrom,
  resolveDfPaladinM2RuntimeParams,
  tryApplyDfPaladinM2Protection,
  type DfPaladinM2ProtectionResult,
} from './dfPaladinM2.ts';
import { mockCombatant } from './testFixtures.ts';

const gameData = loadGameData();
const levelCurves = loadLevelCurves(levelCurvesJson);
const m2Params = resolveDfPaladinM2RuntimeParams(gameData.combatModuleRegistry)!;
const DF_PALADIN_M2_ALL_DAMAGE_TAKEN_MULTIPLIER = m2Params.allDamageTakenMultiplier;
const DF_PALADIN_M2_MAGIC_EXTRA_TAKEN_MULTIPLIER = m2Params.magicDamageTakenMultiplier;
const DF_PALADIN_M2_PROTECTION_DURATION_SEC = m2Params.durationSec;

const damageEffect = {
  type: 'damage',
  target: { kind: 'distance', side: 'enemy', order: 'nearest' },
  damageType: 'physical',
  amount: { kind: 'flat', flatAmount: 100 },
} as SkillEffectDef;

function mockMember(classId: string) {
  return {
    classId,
    build: {
      learnedPassiveIds: [] as string[],
      learnedActiveIds: [] as string[],
      equippedActiveSlots: [] as string[],
    },
    progress: { level: 10, exp: 0 },
  };
}

function makePaladin(
  moduleId: string,
  partial: Partial<CombatantState> = {},
): CombatantState {
  const preset = gameData.classRegistry.df_paladin!;
  const paladin = createAllyFromMember(
    mockMember('df_paladin'),
    preset,
    levelCurves,
    gameData,
    moduleId,
  );
  paladin.build.learnedPassiveIds = [];
  const basicCd = paladin.cooldowns.find((cd) => cd.slotKind === 'basic');
  if (basicCd) basicCd.skillId = moduleId;
  initializeSkillCooldowns(paladin, gameData.skillRegistry.actives);
  return {
    ...paladin,
    id: partial.id ?? paladin.id,
    isEnemy: partial.isEnemy ?? false,
    battleX: partial.battleX ?? 100,
    hp: partial.hp ?? paladin.hp,
    maxHp: partial.maxHp ?? paladin.maxHp,
    barrierHp: partial.barrierHp ?? 0,
    ...partial,
  };
}

function makeAlly(
  id: string,
  partial: Partial<CombatantState> = {},
): CombatantState {
  const preset = gameData.classRegistry.at_swordsman!;
  const unit = createAllyFromMember(
    mockMember('at_swordsman'),
    preset,
    levelCurves,
    gameData,
  );
  unit.build.learnedPassiveIds = [];
  initializeSkillCooldowns(unit, gameData.skillRegistry.actives);
  return {
    ...unit,
    id,
    isEnemy: false,
    def: 0,
    res: 0,
    barrierHp: 0,
    battleX: 120,
    ...partial,
  };
}

function makePhysicalEnemy(
  id: string,
  partial: Partial<CombatantState> = {},
): CombatantState {
  const preset = gameData.classRegistry.at_swordsman!;
  const unit = createAllyFromMember(
    mockMember('at_swordsman'),
    preset,
    levelCurves,
    gameData,
  );
  unit.build.learnedPassiveIds = [];
  unit.id = id;
  unit.isEnemy = true;
  unit.atk = 200;
  unit.def = 0;
  unit.res = 0;
  unit.battleX = 220;
  initializeSkillCooldowns(unit, gameData.skillRegistry.actives);
  const basic = unit.cooldowns.find((cd) => cd.slotKind === 'basic');
  if (basic) basic.remaining = 0;
  return { ...unit, ...partial, id, isEnemy: true };
}

function makeMagicEnemy(
  id: string,
  partial: Partial<CombatantState> = {},
): CombatantState {
  const preset = gameData.classRegistry.at_sorcerer!;
  const unit = createAllyFromMember(
    mockMember('at_sorcerer'),
    preset,
    levelCurves,
    gameData,
    'at_sorcerer_mod_chain',
  );
  unit.build.learnedPassiveIds = [];
  unit.id = id;
  unit.isEnemy = true;
  unit.atk = 200;
  unit.def = 0;
  unit.res = 0;
  unit.battleX = 220;
  initializeSkillCooldowns(unit, gameData.skillRegistry.actives);
  const basic = unit.cooldowns.find((cd) => cd.slotKind === 'basic');
  if (basic) basic.remaining = 0;
  return { ...unit, ...partial, id, isEnemy: true };
}

function makePendingHit(
  actorId: string,
  targetId: string,
  battleSec = 0,
  hitIndex = 0,
): PendingSkillHit {
  return {
    applyAtBattleSec: battleSec,
    actorId,
    skillId: 'enemy_basic',
    skillName: 'enemy_basic',
    effectDef: damageEffect,
    effectIndex: 0,
    slotKind: 'basic',
    hitIndex,
    targets: [{ targetId }],
  };
}

function resolveTargets(
  units: CombatantState[],
  mapping: Record<string, string | null>,
) {
  const byId = new Map(units.map((unit) => [unit.id, unit]));
  return (attacker: CombatantState): CombatantState | null => {
    const targetId = mapping[attacker.id];
    return targetId ? byId.get(targetId) ?? null : null;
  };
}

type ExecutorDeps = {
  getTargetingRuntimeContext?: () => ReturnType<
    typeof buildDangerTargetingRuntime
  >;
  onDfPaladinM2ProtectionResult?: (
    result: DfPaladinM2ProtectionResult,
  ) => void;
};

function getExecutorDeps(engine: BattleEngine): ExecutorDeps {
  return (
    engine as unknown as {
      executor: { deps: ExecutorDeps };
    }
  ).executor.deps;
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
  battleSec = 0,
) {
  const internals = engine as unknown as {
    players: CombatantState[];
    enemies: CombatantState[];
    battleTimeSec: number;
    engaged: boolean;
    pendingHitQueue: PendingSkillHit[];
  };
  internals.players = players;
  internals.enemies = enemies;
  internals.battleTimeSec = battleSec;
  internals.engaged = true;
  return internals;
}

function installAttackTargetMap(
  engine: BattleEngine,
  players: CombatantState[],
  enemies: CombatantState[],
  mapping: Record<string, string | null>,
) {
  const deps = getExecutorDeps(engine);
  deps.getTargetingRuntimeContext = () =>
    buildDangerTargetingRuntime(players, enemies, gameData, {
      battleSec: (engine as unknown as { battleTimeSec: number }).battleTimeSec,
      pendingHits: (engine as unknown as { pendingHitQueue: PendingSkillHit[] })
        .pendingHitQueue,
      resolveCurrentAttackTarget: resolveTargets(
        [...players, ...enemies],
        mapping,
      ),
    });
}

describe('dfPaladinM2 integration (R12g-c5)', () => {
  let protectionResults: DfPaladinM2ProtectionResult[];

  beforeEach(() => {
    resetEntityIdCounter();
    clearDfPaladinM2RuntimeState();
    protectionResults = [];
  });

  function createEngine() {
    const save = createDefaultSave(gameData, 'demo');
    return new BattleEngine(
      gameData,
      levelCurves,
      () => save.party,
      () => save.stageProgress.currentStageId,
      {
        getSelectedCombatModuleId: (slotIndex) =>
          slotIndex === 0 ? DF_PALADIN_M2_COMBAT_MODULE_ID : undefined,
        onDfPaladinM2ProtectionResult: (result) => {
          protectionResults.push(result);
        },
      },
    );
  }

  function fireM2(engine: BattleEngine, paladin: CombatantState) {
    const internals = engine as unknown as {
      players: CombatantState[];
      enemies: CombatantState[];
    };
    const runtime = getExecutorDeps(engine).getTargetingRuntimeContext?.();
    // テスト用: 指定 protector のみ評価（production continuous sync は全員）
    const result = executeDfPaladinM2DangerProtection(
      paladin,
      internals.players,
      internals.enemies,
      runtime,
      gameData.combatModuleRegistry,
    );
    protectionResults.push(result);
  }

  it('full combat path: danger select → protect → physical/magic HP delta', () => {
    const engine = createEngine();
    const paladin = makePaladin(DF_PALADIN_M2_COMBAT_MODULE_ID, {
      id: 'paladin',
      battleX: 80,
    });
    const front = makeAlly('front', { battleX: 140, formationRow: 'front' });
    const back = makeAlly('back', {
      battleX: 20,
      formationRow: 'back',
      hp: 400,
      maxHp: 400,
    });
    const phys = makePhysicalEnemy('phys', { battleX: 200 });
    const mage = makeMagicEnemy('mage', { battleX: 210 });
    const players = [paladin, front, back];
    const enemies = [phys, mage];
    const internals = setEngineUnits(engine, players, enemies);
    internals.pendingHitQueue = [
      makePendingHit('phys', 'back'),
      makePendingHit('mage', 'back'),
    ];
    installAttackTargetMap(engine, players, enemies, {
      phys: 'back',
      mage: 'back',
    });

    const paladinXBefore = paladin.battleX;
    fireM2(engine, paladin);

    expect(protectionResults).toHaveLength(1);
    const result = protectionResults[0]!;
    expect(result.outcome).toBe('applied');
    expect(result.selectedTargetId).toBe('back');
    expect(result.protectorId).toBe('paladin');
    expect(result.allDamageTakenMultiplier).toBe(
      DF_PALADIN_M2_ALL_DAMAGE_TAKEN_MULTIPLIER,
    );
    expect(result.magicExtraTakenMultiplier).toBe(
      DF_PALADIN_M2_MAGIC_EXTRA_TAKEN_MULTIPLIER,
    );
    const selectedSnap = result.dangerSnapshots?.find(
      (snap) => snap.targetId === 'back',
    );
    expect(selectedSnap).toBeDefined();
    expect(selectedSnap!.currentAttackerCount).toBe(2);
    expect(selectedSnap!.pendingAttackerCount).toBe(2);
    expect(selectedSnap!.pendingHitCount).toBe(2);
    expect(hasDfPaladinM2ProtectionFrom(back, 'paladin')).toBe(true);
    expect(paladin.battleX).toBe(paladinXBefore);

    const bare = makeAlly('bare', {
      battleX: 20,
      hp: 400,
      maxHp: 400,
      def: 0,
      res: 0,
    });
    const baselinePhys = resolveDamage(
      phys,
      bare,
      { ...damageEffect, damageType: 'physical' },
      {},
    );
    const protectedPhys = resolveDamage(
      phys,
      back,
      { ...damageEffect, damageType: 'physical' },
      {},
    );
    expect(protectedPhys).toBeLessThan(baselinePhys);
    expect(protectedPhys).toBe(
      Math.max(
        1,
        Math.floor(baselinePhys * DF_PALADIN_M2_ALL_DAMAGE_TAKEN_MULTIPLIER),
      ),
    );

    const baselineMagic = resolveDamage(
      mage,
      bare,
      { ...damageEffect, damageType: 'magic' },
      {},
    );
    const protectedMagic = resolveDamage(
      mage,
      back,
      { ...damageEffect, damageType: 'magic' },
      {},
    );
    expect(protectedMagic).toBeLessThan(protectedPhys);
    expect(protectedMagic).toBe(
      Math.max(
        1,
        Math.floor(
          baselineMagic *
            DF_PALADIN_M2_ALL_DAMAGE_TAKEN_MULTIPLIER *
            DF_PALADIN_M2_MAGIC_EXTRA_TAKEN_MULTIPLIER,
        ),
      ),
    );

    // Same attacker skill path: unprotected vs protected HP loss
    const unprotectedTarget = makeAlly('hitBare', {
      battleX: back.battleX,
      hp: 800,
      maxHp: 800,
      def: 0,
      res: 0,
    });
    setEngineUnits(engine, [paladin, unprotectedTarget], [phys]);
    phys.battleX = unprotectedTarget.battleX + 5;
    phys.cooldowns.find((cd) => cd.slotKind === 'basic')!.remaining = 0;
    const bareHpBefore = unprotectedTarget.hp;
    runUnitSkills(engine, [phys]);
    const bareLoss = bareHpBefore - unprotectedTarget.hp;
    expect(bareLoss).toBeGreaterThan(0);

    setEngineUnits(engine, [paladin, back], [phys]);
    back.hp = 800;
    back.maxHp = 800;
    phys.battleX = back.battleX + 5;
    phys.cooldowns.find((cd) => cd.slotKind === 'basic')!.remaining = 0;
    const protectedHpBefore = back.hp;
    runUnitSkills(engine, [phys]);
    const protectedLoss = protectedHpBefore - back.hp;
    expect(protectedLoss).toBeGreaterThan(0);
    expect(protectedLoss).toBeLessThan(bareLoss);
  });

  it('danger ranking: current focus / pending / hits / earliest / hp / determinism', () => {
    const engine = createEngine();
    const paladin = makePaladin(DF_PALADIN_M2_COMBAT_MODULE_ID, {
      id: 'paladin',
    });

    // 2.1 current target concentration
    {
      const a = makeAlly('a', { hp: 100, maxHp: 100 });
      const b = makeAlly('b', { hp: 10, maxHp: 100 });
      const e1 = makePhysicalEnemy('e1');
      const e2 = makePhysicalEnemy('e2');
      const players = [paladin, a, b];
      const enemies = [e1, e2];
      setEngineUnits(engine, players, enemies);
      installAttackTargetMap(engine, players, enemies, {
        e1: 'a',
        e2: 'a',
      });
      protectionResults = [];
      fireM2(engine, paladin);
      expect(protectionResults[0]?.selectedTargetId).toBe('a');
      expect(hasDfPaladinM2ProtectionFrom(a, 'paladin')).toBe(true);
      clearDfPaladinM2RuntimeState();
      a.statusEffects = [];
    }

    // 2.2 pending attacker count
    {
      const a = makeAlly('pendA', { hp: 100, maxHp: 100 });
      const b = makeAlly('pendB', { hp: 100, maxHp: 100 });
      const e1 = makePhysicalEnemy('pe1');
      const e2 = makePhysicalEnemy('pe2');
      const e3 = makePhysicalEnemy('pe3');
      const players = [paladin, a, b];
      const enemies = [e1, e2, e3];
      const internals = setEngineUnits(engine, players, enemies);
      internals.pendingHitQueue = [
        makePendingHit('pe1', 'pendA'),
        makePendingHit('pe2', 'pendB'),
        makePendingHit('pe3', 'pendB'),
      ];
      installAttackTargetMap(engine, players, enemies, {
        pe1: 'pendA',
        pe2: 'pendB',
        pe3: 'pendB',
      });
      // equal current (1 each via mapping) — wait, mapping gives pendA:1, pendB:2 current
      // For pending-only differentiation with equal current, set all current to same:
      installAttackTargetMap(engine, players, enemies, {
        pe1: null,
        pe2: null,
        pe3: null,
      });
      protectionResults = [];
      fireM2(engine, paladin);
      expect(protectionResults[0]?.selectedTargetId).toBe('pendB');
      clearDfPaladinM2RuntimeState();
      a.statusEffects = [];
      b.statusEffects = [];
    }

    // 2.3 pending hit count (same attacker counts)
    {
      const a = makeAlly('hitA', { hp: 100, maxHp: 100 });
      const b = makeAlly('hitB', { hp: 100, maxHp: 100 });
      const e1 = makePhysicalEnemy('he1');
      const e2 = makePhysicalEnemy('he2');
      const players = [paladin, a, b];
      const enemies = [e1, e2];
      const internals = setEngineUnits(engine, players, enemies);
      internals.pendingHitQueue = [
        makePendingHit('he1', 'hitA', 0, 0),
        makePendingHit('he1', 'hitA', 0, 1),
        makePendingHit('he2', 'hitB', 0, 0),
      ];
      installAttackTargetMap(engine, players, enemies, {
        he1: null,
        he2: null,
      });
      protectionResults = [];
      fireM2(engine, paladin);
      expect(protectionResults[0]?.selectedTargetId).toBe('hitA');
      clearDfPaladinM2RuntimeState();
      a.statusEffects = [];
      b.statusEffects = [];
    }

    // 2.4 earliest pending
    {
      const a = makeAlly('earlyA', { hp: 100, maxHp: 100 });
      const b = makeAlly('earlyB', { hp: 100, maxHp: 100 });
      const e1 = makePhysicalEnemy('ee1');
      const e2 = makePhysicalEnemy('ee2');
      const players = [paladin, a, b];
      const enemies = [e1, e2];
      const internals = setEngineUnits(engine, players, enemies);
      internals.pendingHitQueue = [
        makePendingHit('ee1', 'earlyA', 1.5),
        makePendingHit('ee2', 'earlyB', 0.5),
      ];
      installAttackTargetMap(engine, players, enemies, {
        ee1: null,
        ee2: null,
      });
      protectionResults = [];
      fireM2(engine, paladin);
      expect(protectionResults[0]?.selectedTargetId).toBe('earlyB');
      clearDfPaladinM2RuntimeState();
      a.statusEffects = [];
      b.statusEffects = [];
    }

    // 2.5 HP ratio only when focus equal
    {
      const lowDangerHighHp = makeAlly('focusHigh', { hp: 100, maxHp: 100 });
      const highDangerLowFocus = makeAlly('focusLow', { hp: 5, maxHp: 100 });
      const e1 = makePhysicalEnemy('fe1');
      const e2 = makePhysicalEnemy('fe2');
      const players = [paladin, lowDangerHighHp, highDangerLowFocus];
      const enemies = [e1, e2];
      const internals = setEngineUnits(engine, players, enemies);
      internals.pendingHitQueue = [
        makePendingHit('fe1', 'focusHigh'),
        makePendingHit('fe2', 'focusHigh'),
      ];
      installAttackTargetMap(engine, players, enemies, {
        fe1: 'focusHigh',
        fe2: 'focusHigh',
      });
      protectionResults = [];
      fireM2(engine, paladin);
      expect(protectionResults[0]?.selectedTargetId).toBe('focusHigh');
      clearDfPaladinM2RuntimeState();
      lowDangerHighHp.statusEffects = [];
      highDangerLowFocus.statusEffects = [];
    }

    {
      const lowHp = makeAlly('tieLow', { hp: 20, maxHp: 100 });
      const highHp = makeAlly('tieHigh', { hp: 80, maxHp: 100 });
      const e1 = makePhysicalEnemy('te1');
      const e2 = makePhysicalEnemy('te2');
      const players = [paladin, highHp, lowHp];
      const enemies = [e1, e2];
      const internals = setEngineUnits(engine, players, enemies);
      internals.pendingHitQueue = [
        makePendingHit('te1', 'tieLow'),
        makePendingHit('te2', 'tieHigh'),
      ];
      installAttackTargetMap(engine, players, enemies, {
        te1: 'tieLow',
        te2: 'tieHigh',
      });
      protectionResults = [];
      fireM2(engine, paladin);
      expect(protectionResults[0]?.selectedTargetId).toBe('tieLow');
      clearDfPaladinM2RuntimeState();
      lowHp.statusEffects = [];
      highHp.statusEffects = [];
    }

    // 2.6 determinism — candidate order / id tie-break
    {
      const c1 = makeAlly('id_a', { hp: 50, maxHp: 100 });
      const c2 = makeAlly('id_b', { hp: 50, maxHp: 100 });
      const e1 = makePhysicalEnemy('de1');
      const e2 = makePhysicalEnemy('de2');
      for (const order of [
        [paladin, c1, c2],
        [paladin, c2, c1],
      ] as CombatantState[][]) {
        const players = order;
        const enemies = [e1, e2];
        const internals = setEngineUnits(engine, players, enemies);
        internals.pendingHitQueue = [
          makePendingHit('de1', 'id_a'),
          makePendingHit('de2', 'id_b'),
        ];
        installAttackTargetMap(engine, players, enemies, {
          de1: 'id_a',
          de2: 'id_b',
        });
        protectionResults = [];
        clearDfPaladinM2RuntimeState();
        c1.statusEffects = [];
        c2.statusEffects = [];
        fireM2(engine, paladin);
        expect(protectionResults[0]?.selectedTargetId).toBe('id_a');
      }
    }
  });

  it('protects distant backline without moving the paladin', () => {
    const engine = createEngine();
    const paladin = makePaladin(DF_PALADIN_M2_COMBAT_MODULE_ID, {
      id: 'paladin',
      battleX: 300,
      formationRow: 'front',
    });
    const front = makeAlly('front', { battleX: 280, formationRow: 'front' });
    const back = makeAlly('back', {
      battleX: 10,
      formationRow: 'back',
    });
    const enemy = makePhysicalEnemy('enemy', { battleX: 350 });
    const players = [paladin, front, back];
    const enemies = [enemy];
    const internals = setEngineUnits(engine, players, enemies);
    internals.pendingHitQueue = [makePendingHit('enemy', 'back')];
    installAttackTargetMap(engine, players, enemies, { enemy: 'back' });

    const xBefore = paladin.battleX;
    fireM2(engine, paladin);
    expect(protectionResults[0]?.selectedTargetId).toBe('back');
    expect(protectionResults[0]?.outcome).toBe('applied');
    expect(paladin.battleX).toBe(xBefore);
    expect(hasDfPaladinM2ProtectionFrom(back, 'paladin')).toBe(true);
    expect(hasDfPaladinM2ProtectionFrom(front, 'paladin')).toBe(false);
  });

  it('switches protection target and preserves other paladin source', () => {
    const engine = createEngine();
    const paladin = makePaladin(DF_PALADIN_M2_COMBAT_MODULE_ID, {
      id: 'paladin',
    });
    const otherPaladin = makePaladin(DF_PALADIN_M2_COMBAT_MODULE_ID, {
      id: 'otherPaladin',
    });
    const allyA = makeAlly('allyA');
    const allyB = makeAlly('allyB');
    const e1 = makePhysicalEnemy('e1');
    const e2 = makePhysicalEnemy('e2');
    const players = [paladin, otherPaladin, allyA, allyB];
    const enemies = [e1, e2];
    const internals = setEngineUnits(engine, players, enemies);

    tryApplyDfPaladinM2Protection(otherPaladin, allyA, players,
      m2Params);
    expect(hasDfPaladinM2ProtectionFrom(allyA, 'otherPaladin')).toBe(true);

    internals.pendingHitQueue = [makePendingHit('e1', 'allyA')];
    installAttackTargetMap(engine, players, enemies, { e1: 'allyA', e2: null });
    fireM2(engine, paladin);
    expect(
      protectionResults.find((result) => result.protectorId === 'paladin')
        ?.outcome,
    ).toBe('applied');
    expect(hasDfPaladinM2ProtectionFrom(allyA, 'paladin')).toBe(true);

    internals.pendingHitQueue = [
      makePendingHit('e1', 'allyB'),
      makePendingHit('e2', 'allyB'),
    ];
    installAttackTargetMap(engine, players, enemies, {
      e1: 'allyB',
      e2: 'allyB',
    });
    protectionResults = [];
    fireM2(engine, paladin);
    expect(protectionResults[0]?.outcome).toBe('switched');
    expect(protectionResults[0]?.previousTargetId).toBe('allyA');
    expect(protectionResults[0]?.selectedTargetId).toBe('allyB');
    expect(hasDfPaladinM2ProtectionFrom(allyA, 'paladin')).toBe(false);
    expect(hasDfPaladinM2ProtectionFrom(allyA, 'otherPaladin')).toBe(true);
    expect(hasDfPaladinM2ProtectionFrom(allyB, 'paladin')).toBe(true);
  });

  it('refreshes same target without stacking multipliers', () => {
    const engine = createEngine();
    const paladin = makePaladin(DF_PALADIN_M2_COMBAT_MODULE_ID, {
      id: 'paladin',
    });
    const ally = makeAlly('ally', { def: 0, res: 0 });
    const enemy = makePhysicalEnemy('enemy');
    const players = [paladin, ally];
    const enemies = [enemy];
    const internals = setEngineUnits(engine, players, enemies);
    internals.pendingHitQueue = [makePendingHit('enemy', 'ally')];
    installAttackTargetMap(engine, players, enemies, { enemy: 'ally' });

    fireM2(engine, paladin);
    const fx = ally.statusEffects.filter(
      (effect) => effect.overlay === DF_PALADIN_M2_PROTECTION_OVERLAY,
    );
    expect(fx).toHaveLength(1);
    fx[0]!.remainingSec = 0.4;

    protectionResults = [];
    fireM2(engine, paladin);
    expect(protectionResults[0]?.outcome).toBe('refreshed');
    const refreshed = ally.statusEffects.filter(
      (effect) => effect.overlay === DF_PALADIN_M2_PROTECTION_OVERLAY,
    );
    expect(refreshed).toHaveLength(1);
    expect(refreshed[0]?.remainingSec).toBe(DF_PALADIN_M2_PROTECTION_DURATION_SEC);

    const baseline = resolveDamage(
      enemy,
      makeAlly('bare', { def: 0, res: 0 }),
      { ...damageEffect, damageType: 'physical' },
      {},
    );
    const protectedDamage = resolveDamage(
      enemy,
      ally,
      { ...damageEffect, damageType: 'physical' },
      {},
    );
    expect(protectedDamage).toBe(
      Math.max(
        1,
        Math.floor(baseline * DF_PALADIN_M2_ALL_DAMAGE_TAKEN_MULTIPLIER),
      ),
    );
  });

  it('signal 0: noTarget, no fallback, keeps existing until duration/wave clear', () => {
    const engine = createEngine();
    const paladin = makePaladin(DF_PALADIN_M2_COMBAT_MODULE_ID, {
      id: 'paladin',
    });
    const lowHp = makeAlly('low', { hp: 5, maxHp: 100 });
    const enemy = makePhysicalEnemy('enemy');
    const players = [paladin, lowHp];
    const enemies = [enemy];
    const internals = setEngineUnits(engine, players, enemies);
    internals.pendingHitQueue = [makePendingHit('enemy', 'low')];
    installAttackTargetMap(engine, players, enemies, { enemy: 'low' });
    fireM2(engine, paladin);
    expect(hasDfPaladinM2ProtectionFrom(lowHp, 'paladin')).toBe(true);

    internals.pendingHitQueue = [];
    installAttackTargetMap(engine, players, enemies, { enemy: null });
    protectionResults = [];
    fireM2(engine, paladin);
    expect(protectionResults[0]?.outcome).toBe('noTarget');
    expect(protectionResults[0]?.selectedTargetId).toBeNull();
    expect(protectionResults[0]?.dangerSnapshots?.length).toBeGreaterThan(0);
    expect(hasDfPaladinM2ProtectionFrom(lowHp, 'paladin')).toBe(true);
    expect(hasDfPaladinM2ProtectionFrom(paladin, 'paladin')).toBe(false);

    const fx = lowHp.statusEffects.find(
      (effect) => effect.overlay === DF_PALADIN_M2_PROTECTION_OVERLAY,
    )!;
    fx.remainingSec = 0.01;
    (
      engine as unknown as { tickStatusEffects: (dt: number) => void }
    ).tickStatusEffects(1);
    expect(hasDfPaladinM2ProtectionFrom(lowHp, 'paladin')).toBe(false);
  });

  it('M1 does not apply M2 protection', () => {
    const save = createDefaultSave(gameData, 'demo');
    const engine = new BattleEngine(
      gameData,
      levelCurves,
      () => save.party,
      () => save.stageProgress.currentStageId,
      {
        getSelectedCombatModuleId: () => 'df_paladin_basic_attack',
        onDfPaladinM2ProtectionResult: (result) => {
          protectionResults.push(result);
        },
      },
    );
    const paladin = makePaladin('df_paladin_basic_attack', { id: 'paladin' });
    const ally = makeAlly('ally');
    const enemy = makePhysicalEnemy('enemy');
    const players = [paladin, ally];
    const enemies = [enemy];
    const internals = setEngineUnits(engine, players, enemies);
    internals.pendingHitQueue = [makePendingHit('enemy', 'ally')];
    installAttackTargetMap(engine, players, enemies, { enemy: 'ally' });
    const basic = paladin.cooldowns.find((cd) => cd.slotKind === 'basic')!;
    basic.remaining = 0;
    basic.skillId = 'df_paladin_basic_attack';
    runUnitSkills(engine, [paladin]);
    expect(protectionResults).toHaveLength(0);
    expect(
      ally.statusEffects.some(
        (effect) => effect.overlay === DF_PALADIN_M2_PROTECTION_OVERLAY,
      ),
    ).toBe(false);
  });

  it('enemy-side M2 uses the same rules', () => {
    const engine = createEngine();
    const enemyPaladin = makePaladin(DF_PALADIN_M2_COMBAT_MODULE_ID, {
      id: 'enemyPaladin',
      isEnemy: true,
      battleX: 240,
    });
    const enemyBack = mockCombatant({
      id: 'enemyBack',
      isEnemy: true,
      formationRow: 'back',
      battleX: 320,
      def: 0,
      res: 0,
      hp: 300,
      maxHp: 300,
    });
    const player = makeAlly('playerAtk', { battleX: 100, atk: 200 });
    const players = [player];
    const enemies = [enemyPaladin, enemyBack];
    const internals = setEngineUnits(engine, players, enemies);
    internals.pendingHitQueue = [makePendingHit('playerAtk', 'enemyBack')];
    installAttackTargetMap(engine, players, enemies, {
      playerAtk: 'enemyBack',
    });
    fireM2(engine, enemyPaladin);
    expect(protectionResults[0]?.selectedTargetId).toBe('enemyBack');
    expect(hasDfPaladinM2ProtectionFrom(enemyBack, 'enemyPaladin')).toBe(true);

    const bare = mockCombatant({
      id: 'bare',
      isEnemy: true,
      def: 0,
      res: 0,
    });
    const phys = resolveDamage(
      player,
      enemyBack,
      { ...damageEffect, damageType: 'physical' },
      {},
    );
    const baseline = resolveDamage(
      player,
      bare,
      { ...damageEffect, damageType: 'physical' },
      {},
    );
    expect(phys).toBe(
      Math.max(
        1,
        Math.floor(baseline * DF_PALADIN_M2_ALL_DAMAGE_TAKEN_MULTIPLIER),
      ),
    );
  });

  it('wave reload clears runtime state and overlays', () => {
    const stageId = 'df_paladin_m2_wave_reset';
    const stage: StageDef = {
      id: stageId,
      displayName: 'M2 wave reset',
      recommendedLevel: 10,
      enemyGroups: [{ classId: 'at_swordsman', count: 1 }],
      waves: [{ enemies: [] }, { enemies: [] }],
    };
    gameData.stages = [
      ...gameData.stages.filter((entry) => entry.id !== stageId),
      stage,
    ];
    const save = createDefaultSave(gameData, 'demo');
    save.stageProgress.currentStageId = stageId;
    save.party[0] = {
      ...save.party[0]!,
      classId: 'df_paladin',
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
      progress: { level: 10, exp: 0 },
    };

    const engine = new BattleEngine(
      gameData,
      levelCurves,
      () => save.party,
      () => save.stageProgress.currentStageId,
      {
        getSelectedCombatModuleId: (slotIndex) =>
          slotIndex === 0 ? DF_PALADIN_M2_COMBAT_MODULE_ID : undefined,
      },
    );

    const ally = makeAlly('tracked');
    const paladin = makePaladin(DF_PALADIN_M2_COMBAT_MODULE_ID, {
      id: 'paladin',
    });
    tryApplyDfPaladinM2Protection(paladin, ally, [paladin, ally],
      m2Params);
    expect(hasDfPaladinM2ProtectionFrom(ally, 'paladin')).toBe(true);

    (
      engine as unknown as {
        reloadBattlefield: (wave?: number) => void;
      }
    ).reloadBattlefield(0);

    expect(hasDfPaladinM2ProtectionFrom(ally, 'paladin')).toBe(true);
    // old combatant object may still hold overlay; runtime tracking must reset
    const nextApply = tryApplyDfPaladinM2Protection(
      makePaladin(DF_PALADIN_M2_COMBAT_MODULE_ID, { id: 'paladin' }),
      makeAlly('fresh'),
      [],
      m2Params);
    expect(nextApply.previousTargetId).toBeNull();
    expect(nextApply.outcome).toBe('applied');

    const players = (engine as unknown as { players: CombatantState[] })
      .players;
    expect(
      players.every(
        (unit) =>
          !unit.statusEffects.some(
            (effect) => effect.overlay === DF_PALADIN_M2_PROTECTION_OVERLAY,
          ),
      ),
    ).toBe(true);
  });

  it('does not heal, raise barrier, self-protect, or multi-target', () => {
    const engine = createEngine();
    const paladin = makePaladin(DF_PALADIN_M2_COMBAT_MODULE_ID, {
      id: 'paladin',
      hp: 200,
      maxHp: 400,
      barrierHp: 0,
    });
    const allyA = makeAlly('allyA', { hp: 200, maxHp: 200, barrierHp: 0 });
    const allyB = makeAlly('allyB', { hp: 200, maxHp: 200, barrierHp: 0 });
    const e1 = makePhysicalEnemy('e1');
    const e2 = makePhysicalEnemy('e2');
    const players = [paladin, allyA, allyB];
    const enemies = [e1, e2];
    const internals = setEngineUnits(engine, players, enemies);
    internals.pendingHitQueue = [
      makePendingHit('e1', 'allyA'),
      makePendingHit('e2', 'allyB'),
    ];
    installAttackTargetMap(engine, players, enemies, {
      e1: 'allyA',
      e2: 'allyA',
    });

    const hpBefore = {
      paladin: paladin.hp,
      a: allyA.hp,
      b: allyB.hp,
    };
    const barrierBefore = {
      paladin: paladin.barrierHp,
      a: allyA.barrierHp,
      b: allyB.barrierHp,
    };
    fireM2(engine, paladin);

    expect(paladin.hp).toBe(hpBefore.paladin);
    expect(allyA.hp).toBe(hpBefore.a);
    expect(allyB.hp).toBe(hpBefore.b);
    expect(paladin.barrierHp).toBe(barrierBefore.paladin);
    expect(allyA.barrierHp).toBe(barrierBefore.a);
    expect(allyB.barrierHp).toBe(barrierBefore.b);
    expect(hasDfPaladinM2ProtectionFrom(paladin, 'paladin')).toBe(false);
    const protectedCount = [allyA, allyB, paladin].filter((unit) =>
      unit.statusEffects.some(
        (effect) => effect.overlay === DF_PALADIN_M2_PROTECTION_OVERLAY,
      ),
    ).length;
    expect(protectedCount).toBe(1);
    expect(protectionResults[0]?.selectedTargetId).toBe('allyA');
  });
});
