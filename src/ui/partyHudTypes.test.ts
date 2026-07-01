import { describe, expect, it } from 'vitest';
import { PARTY_SLOT_COUNT } from '../battle/types.ts';
import {
  buildPartyHudEntries,
  buildPartyHudMetaBySlot,
  sortPartyHudEntriesByRange,
  type PartyHudEntry,
} from './partyHudTypes.ts';

describe('buildPartyHudEntries', () => {
  const classRegistry = {
    at_assassin: {
      id: 'at_assassin',
      displayName: '双刃士',
      epithetEn: 'Twinblade',
      role: 'attacker' as const,
      formationRow: 'front' as const,
      traits: {},
      maxHp: 100,
      atk: 20,
      def: 8,
      reg: 0,
      basicAttackSkillId: 'at_assassin_basic_attack',
      skills: [],
      growthTier: { maxHp: 1, atk: 2, def: 1 },
    },
    at_sorcerer: {
      id: 'at_sorcerer',
      displayName: '魔術師',
      epithetEn: 'Arcanist',
      role: 'attacker' as const,
      formationRow: 'back' as const,
      traits: {},
      maxHp: 80,
      atk: 24,
      def: 6,
      reg: 0,
      basicAttackSkillId: 'at_sorcerer_basic_attack',
      skills: [],
      growthTier: { maxHp: 1, atk: 2, def: 1 },
    },
  };

  it('sorts HUD rows by ascending rangePx with vacant slots on the left (head right)', () => {
    const partyMeta = buildPartyHudMetaBySlot(
      [
        {
          classId: 'at_assassin',
          progress: { level: 3, exp: 0 },
          build: {
            learnedPassiveIds: [],
            learnedActiveIds: [],
            equippedActiveSlots: [],
          },
        },
        null,
        null,
        {
          classId: 'at_sorcerer',
          progress: { level: 1, exp: 0 },
          build: {
            learnedPassiveIds: [],
            learnedActiveIds: [],
            equippedActiveSlots: [],
          },
        },
      ],
      classRegistry,
    );

    const entries = buildPartyHudEntries(
      {
        phase: 'running',
        runtimePhase: 'engaged',
        engaged: true,
        waveIndex: 0,
        waveCount: 1,
        worldOffsetX: 0,
        waveAnnouncementActive: false,
        waveAnnouncementElapsedMs: 0,
        partyDeployActive: false,
        partyDeploySettled: true,
        formationResetActive: false,
        alliesOffScreen: false,
        victoryUseTimerFade: false,
        victoryAwaitExitMarch: false,
        players: [],
        allies: [
          {
            id: 'a0',
            name: '双刃士',
            hp: 80,
            maxHp: 100,
            baseMaxHp: 100,
            barrierHp: 0,
            atk: 20,
            def: 8,
            reg: 0,
            rangePx: 30,
            iconKey: 'at_assassin',
            spriteKey: 'at_assassin',
            formationRow: 'front',
            isEnemy: false,
            battleX: 0,
            bodyAnimMarching: false,
            partySlotIndex: 0,
            statusEffects: [],
            activeCooldowns: [],
          },
          {
            id: 'a3',
            name: '魔術師',
            hp: 60,
            maxHp: 80,
            baseMaxHp: 80,
            barrierHp: 0,
            atk: 24,
            def: 6,
            reg: 0,
            rangePx: 100,
            iconKey: 'at_sorcerer',
            spriteKey: 'at_sorcerer',
            formationRow: 'back',
            isEnemy: false,
            battleX: 0,
            bodyAnimMarching: false,
            partySlotIndex: 3,
            statusEffects: [],
            activeCooldowns: [],
          },
        ],
        enemies: [],
      },
      partyMeta,
    );

    expect(entries).toHaveLength(PARTY_SLOT_COUNT);
    expect(entries[0]?.displayName).toBe('双刃士');
    expect(entries[0]?.partySlotIndex).toBe(0);
    expect(entries[0]?.rangePx).toBe(30);
    expect(entries[0]?.unlockedActiveSlotCount).toBe(2);
    expect(entries[1]?.displayName).toBe('魔術師');
    expect(entries[1]?.partySlotIndex).toBe(3);
    expect(entries[1]?.rangePx).toBe(100);
    expect(entries[1]?.unlockedActiveSlotCount).toBe(2);
    expect(entries[2]).toBeNull();
    expect(entries[3]).toBeNull();
  });

  it('sortPartyHudEntriesByRange breaks ties by partySlotIndex', () => {
    const makeEntry = (
      partySlotIndex: number,
      rangePx: number,
    ): PartyHudEntry => ({
      unitId: `u${partySlotIndex}`,
      partySlotIndex,
      rangePx,
      displayName: `Unit ${partySlotIndex}`,
      iconKey: 'at_assassin',
      hp: 100,
      maxHp: 100,
      baseMaxHp: 100,
      barrierHp: 0,
      atk: 10,
      def: 5,
      reg: 0,
      isAlive: true,
      useLocked: false,
      unlockedActiveSlotCount: 2,
      statusEffects: [],
      activeCooldowns: [],
    });

    const sorted = sortPartyHudEntriesByRange([
      makeEntry(2, 30),
      null,
      makeEntry(0, 30),
      makeEntry(3, 100),
    ]);

    expect(sorted.map((entry) => entry?.partySlotIndex ?? null)).toEqual([
      0, 2, 3, null,
    ]);
  });

  it('uses epithetEn for HUD display names in English locale', () => {
    const partyMeta = buildPartyHudMetaBySlot(
      [
        {
          classId: 'at_assassin',
          progress: { level: 1, exp: 0 },
          build: {
            learnedPassiveIds: [],
            learnedActiveIds: [],
            equippedActiveSlots: [],
          },
        },
      ],
      classRegistry,
      'en',
    );

    expect(partyMeta[0]?.displayName).toBe('Twinblade');
  });
});
