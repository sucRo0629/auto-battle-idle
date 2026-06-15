import { describe, expect, it } from 'vitest';
import { PARTY_SLOT_COUNT } from '../battle/types.ts';
import { buildPartyHudEntries, buildPartyHudMetaBySlot } from './partyHudTypes.ts';

describe('buildPartyHudEntries', () => {
  it('aligns HUD slots to party indices and hides vacant slots', () => {
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
      {
        at_assassin: {
          id: 'at_assassin',
          displayName: '双刃士',
          role: 'attacker',
          formationRow: 'front',
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
          displayName: '魔術士',
          role: 'attacker',
          formationRow: 'back',
          traits: {},
          maxHp: 80,
          atk: 24,
          def: 6,
          reg: 0,
          basicAttackSkillId: 'at_sorcerer_basic_attack',
          skills: [],
          growthTier: { maxHp: 1, atk: 2, def: 1 },
        },
      },
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
            barrierHp: 0,
            atk: 20,
            def: 8,
            reg: 0,
            iconKey: 'at_assassin',
            spriteKey: 'at_assassin',
            formationRow: 'front',
            isEnemy: false,
            battleX: 0,
            visualX: 0,
            bodyAnimMarching: false,
            partySlotIndex: 0,
            statusEffects: [],
            activeCooldowns: [],
          },
          {
            id: 'a3',
            name: '魔術士',
            hp: 60,
            maxHp: 80,
            barrierHp: 0,
            atk: 24,
            def: 6,
            reg: 0,
            iconKey: 'at_sorcerer',
            spriteKey: 'at_sorcerer',
            formationRow: 'back',
            isEnemy: false,
            battleX: 0,
            visualX: 0,
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
    expect(entries[1]).toBeNull();
    expect(entries[2]).toBeNull();
    expect(entries[3]?.displayName).toBe('魔術士');
  });
});
