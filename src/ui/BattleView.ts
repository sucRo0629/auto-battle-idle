import "../styles/battle-view.css";
import "../styles/party-hud-floating-tooltip.css";
import type { BattleEngine } from "../battle/BattleEngine.ts";
import type { BattleEvent } from "../battle/events.ts";
import { resolveSkillRangePx } from "../battle/skills/rangeUtils.ts";
import type {
  BattleSnapshot,
  CombatantSnapshot,
  CombatantState,
  GameData,
  SaveGameState,
  SkillEffectDef,
} from "../battle/types.ts";
import {
  type LevelCurvesConfig,
} from "../progression/levelGrowth.ts";
import {
  getNextStageId,
  getStageById,
} from "../progression/stageProgression.ts";
import type { StageDamageDisplayRow } from "../battle/stageDamageStats.ts";
import { BattleCanvas } from "../render/BattleCanvas.ts";
import { subscribeLocaleChange, getLocale } from "../i18n/locale.ts";
import { t } from "../i18n/t.ts";
import type { GameTermLocale } from "./gameTermGlossary.ts";
import {
  buildSkillPresentationContext,
  isOverlayTickSkillEvent,
  playSkillBody,
  playSkillHitFeedback,
  resolveSkillPresentation,
} from "../render/skillPresentation.ts";
import { PartyHudPanel } from "./PartyHudPanel.ts";
import { PartyMemberEffectiveStatsPanel } from "./PartyMemberEffectiveStatsPanel.ts";
import {
  buildPartyHudEntries,
  buildPartyHudMetaBySlot,
} from "./partyHudTypes.ts";
import { resolveAttackSpeedTier } from "../progression/memberStatsDisplay.ts";
import { resolvePlayerDisplayLevel } from "../progression/resolvePlayerDisplayLevel.ts";
import { BattleStatsDrawer } from "./BattleStatsDrawer.ts";
import { PartyHudFloatingTooltip } from "./partyHudFloatingTooltip.ts";
import { GameTermPanel } from "./GameTermPanel.ts";
import "../styles/game-term-panel.css";
import { BattleXDebugCanvas } from "./BattleXDebugCanvas.ts";
import { DebugMenuPanel } from "./DebugMenuPanel.ts";

export interface VerifyModeControls {
  isVerifyMode: () => boolean;
  onVerifyModeChange: (enabled: boolean) => void;
  onOpenMetaMenu: () => void;
  onPlayerLevelChange?: (level: number) => void;
  getLoopStageId?: () => string | null;
  getLoopWaveIndex?: () => number | null;
  onLoopStageChange?: (stageId: string | null) => void;
  onLoopWaveChange?: (waveIndex: number | null) => void;
  getStageDamageDisplayRows?: () => StageDamageDisplayRow[];
  getCurrentStageId?: () => string;
  onStatsDrawerOpenChange?: (open: boolean) => void;
}

function resolveSkillRangePxFromSnapshot(
  actor: CombatantSnapshot,
  effect: SkillEffectDef,
  snapshot: BattleSnapshot,
): number {
  const livingAllyCount = snapshot.allies.filter((ally) => ally.hp > 0).length;
  return resolveSkillRangePx(
    { traits: { rangePx: actor.rangePx }, isEnemy: actor.isEnemy } as CombatantState,
    effect,
    livingAllyCount,
  );
}

export class BattleView {
  private readonly root: HTMLElement;
  private readonly canvasHost: HTMLElement;
  private readonly canvasWrap: HTMLElement;
  private readonly headerStageEl: HTMLElement;
  private readonly headerLevelEl: HTMLElement;
  private readonly verifyModeInput: HTMLInputElement;
  private readonly menuButton: HTMLButtonElement;
  private readonly hudToolbarLevelEl: HTMLElement;
  private readonly canvas: BattleCanvas;
  private readonly partyHud: PartyHudPanel;
  private readonly memberStatsPanel: PartyMemberEffectiveStatsPanel;
  private readonly debugMenu: DebugMenuPanel;
  private readonly battleXDebugCanvas: BattleXDebugCanvas;
  private readonly statsDrawer: BattleStatsDrawer;
  private readonly hudFloatingTooltip: PartyHudFloatingTooltip;
  private readonly gameTermPanel: GameTermPanel;
  private readonly canvasFrame: HTMLElement;
  private hoveredMemberStatsSlotIndex: number | null = null;
  private memberStatsHideTimer: ReturnType<typeof setTimeout> | null = null;
  private lastStageLabel = "";
  private lastHudToolbarLevel = -1;
  private readonly unsubscribeLocale: () => void;
  private readonly verifyModeControls?: VerifyModeControls;

  constructor(
    container: HTMLElement,
    private readonly engine: BattleEngine,
    private readonly gameData: GameData,
    private readonly levelCurves: LevelCurvesConfig,
    private readonly getSave: () => SaveGameState,
    verifyModeControls?: VerifyModeControls
  ) {
    this.verifyModeControls = verifyModeControls;
    this.root = document.createElement("div");
    this.root.className = "battle-view";

    const header = document.createElement("header");
    header.className = "battle-header";

    this.headerLevelEl = document.createElement("span");
    this.headerLevelEl.className = "battle-header-level";

    this.headerStageEl = document.createElement("span");
    this.headerStageEl.className = "battle-header-stage";

    const verifyLabel = document.createElement("label");
    verifyLabel.className = "verify-mode-toggle";
    verifyLabel.hidden = !verifyModeControls;

    this.verifyModeInput = document.createElement("input");
    this.verifyModeInput.type = "checkbox";
    this.verifyModeInput.checked = verifyModeControls?.isVerifyMode() ?? true;
    this.verifyModeInput.addEventListener("change", () => {
      verifyModeControls?.onVerifyModeChange(this.verifyModeInput.checked);
    });

    verifyLabel.appendChild(this.verifyModeInput);
    verifyLabel.setAttribute("aria-label", t("battle.verifyMode"));
    verifyLabel.title = t("battle.verifyMode");

    header.append(this.headerLevelEl, this.headerStageEl, verifyLabel);
    this.root.appendChild(header);

    this.canvasHost = document.createElement("div");
    this.canvasHost.className = "battle-canvas-host";

    const canvasFrame = document.createElement("div");
    canvasFrame.className = "battle-canvas-frame";
    this.canvasFrame = canvasFrame;

    const canvasWrap = document.createElement("div");
    canvasWrap.className = "battle-canvas-wrap";
    this.canvasWrap = canvasWrap;

    canvasFrame.appendChild(canvasWrap);
    this.canvasHost.appendChild(canvasFrame);

    this.root.appendChild(this.canvasHost);

    this.debugMenu = new DebugMenuPanel(this.gameData, {
      isVerifyMode: () => verifyModeControls?.isVerifyMode() ?? false,
      getSave: this.getSave,
      getLoopStageId: () => verifyModeControls?.getLoopStageId?.() ?? null,
      getLoopWaveIndex: () => verifyModeControls?.getLoopWaveIndex?.() ?? null,
      onLoopStageChange: (stageId) => {
        verifyModeControls?.onLoopStageChange?.(stageId);
        this.debugMenu.refresh();
      },
      onLoopWaveChange: (waveIndex) => {
        verifyModeControls?.onLoopWaveChange?.(waveIndex);
        this.debugMenu.refresh();
      },
      onPlayerLevelChange: (level) => {
        verifyModeControls?.onPlayerLevelChange?.(level);
        this.debugMenu.refresh();
      },
    });
    this.debugMenu.mount(this.root);

    this.battleXDebugCanvas = new BattleXDebugCanvas();
    this.battleXDebugCanvas.mount(this.root);
    this.battleXDebugCanvas.setVisible(
      verifyModeControls?.isVerifyMode() ?? false,
    );

    container.appendChild(this.root);

    this.canvas = new BattleCanvas();
    this.canvas.mount(canvasWrap);

    const hudStack = document.createElement("div");
    hudStack.className = "battle-hud-stack";
    canvasFrame.appendChild(hudStack);

    const hudToolbar = document.createElement("div");
    hudToolbar.className = "battle-hud-toolbar";

    const hudToolbarLeading = document.createElement("div");
    hudToolbarLeading.className = "battle-hud-toolbar-leading";

    this.hudToolbarLevelEl = document.createElement("span");
    this.hudToolbarLevelEl.className = "battle-hud-toolbar-level";

    hudToolbarLeading.appendChild(this.hudToolbarLevelEl);

    this.menuButton = this.createPartyMenuButton();
    this.menuButton.addEventListener("click", () => {
      verifyModeControls?.onOpenMetaMenu();
    });

    hudToolbar.append(hudToolbarLeading, this.menuButton);
    hudStack.appendChild(hudToolbar);
    this.syncHudToolbarLevel(this.getSave().party);

    this.hudFloatingTooltip = new PartyHudFloatingTooltip(canvasFrame);

    this.gameTermPanel = new GameTermPanel(canvasFrame, {
      locale: getLocale() as GameTermLocale,
    });
    this.gameTermPanel.mount();

    this.partyHud = new PartyHudPanel(this.canvasHost, {
      onMemberStatsHoverStart: (slotIndex) => {
        this.showMemberStatsPanel(slotIndex);
      },
      onMemberStatsHoverEnd: () => {
        this.scheduleMemberStatsHide();
      },
      floatingTooltip: this.hudFloatingTooltip,
      gameTermPanel: this.gameTermPanel,
      onScrollReposition: () => {
        if (this.memberStatsPanel.isVisible()) {
          this.memberStatsPanel.reposition();
        }
      },
    });
    this.partyHud.mount(hudStack);

    this.statsDrawer = new BattleStatsDrawer({
      onOpenChange: (open) => {
        this.partyHud.setMode(open ? "detail" : "compact");
        if (open) {
          const snapshot = this.engine.getSnapshot();
          this.partyHud.updateDetailMetrics({
            snapshots: snapshot.allies,
            displayRows:
              verifyModeControls?.getStageDamageDisplayRows?.() ?? [],
          });
        }
        verifyModeControls?.onStatsDrawerOpenChange?.(open);
      },
    });
    this.statsDrawer.mount(hudStack);

    const statsPanelStorage = document.createElement('div');
    statsPanelStorage.hidden = true;
    canvasFrame.appendChild(statsPanelStorage);

    this.memberStatsPanel = new PartyMemberEffectiveStatsPanel(
      statsPanelStorage,
      this.root,
      {
        frameMount: canvasFrame,
        onHoverStart: () => {
          this.clearMemberStatsHideTimer();
        },
        onHoverEnd: () => {
          this.scheduleMemberStatsHide();
        },
      },
    );

    this.engine.onEvent((event) => this.onBattleEvent(event));

    this.unsubscribeLocale = subscribeLocaleChange(() => {
      this.refreshLocaleChrome();
      this.lastHudToolbarLevel = -1;
      this.syncHudToolbarLevel(this.getSave().party);
      const snapshot = this.engine.getSnapshot();
      const save = this.getSave();
      const partyMeta = buildPartyHudMetaBySlot(
        save.party,
        this.gameData.classRegistry,
      );
      this.partyHud.update(buildPartyHudEntries(snapshot, partyMeta));
      this.partyHud.refreshLocale();
      this.refreshMemberStatsPanel();
    });
    this.refreshLocaleChrome();
  }

  private refreshLocaleChrome(): void {
    this.menuButton.textContent = t("battle.formation");
    this.menuButton.setAttribute("aria-label", t("battle.formationAria"));
    const verifyLabel = this.verifyModeInput.parentElement;
    verifyLabel?.setAttribute("aria-label", t("battle.verifyMode"));
    verifyLabel?.setAttribute("title", t("battle.verifyMode"));
  }

  private clearMemberStatsHideTimer(): void {
    if (this.memberStatsHideTimer === null) return;
    clearTimeout(this.memberStatsHideTimer);
    this.memberStatsHideTimer = null;
  }

  private scheduleMemberStatsHide(): void {
    this.clearMemberStatsHideTimer();
    this.memberStatsHideTimer = setTimeout(() => {
      this.memberStatsHideTimer = null;
      this.hoveredMemberStatsSlotIndex = null;
      this.syncMemberStatsPanel();
    }, 80);
  }

  private showMemberStatsPanel(slotIndex: number): void {
    this.clearMemberStatsHideTimer();
    this.hoveredMemberStatsSlotIndex = slotIndex;
    this.syncMemberStatsPanel();
  }

  private syncMemberStatsPanel(): void {
    if (this.hoveredMemberStatsSlotIndex === null) {
      this.memberStatsPanel.hide();
      return;
    }

    const data = this.resolveMemberStatsPanelData(
      this.hoveredMemberStatsSlotIndex,
    );
    if (!data) {
      this.hoveredMemberStatsSlotIndex = null;
      this.memberStatsPanel.hide();
      return;
    }

    const slotRoot = this.partyHud.getSlotRoot(this.hoveredMemberStatsSlotIndex);
    this.memberStatsPanel.attachToSlot(
      slotRoot,
      this.hoveredMemberStatsSlotIndex,
    );

    if (this.memberStatsPanel.isVisible()) {
      this.memberStatsPanel.update(data);
      return;
    }

    this.memberStatsPanel.show(data);
  }

  private resolveMemberStatsPanelData(slotIndex: number) {
    const snapshot = this.engine.getSnapshot();
    const save = this.getSave();
    const partyMeta = buildPartyHudMetaBySlot(
      save.party,
      this.gameData.classRegistry,
    );
    const meta = partyMeta[slotIndex];
    const member = save.party[slotIndex];
    if (!meta || !member) return null;

    const ally = snapshot.allies.find(
      (unit) => unit.partySlotIndex === slotIndex,
    );
    if (!ally) return null;

    const preset = this.gameData.classRegistry[member.classId];
    if (!preset) return null;

    return {
      displayName: meta.displayName,
      iconKey: ally.iconKey,
      ally,
      attackSpeedTier: resolveAttackSpeedTier(preset),
    };
  }

  private refreshMemberStatsPanel(): void {
    if (this.hoveredMemberStatsSlotIndex === null) return;
    const data = this.resolveMemberStatsPanelData(
      this.hoveredMemberStatsSlotIndex,
    );
    if (!data) {
      this.hoveredMemberStatsSlotIndex = null;
      this.memberStatsPanel.hide();
      return;
    }
    this.memberStatsPanel.update(data);
  }

  private flashDebugSkillRange(
    actorId: string,
    effectDef: SkillEffectDef,
  ): void {
    const snapshot = this.engine.getSnapshot();
    const actor = [...snapshot.allies, ...snapshot.enemies].find(
      (unit) => unit.id === actorId,
    );
    if (!actor) return;
    const rangePx = resolveSkillRangePxFromSnapshot(actor, effectDef, snapshot);
    this.battleXDebugCanvas.flashSkillRange(actorId, rangePx);
  }

  private refreshPartyHud(): void {
    const snapshot = this.engine.getSnapshot();
    const save = this.getSave();
    this.partyHud.update(
      buildPartyHudEntries(
        snapshot,
        buildPartyHudMetaBySlot(save.party, this.gameData.classRegistry),
      ),
    );
  }

  private onBattleEvent(event: BattleEvent): void {
    if (event.type === 'skillWindup') {
      const slotKind = event.slotKind ?? "active";
      const snapshot = this.engine.getSnapshot();
      const actor = [...snapshot.allies, ...snapshot.enemies].find(
        (c) => c.id === event.actorId,
      );
      const skillDef = this.gameData.skillRegistry.actives[event.skillId];
      const effectDef = skillDef?.effect[event.effectIndex];
      if (!skillDef || !effectDef) return;
      playSkillBody(
        this.canvas,
        event.actorId,
        skillDef,
        event.effectIndex,
        actor,
        slotKind,
        { restartIfPlaying: true },
      );
      return;
    }
    if (event.type === "skill") {
      const slotLabel =
        event.slotKind === "basic" ? t("battle.basicAttack") : event.skillName;
      const overlayTick = isOverlayTickSkillEvent(event);
      if (event.effect === "counter") {
        this.canvas.showCounterPopup(event.actorId);
      }
      if (event.effect === "enemyReelIn") {
        this.canvas.showEnemyReelInPopup(event.targetId);
      }
      if (
        event.effect === "knockback" ||
        (event.effect === "counter" && event.statusLabel === "knockback")
      ) {
        this.canvas.showKnockbackPopup(event.targetId);
      }
      if (!overlayTick) {
        if (event.effect === "damage" || event.effect === "dot") {
          if (event.amount !== undefined) {
            this.pushLog(`${slotLabel} → ${event.amount} dmg`);
          }
        } else if (event.effect === "heal") {
          if (event.amount !== undefined) {
            this.pushLog(`${slotLabel} → +${event.amount} HP`);
          } else if (event.statusLabel === "hot") {
            this.pushLog(`${slotLabel} → HoT`);
            this.canvas.showBuffGlow(event.targetId);
          }
        } else if (event.effect === "barrier") {
          if (event.amount !== undefined) {
            this.pushLog(`${slotLabel} → +${event.amount} barrier`);
          }
        } else if (event.effect === "buff" || event.effect === "debuff") {
          this.pushLog(`${slotLabel} → ${event.statusLabel ?? event.effect}`);
          this.canvas.showBuffGlow(event.targetId);
        } else if (event.effect === "move") {
          this.pushLog(`${slotLabel} → ${t("battle.move")}`);
        } else {
          this.pushLog(`${slotLabel} (${event.effect})`);
        }
      }

      if (overlayTick) {
        this.playOverlayTickFeedback(event);
        return;
      }

      const snapshot = this.engine.getSnapshot();
      const actor = [...snapshot.allies, ...snapshot.enemies].find(
        (c) => c.id === event.actorId
      );
      const slotKind = event.slotKind ?? "active";
      const skillDef = this.gameData.skillRegistry.actives[event.skillId];
      if (!skillDef) {
        if (event.effect === "dot" && event.amount !== undefined) {
          this.canvas.showDamagePopup(
            event.targetId,
            event.amount,
            "dot",
            event.dotFlavor,
          );
        } else if (event.effect === "heal" && event.amount !== undefined) {
          this.canvas.showHealPopup(event.targetId, event.amount);
        }
        return;
      }
      const effectDef = skillDef?.effect[event.effectIndex ?? 0];
      if (effectDef) {
        this.flashDebugSkillRange(event.actorId, effectDef);
        const skipBodyAnim = effectDef.applyFrame !== undefined;
        const presentation = !skipBodyAnim && skillDef
          ? playSkillBody(
              this.canvas,
              event.actorId,
              skillDef,
              event.effectIndex ?? 0,
              actor,
              slotKind,
            )
          : resolveSkillPresentation(
              skillDef,
              effectDef,
              buildSkillPresentationContext(
                actor,
                slotKind,
                effectDef,
                skillDef.id,
                event.effectIndex ?? 0,
              ),
            );
        if (!presentation) return;
        playSkillHitFeedback(this.canvas, {
          sourceId: event.vfxSourceId ?? event.actorId,
          targetId: event.targetId,
          presentation,
          effect: effectDef,
          skillId: skillDef.id,
          effectIndex: event.effectIndex ?? 0,
          hitIndex: event.hitIndex,
          amount: event.amount,
          kind:
            event.effect === "damage"
              ? "damage"
              : event.effect === "dot"
                ? "dot"
                : event.effect === "heal"
                  ? "heal"
                  : undefined,
          dotFlavor:
            event.effect === "dot" ? event.dotFlavor : undefined,
          popupDedupeKey: this.resolveSkillPopupDedupeKey(event),
          skipMainVfx: (event.hitIndex ?? 0) > 0,
        });
      }
    } else if (event.type === "basicAttackCountCharged") {
      this.refreshPartyHud();
    } else if (event.type === "evade") {
      this.canvas.showEvadePopup(event.targetId);
    } else if (event.type === "block") {
      this.canvas.showBlockPopup(event.targetId);
    } else if (event.type === "lowHpCover") {
      this.canvas.showLowHpCoverPopup(event.targetId);
    } else if (event.type === "invulnerable") {
      this.canvas.showInvulnerablePopup(event.targetId);
    } else if (event.type === "lastStandRecovery") {
      this.canvas.showLastStandRecoveryPopup(event.targetId);
    } else if (event.type === "lastStandGuts") {
      this.canvas.showLastStandGutsPopup(event.targetId);
    } else if (event.type === "death") {
      this.canvas.playAnim(event.targetId, "death");
    } else if (event.type === "battleEnd") {
      this.pushLog(event.result === "victory" ? "Victory!" : "Defeat...");
      const currentStageId = this.getSave().stageProgress.currentStageId;
      if (event.result === "victory") {
        const pinnedLoopStageId =
          this.verifyModeControls?.getLoopStageId?.() ?? null;
        const pinnedLoopWaveIndex =
          this.verifyModeControls?.getLoopWaveIndex?.() ?? null;
        if (pinnedLoopStageId) {
          if (pinnedLoopWaveIndex !== null) {
            this.pushLog(
              `Looping pinned wave ${pinnedLoopWaveIndex + 1}...`,
            );
          } else {
            this.pushLog("Looping pinned stage...");
          }
        } else {
          const nextStageId = getNextStageId(
            this.gameData.stages,
            currentStageId
          );
          this.pushLog(
            nextStageId === currentStageId
              ? "Looping current stage..."
              : "Advancing to next stage..."
          );
        }
      } else if (this.verifyModeControls?.getLoopStageId?.()) {
        this.pushLog("Staying on pinned stage...");
      } else {
        this.pushLog("Returning to previous stage...");
      }
    }
  }

  private pushLog(message: string): void {
    if (!(this.verifyModeControls?.isVerifyMode() ?? false)) return;
    console.log(`[battle] ${message}`);
  }

  private resolveSkillPopupDedupeKey(
    event: Extract<BattleEvent, { type: "skill" }>,
  ): string | undefined {
    if (event.amount === undefined) return undefined;
    if (event.effect === "dot" && event.statusEffectId) {
      return [event.statusEffectId, event.targetId, event.amount].join(":");
    }
    if (
      event.effect === "heal" &&
      event.statusLabel === "hot" &&
      event.amount !== undefined
    ) {
      return ["hot", event.targetId, event.amount].join(":");
    }
    if (event.effect !== "damage" && event.effect !== "dot") {
      return undefined;
    }
    return [
      event.vfxSourceId ?? event.actorId,
      event.targetId,
      event.skillId,
      event.effectIndex ?? 0,
      event.hitIndex ?? -1,
      event.effect,
      event.amount,
    ].join(":");
  }

  private playOverlayTickFeedback(
    event: Extract<BattleEvent, { type: "skill" }>,
  ): void {
    if (event.amount === undefined) return;
    const effect =
      event.effect === "dot"
        ? ({ type: "dot", dotFlavor: event.dotFlavor } as SkillEffectDef)
        : ({ type: "heal" } as SkillEffectDef);
    playSkillHitFeedback(this.canvas, {
      sourceId: event.vfxSourceId ?? event.actorId,
      targetId: event.targetId,
      presentation: {},
      effect,
      skillId: event.skillId,
      effectIndex: event.effectIndex ?? 0,
      amount: event.amount,
      kind: event.effect === "dot" ? "dot" : "heal",
      dotFlavor: event.dotFlavor,
      overlayTick: true,
      popupDedupeKey: this.resolveSkillPopupDedupeKey(event),
    });
  }

  tick(deltaMs: number): void {
    const snapshot = this.engine.getSnapshot();
    const save = this.getSave();
    const stage = getStageById(
      this.gameData.stages,
      save.stageProgress.currentStageId
    );
    const stageName = stage?.displayName ?? save.stageProgress.currentStageId;
    const waveNum = snapshot.waveIndex + 1;
    const waveTotal = snapshot.waveCount;
    const stageLabel = `${stageName}  Wave ${waveNum}/${waveTotal}`;
    if (stageLabel !== this.lastStageLabel) {
      this.lastStageLabel = stageLabel;
      this.headerStageEl.textContent = stageLabel;
    }

    this.syncHudToolbarLevel(save.party);

    const debugEnabled = this.verifyModeControls?.isVerifyMode() ?? false;

    this.canvas.syncFromSnapshot(snapshot);
    if (debugEnabled) {
      this.battleXDebugCanvas.recordLiveFrame(snapshot);
      const debugSnapshot =
        this.battleXDebugCanvas.resolveDisplaySnapshot(snapshot);
      this.battleXDebugCanvas.syncFromSnapshot(debugSnapshot);
    }
    this.partyHud.update(
      buildPartyHudEntries(
        snapshot,
        buildPartyHudMetaBySlot(save.party, this.gameData.classRegistry),
      ),
    );
    this.canvas.tick(deltaMs);
    if (debugEnabled) {
      this.battleXDebugCanvas.tick(deltaMs);
    }

    if (this.statsDrawer.isOpen()) {
      this.partyHud.updateDetailMetrics({
        snapshots: snapshot.allies,
        displayRows:
          this.verifyModeControls?.getStageDamageDisplayRows?.() ?? [],
      });
    }
    this.refreshMemberStatsPanel();
  }

  setMenuButtonDisabled(disabled: boolean): void {
    this.menuButton.disabled = disabled;
  }

  setStatsDrawerDisabled(disabled: boolean): void {
    this.statsDrawer.setDisabled(disabled);
  }

  private syncHudToolbarLevel(
    party: ReturnType<BattleView["getSave"]>["party"] | undefined,
  ): void {
    const level = resolvePlayerDisplayLevel(party ?? []);
    if (level === this.lastHudToolbarLevel) return;
    this.lastHudToolbarLevel = level;
    const levelLabel = t("common.playerLevel", { level });
    this.headerLevelEl.textContent = levelLabel;
    this.hudToolbarLevelEl.textContent = levelLabel;
  }

  private createPartyMenuButton(): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "battle-party-menu-button";
    return button;
  }

  destroy(): void {
    this.unsubscribeLocale();
    this.clearMemberStatsHideTimer();
    this.hudFloatingTooltip.destroy();
    this.gameTermPanel.destroy();
    this.statsDrawer.destroy();
    this.memberStatsPanel.destroy();
    this.canvas.destroy();
    this.battleXDebugCanvas.destroy();
    this.partyHud.destroy();
    this.debugMenu.destroy();
    this.root.remove();
  }

  syncVerifyModeToggle(enabled: boolean): void {
    this.verifyModeInput.checked = enabled;
    this.battleXDebugCanvas.setVisible(enabled);
    this.debugMenu.refresh();
  }

  isBattleXDebugReplayPaused(): boolean {
    return this.battleXDebugCanvas.isReplayPaused();
  }
}
