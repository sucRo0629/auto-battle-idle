import { describe, expect, it } from 'vitest';
import {
  buildDemoRangerTargetReport,
  isRangerPriorityEnemyClass,
} from './rangerTargetReport.ts';
import type { RangerBasicAttackDiagnostics } from './rangerBasicAttackDiagnostic.ts';

describe('rangerTargetReport', () => {
  it('marks role fulfilled when backline damage share is high', () => {
    const report = buildDemoRangerTargetReport('demo_ch1_06', 'baseline', {
      classStats: [
        {
          classId: 'at_ranger',
          damageDealt: 500,
          damageByTarget: {
            at_sorcerer: 300,
            df_guardian: 200,
          },
          basicActionCount: 12,
          firstBasicActionSec: 8,
          activeSkillUseCountBySkillId: { at_ranger_active_2: 2 },
        },
      ],
      outcome: 'victory',
      durationSec: 70,
      enemyDeaths: [
        {
          unitId: 'e1',
          classId: 'at_sorcerer',
          deathSec: 40,
          lastHitByAllyClassId: 'at_ranger',
        },
      ],
    });

    expect(report).not.toBeNull();
    expect(report!.roleFulfilled).toBe(true);
    expect(report!.backlineDamageShare).toBeCloseTo(0.6);
    expect(report!.primaryTargetClassId).toBeNull();
    expect(report!.killOrLastHitTargetClassId.at_sorcerer).toBe(1);
  });

  it('marks role unmet when damage is mostly to frontline', () => {
    const report = buildDemoRangerTargetReport('demo_ch1_06', 'baseline', {
      classStats: [
        {
          classId: 'at_ranger',
          damageDealt: 400,
          damageByTarget: {
            df_guardian: 320,
            at_sorcerer: 80,
          },
          basicActionCount: 10,
          firstBasicActionSec: 6,
          activeSkillUseCountBySkillId: {},
        },
      ],
      outcome: 'victory',
      durationSec: 60,
    });

    expect(report!.roleFulfilled).toBe(false);
    expect(report!.backlineDamageShare).toBeCloseTo(0.2);
    expect(report!.note).toContain('role unmet');
  });

  it('uses skip histogram for stall notes when diagnostics present', () => {
    const diagnostics: RangerBasicAttackDiagnostics = {
      targetAcquisition: [
        {
          battleSec: 5,
          targetId: 'e1',
          targetClassId: 'at_sorcerer',
          targetAlive: true,
          targetBattleX: 50,
          rangerBattleX: 120,
          distancePx: 70,
          rangePx: 100,
          inRange: true,
        },
      ],
      basicAttackSkips: [],
      active2Uses: [],
      preFirstBasicChanges: null,
      firstBasicActionSec: 12,
      skipReasonHistogram: {
        out_of_range: 150,
        moving: 20,
        ready: 40,
      },
    };

    const report = buildDemoRangerTargetReport('demo_ch1_06', 'baseline', {
      classStats: [
        {
          classId: 'at_ranger',
          damageDealt: 300,
          damageByTarget: { at_sorcerer: 200, df_paladin: 100 },
          basicActionCount: 8,
          firstBasicActionSec: 12,
          activeSkillUseCountBySkillId: {},
        },
      ],
      rangerBasicAttackDiagnostics: diagnostics,
      outcome: 'victory',
      durationSec: 55,
    });

    expect(report!.outOfRangeSkipCount).toBe(150);
    expect(report!.movingSkipCount).toBe(20);
    expect(report!.primaryTargetClassId).toBe('at_sorcerer');
    expect(report!.note).toContain('out_of_range stall');
  });

  it('classifies known backline enemy classes', () => {
    expect(isRangerPriorityEnemyClass('at_sorcerer')).toBe(true);
    expect(isRangerPriorityEnemyClass('sp_cleric')).toBe(true);
    expect(isRangerPriorityEnemyClass('df_guardian')).toBe(false);
  });
});
