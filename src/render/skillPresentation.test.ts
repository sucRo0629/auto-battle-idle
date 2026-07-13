import { afterEach, describe, expect, it, vi } from "vitest";
import {
  __registerVfxAnimForTest,
  __resetVfxAnimsForTest,
} from "./vfxAnimRegistry.ts";
import {
  __registerSkillAnimForTest,
  __resetSkillAnimsForTest,
} from "./skillAnimRegistry.ts";
import {
  playSkillBody,
  playSkillHitFeedback,
  resolveBasicAttackPresentationSkillId,
} from "./skillPresentation.ts";

function mockImage(width: number): HTMLImageElement {
  return { width, height: 64 } as HTMLImageElement;
}

describe("resolveBasicAttackPresentationSkillId", () => {
  it("maps combat module runtime id to legacy basic attack assets", () => {
    expect(
      resolveBasicAttackPresentationSkillId(
        "df_guardian_mod_nearest_strike",
        "df_guardian",
      ),
    ).toBe("df_guardian_basic_attack");
  });

  it("keeps legacy basic attack id unchanged", () => {
    expect(
      resolveBasicAttackPresentationSkillId(
        "at_ranger_basic_attack",
        "at_ranger",
      ),
    ).toBe("at_ranger_basic_attack");
  });
});

describe("playSkillBody", () => {
  afterEach(() => {
    __resetSkillAnimsForTest();
  });

  it("plays legacy basic attack body strip for combat module basics", () => {
    __registerSkillAnimForTest(
      "df_guardian_basic_attack",
      mockImage(192),
    );
    const canvas = {
      isSkillAnimActive: vi.fn(() => false),
      playSkillAnim: vi.fn(),
      playAnim: vi.fn(),
    };
    const skill = {
      id: "df_guardian_mod_nearest_strike",
      effect: [
        {
          type: "damage",
          target: { kind: "distance", side: "enemy", order: "nearest" },
          damageType: "physical",
          amount: { kind: "atkBased", atkScale: 1 },
        },
      ],
    } as never;

    playSkillBody(canvas, "ally-0", skill, 0, {
      rangePx: 30,
      damageType: "physical",
      classId: "df_guardian",
    }, "basic");

    expect(canvas.playSkillAnim).toHaveBeenCalledWith(
      "ally-0",
      "df_guardian_basic_attack",
      expect.any(Object),
    );
    expect(canvas.playAnim).not.toHaveBeenCalled();
  });
});

describe("playSkillHitFeedback", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    __resetVfxAnimsForTest();
  });

  it("uses legacy basic attack vfx sheets for combat module basics", () => {
    __registerVfxAnimForTest("df_guardian_basic_attack_vfx", mockImage(256));
    const canvas = {
      playSkillVfx: vi.fn(),
      showDamagePopup: vi.fn(),
      showHealPopup: vi.fn(),
    };
    const effect = { type: "damage" } as never;
    const presentation = { vfx: {} } as never;

    playSkillHitFeedback(canvas, {
      sourceId: "ally-0",
      targetId: "enemy-0",
      presentation,
      effect,
      skillId: "df_guardian_mod_nearest_strike",
      effectIndex: 0,
      slotKind: "basic",
      classId: "df_guardian",
    });

    expect(canvas.playSkillVfx).toHaveBeenCalled();
    expect(canvas.playSkillVfx.mock.calls[0]?.[4]).toEqual(
      expect.objectContaining({
        skillId: "df_guardian_basic_attack",
        effectIndex: 0,
        kind: "main",
      }),
    );
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

  it("skips VFX for overlay DoT/HoT ticks but still shows popups", () => {
    __registerVfxAnimForTest("test_skill_0_vfx", mockImage(128));
    __registerVfxAnimForTest("test_skill_0_vfx_hit", mockImage(128));
    const canvas = {
      playSkillVfx: vi.fn(),
      showDamagePopup: vi.fn(),
      showHealPopup: vi.fn(),
    };
    const effect = { type: "dot" } as never;
    const presentation = { vfx: {}, hitVfx: {} } as never;

    playSkillHitFeedback(canvas, {
      sourceId: "source-1",
      targetId: "target-1",
      presentation,
      effect,
      skillId: "test_skill",
      effectIndex: 0,
      amount: 7,
      kind: "dot",
      overlayTick: true,
    });

    expect(canvas.playSkillVfx).not.toHaveBeenCalled();
    expect(canvas.showDamagePopup).toHaveBeenCalledWith(
      "target-1",
      7,
      "dot",
      undefined,
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
    expect(canvas.showDamagePopup).toHaveBeenCalledWith("target-1", 42, "damage", undefined);
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

  it("shows dot popup for debuff dot effects when kind is dot", () => {
    const canvas = {
      playSkillVfx: vi.fn(),
      showDamagePopup: vi.fn(),
      showHealPopup: vi.fn(),
    };
    const effect = {
      type: "debuff",
      debuffSubKind: "dot",
      dotFlavor: "bleed",
    } as never;
    const presentation = {} as never;

    playSkillHitFeedback(canvas, {
      sourceId: "assassin",
      targetId: "enemy-1",
      presentation,
      effect,
      skillId: "at_assassin_active_1",
      effectIndex: 1,
      amount: 12,
      kind: "dot",
    });

    expect(canvas.showDamagePopup).toHaveBeenCalledWith(
      "enemy-1",
      12,
      "dot",
      "bleed",
    );
  });

  it("shows dot popup for placedField parent effect when kind is dot", () => {
    const canvas = {
      playSkillVfx: vi.fn(),
      showDamagePopup: vi.fn(),
      showHealPopup: vi.fn(),
    };
    const effect = { type: "placedField" } as never;
    const presentation = {} as never;

    playSkillHitFeedback(canvas, {
      sourceId: "hunter",
      targetId: "enemy-1",
      presentation,
      effect,
      skillId: "at_hunter_active_1",
      effectIndex: 0,
      amount: 8,
      kind: "dot",
      dotFlavor: "poison",
    });

    expect(canvas.showDamagePopup).toHaveBeenCalledWith(
      "enemy-1",
      8,
      "dot",
      "poison",
    );
  });

  it("allows separate dot popups for stacked instances with distinct dedupe keys", () => {
    const canvas = {
      playSkillVfx: vi.fn(),
      showDamagePopup: vi.fn(),
      showHealPopup: vi.fn(),
    };
    const effect = { type: "placedField" } as never;
    const presentation = {} as never;
    const now = vi.spyOn(performance, "now");
    now.mockReturnValueOnce(100);
    now.mockReturnValueOnce(105);

    playSkillHitFeedback(canvas, {
      sourceId: "hunter",
      targetId: "enemy-1",
      presentation,
      effect,
      skillId: "at_hunter_active_1",
      effectIndex: 0,
      amount: 8,
      kind: "dot",
      dotFlavor: "poison",
      popupDedupeKey: "dot-instance-a:enemy-1:8",
    });
    playSkillHitFeedback(canvas, {
      sourceId: "hunter",
      targetId: "enemy-1",
      presentation,
      effect,
      skillId: "at_hunter_active_1",
      effectIndex: 0,
      amount: 8,
      kind: "dot",
      dotFlavor: "poison",
      popupDedupeKey: "dot-instance-b:enemy-1:8",
    });

    expect(canvas.showDamagePopup).toHaveBeenCalledTimes(2);
  });
});
