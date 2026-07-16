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
import { createResolveCurrentAttackTarget } from './resolveApproachBattleX.ts';
import type { CombatantState, PendingSkillHit, SkillEffectDef } from './types.ts';
import {
  DF_PALADIN_M2_ALL_DAMAGE_TAKEN_MULTIPLIER,
  DF_PALADIN_M2_COMBAT_MODULE_ID,
  DF_PALADIN_M2_MAGIC_EXTRA_TAKEN_MULTIPLIER,
  DF_PALADIN_M2_PROTECTION_DURATION_SEC,
  DF_PALADIN_M2_PROTECTION_OVERLAY,
  clearDfPaladinM2RuntimeState,
  executeDfPaladinM2DangerProtection,
  hasDfPaladinM2ProtectionFrom,
  isDfPaladinM2Selected,
  tryApplyDfPaladinM2Protection,
} from './dfPaladinM2.ts';
import { mockCombatant } from './testFixtures.ts';

const gameData = loadGameData();
const levelCurves = loadLevelCurves(levelCurvesJson);

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
      learnedPassiveIds: [],
      learnedActiveIds: [],
      equippedActiveSlots: [],
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

function runtimeFor(
  allies: CombatantState[],
  enemies: CombatantState[],
  params: {
    battleSec?: number;
    pendingHits?: PendingSkillHit[];
    resolveCurrentAttackTarget?: ReturnType<typeof resolveTargets>;
  } = {},
) {
  return buildDangerTargetingRuntime(allies, enemies, gameData, {
    battleSec: params.battleSec ?? 0,
    pendingHits: params.pendingHits ?? [],
    resolveCurrentAttackTarget:
      params.resolveCurrentAttackTarget ??
      createResolveCurrentAttackTarget(allies, enemies, gameData),
  });
}

function makePendingHit(
  actorId: string,
  targetId: string,
  battleSec = 0,
): PendingSkillHit {
  return {
    applyAtBattleSec: battleSec,
    actorId,
    skillId: 'enemy_basic',
    skillName: 'enemy_basic',
    effectDef: damageEffect,
    effectIndex: 0,
    slotKind: 'basic',
    hitIndex: 0,
    targets: [{ targetId }],
  };
}

beforeEach(() => {
  clearDfPaladinM2RuntimeState();
});

describe('dfPaladinM2 runtime (R12g-c4)', () => {
  it('selects M2 only when basic module ID matches', () => {
    expect(
      isDfPaladinM2Selected(makePaladin(DF_PALADIN_M2_COMBAT_MODULE_ID)),
    ).toBe(true);
    expect(
      isDfPaladinM2Selected(makePaladin('df_paladin_basic_attack')),
    ).toBe(false);
  });

  it('applies protection to concentrated danger target', () => {
    const paladin = makePaladin(DF_PALADIN_M2_COMBAT_MODULE_ID, { id: 'paladin' });
    const front = makePaladin('df_paladin_basic_attack', {
      id: 'front',
      battleX: 120,
    });
    const back = makePaladin('df_paladin_basic_attack', {
      id: 'back',
      formationRow: 'back',
      battleX: 40,
    });
    const enemyA = mockCombatant({
      id: 'enemyA',
      isEnemy: true,
      battleX: 200,
    });
    const enemyB = mockCombatant({
      id: 'enemyB',
      isEnemy: true,
      battleX: 210,
    });
    const allies = [paladin, front, back];
    const enemies = [enemyA, enemyB];
    const runtime = runtimeFor(allies, enemies, {
      pendingHits: [makePendingHit('enemyA', 'back'), makePendingHit('enemyB', 'back')],
      resolveCurrentAttackTarget: resolveTargets([...allies, ...enemies], {
        enemyA: 'back',
        enemyB: 'back',
      }),
    });

    const result = executeDfPaladinM2DangerProtection(
      paladin,
      allies,
      enemies,
      runtime,
    );

    expect(result.outcome).toBe('applied');
    expect(result.selectedTargetId).toBe('back');
    expect(hasDfPaladinM2ProtectionFrom(back, 'paladin')).toBe(true);
    const selectedSnap = result.dangerSnapshots?.find(
      (snap) => snap.targetId === 'back',
    );
    expect(selectedSnap?.currentAttackerCount).toBe(2);
    expect(selectedSnap?.pendingHitCount).toBe(2);
    expect(back.statusEffects.some((fx) => fx.overlay === 'barrier')).toBe(false);
    expect(back.hp).toBe(back.maxHp);
  });

  it('no-ops on danger signal 0 without PHT fallback', () => {
    const paladin = makePaladin(DF_PALADIN_M2_COMBAT_MODULE_ID, { id: 'paladin' });
    const lowHp = makePaladin('df_paladin_basic_attack', {
      id: 'low',
      hp: 10,
      maxHp: 100,
    });
    const allies = [paladin, lowHp];
    const enemies = [mockCombatant({ id: 'enemy', isEnemy: true })];
    const result = executeDfPaladinM2DangerProtection(
      paladin,
      allies,
      enemies,
      runtimeFor(allies, enemies),
    );
    expect(result.outcome).toBe('noTarget');
    expect(result.selectedTargetId).toBeNull();
    expect(hasDfPaladinM2ProtectionFrom(lowHp, 'paladin')).toBe(false);
    expect(hasDfPaladinM2ProtectionFrom(paladin, 'paladin')).toBe(false);
  });

  it('protects backline regardless of distance', () => {
    const paladin = makePaladin(DF_PALADIN_M2_COMBAT_MODULE_ID, {
      id: 'paladin',
      battleX: 300,
    });
    const back = makePaladin('df_paladin_basic_attack', {
      id: 'back',
      formationRow: 'back',
      battleX: 20,
    });
    const enemy = mockCombatant({ id: 'enemy', isEnemy: true, battleX: 400 });
    const allies = [paladin, back];
    const enemies = [enemy];
    const runtime = runtimeFor(allies, enemies, {
      pendingHits: [makePendingHit('enemy', 'back')],
      resolveCurrentAttackTarget: resolveTargets([...allies, ...enemies], {
        enemy: 'back',
      }),
    });
    const result = executeDfPaladinM2DangerProtection(
      paladin,
      allies,
      enemies,
      runtime,
    );
    expect(result.selectedTargetId).toBe('back');
  });

  it('reduces physical damage via all-attribute taken multiplier', () => {
    const target = mockCombatant({ id: 'target', def: 0, res: 0 });
    const attacker = mockCombatant({ id: 'attacker', atk: 100 });
    const baseline = resolveDamage(
      attacker,
      target,
      { ...damageEffect, damageType: 'physical' },
      {},
    );
    tryApplyDfPaladinM2Protection(
      mockCombatant({ id: 'paladin' }),
      target,
      [target],
    );
    const protectedDamage = resolveDamage(
      attacker,
      target,
      { ...damageEffect, damageType: 'physical' },
      {},
    );
    expect(protectedDamage).toBe(
      Math.max(1, Math.floor(baseline * DF_PALADIN_M2_ALL_DAMAGE_TAKEN_MULTIPLIER)),
    );
  });

  it('reduces magic damage more than physical', () => {
    const target = mockCombatant({ id: 'target', def: 0, res: 0 });
    const attacker = mockCombatant({ id: 'attacker', atk: 100 });
    tryApplyDfPaladinM2Protection(
      mockCombatant({ id: 'paladin' }),
      target,
      [target],
    );
    const physical = resolveDamage(
      attacker,
      target,
      { ...damageEffect, damageType: 'physical' },
      {},
    );
    const magic = resolveDamage(
      attacker,
      target,
      { ...damageEffect, damageType: 'magic' },
      {},
    );
    expect(magic).toBeLessThan(physical);
    const unprotectedMagic = resolveDamage(
      attacker,
      mockCombatant({ id: 't2', def: 0, res: 0 }),
      { ...damageEffect, damageType: 'magic' },
      {},
    );
    expect(magic).toBe(
      Math.max(
        1,
        Math.floor(
          unprotectedMagic *
            DF_PALADIN_M2_ALL_DAMAGE_TAKEN_MULTIPLIER *
            DF_PALADIN_M2_MAGIC_EXTRA_TAKEN_MULTIPLIER,
        ),
      ),
    );
  });

  it('switches protection from old target to new danger target', () => {
    const protector = mockCombatant({ id: 'paladin' });
    const oldTarget = mockCombatant({ id: 'old' });
    const newTarget = mockCombatant({ id: 'new' });
    tryApplyDfPaladinM2Protection(protector, oldTarget, [oldTarget, newTarget]);
    expect(hasDfPaladinM2ProtectionFrom(oldTarget, 'paladin')).toBe(true);
    const switched = tryApplyDfPaladinM2Protection(protector, newTarget, [
      oldTarget,
      newTarget,
    ]);
    expect(switched.outcome).toBe('switched');
    expect(hasDfPaladinM2ProtectionFrom(oldTarget, 'paladin')).toBe(false);
    expect(hasDfPaladinM2ProtectionFrom(newTarget, 'paladin')).toBe(true);
  });

  it('refreshes duration on same target without stacking', () => {
    const protector = mockCombatant({ id: 'paladin' });
    const target = mockCombatant({ id: 'target' });
    tryApplyDfPaladinM2Protection(protector, target, [target]);
    target.statusEffects[0]!.remainingSec = 0.5;
    const refreshed = tryApplyDfPaladinM2Protection(protector, target, [target]);
    expect(refreshed.outcome).toBe('refreshed');
    const protectionEffects = target.statusEffects.filter(
      (fx) => fx.overlay === DF_PALADIN_M2_PROTECTION_OVERLAY,
    );
    expect(protectionEffects).toHaveLength(1);
    expect(protectionEffects[0]?.remainingSec).toBe(DF_PALADIN_M2_PROTECTION_DURATION_SEC);
  });

  it('keeps independent protections for multiple paladins', () => {
    const paladinA = mockCombatant({ id: 'paladinA' });
    const paladinB = mockCombatant({ id: 'paladinB' });
    const target = mockCombatant({ id: 'target' });
    tryApplyDfPaladinM2Protection(paladinA, target, [target]);
    tryApplyDfPaladinM2Protection(paladinB, target, [target]);
    expect(hasDfPaladinM2ProtectionFrom(target, 'paladinA')).toBe(true);
    expect(hasDfPaladinM2ProtectionFrom(target, 'paladinB')).toBe(true);
  });

  it('applies the same rules for enemy paladins', () => {
    const enemyPaladin = makePaladin(DF_PALADIN_M2_COMBAT_MODULE_ID, {
      id: 'enemyPaladin',
      isEnemy: true,
      battleX: 200,
    });
    const enemyAlly = mockCombatant({
      id: 'enemyAlly',
      isEnemy: true,
      battleX: 180,
    });
    const player = mockCombatant({ id: 'player', isEnemy: false, battleX: 50 });
    const allies = [player];
    const enemies = [enemyPaladin, enemyAlly];
    const runtime = runtimeFor(allies, enemies, {
      pendingHits: [makePendingHit('player', 'enemyAlly')],
      resolveCurrentAttackTarget: resolveTargets([...allies, ...enemies], {
        player: 'enemyAlly',
      }),
    });
    const result = executeDfPaladinM2DangerProtection(
      enemyPaladin,
      allies,
      enemies,
      runtime,
    );
    expect(result.selectedTargetId).toBe('enemyAlly');
    expect(hasDfPaladinM2ProtectionFrom(enemyAlly, 'enemyPaladin')).toBe(true);
  });

  it('does not protect the paladin when another ally is dangerous', () => {
    const paladin = makePaladin(DF_PALADIN_M2_COMBAT_MODULE_ID, { id: 'paladin' });
    const ally = makePaladin('df_paladin_basic_attack', { id: 'ally' });
    const enemy = mockCombatant({ id: 'enemy', isEnemy: true });
    const allies = [paladin, ally];
    const enemies = [enemy];
    const runtime = runtimeFor(allies, enemies, {
      pendingHits: [makePendingHit('enemy', 'ally')],
    });
    const result = executeDfPaladinM2DangerProtection(
      paladin,
      allies,
      enemies,
      runtime,
    );
    expect(result.selectedTargetId).toBe('ally');
    expect(hasDfPaladinM2ProtectionFrom(paladin, 'paladin')).toBe(false);
  });

  it('keeps existing protection when danger signal drops to zero', () => {
    const paladin = makePaladin(DF_PALADIN_M2_COMBAT_MODULE_ID, { id: 'paladin' });
    const ally = makePaladin('df_paladin_basic_attack', { id: 'ally' });
    const enemy = mockCombatant({ id: 'enemy', isEnemy: true });
    const allies = [paladin, ally];
    const enemies = [enemy];
    const withDanger = runtimeFor(allies, enemies, {
      pendingHits: [makePendingHit('enemy', 'ally')],
    });
    executeDfPaladinM2DangerProtection(paladin, allies, enemies, withDanger);
    const noDanger = executeDfPaladinM2DangerProtection(
      paladin,
      allies,
      enemies,
      runtimeFor(allies, enemies),
    );
    expect(noDanger.outcome).toBe('noTarget');
    expect(hasDfPaladinM2ProtectionFrom(ally, 'paladin')).toBe(true);
  });

  it('limits protection to one danger target', () => {
    const paladin = makePaladin(DF_PALADIN_M2_COMBAT_MODULE_ID, { id: 'paladin' });
    const a = makePaladin('df_paladin_basic_attack', { id: 'a' });
    const b = makePaladin('df_paladin_basic_attack', { id: 'b' });
    const enemyA = mockCombatant({ id: 'enemyA', isEnemy: true });
    const enemyB = mockCombatant({ id: 'enemyB', isEnemy: true });
    const allies = [paladin, a, b];
    const enemies = [enemyA, enemyB];
    const runtime = runtimeFor(allies, enemies, {
      pendingHits: [
        makePendingHit('enemyA', 'a'),
        makePendingHit('enemyB', 'b'),
      ],
    });
    const result = executeDfPaladinM2DangerProtection(
      paladin,
      allies,
      enemies,
      runtime,
    );
    expect(result.selectedTargetId).not.toBeNull();
    const protectedCount = [a, b].filter((unit) =>
      unit.statusEffects.some(
        (fx) => fx.overlay === DF_PALADIN_M2_PROTECTION_OVERLAY,
      ),
    ).length;
    expect(protectedCount).toBe(1);
  });

  it('clears runtime state on wave reset helper', () => {
    const protector = mockCombatant({ id: 'paladin' });
    const target = mockCombatant({ id: 'target' });
    tryApplyDfPaladinM2Protection(protector, target, [target]);
    clearDfPaladinM2RuntimeState();
    target.statusEffects = [];
    const result = tryApplyDfPaladinM2Protection(protector, target, [target]);
    expect(result.previousTargetId).toBeNull();
  });
});

describe('dfPaladinM2 integration (R12g-c4)', () => {
  beforeEach(() => {
    resetEntityIdCounter();
    clearDfPaladinM2RuntimeState();
  });

  function createEngine(selectedModuleId?: string) {
    const save = createDefaultSave(gameData, 'demo');
    return new BattleEngine(
      gameData,
      levelCurves,
      () => save.party,
      () => save.stageProgress.currentStageId,
      {
        getSelectedCombatModuleId: (slotIndex) =>
          slotIndex === 0 ? selectedModuleId : undefined,
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
    battleSec = 0,
  ) {
    const internals = engine as unknown as {
      players: CombatantState[];
      enemies: CombatantState[];
      battleTimeSec: number;
      engaged: boolean;
    };
    internals.players = players;
    internals.enemies = enemies;
    internals.battleTimeSec = battleSec;
    internals.engaged = true;
  }

  it('uses BattleEngine targeting runtime to protect danger target on basic action', () => {
    const engine = createEngine(DF_PALADIN_M2_COMBAT_MODULE_ID);
    const paladin = makePaladin(DF_PALADIN_M2_COMBAT_MODULE_ID, {
      id: 'paladin',
    });
    paladin.cooldowns.find((cd) => cd.slotKind === 'basic')!.remaining = 0;
    const ally = makePaladin('df_paladin_basic_attack', { id: 'ally' });
    const enemy = mockCombatant({ id: 'enemy', isEnemy: true, battleX: 220 });
    setEngineUnits(engine, [paladin, ally], [enemy]);
    const internals = engine as unknown as {
      pendingHitQueue: PendingSkillHit[];
    };
    internals.pendingHitQueue = [makePendingHit('enemy', 'ally')];

    runUnitSkills(engine, [paladin]);

    expect(hasDfPaladinM2ProtectionFrom(ally, 'paladin')).toBe(true);
    expect(
      paladin.cooldowns.find((cd) => cd.slotKind === 'basic')!.remaining,
    ).toBeGreaterThan(0);
  });

  it('does not fire M2 protection for M1/basic legacy module', () => {
    const engine = createEngine('df_paladin_basic_attack');
    const paladin = makePaladin('df_paladin_basic_attack', { id: 'paladin' });
    paladin.cooldowns.find((cd) => cd.slotKind === 'basic')!.remaining = 0;
    const ally = makePaladin('df_paladin_basic_attack', { id: 'ally' });
    const enemy = mockCombatant({
      id: 'enemy',
      isEnemy: true,
      battleX: 180,
      hp: 500,
      maxHp: 500,
    });
    setEngineUnits(engine, [paladin, ally], [enemy]);
    const internals = engine as unknown as {
      pendingHitQueue: PendingSkillHit[];
    };
    internals.pendingHitQueue = [makePendingHit('enemy', 'ally')];

    runUnitSkills(engine, [paladin]);

    expect(
      ally.statusEffects.some(
        (fx) => fx.overlay === DF_PALADIN_M2_PROTECTION_OVERLAY,
      ),
    ).toBe(false);
  });
});
