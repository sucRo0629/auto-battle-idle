import "../styles/battle-view.css";
import "../styles/party-hud-overlay.css";
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
import { formatPartyHudSkillSlotTooltip } from "./partyHudSkillGaugeTooltip.ts";
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
import { applyBattleRootScale } from "./battleRootScale.ts";

export interface VerifyModeControls {
  isVerifyMode: () => boolean;
  onVerifyModeChange: (enabled: boolean) => void;
  isBattleXDebugDisplayEnabled?: () => boolean;
  onBattleXDebugDisplayChange?: (enabled: boolean) => void;
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
  private readonly battleViewport: HTMLElement;
  private readonly battleRoot: HTMLElement;
  private readonly canvasHost: HTMLElement;
  private readonly canvasWrap: HTMLElement;
  private readonly canvasHudStageEl: HTMLElement;
  private readonly canvasHudWaveEl: HTMLElement;
  private readonly verifyBadgeEl: HTMLButtonElement;
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
  private readonly partyHudSlotEl: HTMLElement;
  private hoveredMemberStatsSlotIndex: number | null = null;
  private memberStatsHideTimer: ReturnType<typeof setTimeout> | null = null;
  private lastStageName = "";
  private lastWaveLabel = "";
  private lastHudToolbarLevel = -1;
  private readonly unsubscribeLocale: () => void;
  private readonly verifyModeControls?: VerifyModeControls;
  private battleRootResizeObserver: ResizeObserver | null = null;

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

    this.battleViewport = document.createElement("div");
    this.battleViewport.className = "battle-viewport";

    this.battleRoot = document.createElement("div");
    this.battleRoot.className = "battle-root";

    this.canvasHost = document.createElement("div");
    this.canvasHost.className = "battle-canvas-host";

    const battleBackground = document.createElement("div");
    battleBackground.className = "battle-background";
    battleBackground.setAttribute("aria-hidden", "true");

    const battleLaneLayer = document.createElement("div");
    battleLaneLayer.className = "battle-layer battle-layer--lane";

    const battleLane = document.createElement("div");
    battleLane.className = "battle-lane";

    const battleFxLayer = document.createElement("div");
    battleFxLayer.className = "battle-layer battle-layer--fx";
    battleFxLayer.setAttribute("aria-hidden", "true");

    const battleHudLayer = document.createElement("div");
    battleHudLayer.className = "battle-layer battle-layer--hud";

    const partyHudSlot = document.createElement("div");
    partyHudSlot.className = "battle-hud-slot battle-hud-slot--party";
    partyHudSlot.setAttribute("data-battle-hud-slot", "party");
    this.partyHudSlotEl = partyHudSlot;

    const enemyHudSlot = document.createElement("div");
    enemyHudSlot.className = "enemy-hud-slot battle-hud-slot battle-hud-slot--enemy";
    enemyHudSlot.setAttribute("data-battle-hud-slot", "enemy");
    enemyHudSlot.setAttribute("aria-hidden", "true");

    const battleTopInfo = document.createElement("div");
    battleTopInfo.className = "battle-top-info";

    const battleDebugOverlay = document.createElement("div");
    battleDebugOverlay.className = "battle-debug-overlay";
    battleDebugOverlay.setAttribute("aria-hidden", "true");

    const canvasFrame = document.createElement("div");
    canvasFrame.className = "battle-canvas-frame battle-canvas-frame--lane-hud";
    this.canvasFrame = canvasFrame;

    const canvasWrap = document.createElement("div");
    canvasWrap.className = "battle-canvas-wrap";
    this.canvasWrap = canvasWrap;

    this.canvasHudStageEl = document.createElement("span");
    this.canvasHudStageEl.className = "battle-canvas-hud-stage battle-top-info-stage";

    this.canvasHudWaveEl = document.createElement("span");
    this.canvasHudWaveEl.className = "battle-canvas-hud-wave battle-top-info-wave";

    this.verifyBadgeEl = document.createElement("button");
    this.verifyBadgeEl.type = "button";
    this.verifyBadgeEl.className = "battle-verify-badge battle-top-info-verify";
    this.verifyBadgeEl.hidden = !verifyModeControls;
    this.verifyBadgeEl.addEventListener("click", () => {
      if (!verifyModeControls) return;
      verifyModeControls.onVerifyModeChange(
        !verifyModeControls.isVerifyMode()
      );
    });

    battleTopInfo.append(
      this.canvasHudStageEl,
      this.canvasHudWaveEl,
      this.verifyBadgeEl,
    );

    battleLane.appendChild(canvasWrap);

    battleLaneLayer.appendChild(battleLane);
    battleHudLayer.append(partyHudSlot, enemyHudSlot);

    this.canvasHost.append(
      battleBackground,
      battleLaneLayer,
      battleFxLayer,
      battleHudLayer,
      battleTopInfo,
      battleDebugOverlay,
    );

    this.battleRoot.appendChild(this.canvasHost);
    this.battleViewport.appendChild(this.battleRoot);
    this.root.appendChild(this.battleViewport);
    this.mountBattleRootScale();

    this.debugMenu = new DebugMenuPanel(this.gameData, {
      isVerifyMode: () => verifyModeControls?.isVerifyMode() ?? false,
      isBattleXDebugDisplayEnabled: () =>
        this.isBattleXDebugDisplayActive(),
      onBattleXDebugDisplayChange: (enabled) => {
        verifyModeControls?.onBattleXDebugDisplayChange?.(enabled);
      },
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
    this.syncBattleXDebugDisplay();

    container.appendChild(this.root);

    this.canvas = new BattleCanvas();
    this.canvas.mount(canvasWrap);

    const hudStack = document.createElement("div");
    hudStack.className = "battle-hud-stack";

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

    canvasFrame.appendChild(hudStack);
    battleLane.appendChild(canvasFrame);

    this.hudFloatingTooltip = new PartyHudFloatingTooltip(canvasFrame);

    this.gameTermPanel = new GameTermPanel(canvasFrame, {
      locale: getLocale() as GameTermLocale,
    });
    this.gameTermPanel.mount();

    this.partyHud = new PartyHudPanel(this.canvasHost, {
      layout: "overlay",
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
      resolveSkillSlotTooltip: (_partySlot, cellIndex, cd, inactive) =>
        formatPartyHudSkillSlotTooltip(
          cellIndex,
          cd,
          cd?.skillId
            ? this.gameData.skillRegistry.actives[cd.skillId]
            : undefined,
          inactive,
        ),
    });
    this.partyHud.mount(this.partyHudSlotEl);

    this.statsDrawer = new BattleStatsDrawer({
      onOpenChange: (open) => {
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

  private mountBattleRootScale(): void {
    const updateScale = (): void => {
      applyBattleRootScale(
        this.battleRoot,
        this.battleViewport.clientWidth,
        this.battleViewport.clientHeight,
      );
    };

    updateScale();
    this.battleRootResizeObserver = new ResizeObserver(updateScale);
    this.battleRootResizeObserver.observe(this.battleViewport);
  }

  private refreshLocaleChrome(): void {
    this.menuButton.textContent = t("battle.formation");
    this.menuButton.setAttribute("aria-label", t("battle.formationAria"));
    this.syncVerifyBadgeState();
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
    const waveLabel = t("battle.waveProgress", {
      current: waveNum,
      total: waveTotal,
    });
    if (stageName !== this.lastStageName) {
      this.lastStageName = stageName;
      this.canvasHudStageEl.textContent = stageName;
    }
    if (waveLabel !== this.lastWaveLabel) {
      this.lastWaveLabel = waveLabel;
      this.canvasHudWaveEl.textContent = waveLabel;
    }

    this.syncHudToolbarLevel(save.party);
    this.syncVerifyBadgeState();

    const debugEnabled = this.isBattleXDebugDisplayActive();

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
    this.partyHud.updateDetailMetrics({
      snapshots: snapshot.allies,
      displayRows:
        this.verifyModeControls?.getStageDamageDisplayRows?.() ?? [],
    });
    this.canvas.tick(deltaMs);
    if (debugEnabled) {
      this.battleXDebugCanvas.tick(deltaMs);
    }

    this.refreshMemberStatsPanel();
  }

  setMenuButtonDisabled(disabled: boolean): void {
    this.menuButton.disabled = disabled;
  }

  setStatsDrawerDisabled(disabled: boolean): void {
    this.statsDrawer.setDisabled(disabled);
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
    this.root.setAttribute('aria-hidden', visible ? 'false' : 'true');
  }

  private syncHudToolbarLevel(
    party: ReturnType<BattleView["getSave"]>["party"] | undefined,
  ): void {
    const level = resolvePlayerDisplayLevel(party ?? []);
    if (level === this.lastHudToolbarLevel) return;
    this.lastHudToolbarLevel = level;
    const levelLabel = t("common.playerLevel", { level });
    this.hudToolbarLevelEl.textContent = levelLabel;
  }

  private syncVerifyBadgeState(): void {
    if (!this.verifyModeControls) {
      this.verifyBadgeEl.hidden = true;
      return;
    }

    this.verifyBadgeEl.hidden = false;
    const enabled = this.verifyModeControls.isVerifyMode();
    this.verifyBadgeEl.classList.toggle("battle-verify-badge--on", enabled);
    this.verifyBadgeEl.classList.toggle("battle-verify-badge--off", !enabled);
    this.verifyBadgeEl.textContent = enabled
      ? t("battle.verifyBadge")
      : t("battle.debugBadge");
    this.verifyBadgeEl.setAttribute("aria-label", t("battle.verifyMode"));
    this.verifyBadgeEl.title = enabled
      ? t("battle.verifyMode")
      : t("battle.verifyMode");
  }

  private createPartyMenuButton(): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "battle-party-menu-button";
    return button;
  }

  destroy(): void {
    this.unsubscribeLocale();
    this.battleRootResizeObserver?.disconnect();
    this.battleRootResizeObserver = null;
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

  syncVerifyModeToggle(_enabled: boolean): void {
    this.syncBattleXDebugDisplay();
    this.debugMenu.refresh();
    this.syncVerifyBadgeState();
  }

  syncBattleXDebugDisplay(): void {
    this.battleXDebugCanvas.setVisible(this.isBattleXDebugDisplayActive());
  }

  private isBattleXDebugDisplayActive(): boolean {
    return (
      (this.verifyModeControls?.isVerifyMode() ?? false) &&
      (this.verifyModeControls?.isBattleXDebugDisplayEnabled?.() ?? true)
    );
  }

  isBattleXDebugReplayPaused(): boolean {
    return this.battleXDebugCanvas.isReplayPaused();
  }
}
