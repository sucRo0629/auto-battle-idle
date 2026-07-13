import { describe, expect, it } from 'vitest';
import { loadGameData } from './data/loadGameData.ts';
import {
  buildM1TargetClassificationRows,
  logM1TargetClassificationReport,
} from './test/m1TargetClassificationReport.ts';

describe('demo M1 target classification (diagnostic)', () => {
  it('logs static M1 target priority bands', () => {
    const gameData = loadGameData();
    logM1TargetClassificationReport(gameData);
    const rows = buildM1TargetClassificationRows(gameData);
    expect(rows.length).toBeGreaterThan(0);

    const cleric = rows.find((r) => r.classId === 'sp_cleric');
    const wardweaver = rows.find((r) => r.classId === 'sp_wardweaver');
    const ballista = rows.find((r) => r.classId === 'at_ballista');
    const sorcerer = rows.find((r) => r.classId === 'at_sorcerer');

    expect(cleric?.inRangerRangedPool).toBe(false);
    expect(wardweaver?.inRangerRangedPool).toBe(false);
    expect(cleric?.role).toBe('supporter');
    expect(cleric?.inAssassinLowHpPool).toBe(true);
    expect(wardweaver?.inAssassinLowHpPool).toBe(true);
    expect(ballista?.inRangerRangedPool).toBe(true);
    expect(sorcerer?.inRangerRangedPool).toBe(true);
  });
});
