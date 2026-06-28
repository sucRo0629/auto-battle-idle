import { describe, expect, it } from 'vitest';
import type { SaveGameState } from '../battle/types.ts';
import {
  migrateLegacyClassId,
  migrateLegacySkillId,
  migrateSaveClassIds,
} from './saveClassMigration.ts';

describe('saveClassMigration', () => {
  it('maps at_warrior to at_swordsman', () => {
    expect(migrateLegacyClassId('at_warrior')).toBe('at_swordsman');
    expect(migrateLegacySkillId('at_warrior_active_1')).toBe(
      'at_swordsman_active_1',
    );
  });

  it('maps at_sniper to at_ballista', () => {
    expect(migrateLegacyClassId('at_sniper')).toBe('at_ballista');
    expect(migrateLegacyClassId('at_ballista')).toBe('at_ballista');
  });

  it('maps legacy sniper skill ids', () => {
    expect(migrateLegacySkillId('at_sniper_active_1')).toBe(
      'at_ballista_active_1',
    );
    expect(migrateLegacySkillId('at_ranger_basic_attack')).toBe(
      'at_ranger_basic_attack',
    );
  });

  it('maps at_enchanter to at_sigilist', () => {
    expect(migrateLegacyClassId('at_enchanter')).toBe('at_sigilist');
    expect(migrateLegacySkillId('at_enchanter_active_1')).toBe(
      'at_sigilist_active_1',
    );
  });

  it('maps sp_abjurer to sp_wardweaver', () => {
    expect(migrateLegacyClassId('sp_abjurer')).toBe('sp_wardweaver');
    expect(migrateLegacySkillId('sp_abjurer_passive_2')).toBe(
      'sp_wardweaver_passive_2',
    );
  });

  it('migrates party and unlockedClassIds', () => {
    const save: SaveGameState = {
      version: 2,
      stageProgress: { currentStageId: 'stage_1', totalClears: 0 },
      party: [
        {
          classId: 'at_sniper',
          progress: { level: 5, exp: 0 },
          build: {
            learnedPassiveIds: ['at_sniper_passive_1'],
            learnedActiveIds: ['at_sniper_active_1'],
            equippedActiveSlots: ['at_sniper_active_1', ''],
          },
        },
        null,
        null,
        null,
      ],
      unlockedClassIds: ['df_guardian', 'at_sniper', 'at_ballista'],
    };

    const migrated = migrateSaveClassIds(save);

    expect(migrated.party[0]?.classId).toBe('at_ballista');
    expect(migrated.party[0]?.build.learnedActiveIds).toEqual([
      'at_ballista_active_1',
    ]);
    expect(migrated.unlockedClassIds).toEqual(['df_guardian', 'at_ballista']);
  });
});
