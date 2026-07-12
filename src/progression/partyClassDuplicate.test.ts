/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import levelCurvesJson from '../../data/levelCurves.json';
import { BattleEngine } from '../battle/BattleEngine.ts';
import { loadGameData } from '../battle/data/loadGameData.ts';
import {
  createAlliesFromPartyState,
  createEnemiesForStage,
  PartyDuplicateClassError,
  resetEntityIdCounter,
} from '../battle/entities.ts';
import { expandEnemyGroups } from '../battle/enemyGroupSpawn.ts';
import { loadLevelCurves } from './levelGrowth.ts';
import { PartyCombatModuleSelection } from '../battle/partyCombatModuleSelection.ts';
import { GameSession } from '../game/GameSession.ts';
import { setVerifyModeEnabled } from '../dev/verifyMode.ts';
import { createDefaultSave } from './victoryRewards.ts';
import {
  createMemberFromClass,
  getAssignableClassIds,
  normalizePartyClassId,
  validatePartyClassAssignment,
  validatePartyClassIds,
} from './partyCompose.ts';
import type { ClassId, PartySlotState, StageDef } from '../battle/types.ts';
import { R5_COMBAT_MODULE_CLASS_IDS } from '../battle/types.ts';

const levelCurves = loadLevelCurves(levelCurvesJson);

function mockMember(classId: ClassId) {
  return {
    classId,
    build: {
      learnedPassiveIds: [] as string[],
      learnedActiveIds: [] as string[],
      equippedActiveSlots: [] as (string | null)[],
    },
    progress: { level: 10, exp: 0 },
  };
}

function partyFromClassIds(...classIds: ClassId[]): PartySlotState[] {
  return [
    classIds[0] ? mockMember(classIds[0]) : null,
    classIds[1] ? mockMember(classIds[1]) : null,
    classIds[2] ? mockMember(classIds[2]) : null,
    classIds[3] ? mockMember(classIds[3]) : null,
  ];
}

function mockCanvas2d(): void {
  const ctx = {
    imageSmoothingEnabled: true,
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn(() => ({ width: 0 })),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    rotate: vi.fn(),
    setTransform: vi.fn(),
    drawImage: vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    canvas: { width: 800, height: 600 },
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    ctx as unknown as CanvasRenderingContext2D,
  );
}

function createSession(): GameSession {
  const gameData = loadGameData();
  const container = document.createElement('div');
  document.body.appendChild(container);
  return new GameSession(gameData, container);
}

function stageWithDuplicateEnemyGroups(): StageDef {
  return {
    id: 'r5f_enemy_dup_test',
    displayName: 'R5f Enemy Dup Test',
    recommendedLevel: 10,
    enemyGroups: [
      { classId: 'df_guardian', count: 2 },
      { classId: 'at_swordsman', count: 1, selectedCombatModuleId: 'at_swordsman_mod_pierce_slash' },
    ],
    waves: [{ enemies: [] }],
  };
}

describe('party classId duplicate prohibition (R5f)', () => {
  beforeEach(() => {
    localStorage.clear();
    resetEntityIdCounter();
    mockCanvas2d();
    setVerifyModeEnabled(true);
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  describe('validation helpers', () => {
    it('1. four distinct classes are valid', () => {
      const party = partyFromClassIds(
        'df_guardian',
        'at_swordsman',
        'sp_cleric',
        'at_ranger',
      );
      expect(validatePartyClassIds(party)).toEqual({ ok: true });
    });

    it('2. duplicate class in two slots is invalid', () => {
      const party = partyFromClassIds(
        'df_guardian',
        'df_guardian',
        'sp_cleric',
        'at_ranger',
      );
      const result = validatePartyClassIds(party);
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('duplicateClass');
      expect(result.duplicateClassId).toBe('df_guardian');
      expect(result.conflictingSlotIndices).toEqual([0, 1]);
    });

    it('3. detects duplicates across three or more slots', () => {
      const party = partyFromClassIds(
        'df_guardian',
        'df_guardian',
        'df_guardian',
        'at_ranger',
      );
      const result = validatePartyClassIds(party);
      expect(result.ok).toBe(false);
      expect(result.duplicateClassId).toBe('df_guardian');
      expect(result.conflictingSlotIndices).toEqual([0, 1, 2]);
    });

    it('4. re-selecting current slot class is valid', () => {
      const party = partyFromClassIds(
        'df_guardian',
        'at_swordsman',
        'sp_cleric',
        'at_ranger',
      );
      expect(
        validatePartyClassAssignment(party, 0, 'df_guardian'),
      ).toEqual({ ok: true });
    });

    it('5. changing slot to class used elsewhere is rejected', () => {
      const party = partyFromClassIds(
        'df_guardian',
        'at_swordsman',
        'sp_cleric',
        'at_ranger',
      );
      const result = validatePartyClassAssignment(party, 3, 'df_guardian');
      expect(result).toEqual({
        ok: false,
        reason: 'duplicateClass',
        conflictingSlotIndex: 0,
        conflictingClassId: 'df_guardian',
      });
    });

    it('6. same-role different classes can coexist', () => {
      const party = partyFromClassIds(
        'at_swordsman',
        'at_ranger',
        'sp_cleric',
        'df_guardian',
      );
      expect(validatePartyClassIds(party)).toEqual({ ok: true });
      expect(
        validatePartyClassAssignment(party, 3, 'at_assassin'),
      ).toEqual({ ok: true });
    });

    it('legacy alias normalizes to the same classId for duplicate detection', () => {
      const party: PartySlotState[] = [
        mockMember('at_swordsman'),
        mockMember('at_warrior' as ClassId),
        null,
        null,
      ];
      const result = validatePartyClassIds(party);
      expect(result.ok).toBe(false);
      expect(result.duplicateClassId).toBe('at_swordsman');
      expect(normalizePartyClassId('at_warrior' as ClassId)).toBe('at_swordsman');
    });
  });

  describe('party slot update API', () => {
    let session: GameSession | null = null;

    afterEach(() => {
      session?.destroy();
      session = null;
    });

    it('7. production API rejects duplicate class assignment', () => {
      session = createSession();
      const result = session.tryUpdatePartySlot(
        3,
        mockMember('df_guardian'),
      );
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('duplicateClass');
      expect(result.conflictingSlotIndex).toBe(0);
    });

    it('8. rejected update leaves party unchanged', () => {
      session = createSession();
      const before = structuredClone(session.getSaveState().party);
      session.tryUpdatePartySlot(3, mockMember('df_guardian'));
      expect(session.getSaveState().party).toEqual(before);
    });

    it('9. valid class change succeeds', () => {
      session = createSession();
      const result = session.tryUpdatePartySlot(
        3,
        mockMember('at_assassin'),
      );
      expect(result.ok).toBe(true);
      expect(session.getSaveState().party[3]?.classId).toBe('at_assassin');
    });

    it('10. class change clears module selection for that slot', () => {
      session = createSession();
      session.setPartySlotCombatModule(0, 'df_guardian_mod_guard_focus');
      expect(session.getPartySlotCombatModule(0)).toBe('df_guardian_mod_guard_focus');

      const gameData = loadGameData();
      const nextMember = createMemberFromClass('df_paladin', gameData);
      nextMember.progress = { level: 10, exp: 0 };
      session.tryUpdatePartySlot(0, nextMember);

      expect(session.getPartySlotCombatModule(0)).toBeUndefined();
      expect(session.getSaveState().party[0]?.classId).toBe('df_paladin');
    });

    it('11. same-class re-set does not clear module selection', () => {
      session = createSession();
      session.setPartySlotCombatModule(0, 'df_guardian_mod_guard_focus');
      const member = structuredClone(session.getSaveState().party[0]!);
      member.progress.exp = 99;

      session.tryUpdatePartySlot(0, member);

      expect(session.getPartySlotCombatModule(0)).toBe('df_guardian_mod_guard_focus');
      expect(session.getSaveState().party[0]?.progress.exp).toBe(99);
    });
  });

  describe('assignable class candidates', () => {
    const gameData = loadGameData();
    const unlocked = gameData.classOrder;

    it('12. classes used in other slots are excluded from assignable list', () => {
      const party = partyFromClassIds(
        'df_guardian',
        'at_swordsman',
        'sp_cleric',
        'at_ranger',
      );
      const assignable = getAssignableClassIds(party, unlocked, 3, gameData.classOrder);
      expect(assignable).not.toContain('df_guardian');
      expect(assignable).not.toContain('at_swordsman');
    });

    it('13. editing slot keeps its own current class in candidates', () => {
      const party = partyFromClassIds(
        'df_guardian',
        'at_swordsman',
        'sp_cleric',
        'at_ranger',
      );
      const assignable = getAssignableClassIds(party, unlocked, 0, gameData.classOrder);
      expect(assignable).toContain('df_guardian');
    });

    it('14. locked classes stay hidden (not in unlocked list)', () => {
      const party = partyFromClassIds(
        'df_guardian',
        'at_swordsman',
        'sp_cleric',
        'at_ranger',
      );
      const unlockedSubset = ['df_guardian', 'at_swordsman', 'sp_cleric', 'at_ranger'];
      const assignable = getAssignableClassIds(
        party,
        unlockedSubset,
        0,
        gameData.classOrder,
      );
      expect(assignable).not.toContain('at_assassin');
    });

    it('15. same-role different unused classes remain candidates', () => {
      const party = partyFromClassIds(
        'df_guardian',
        'at_swordsman',
        'sp_cleric',
        'at_ranger',
      );
      const unlockedSubset = [
        'df_guardian',
        'at_swordsman',
        'sp_cleric',
        'at_ranger',
        'at_assassin',
        'at_sorcerer',
      ];
      const assignable = getAssignableClassIds(
        party,
        unlockedSubset,
        3,
        gameData.classOrder,
      );
      expect(assignable).toContain('at_assassin');
      expect(assignable).toContain('at_sorcerer');
      expect(assignable).not.toContain('at_swordsman');
    });
  });

  describe('battle boundary', () => {
    it('16. duplicate-free party creates ally combatants', () => {
      const gameData = loadGameData();
      const party = createDefaultSave(gameData, 'demo').party;
      const allies = createAlliesFromPartyState(gameData, party, levelCurves);
      expect(allies).toHaveLength(4);
      expect(new Set(allies.map((a) => a.classId)).size).toBe(4);
    });

    it('17. duplicate party is rejected at ally creation boundary', () => {
      const gameData = loadGameData();
      const party = partyFromClassIds(
        'df_guardian',
        'df_guardian',
        'sp_cleric',
        'at_ranger',
      );
      expect(() =>
        createAlliesFromPartyState(gameData, party, levelCurves),
      ).toThrow(PartyDuplicateClassError);
    });

    it('17b. BattleEngine restartBattle rejects duplicate party', () => {
      const gameData = loadGameData();
      const validParty = createDefaultSave(gameData, 'demo').party;
      const duplicateParty = partyFromClassIds(
        'df_guardian',
        'df_guardian',
        'sp_cleric',
        'at_ranger',
      );
      let party = validParty;
      const engine = new BattleEngine(
        gameData,
        levelCurves,
        () => party,
        () => gameData.stages[0]!.id,
      );
      party = duplicateParty;
      expect(() => engine.restartBattle()).toThrow(PartyDuplicateClassError);
    });

    it('18. multiple enemies with the same class still spawn', () => {
      const gameData = loadGameData();
      const stage = stageWithDuplicateEnemyGroups();
      const gameDataWithStage = {
        ...gameData,
        stages: [...gameData.stages.filter((s) => s.id !== stage.id), stage],
      };
      const enemies = createEnemiesForStage(
        gameDataWithStage,
        stage.id,
        0,
        levelCurves,
      );
      const guardianCount = enemies.filter((e) => e.classId === 'df_guardian').length;
      expect(guardianCount).toBe(2);
    });

    it('19. enemy group count > 1 and module selection are unaffected', () => {
      const gameData = loadGameData();
      const stage = stageWithDuplicateEnemyGroups();
      const specs = expandEnemyGroups(stage);
      expect(specs.filter((s) => s.classId === 'df_guardian')).toHaveLength(2);

      const moduleBSpec = specs.find(
        (s) => s.selectedCombatModuleId === 'at_swordsman_mod_pierce_slash',
      );
      expect(moduleBSpec).toBeDefined();

      const gameDataWithStage = {
        ...gameData,
        stages: [...gameData.stages.filter((s) => s.id !== stage.id), stage],
      };
      const enemies = createEnemiesForStage(
        gameDataWithStage,
        stage.id,
        0,
        levelCurves,
      );
      const moduleEnemy = enemies.find(
        (e) => e.classId === 'at_swordsman',
      );
      expect(
        moduleEnemy?.cooldowns.find((cd) => cd.slotKind === 'basic')?.skillId,
      ).toBe('at_swordsman_mod_pierce_slash');
    });
  });

  describe('existing data', () => {
    it('20. default party has no duplicate classIds', () => {
      const gameData = loadGameData();
      const save = createDefaultSave(gameData, 'demo');
      expect(validatePartyClassIds(save.party)).toEqual({ ok: true });
    });

    it('21. R5 four-class party with distinct slots is valid', () => {
      const party = partyFromClassIds(
        ...R5_COMBAT_MODULE_CLASS_IDS,
      );
      expect(validatePartyClassIds(party)).toEqual({ ok: true });
    });

    it('22. R5d module A/B selections stay independent per slot', () => {
      const gameData = loadGameData();
      const party = partyFromClassIds(
        'df_guardian',
        'at_swordsman',
        'sp_cleric',
        'at_sorcerer',
      );
      const selection = new PartyCombatModuleSelection();
      selection.setSelectedCombatModuleId(0, 'df_guardian_mod_guard_focus');
      selection.setSelectedCombatModuleId(1, 'at_swordsman_mod_pierce_slash');

      const allies = createAlliesFromPartyState(
        gameData,
        party,
        levelCurves,
        (slotIndex) => selection.getSelectedCombatModuleId(slotIndex),
      );

      expect(
        allies[0]?.cooldowns.find((cd) => cd.slotKind === 'basic')?.skillId,
      ).toBe('df_guardian_mod_guard_focus');
      expect(
        allies[1]?.cooldowns.find((cd) => cd.slotKind === 'basic')?.skillId,
      ).toBe('at_swordsman_mod_pierce_slash');
      expect(
        allies[2]?.cooldowns.find((cd) => cd.slotKind === 'basic')?.skillId,
      ).toBe('sp_cleric_mod_single_mend');
      expect(
        allies[3]?.cooldowns.find((cd) => cd.slotKind === 'basic')?.skillId,
      ).toBe('at_sorcerer_mod_single_bolt');
    });
  });
});
