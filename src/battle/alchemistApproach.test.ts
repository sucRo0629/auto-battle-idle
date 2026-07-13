import { describe, expect, it } from 'vitest';
import { loadGameData } from './data/loadGameData.ts';
import {
  resolveApproachAttackBattleX,
  resolveApproachRangePx,
  resolveBasicAttackRangePx,
} from './combatPosition.ts';
import {
  asBattleEngineInternals,
  TICK_DT,
  waitForEngaged,
} from './test/battleFieldSpec.harness.ts';
import { createDefaultSave } from '../progression/victoryRewards.ts';
import { loadLevelCurves } from '../progression/levelGrowth.ts';
import levelCurvesJson from '../../data/levelCurves.json';
import { BattleEngine } from './BattleEngine.ts';
import { createMemberFromClass } from '../progression/partyCompose.ts';
import { reconcileMemberBuildFromGameData } from '../progression/skillBuild.ts';
import type { CombatantState } from './types.ts';

function createAlchemistGuardianEngine(): BattleEngine {
  const gameData = structuredClone(loadGameData());
  const levelCurves = loadLevelCurves(levelCurvesJson);
  const save = createDefaultSave(gameData, 'demo');
  save.stageProgress.currentStageId = '1';

  const guardian = createMemberFromClass('df_guardian', gameData);
  const alchemist = createMemberFromClass('sp_alchemist', gameData);
  guardian.progress.level = 12;
  alchemist.progress.level = 12;
  reconcileMemberBuildFromGameData(guardian, gameData);
  reconcileMemberBuildFromGameData(alchemist, gameData);
  save.party = [guardian, alchemist, null, null];

  const engine = new BattleEngine(
    gameData,
    levelCurves,
    () => save.party,
    () => save.stageProgress.currentStageId,
  );
  engine.startBattle();
  return engine;
}

function mockAlchemist(battleX: number, overrides: Partial<CombatantState> = {}) {
  return {
    id: 'alchemist',
    name: '薬草師',
    hp: 98,
    maxHp: 98,
    atk: 17,
    def: 9,
    res: 10,
    isAlive: true,
    role: 'supporter' as const,
    classId: 'sp_alchemist',
    formationRow: 'back' as const,
    traits: {
      rangePx: 128,
      damageType: 'magic' as const,
      basicAttackVfx: { enabled: true },
    },
    build: {
      learnedPassiveIds: [],
      learnedActiveIds: ['sp_alchemist_active_1'],
      equippedActiveSlots: ['sp_alchemist_active_1'],
    },
    cooldowns: [
      { skillId: 'sp_alchemist_basic_attack', remaining: 0, slotKind: 'basic' },
      {
        skillId: 'sp_alchemist_active_1',
        remaining: 0,
        slotKind: 'active',
        slotIndex: 0,
      },
    ],
    statusEffects: [],
    barrierHp: 0,
    spriteKey: 'placeholder',
    iconKey: 'placeholder',
    isEnemy: false,
    battleX,
    corpseVisible: true,
    ...overrides,
  } satisfies CombatantState;
}

describe('alchemist approach (melee-band active range regression)', () => {
  const gameData = loadGameData();

  it('active ready: basic and approach range use effective skill range', () => {
    const alchemist = mockAlchemist(80);
    const basic = resolveBasicAttackRangePx(alchemist, gameData, 4);
    const approach = resolveApproachRangePx(alchemist, gameData, 4);
    expect(basic).toBeGreaterThanOrEqual(100);
    expect(approach).toBeGreaterThanOrEqual(100);
  });

  it('resolveApproachAttackBattleX never returns left of current battleX (melee-band heal range)', () => {
    const alchemist = mockAlchemist(180, {
      traits: {
        rangePx: 90,
        damageType: 'magic',
        basicAttackVfx: { enabled: true },
      },
    });
    const stopX = resolveApproachAttackBattleX(alchemist, 120, gameData, 4);
    expect(stopX).toBeGreaterThanOrEqual(180);
  });

  it('demo party (alchemist replaces cleric): no left drift', () => {
    const gameData = structuredClone(loadGameData());
    const levelCurves = loadLevelCurves(levelCurvesJson);
    const save = createDefaultSave(gameData, 'demo');
    save.stageProgress.currentStageId = '1';
    for (const slot of save.party) {
      if (slot?.classId === 'sp_cleric') slot.classId = 'sp_alchemist';
      if (slot) slot.progress.level = 12;
    }

    const engine = new BattleEngine(
      gameData,
      levelCurves,
      () => save.party,
      () => save.stageProgress.currentStageId,
    );
    engine.startBattle();
    waitForEngaged(engine);

    let engageX: number | null = null;
    let minX = Infinity;

    for (let t = 0; t < 25_000; t++) {
      engine.tick(TICK_DT);
      if (!engine.getSnapshot().engaged) continue;
      const alch = asBattleEngineInternals(engine).players.find(
        (p) => p.classId === 'sp_alchemist' && p.isAlive,
      );
      if (!alch) break;
      if (engageX === null) engageX = alch.battleX;
      minX = Math.min(minX, alch.battleX);
    }

    expect(engageX).not.toBeNull();
    expect(minX).toBeGreaterThanOrEqual((engageX ?? 0) - 4);
  });

  it('guardian + alchemist: no left drift after engage or front-row wipe', () => {
    const engine = createAlchemistGuardianEngine();
    waitForEngaged(engine);

    let engageAlchemistX: number | null = null;
    let minX = Infinity;
    let frontWipeTick = -1;
    let xAtFrontWipe: number | null = null;

    for (let t = 0; t < 20_000; t++) {
      engine.tick(TICK_DT);
      const snap = engine.getSnapshot();
      if (!snap.engaged) continue;

      const internal = asBattleEngineInternals(engine);
      const alch = internal.players.find(
        (p) => p.classId === 'sp_alchemist' && p.isAlive,
      );
      if (!alch) break;

      if (engageAlchemistX === null) engageAlchemistX = alch.battleX;
      minX = Math.min(minX, alch.battleX);

      const frontAlive = internal.players.some(
        (a) => a.formationRow === 'front' && a.isAlive,
      );
      if (frontWipeTick < 0 && !frontAlive) {
        frontWipeTick = t;
        xAtFrontWipe = alch.battleX;
      }

      if (frontWipeTick >= 0 && t - frontWipeTick > 300) break;
    }

    expect(engageAlchemistX).not.toBeNull();
    expect(minX).toBeGreaterThanOrEqual((engageAlchemistX ?? 0) - 4);
    if (xAtFrontWipe !== null) {
      expect(minX).toBeGreaterThanOrEqual(xAtFrontWipe - 4);
    }
  });
});
