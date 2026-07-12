import { describe, expect, it } from 'vitest';
import levelCurvesJson from '../../data/levelCurves.json';
import { BattleEngine } from '../battle/BattleEngine.ts';
import { loadGameData } from '../battle/data/loadGameData.ts';
import { resolveBasicAttackSkillIdFromGameData } from '../battle/data/resolveCombatModuleBasic.ts';
import { resolveLearnedSkills } from '../progression/skillUnlocks.ts';
import { loadLevelCurves } from '../progression/levelGrowth.ts';
import { createDefaultSave } from '../progression/victoryRewards.ts';
import { R5_COMBAT_MODULE_CLASS_IDS } from '../battle/types.ts';
import type {
  BattleSnapshot,
  CombatantSnapshot,
  GameData,
  PartyMemberState,
} from '../battle/types.ts';
import {
  buildPartyHudEntries,
  type PartyHudMeta,
} from './partyHudTypes.ts';

const gameData = loadGameData();
const levelCurves = loadLevelCurves(levelCurvesJson);

function mockAlly(
  partySlotIndex: number,
  basicSkillId: string,
  overrides: Partial<CombatantSnapshot> = {},
): CombatantSnapshot {
  return {
    id: `ally-${partySlotIndex}`,
    name: 'Test',
    hp: 100,
    maxHp: 100,
    baseMaxHp: 100,
    barrierHp: 0,
    atk: 10,
    def: 5,
    res: 0,
    rangePx: 30 + partySlotIndex,
    effectiveRangePx: 30 + partySlotIndex,
    damageType: 'physical',
    spriteKey: 'x',
    iconKey: 'x',
    formationRow: 'front',
    isEnemy: false,
    battleX: 0,
    bodyAnimMarching: false,
    partySlotIndex,
    basicSkillId,
    statusEffects: [],
    activeCooldowns: [],
    ...overrides,
  };
}

function mockSnapshot(allies: CombatantSnapshot[]): BattleSnapshot {
  return {
    phase: 'running',
    runtimePhase: 'engaged',
    engaged: true,
    waveIndex: 0,
    waveCount: 1,
    worldOffsetX: 0,
    allyRangePassiveBands: [],
    waveAnnouncementActive: false,
    waveAnnouncementElapsedMs: 0,
    partyDeployActive: false,
    partyDeploySettled: true,
    formationResetActive: false,
    alliesOffScreen: false,
    victoryUseTimerFade: false,
    victoryAwaitExitMarch: false,
    awaitingNextWave: false,
    players: [],
    allies,
    enemies: [],
  } as unknown as BattleSnapshot;
}

function meta(displayName: string): PartyHudMeta {
  return { displayName, unlockedActiveSlotCount: 4 };
}

function mockMemberAtLevel(
  classId: string,
  level: number,
  data: GameData,
): PartyMemberState {
  const preset = data.classRegistry[classId]!;
  const learned = resolveLearnedSkills(preset, level, data.skillRegistry);
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

describe('R9.5b party HUD legacy active gauge visibility (view model)', () => {
  it.each(R5_COMBAT_MODULE_CLASS_IDS.map((classId) => ({ classId })))(
    'marks $classId with hasCombatModuleBasic=true (hides legacy 2x2 gauge)',
    ({ classId }) => {
      const preset = gameData.classRegistry[classId]!;
      const basicSkillId = resolveBasicAttackSkillIdFromGameData(
        preset,
        gameData,
      );
      const entries = buildPartyHudEntries(
        mockSnapshot([mockAlly(0, basicSkillId)]),
        [meta(preset.displayName), null, null, null],
        gameData.combatModuleRegistry,
      );
      expect(entries[0]?.hasCombatModuleBasic).toBe(true);
      expect(entries[0]?.activeCooldowns).toHaveLength(0);
    },
  );

  it('keeps hasCombatModuleBasic=false for a legacy class (retains legacy gauge)', () => {
    const preset = gameData.classRegistry.at_ranger!;
    const entries = buildPartyHudEntries(
      mockSnapshot([mockAlly(0, preset.basicAttackSkillId)]),
      [meta(preset.displayName), null, null, null],
      gameData.combatModuleRegistry,
    );
    expect(entries[0]?.hasCombatModuleBasic).toBe(false);
  });

  it('gives module and legacy units different gauge modes in a mixed party', () => {
    const guardian = gameData.classRegistry.df_guardian!;
    const ranger = gameData.classRegistry.at_ranger!;
    const entries = buildPartyHudEntries(
      mockSnapshot([
        mockAlly(0, resolveBasicAttackSkillIdFromGameData(guardian, gameData), {
          rangePx: 30,
        }),
        mockAlly(1, ranger.basicAttackSkillId, { rangePx: 200 }),
      ]),
      [meta(guardian.displayName), meta(ranger.displayName), null, null],
      gameData.combatModuleRegistry,
    );
    const byName = new Map(
      entries
        .filter((e): e is NonNullable<typeof e> => e !== null)
        .map((e) => [e.displayName, e]),
    );
    expect(byName.get(guardian.displayName)?.hasCombatModuleBasic).toBe(true);
    expect(byName.get(ranger.displayName)?.hasCombatModuleBasic).toBe(false);
  });

  it('defaults hasCombatModuleBasic=false when no registry is provided', () => {
    const entries = buildPartyHudEntries(
      mockSnapshot([mockAlly(0, 'df_guardian_mod_nearest_strike')]),
      [meta('X'), null, null, null],
    );
    expect(entries[0]?.hasCombatModuleBasic).toBe(false);
  });
});

describe('R9.5b party HUD legacy active gauge visibility (runtime integration)', () => {
  it('resolves module basicSkillId through the engine snapshot for all 4 classes', () => {
    const save = createDefaultSave(gameData, 'demo');
    save.party = R5_COMBAT_MODULE_CLASS_IDS.map((classId) =>
      mockMemberAtLevel(classId, 10, gameData),
    );
    const engine = new BattleEngine(
      gameData,
      levelCurves,
      () => save.party,
      () => save.stageProgress.currentStageId,
    );
    engine.startBattle();

    const snapshot = engine.getSnapshot();
    const entries = buildPartyHudEntries(
      snapshot,
      save.party.map((member) =>
        member
          ? meta(gameData.classRegistry[member.classId]!.displayName)
          : null,
      ),
      gameData.combatModuleRegistry,
    );

    const moduleEntries = entries.filter(
      (e): e is NonNullable<typeof e> => e !== null,
    );
    expect(moduleEntries).toHaveLength(R5_COMBAT_MODULE_CLASS_IDS.length);
    for (const entry of moduleEntries) {
      expect(entry.hasCombatModuleBasic).toBe(true);
      expect(entry.activeCooldowns).toHaveLength(0);
    }
  });
});
