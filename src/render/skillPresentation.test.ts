import { afterEach, describe, expect, it, vi } from "vitest";
import {
  __registerVfxAnimForTest,
  __resetVfxAnimsForTest,
} from "./vfxAnimRegistry.ts";
import { playSkillHitFeedback } from "./skillPresentation.ts";

function mockImage(width: number): HTMLImageElement {
  return { width, height: 64 } as HTMLImageElement;
}

describe("playSkillHitFeedback", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    __resetVfxAnimsForTest();
  });

  it("spawns main and hit VFX with unique instance ids", () => {
    __registerVfxAnimForTest("test_skill_0_vfx", mockImage(128));
    __registerVfxAnimForTest("test_skill_0_vfx_hit", mockImage(128));
    const canvas = {
      playSkillVfx: vi.fn(),
      showDamagePopup: vi.fn(),
      showHealPopup: vi.fn(),
    };
    const effect = { type: "damage" } as never;
    const presentation = { vfx: {}, hitVfx: {} } as never;

    playSkillHitFeedback(canvas, {
      sourceId: "source-1",
      targetId: "target-1",
      presentation,
      effect,
      skillId: "test_skill",
      effectIndex: 0,
      hitIndex: 0,
    });

    expect(canvas.playSkillVfx).toHaveBeenCalledTimes(2);
    expect(canvas.playSkillVfx.mock.calls[0]?.[0]).toMatch(
      /^source-1:target-1:test_skill:0:0:main:/,
    );
    expect(canvas.playSkillVfx.mock.calls[1]?.[0]).toMatch(
      /^source-1:target-1:test_skill:0:0:hit:/,
    );
    expect(canvas.playSkillVfx.mock.calls[0]?.[4]).toEqual(
      expect.objectContaining({ skillId: "test_skill", effectIndex: 0, kind: "main" }),
    );
    expect(canvas.playSkillVfx.mock.calls[1]?.[4]).toEqual(
      expect.objectContaining({ skillId: "test_skill", effectIndex: 0, kind: "hit" }),
    );
  });

  it("skips main VFX but still spawns hit VFX on later hits", () => {
    __registerVfxAnimForTest("test_skill_0_vfx_hit", mockImage(128));
    const canvas = {
      playSkillVfx: vi.fn(),
      showDamagePopup: vi.fn(),
      showHealPopup: vi.fn(),
    };
    const effect = { type: "damage" } as never;
    const presentation = { vfx: {}, hitVfx: {} } as never;

    playSkillHitFeedback(canvas, {
      sourceId: "source-1",
      targetId: "target-2",
      presentation,
      effect,
      skillId: "test_skill",
      effectIndex: 0,
      hitIndex: 2,
      skipMainVfx: true,
    });

    expect(canvas.playSkillVfx).toHaveBeenCalledTimes(1);
    expect(canvas.playSkillVfx.mock.calls[0]?.[4]).toEqual(
      expect.objectContaining({ kind: "hit" }),
    );
  });

  it("uses vfx as hit fallback when hitVfx is unset", () => {
    __registerVfxAnimForTest("test_skill_0_vfx_hit", mockImage(128));
    const canvas = {
      playSkillVfx: vi.fn(),
      showDamagePopup: vi.fn(),
      showHealPopup: vi.fn(),
    };
    const effect = { type: "damage" } as never;
    const presentation = { vfx: {} } as never;

    playSkillHitFeedback(canvas, {
      sourceId: "source-1",
      targetId: "target-1",
      presentation,
      effect,
      skillId: "test_skill",
      effectIndex: 0,
      skipMainVfx: true,
    });

    expect(canvas.playSkillVfx).toHaveBeenCalledTimes(1);
    expect(canvas.playSkillVfx.mock.calls[0]?.[4]).toEqual(
      expect.objectContaining({ kind: "hit" }),
    );
  });

  it("suppresses immediate duplicate damage popups with the same key", () => {
    const canvas = {
      playSkillVfx: vi.fn(),
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
      skillId: "test_skill",
      effectIndex: 0,
      amount: 42,
      kind: "damage",
      popupDedupeKey: "enemy-hit-1",
    });
    playSkillHitFeedback(canvas, {
      sourceId: "source-1",
      targetId: "target-1",
      presentation,
      effect,
      skillId: "test_skill",
      effectIndex: 0,
      amount: 42,
      kind: "damage",
      popupDedupeKey: "enemy-hit-1",
    });

    expect(canvas.showDamagePopup).toHaveBeenCalledTimes(1);
    expect(canvas.showDamagePopup).toHaveBeenCalledWith("target-1", 42, "damage");
  });

  it("allows the same damage popup after the dedupe window", () => {
    const canvas = {
      playSkillVfx: vi.fn(),
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
      skillId: "test_skill",
      effectIndex: 0,
      amount: 18,
      kind: "damage",
      popupDedupeKey: "enemy-hit-2",
    });
    playSkillHitFeedback(canvas, {
      sourceId: "source-2",
      targetId: "target-2",
      presentation,
      effect,
      skillId: "test_skill",
      effectIndex: 0,
      amount: 18,
      kind: "damage",
      popupDedupeKey: "enemy-hit-2",
    });

    expect(canvas.showDamagePopup).toHaveBeenCalledTimes(2);
  });
});
