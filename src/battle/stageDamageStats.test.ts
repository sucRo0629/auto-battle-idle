import { describe, expect, it } from 'vitest';
import {
  StageDamageStatsTracker,
  resolveDamageSourceKind,
} from './stageDamageStats.ts';
import type { CombatantState, PartySlotState } from './types.ts';

import { mockCombatant as mockCombatantBase } from './testFixtures.ts';

function mockCombatant(overrides: Partial<CombatantState> = {}): CombatantState {
  return mockCombatantBase(overrides, 'stageTracker');
}

const classRegistry = {
  swordsman: {
    id: 'swordsman',
    displayName: '剣士',
    role: 'attacker',
    formationRow: 'front',
    traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { enabled: true } },
    maxHp: 100,
    atk: 20,
    def: 5,
    res: 0,
    basicAttackSkillId: 'basic',
    skills: [],
    starterPassiveIds: [],
    starterActiveIds: [],
    classSkillIds: [],
  },
  archer: {
    id: 'archer',
    displayName: '弓士',
    role: 'attacker',
    formationRow: 'back',
    traits: { rangePx: 50, damageType: 'physical', basicAttackVfx: { enabled: true } },
    maxHp: 80,
    atk: 18,
    def: 4,
    res: 0,
    basicAttackSkillId: 'basic',
    skills: [],
    starterPassiveIds: [],
    starterActiveIds: [],
    classSkillIds: [],
  },
  cleric: {
    id: 'cleric',
    displayName: '治癒師',
    role: 'supporter',
    formationRow: 'back',
    traits: { rangePx: 128, damageType: 'magic', basicAttackVfx: { enabled: true } },
    maxHp: 70,
    atk: 16,
    def: 4,
    res: 0,
    basicAttackSkillId: 'basic',
    skills: [],
    starterPassiveIds: [],
    starterActiveIds: [],
    classSkillIds: [],
  },
} as Record<string, import('./types.ts').ClassPreset>;

describe('StageDamageStatsTracker', () => {
  it('records dealt and taken damage for allies', () => {
    const tracker = new StageDamageStatsTracker();
    tracker.resetForStage('stage-1');

    const actor = mockCombatant({
      partySlotIndex: 0,
      classId: 'swordsman',
    });
    const target = mockCombatant({
      id: 'ally-2',
      partySlotIndex: 1,
      classId: 'archer',
    });
    const enemy = mockCombatant({
      id: 'enemy',
      isEnemy: true,
      classId: 'swordsman',
    });

    tracker.recordDamage(actor, target, 25);
    tracker.recordDamage(actor, enemy, 30);

    const party: PartySlotState[] = [
      { classId: 'swordsman', progress: { level: 1, exp: 0 }, build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      } },
      { classId: 'archer', progress: { level: 1, exp: 0 }, build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      } },
      null,
      null,
    ];

    const rows = tracker.getDisplayRows(party, classRegistry);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.damageDealt).toBe(55);
    expect(rows[0]?.damageTaken).toBe(0);
    expect(rows[0]?.hitCount).toBe(1);
    expect(rows[0]?.averageDamagePerHit).toBe(55);
    expect(rows[1]?.damageDealt).toBe(0);
    expect(rows[1]?.damageTaken).toBe(25);
    expect(rows[0]?.dealtRatio).toBe(1);
    expect(rows[1]?.takenRatio).toBe(1);
  });

  it('tracks attack, skill use, indexed hits, and damage by enemy class', () => {
    const tracker = new StageDamageStatsTracker();
    tracker.resetForStage('stage-1');

    const actor = mockCombatant({
      partySlotIndex: 0,
      classId: 'archer',
    });
    const enemy = mockCombatant({
      id: 'enemy',
      isEnemy: true,
      classId: 'swordsman',
    });

    tracker.recordBasicAttack(actor);
    tracker.recordActiveSkillUse(actor);
    tracker.recordDamage(actor, enemy, 40);
    tracker.recordDamage(actor, enemy, 20);
    tracker.recordIndexedDamageHitForSlot(0, 'archer');
    tracker.recordIndexedDamageHitForSlot(0, 'archer');

    const party: PartySlotState[] = [
      { classId: 'archer', progress: { level: 1, exp: 0 }, build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      } },
      null,
      null,
      null,
    ];

    const rows = tracker.getDisplayRows(party, classRegistry);
    expect(rows[0]?.attackCount).toBe(1);
    expect(rows[0]?.skillUseCount).toBe(1);
    expect(rows[0]?.hitCount).toBe(2);
    expect(rows[0]?.damageDealt).toBe(60);
    expect(rows[0]?.averageDamagePerHit).toBe(30);
    expect(rows[0]?.indexedDamageHits).toBe(2);
    expect(rows[0]?.damageByTarget.swordsman).toBe(60);
  });

  it('records healing dealt for allies and marks supporter rows as healers', () => {
    const tracker = new StageDamageStatsTracker();
    tracker.resetForStage('stage-1');

    const healer = mockCombatant({
      partySlotIndex: 0,
      classId: 'cleric',
    });
    const target = mockCombatant({
      id: 'ally-2',
      partySlotIndex: 1,
      classId: 'archer',
    });

    tracker.recordHeal(healer, 40);
    tracker.recordHeal(healer, 15);

    const party: PartySlotState[] = [
      { classId: 'cleric', progress: { level: 1, exp: 0 }, build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      } },
      { classId: 'archer', progress: { level: 1, exp: 0 }, build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      } },
      null,
      null,
    ];

    const rows = tracker.getDisplayRows(party, classRegistry);
    expect(rows[0]?.isHealer).toBe(true);
    expect(rows[0]?.healingDealt).toBe(55);
    expect(rows[1]?.isHealer).toBe(false);
  });

  it('returns rows in party slot order and skips empty slots', () => {
    const tracker = new StageDamageStatsTracker();
    tracker.resetForStage('stage-1');

    tracker.recordDamage(
      mockCombatant({ partySlotIndex: 2, classId: 'archer' }),
      mockCombatant({ id: 'enemy', isEnemy: true }),
      10,
    );

    const party: PartySlotState[] = [
      null,
      null,
      { classId: 'archer', progress: { level: 1, exp: 0 }, build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      } },
      null,
    ];

    const rows = tracker.getDisplayRows(party, classRegistry);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.slotIndex).toBe(2);
    expect(rows[0]?.displayName).toBe('弓士');
  });

  it('clears stats when reset for a new stage', () => {
    const tracker = new StageDamageStatsTracker();
    tracker.resetForStage('stage-1');
    tracker.recordDamage(
      mockCombatant({ partySlotIndex: 0 }),
      mockCombatant({ id: 'enemy', isEnemy: true }),
      12,
    );

    tracker.resetForStage('stage-2');

    const party: PartySlotState[] = [
      { classId: 'swordsman', progress: { level: 1, exp: 0 }, build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      } },
      null,
      null,
      null,
    ];

    const rows = tracker.getDisplayRows(party, classRegistry);
    expect(rows[0]?.damageDealt).toBe(0);
    expect(rows[0]?.damageTaken).toBe(0);
    expect(tracker.getStageId()).toBe('stage-2');
  });

  it('resolveDamageSourceKind maps meta to source kinds', () => {
    expect(resolveDamageSourceKind(undefined)).toBe('unknown');
    expect(
      resolveDamageSourceKind({
        attackKind: 'damage',
        slotKind: 'basic',
      }),
    ).toBe('basic');
    expect(
      resolveDamageSourceKind({
        attackKind: 'damage',
        slotKind: 'active',
        skillId: 'skill_a',
      }),
    ).toBe('active_direct');
    expect(
      resolveDamageSourceKind({
        attackKind: 'dot',
        skillId: 'skill_b',
        statusId: 'status_1',
      }),
    ).toBe('dot');
    expect(
      resolveDamageSourceKind({
        attackKind: 'damage',
        isCounterDamage: true,
      }),
    ).toBe('other');
  });

  it('records damage breakdown by source kind, skillId, and statusId', () => {
    const tracker = new StageDamageStatsTracker();
    tracker.resetForStage('stage-1');

    const actor = mockCombatant({
      partySlotIndex: 0,
      classId: 'archer',
    });
    const enemy = mockCombatant({
      id: 'enemy',
      isEnemy: true,
      classId: 'swordsman',
    });

    tracker.recordBasicAttack(actor);
    tracker.recordActiveSkillUse(actor, 'at_sorcerer_active_1');
    tracker.recordDamage(actor, enemy, 10, {
      attackKind: 'damage',
      slotKind: 'basic',
      skillId: 'at_ranger_basic',
    });
    tracker.recordDamage(actor, enemy, 20, {
      attackKind: 'damage',
      slotKind: 'basic',
      skillId: 'at_ranger_basic',
    });
    tracker.recordDamage(actor, enemy, 30, {
      attackKind: 'damage',
      slotKind: 'active',
      skillId: 'at_sorcerer_active_1',
    });
    tracker.recordDamage(actor, enemy, 5, {
      attackKind: 'dot',
      skillId: 'at_sorcerer_active_1',
      statusId: 'seed_flame_1',
    });
    tracker.recordDamage(actor, enemy, 7, {
      attackKind: 'dot',
      skillId: 'at_sorcerer_active_1',
      statusId: 'seed_flame_1',
    });

    const party: PartySlotState[] = [
      {
        classId: 'archer',
        progress: { level: 1, exp: 0 },
        build: {
          learnedPassiveIds: [],
          learnedActiveIds: [],
          equippedActiveSlots: [],
        },
      },
      null,
      null,
      null,
    ];

    const rows = tracker.getDisplayRows(party, classRegistry);
    const row = rows[0]!;
    expect(row.basicActionCount).toBe(1);
    expect(row.basicDamageHitCount).toBe(2);
    expect(row.activeSkillUseCountBySkillId.at_sorcerer_active_1).toBe(1);
    expect(row.activeDamageHitCountBySkillId.at_sorcerer_active_1).toBe(1);
    expect(row.damageBySkillId.at_ranger_basic).toBe(30);
    expect(row.damageBySkillId.at_sorcerer_active_1).toBe(42);
    expect(row.damageBySourceKind.basic).toBe(30);
    expect(row.damageBySourceKind.active_direct).toBe(30);
    expect(row.damageBySourceKind.dot).toBe(12);
    expect(row.hitCountBySourceKind.basic).toBe(2);
    expect(row.hitCountBySourceKind.active_direct).toBe(1);
    expect(row.hitCountBySourceKind.dot).toBe(2);
    expect(row.dotDamageHitCount).toBe(2);
    expect(row.dotDamageByStatusId.seed_flame_1).toBe(12);
    expect(row.dotHitCountByStatusId.seed_flame_1).toBe(2);
    expect(row.unknownDamageHitCount).toBe(0);
  });

  it('records action and damage timelines with battleSec', () => {
    const tracker = new StageDamageStatsTracker();
    tracker.resetForStage('stage-1');

    const actor = mockCombatant({
      partySlotIndex: 0,
      classId: 'archer',
    });
    const enemy = mockCombatant({
      id: 'enemy',
      isEnemy: true,
      classId: 'swordsman',
    });

    tracker.recordBasicAttack(actor, 5.5);
    tracker.recordBasicAttack(actor, 12.0);
    tracker.recordActiveSkillUse(actor, 'at_ranger_active_2', 3.0);
    tracker.recordActiveSkillUse(actor, 'at_ranger_active_2', 8.5);
    tracker.recordDamage(actor, enemy, 10, {
      attackKind: 'damage',
      slotKind: 'basic',
    }, 5.6);
    tracker.recordDamage(actor, enemy, 20, {
      attackKind: 'damage',
      slotKind: 'active',
      skillId: 'at_ranger_active_1',
    }, 9.0);
    tracker.recordAllyDeath(0, 'archer', 70.0);

    const party: PartySlotState[] = [
      {
        classId: 'archer',
        progress: { level: 1, exp: 0 },
        build: {
          learnedPassiveIds: [],
          learnedActiveIds: [],
          equippedActiveSlots: [],
        },
      },
      null,
      null,
      null,
    ];

    const row = tracker.getDisplayRows(party, classRegistry)[0]!;
    expect(row.basicActionCount).toBe(2);
    expect(row.firstBasicActionSec).toBe(5.5);
    expect(row.lastBasicActionSec).toBe(12.0);
    expect(row.basicActionTimelineSec).toEqual([5.5, 12.0]);
    expect(row.activeUseTimelineBySkillId.at_ranger_active_2).toEqual([3.0, 8.5]);
    expect(row.firstActiveUseSecBySkillId.at_ranger_active_2).toBe(3.0);
    expect(row.lastActiveUseSecBySkillId.at_ranger_active_2).toBe(8.5);
    expect(row.lastDamageDealtSec).toBe(9.0);
    expect(row.damageTimelineBySourceKind.basic).toEqual([5.6]);
    expect(row.damageTimelineBySourceKind.active_direct).toEqual([9.0]);
    expect(row.deathSec).toBe(70.0);
  });
});
