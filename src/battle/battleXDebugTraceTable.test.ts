import { describe, expect, it } from "vitest";
import {
  formatBattleXTraceDetails,
  isBattleXTraceApproachIdleRow,
  isBattleXTraceTableRowVisible,
} from "./battleXDebugTraceTable.ts";
import type { BattleXDebugTraceEntry } from "./types.ts";

function entry(
  overrides: Partial<BattleXDebugTraceEntry> = {},
): BattleXDebugTraceEntry {
  return {
    unitId: "alchemist",
    unitName: "薬草師",
    isEnemy: false,
    phase: "running",
    runtimePhase: "Engaged",
    reason: "approach",
    beforeX: 52,
    afterX: 52,
    deltaX: 0,
    battleTimeSec: 1.5,
    tickIndex: 12,
    warning: false,
    ...overrides,
  };
}

describe("battleX debug trace table rows", () => {
  it("shows movement rows", () => {
    expect(
      isBattleXTraceTableRowVisible(
        entry({ beforeX: 50, afterX: 52, deltaX: 2 }),
      ),
    ).toBe(true);
  });

  it("shows zero-delta approach rows with PHT / withhold details", () => {
    const idle = entry({
      details: {
        approachTargetX: 192,
        shouldSkipEngagedAutoApproach: false,
        priorityHealTargetId: "guardian",
        healWithholdReason: "basic:pht_out_of_range",
      },
    });
    expect(isBattleXTraceTableRowVisible(idle)).toBe(true);
    expect(isBattleXTraceApproachIdleRow(idle)).toBe(true);
  });

  it("hides zero-delta approach rows without debug details", () => {
    expect(isBattleXTraceTableRowVisible(entry())).toBe(false);
    expect(
      isBattleXTraceTableRowVisible(
        entry({
          details: { bodyAnimMarching: true },
        }),
      ),
    ).toBe(false);
  });

  it("formats PHT and withhold in details summary", () => {
    const text = formatBattleXTraceDetails(
      entry({
        details: {
          approachTargetX: 192,
          shouldSkipEngagedAutoApproach: false,
          priorityHealTargetId: "guardian",
          healWithholdReason: "sp_alchemist_active_1:pht_outside_aoe",
        },
      }),
    );
    expect(text).toContain("pht=guardian");
    expect(text).toContain("withhold=sp_alchemist_active_1:pht_outside_aoe");
  });
});
