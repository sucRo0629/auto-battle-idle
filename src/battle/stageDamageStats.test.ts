import { describe, expect, it } from 'vitest';
import { StageDamageStatsTracker } from './stageDamageStats.ts';
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
    traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { preset: 'slash' } },
    maxHp: 100,
    atk: 20,
    def: 5,
    reg: 0,
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
    traits: { rangePx: 50, damageType: 'physical', basicAttackVfx: { preset: 'arrow', arc: true } },
    maxHp: 80,
    atk: 18,
    def: 4,
    reg: 0,
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

    tracker.recordDamage(actor, target, 25);

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
    expect(rows[0]?.damageDealt).toBe(25);
    expect(rows[0]?.damageTaken).toBe(0);
    expect(rows[1]?.damageDealt).toBe(0);
    expect(rows[1]?.damageTaken).toBe(25);
    expect(rows[0]?.dealtRatio).toBe(1);
    expect(rows[1]?.takenRatio).toBe(1);
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
});
