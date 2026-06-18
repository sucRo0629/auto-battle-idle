import { afterEach, describe, expect, it, vi } from "vitest";
import { playSkillHitFeedback } from "./skillPresentation.ts";

describe("playSkillHitFeedback", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("suppresses immediate duplicate damage popups with the same key", () => {
    const canvas = {
      playAttackEffect: vi.fn(),
      showDamagePopup: vi.fn(),
      showHealPopup: vi.fn(),
    };
    const effect = { type: "damage" } as never;
    const presentation = {} as never;
    const now = vi.spyOn(performance, "now");
    now.mockReturnValueOnce(100);
    now.mockReturnValueOnce(110);

    playSkillHitFeedback(canvas, {
      sourceId: "source-1",
      targetId: "target-1",
      presentation,
      effect,
      amount: 42,
      kind: "damage",
      popupDedupeKey: "enemy-hit-1",
    });
    playSkillHitFeedback(canvas, {
      sourceId: "source-1",
      targetId: "target-1",
      presentation,
      effect,
      amount: 42,
      kind: "damage",
      popupDedupeKey: "enemy-hit-1",
    });

    expect(canvas.showDamagePopup).toHaveBeenCalledTimes(1);
    expect(canvas.showDamagePopup).toHaveBeenCalledWith("target-1", 42, "damage");
  });

  it("allows the same damage popup after the dedupe window", () => {
    const canvas = {
      playAttackEffect: vi.fn(),
      showDamagePopup: vi.fn(),
      showHealPopup: vi.fn(),
    };
    const effect = { type: "damage" } as never;
    const presentation = {} as never;
    const now = vi.spyOn(performance, "now");
    now.mockReturnValueOnce(200);
    now.mockReturnValueOnce(300);

    playSkillHitFeedback(canvas, {
      sourceId: "source-2",
      targetId: "target-2",
      presentation,
      effect,
      amount: 18,
      kind: "damage",
      popupDedupeKey: "enemy-hit-2",
    });
    playSkillHitFeedback(canvas, {
      sourceId: "source-2",
      targetId: "target-2",
      presentation,
      effect,
      amount: 18,
      kind: "damage",
      popupDedupeKey: "enemy-hit-2",
    });

    expect(canvas.showDamagePopup).toHaveBeenCalledTimes(2);
  });
});
