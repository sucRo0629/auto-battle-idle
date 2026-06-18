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

  it("passes sourceId, targetId, and vfx placement to playSkillVfx", () => {
    __registerVfxAnimForTest("placement_skill_0_vfx", mockImage(128));
    __registerVfxAnimForTest("placement_skill_0_vfx_hit", mockImage(128));
    const canvas = {
      playSkillVfx: vi.fn(),
      showDamagePopup: vi.fn(),
      showHealPopup: vi.fn(),
    };
    const effect = { type: "damage" } as never;
    const mainPlacement = { anchor: "between" as const, layer: "behind" as const };
    const hitPlacement = {
      anchor: "footTarget" as const,
      offsetX: 6,
      layer: "front" as const,
    };
    const presentation = {
      vfx: { placement: mainPlacement },
      hitVfx: { placement: hitPlacement },
    } as never;

    playSkillHitFeedback(canvas, {
      sourceId: "ally-7",
      targetId: "enemy-3",
      presentation,
      effect,
      skillId: "placement_skill",
      effectIndex: 0,
      hitIndex: 1,
    });

    expect(canvas.playSkillVfx).toHaveBeenCalledTimes(2);
    expect(canvas.playSkillVfx.mock.calls[0]).toEqual([
      expect.stringMatching(/^ally-7:enemy-3:placement_skill:0:1:main:/),
      "ally-7",
      "enemy-3",
      { placement: mainPlacement },
      expect.objectContaining({
        skillId: "placement_skill",
        effectIndex: 0,
        kind: "main",
      }),
    ]);
    expect(canvas.playSkillVfx.mock.calls[1]).toEqual([
      expect.stringMatching(/^ally-7:enemy-3:placement_skill:0:1:hit:/),
      "ally-7",
      "enemy-3",
      { placement: hitPlacement },
      expect.objectContaining({
        skillId: "placement_skill",
        effectIndex: 0,
        kind: "hit",
      }),
    ]);
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

  it("spawns main VFX once for particles-only heal vfx", () => {
    const canvas = {
      playSkillVfx: vi.fn(),
      showDamagePopup: vi.fn(),
      showHealPopup: vi.fn(),
    };
    const effect = { type: "heal" } as never;
    const presentation = {
      vfx: {
        particles: { preset: "heal_normal" },
      },
    } as never;

    playSkillHitFeedback(canvas, {
      sourceId: "cleric",
      targetId: "guardian",
      presentation,
      effect,
      skillId: "heal_skill",
      effectIndex: 0,
      hitIndex: 0,
    });

    expect(canvas.playSkillVfx).toHaveBeenCalledTimes(1);
    expect(canvas.playSkillVfx.mock.calls[0]?.[3]).toEqual(
      expect.objectContaining({
        particles: { preset: "heal_normal" },
      }),
    );
    expect(canvas.playSkillVfx.mock.calls[0]?.[4]).toEqual(
      expect.objectContaining({ kind: "main" }),
    );
  });

  it("spawns hitVfx particles once for heal hit feedback", () => {
    const canvas = {
      playSkillVfx: vi.fn(),
      showDamagePopup: vi.fn(),
      showHealPopup: vi.fn(),
    };
    const effect = { type: "heal" } as never;
    const presentation = {
      hitVfx: {
        particles: {
          preset: "heal_normal",
          placement: { anchor: "footTarget", layer: "front" },
        },
      },
    } as never;

    playSkillHitFeedback(canvas, {
      sourceId: "cleric",
      targetId: "guardian",
      presentation,
      effect,
      skillId: "sp_cleric_active_1",
      effectIndex: 0,
      hitIndex: 0,
      amount: 42,
      kind: "heal",
    });

    expect(canvas.playSkillVfx).toHaveBeenCalledTimes(1);
    expect(canvas.playSkillVfx.mock.calls[0]?.[4]).toEqual(
      expect.objectContaining({ kind: "hit" }),
    );
    expect(canvas.showHealPopup).toHaveBeenCalledWith("guardian", 42);
  });
});
