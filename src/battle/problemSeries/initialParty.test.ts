import { describe, expect, it } from 'vitest';
import { loadGameData } from '../data/loadGameData.ts';
import type { ClassId, GameData, PartyMemberState } from '../types.ts';
import { PARTY_SLOT_COUNT } from '../types.ts';
import { createProblemSeriesInitialParty } from './initialParty.ts';
import { createProblemSeriesOperationStartSnapshot } from './operationStartSnapshot.ts';
import { resolveProblemSeriesFromSeed } from './seedResolve.ts';

const FIXTURE_SEED_A = 'fixture-a';
const FIXTURE_SEED_B = 'fixture-b';
const UNKNOWN_CLASS_ID = 'r12m_unknown_class';

function resolveSnapshotFromProduction(seed: string) {
  const gameData = loadGameData();
  const result = resolveProblemSeriesFromSeed(gameData.problemSeriesCatalog, seed);
  const snapshot = createProblemSeriesOperationStartSnapshot(result);
  return { gameData, result, snapshot };
}

function createPartyFromProduction(seed: string) {
  const { gameData, snapshot } = resolveSnapshotFromProduction(seed);
  const party = createProblemSeriesInitialParty(
    snapshot.allowedClassIds,
    gameData,
  );
  return { gameData, snapshot, party };
}

function expectAllSlotsNonNull(
  party: readonly (PartyMemberState | null)[],
): PartyMemberState[] {
  expect(party).toHaveLength(PARTY_SLOT_COUNT);
  const members: PartyMemberState[] = [];
  for (let slotIndex = 0; slotIndex < PARTY_SLOT_COUNT; slotIndex++) {
    const member = party[slotIndex];
    expect(member).not.toBeNull();
    if (member === null) {
      throw new Error(`Expected slot ${slotIndex} to be non-null`);
    }
    members.push(member);
  }
  return members;
}

function expectFreshMemberState(member: PartyMemberState): void {
  expect(member.progress.level).toBe(1);
  expect(member.progress.exp).toBe(0);
}

function expectNoSharedMemberReferences(members: readonly PartyMemberState[]): void {
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      expect(members[i]).not.toBe(members[j]);
      expect(members[i]!.progress).not.toBe(members[j]!.progress);
      expect(members[i]!.build).not.toBe(members[j]!.build);
      expect(members[i]!.build.learnedPassiveIds).not.toBe(
        members[j]!.build.learnedPassiveIds,
      );
      expect(members[i]!.build.learnedActiveIds).not.toBe(
        members[j]!.build.learnedActiveIds,
      );
      expect(members[i]!.build.equippedActiveSlots).not.toBe(
        members[j]!.build.equippedActiveSlots,
      );
    }
  }
}

function expectPartyMatchesAllowedClassIds(
  party: readonly (PartyMemberState | null)[],
  allowedClassIds: readonly ClassId[],
): PartyMemberState[] {
  const members = expectAllSlotsNonNull(party);
  const outputClassIds = members.map((member) => member.classId);
  expect(outputClassIds).toEqual([...allowedClassIds]);
  expect(new Set(outputClassIds).size).toBe(PARTY_SLOT_COUNT);
  return members;
}

describe('R12m createProblemSeriesInitialParty (production A/B path)', () => {
  it('fixture-a: loadGameData → resolve → snapshot → initial party', () => {
    const { gameData, snapshot, party } = createPartyFromProduction(FIXTURE_SEED_A);

    expect(snapshot.seriesId).toBe('r12m_series_a');
    expect(snapshot.allowedClassIds).toHaveLength(PARTY_SLOT_COUNT);

    const members = expectPartyMatchesAllowedClassIds(
      party,
      snapshot.allowedClassIds,
    );
    for (const member of members) {
      expectFreshMemberState(member);
      expect(gameData.classRegistry[member.classId]).toBeDefined();
    }
    expectNoSharedMemberReferences(members);
    expect(party).not.toBe(snapshot.allowedClassIds);
  });

  it('fixture-b: loadGameData → resolve → snapshot → initial party', () => {
    const { gameData, snapshot, party } = createPartyFromProduction(FIXTURE_SEED_B);

    expect(snapshot.seriesId).toBe('r12m_series_b');
    expect(snapshot.allowedClassIds).toHaveLength(PARTY_SLOT_COUNT);

    const members = expectPartyMatchesAllowedClassIds(
      party,
      snapshot.allowedClassIds,
    );
    for (const member of members) {
      expectFreshMemberState(member);
      expect(gameData.classRegistry[member.classId]).toBeDefined();
    }
    expectNoSharedMemberReferences(members);
    expect(party).not.toBe(snapshot.allowedClassIds);
  });

  it('fixture-a and fixture-b both produce four allowed classes only', () => {
    const partyA = createPartyFromProduction(FIXTURE_SEED_A).party;
    const partyB = createPartyFromProduction(FIXTURE_SEED_B).party;

    const membersA = expectAllSlotsNonNull(partyA);
    const membersB = expectAllSlotsNonNull(partyB);

    expect(membersA.map((member) => member.classId)).toEqual([
      'df_guardian',
      'at_swordsman',
      'at_sorcerer',
      'sp_cleric',
    ]);
    expect(membersB.map((member) => member.classId)).toEqual([
      'df_guardian',
      'at_swordsman',
      'at_sorcerer',
      'sp_cleric',
    ]);
  });

  it('mutating input allowedClassIds after factory does not change output party', () => {
    const { gameData, snapshot } = resolveSnapshotFromProduction(FIXTURE_SEED_A);
    const allowedClassIds = [...snapshot.allowedClassIds];
    const party = createProblemSeriesInitialParty(allowedClassIds, gameData);
    const partyBefore = structuredClone(party);

    allowedClassIds[0] = 'mutated_class';
    allowedClassIds.push('extra_class');

    expect(party).toEqual(partyBefore);
    expect(party.map((member) => member?.classId)).toEqual(
      partyBefore.map((member) => member?.classId),
    );
  });
});

describe('R12m createProblemSeriesInitialParty (fail-closed validation)', () => {
  function validAllowedClassIds(gameData: GameData): ClassId[] {
    const { snapshot } = resolveSnapshotFromProduction(FIXTURE_SEED_A);
    expect(snapshot.allowedClassIds).toHaveLength(PARTY_SLOT_COUNT);
    return [...snapshot.allowedClassIds];
  }

  it('throws when allowedClassIds has only 3 entries', () => {
    const gameData = loadGameData();
    const allowedClassIds = validAllowedClassIds(gameData).slice(0, 3);
    expect(allowedClassIds).toHaveLength(3);

    expect(() =>
      createProblemSeriesInitialParty(allowedClassIds, gameData),
    ).toThrow(/exactly 4 allowed class IDs, got 3/);
  });

  it('throws when allowedClassIds has 5 entries', () => {
    const gameData = loadGameData();
    const allowedClassIds = [
      ...validAllowedClassIds(gameData),
      'at_assassin',
    ];
    expect(allowedClassIds).toHaveLength(5);

    expect(() =>
      createProblemSeriesInitialParty(allowedClassIds, gameData),
    ).toThrow(/exactly 4 allowed class IDs, got 5/);
  });

  it('throws when allowedClassIds contains duplicate class IDs', () => {
    const gameData = loadGameData();
    const base = validAllowedClassIds(gameData);
    const allowedClassIds = [base[0]!, base[0]!, base[2]!, base[3]!];

    expect(() =>
      createProblemSeriesInitialParty(allowedClassIds, gameData),
    ).toThrow(/Duplicate class ID in allowedClassIds: /);
    expect(() =>
      createProblemSeriesInitialParty(allowedClassIds, gameData),
    ).toThrow(base[0]!);
  });

  it('throws when allowedClassIds contains unknown class ID', () => {
    const gameData = loadGameData();
    expect(
      gameData.classRegistry[UNKNOWN_CLASS_ID as keyof typeof gameData.classRegistry],
    ).toBeUndefined();

    const base = validAllowedClassIds(gameData);
    const allowedClassIds = [UNKNOWN_CLASS_ID, base[1]!, base[2]!, base[3]!];

    expect(() =>
      createProblemSeriesInitialParty(allowedClassIds, gameData),
    ).toThrow(/Unknown class ID in allowedClassIds: /);
    expect(() =>
      createProblemSeriesInitialParty(allowedClassIds, gameData),
    ).toThrow(UNKNOWN_CLASS_ID);
  });
});
