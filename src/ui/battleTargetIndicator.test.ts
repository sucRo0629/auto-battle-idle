import { describe, expect, it } from "vitest";
import { BattleTargetIndicatorTracker } from "./battleTargetIndicator.ts";

describe("BattleTargetIndicatorTracker", () => {
  it("tracks actor to target pairs from battle events", () => {
    const tracker = new BattleTargetIndicatorTracker();
    tracker.note("ally-1", "enemy-1", 1000);
    tracker.note("enemy-2", "ally-2", 1200);

    expect(tracker.getPairs()).toEqual([
      { actorId: "ally-1", targetId: "enemy-1" },
      { actorId: "enemy-2", targetId: "ally-2" },
    ]);
    expect(tracker.getTargetedUnitIds().sort()).toEqual(["ally-2", "enemy-1"]);
  });

  it("expires stale indicators independently per actor", () => {
    const tracker = new BattleTargetIndicatorTracker();
    tracker.note("ally-1", "enemy-1", 0, 1000);
    tracker.note("enemy-2", "ally-2", 500, 1000);

    expect(tracker.prune(900)).toBe(false);
    expect(tracker.getTargetedUnitIds().sort()).toEqual(["ally-2", "enemy-1"]);

    expect(tracker.prune(1001)).toBe(true);
    expect(tracker.getPairs()).toEqual([
      { actorId: "enemy-2", targetId: "ally-2" },
    ]);
  });
});
