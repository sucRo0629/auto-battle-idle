import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const canvasInstance = {
    mount: vi.fn(),
    setCombatants: vi.fn(),
    setWorldOffset: vi.fn(),
    playAnim: vi.fn(),
    playSkillAnim: vi.fn(),
    isSkillAnimActive: vi.fn(() => false),
    playSkillVfx: vi.fn(),
    showDamagePopup: vi.fn(),
    showHealPopup: vi.fn(),
    showEvadePopup: vi.fn(),
    showBlockPopup: vi.fn(),
    showInvulnerablePopup: vi.fn(),
    showLastStandRecoveryPopup: vi.fn(),
    showCounterPopup: vi.fn(),
    showEnemyReelInPopup: vi.fn(),
    showKnockbackPopup: vi.fn(),
    showBuffGlow: vi.fn(),
    tick: vi.fn(),
    destroy: vi.fn(),
    syncFromSnapshot: vi.fn(),
  };
  return {
    canvasInstance,
    BattleCanvas: vi.fn().mockImplementation(() => canvasInstance),
  };
});

vi.mock("../styles/battle-view.css", () => ({}));

vi.mock("../render/BattleCanvas.ts", () => ({
  BattleCanvas: mocks.BattleCanvas,
}));

vi.mock("../render/skillPresentation.ts", () => ({
  buildSkillPresentationContext: vi.fn(),
  playSkillBody: vi.fn(() => ({})),
  playSkillHitFeedback: vi.fn((canvas, request) => {
    if (request.amount === undefined) return;
    if (request.kind === "heal" || request.effect.type === "heal") {
      canvas.showHealPopup(request.targetId, request.amount);
      return;
    }
    const isDebuffDot =
      request.effect.type === "debuff" &&
      request.effect.debuffSubKind === "dot";
    const isDotPopup =
      request.kind === "dot" ||
      request.effect.type === "dot" ||
      isDebuffDot;
    const isDamagePopup =
      request.kind === "damage" || request.effect.type === "damage";
    if (isDotPopup || isDamagePopup) {
      canvas.showDamagePopup(
        request.targetId,
        request.amount,
        isDotPopup ? "dot" : "damage",
        isDotPopup
          ? (request.dotFlavor ?? request.effect.dotFlavor)
          : undefined,
      );
    }
  }),
  resolveSkillPresentation: vi.fn(() => ({})),
}));

vi.mock("../ui/BattleXDebugCanvas.ts", () => ({
  BattleXDebugCanvas: vi.fn().mockImplementation(() => ({
    mount: vi.fn(),
    setVisible: vi.fn(),
    isReplayPaused: vi.fn(() => false),
    recordLiveFrame: vi.fn(),
    resolveDisplaySnapshot: vi.fn((snapshot: unknown) => snapshot),
    syncFromSnapshot: vi.fn(),
    flashSkillRange: vi.fn(),
    tick: vi.fn(),
    destroy: vi.fn(),
  })),
}));

vi.mock("../ui/PartyHudPanel.ts", () => ({
  PartyHudPanel: vi.fn().mockImplementation(() => ({
    mount: vi.fn(),
    update: vi.fn(),
    getSlotRoot: vi.fn(() => null),
    destroy: vi.fn(),
  })),
}));

vi.mock("../ui/PartyMemberEffectiveStatsPanel.ts", () => ({
  PartyMemberEffectiveStatsPanel: vi.fn().mockImplementation(() => ({
    attachToSlot: vi.fn(),
    show: vi.fn(),
    hide: vi.fn(),
    update: vi.fn(),
    isVisible: vi.fn(() => false),
    destroy: vi.fn(),
  })),
}));

vi.mock("../ui/DebugMenuPanel.ts", () => ({
  DebugMenuPanel: vi.fn().mockImplementation(() => ({
    mount: vi.fn(),
    refresh: vi.fn(),
  })),
}));

import { BattleView } from "./BattleView.ts";

function createFakeElement() {
  return {
    className: "",
    textContent: "",
    checked: false,
    disabled: false,
    type: "",
    style: {},
    appendChild: vi.fn(),
    append: vi.fn(),
    addEventListener: vi.fn(),
    setAttribute: vi.fn(),
    remove: vi.fn(),
  };
}

describe("BattleView", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("shows a damage popup only once per skill damage event", () => {
    let emitEvent: (event: any) => void = () => {};
    const engine = {
      onEvent: vi.fn((listener: (event: any) => void) => {
        emitEvent = listener;
      }),
      getSnapshot: vi.fn(() => ({
        allies: [{ id: "actor-1" }],
        enemies: [{ id: "target-1" }],
      })),
    };

    const gameData = {
      skillRegistry: {
        actives: {
          skill_1: {
            id: "skill_1",
            name: "Dummy Attack",
            effect: [{ type: "damage" }],
          },
        },
      },
      classRegistry: {},
      stages: [],
    };

    const getSave = vi.fn(() => ({
      stageProgress: { currentStageId: "stage_1" },
    }));
    const verifyModeControls = {
      isVerifyMode: () => false,
      onVerifyModeChange: vi.fn(),
      onOpenMetaMenu: vi.fn(),
    };

    vi.stubGlobal("document", {
      createElement: () => createFakeElement(),
    });

    const container = createFakeElement();

    new BattleView(
      container,
      engine as never,
      gameData as never,
      {} as never,
      getSave,
      verifyModeControls,
    );

    emitEvent({
      type: "skill",
      actorId: "actor-1",
      targetId: "target-1",
      skillId: "skill_1",
      skillName: "Dummy Attack",
      effect: "damage",
      amount: 42,
      effectIndex: 0,
      slotKind: "basic",
    });

    expect(mocks.canvasInstance.showDamagePopup).toHaveBeenCalledTimes(1);
    expect(mocks.canvasInstance.showDamagePopup).toHaveBeenCalledWith(
      "target-1",
      42,
      "damage",
      undefined,
    );
  });

  it("shows a counter popup for counter skill events", () => {
    let emitEvent: (event: any) => void = () => {};
    const engine = {
      onEvent: vi.fn((listener: (event: any) => void) => {
        emitEvent = listener;
      }),
      getSnapshot: vi.fn(() => ({
        allies: [{ id: "actor-1" }],
        enemies: [{ id: "target-1" }],
      })),
    };

    const gameData = {
      skillRegistry: {
        actives: {
          counter_1: {
            id: "counter_1",
            name: "Counter",
            effect: [{ type: "counter" }],
          },
        },
      },
      classRegistry: {},
      stages: [],
    };

    const getSave = vi.fn(() => ({
      stageProgress: { currentStageId: "stage_1" },
    }));
    const verifyModeControls = {
      isVerifyMode: () => false,
      onVerifyModeChange: vi.fn(),
      onOpenMetaMenu: vi.fn(),
    };

    vi.stubGlobal("document", {
      createElement: () => createFakeElement(),
    });

    const container = createFakeElement();

    new BattleView(
      container,
      engine as never,
      gameData as never,
      {} as never,
      getSave,
      verifyModeControls,
    );

    emitEvent({
      type: "skill",
      actorId: "actor-1",
      targetId: "target-1",
      skillId: "counter_1",
      skillName: "Counter",
      effect: "counter",
      effectIndex: 0,
      slotKind: "active",
    });

    expect(mocks.canvasInstance.showCounterPopup).toHaveBeenCalledTimes(1);
    expect(mocks.canvasInstance.showCounterPopup).toHaveBeenCalledWith(
      "actor-1",
    );
  });

  it("shows an enemyReelIn popup for reel-in skill events", () => {
    let emitEvent: (event: any) => void = () => {};
    const engine = {
      onEvent: vi.fn((listener: (event: any) => void) => {
        emitEvent = listener;
      }),
      getSnapshot: vi.fn(() => ({
        allies: [{ id: "actor-1" }],
        enemies: [{ id: "target-1" }],
      })),
    };

    const gameData = {
      skillRegistry: {
        actives: {
          reel_in_1: {
            id: "reel_in_1",
            name: "誘い込み",
            effect: [{ type: "enemyReelIn" }],
          },
        },
      },
      classRegistry: {},
      stages: [],
    };

    const getSave = vi.fn(() => ({
      stageProgress: { currentStageId: "stage_1" },
    }));
    const verifyModeControls = {
      isVerifyMode: () => false,
      onVerifyModeChange: vi.fn(),
      onOpenMetaMenu: vi.fn(),
    };

    vi.stubGlobal("document", {
      createElement: () => createFakeElement(),
    });

    const container = createFakeElement();

    new BattleView(
      container,
      engine as never,
      gameData as never,
      {} as never,
      getSave,
      verifyModeControls,
    );

    emitEvent({
      type: "skill",
      actorId: "actor-1",
      targetId: "target-1",
      skillId: "reel_in_1",
      skillName: "誘い込み",
      effect: "enemyReelIn",
      effectIndex: 0,
      slotKind: "active",
    });

    expect(mocks.canvasInstance.showEnemyReelInPopup).toHaveBeenCalledTimes(1);
    expect(mocks.canvasInstance.showEnemyReelInPopup).toHaveBeenCalledWith(
      "target-1",
    );
  });

  it("shows a knockback popup for knockback skill events", () => {
    let emitEvent: (event: any) => void = () => {};
    const engine = {
      onEvent: vi.fn((listener: (event: any) => void) => {
        emitEvent = listener;
      }),
      getSnapshot: vi.fn(() => ({
        allies: [{ id: "actor-1" }],
        enemies: [{ id: "target-1" }],
      })),
    };

    const gameData = {
      skillRegistry: {
        actives: {
          knockback_1: {
            id: "knockback_1",
            name: "体捌き",
            effect: [{ type: "knockback", distancePx: 30 }],
          },
        },
      },
      classRegistry: {},
      stages: [],
    };

    const getSave = vi.fn(() => ({
      stageProgress: { currentStageId: "stage_1" },
    }));
    const verifyModeControls = {
      isVerifyMode: () => false,
      onVerifyModeChange: vi.fn(),
      onOpenMetaMenu: vi.fn(),
    };

    vi.stubGlobal("document", {
      createElement: () => createFakeElement(),
    });

    const container = createFakeElement();

    new BattleView(
      container,
      engine as never,
      gameData as never,
      {} as never,
      getSave,
      verifyModeControls,
    );

    emitEvent({
      type: "skill",
      actorId: "actor-1",
      targetId: "target-1",
      skillId: "knockback_1",
      skillName: "体捌き",
      effect: "knockback",
      effectIndex: 0,
      slotKind: "active",
    });

    expect(mocks.canvasInstance.showKnockbackPopup).toHaveBeenCalledTimes(1);
    expect(mocks.canvasInstance.showKnockbackPopup).toHaveBeenCalledWith(
      "target-1",
    );
  });
});
