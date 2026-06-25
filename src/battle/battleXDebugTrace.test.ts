import { describe, expect, it } from "vitest";
import {
  BATTLE_X_DEBUG_TRACE_LIMIT,
  recordBattleXTraceEntry,
} from "./battleXDebugTrace.ts";
import { mockCombatant } from "./testFixtures.ts";
import type { BattleXDebugTraceEntry } from "./types.ts";

const context = {
  phase: "running",
  runtimePhase: "Engaged" as const,
  battleTimeSec: 1.5,
  tickIndex: 12,
  warningThresholdPx: 8,
};

describe("battleX debug trace", () => {
  it("records non-zero movement with warning flag", () => {
    const trace: BattleXDebugTraceEntry[] = [];
    const unit = mockCombatant({ id: "guardian", name: "鉄衛士", battleX: 411 });

    recordBattleXTraceEntry(trace, unit, 375, "overlap", context);

    expect(trace).toHaveLength(1);
    expect(trace[0]).toMatchObject({
      unitId: "guardian",
      unitName: "鉄衛士",
      reason: "overlap",
      beforeX: 375,
      afterX: 411,
      deltaX: 36,
      warning: true,
    });
  });

  it("skips zero delta and keeps only recent rows", () => {
    const trace: BattleXDebugTraceEntry[] = [];
    const unit = mockCombatant({ id: "unit", battleX: 10 });

    recordBattleXTraceEntry(trace, unit, 10, "approach", context);
    expect(trace).toHaveLength(0);

    for (let i = 0; i < BATTLE_X_DEBUG_TRACE_LIMIT + 3; i++) {
      unit.battleX = i + 1;
      recordBattleXTraceEntry(trace, unit, i, "approach", {
        ...context,
        tickIndex: i,
      });
    }

    expect(trace).toHaveLength(BATTLE_X_DEBUG_TRACE_LIMIT);
    expect(trace[0]?.tickIndex).toBe(3);
  });
});
