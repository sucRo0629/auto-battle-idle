import "../styles/battle-view.css";
import "../styles/battle-stats-drawer.css";
import "../styles/enemy-hud-overlay.css";
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
import { EnemyHudPanel } from "./EnemyHudPanel.ts";
import { buildEnemyHudGroups } from "./enemyHudTypes.ts";
import { PartyHudPanel } from "./PartyHudPanel.ts";
import { PartyMemberEffectiveStatsPanel } from "./PartyMemberEffectiveStatsPanel.ts";
import {
  buildPartyHudEntries,
  buildPartyHudMetaBySlot,
} from "./partyHudTypes.ts";
import { resolveAttackSpeedTier } from "../progression/memberStatsDisplay.ts";
import { PartyHudFloatingTooltip } from "./partyHudFloatingTooltip.ts";
import { GameTermPanel } from "./GameTermPanel.ts";
import "../styles/game-term-panel.css";
import { BattleXDebugCanvas } from "./BattleXDebugCanvas.ts";
import { DebugMenuPanel } from "./DebugMenuPanel.ts";
import { applyBattleRootScale } from "./battleRootScale.ts";
import {
  BATTLE_GROUND_LINE_SCREEN_RATIO,
  BATTLE_HUD_SIDE_MARGIN,
  BATTLE_LANE_RECT,
  BATTLE_SIDE_HUD_WIDTH,
  BATTLE_TRANSIENT_CONTROLS_TOP,
  BATTLE_X_DEBUG_PANEL_TOP,
  ENEMY_HUD_SLOT_RECT,
  battleHudToolbarTopY,
  battleRootRectStyle,
  PARTY_HUD_ALLY_CARD_CONTENT_WIDTH,
  PARTY_HUD_ALLY_CARD_PAD,
  PARTY_HUD_ALLY_CARD_PAD_X,
  PARTY_HUD_OVERLAY_CARD_PAD_SCALE,
  PARTY_HUD_SLOT_RECT,
} from "./battleRootLayout.ts";
import { CANVAS_W } from "../battle/battleConstants.ts";
import {
  createEmptyHoverHighlight,
  isSameHoverHighlight,
  resolveHoverHighlightUnitIds,
  type BattleHoverHighlightSource,
  type BattleHoverHighlightState,
} from "./battleHoverHighlight.ts";
import { BattleTargetIndicatorTracker } from "./battleTargetIndicator.ts";

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
  private readonly stagePlateEl: HTMLElement;
  private readonly stagePlateStageEl: HTMLElement;
  private readonly stagePlateWaveEl: HTMLElement;
  private readonly verifyBadgeEl: HTMLButtonElement;
  private readonly menuButton: HTMLButtonElement;
  private readonly canvas: BattleCanvas;
  private readonly partyHud: PartyHudPanel;
  private readonly enemyHud: EnemyHudPanel;
  private readonly memberStatsPanel: PartyMemberEffectiveStatsPanel;
  private readonly debugMenu: DebugMenuPanel;
  private readonly battleXDebugCanvas: BattleXDebugCanvas;
  private readonly hudFloatingTooltip: PartyHudFloatingTooltip;
  private readonly gameTermPanel: GameTermPanel;
  private readonly hudTooltipLayer: HTMLElement;
  private readonly partyHudSlotEl: HTMLElement;
  private readonly enemyHudSlotEl: HTMLElement;
  private readonly battleDebugOverlay: HTMLElement;
  private readonly battleDebugShell: HTMLElement;
  private readonly debugMenuDock: HTMLElement;
  private hoveredMemberStatsSlotIndex: number | null = null;
  private hoverHighlight: BattleHoverHighlightState = createEmptyHoverHighlight();
  private readonly targetIndicatorTracker = new BattleTargetIndicatorTracker();
  private battleElapsedMs = 0;
  private memberStatsHideTimer: ReturnType<typeof setTimeout> | null = null;
  private lastStagePlateLabel = "";
  private lastWavePlateLabel = "";
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
    this.battleRoot.style.setProperty(
      "--battle-side-hud-width",
      `${BATTLE_SIDE_HUD_WIDTH}px`,
    );
    this.battleRoot.style.setProperty(
      "--party-hud-overlay-content-w",
      `${PARTY_HUD_ALLY_CARD_CONTENT_WIDTH}px`,
    );
    this.battleRoot.style.setProperty(
      "--party-hud-overlay-card-pad-x",
      `${PARTY_HUD_ALLY_CARD_PAD_X}px`,
    );
    this.battleRoot.style.setProperty(
      "--party-hud-overlay-card-pad",
      `${PARTY_HUD_ALLY_CARD_PAD}px`,
    );
    this.battleRoot.style.setProperty(
      "--party-hud-overlay-card-pad-scale",
      `${PARTY_HUD_OVERLAY_CARD_PAD_SCALE}`,
    );
    this.battleRoot.style.setProperty(
      "--battle-canvas-width",
      `${CANVAS_W}px`,
    );
    this.battleRoot.style.setProperty(
      "--battle-ground-line-ratio",
      `${BATTLE_GROUND_LINE_SCREEN_RATIO}%`,
    );

    this.canvasHost = document.createElement("div");
    this.canvasHost.className = "battle-canvas-host";

    const battleBackground = document.createElement("div");
    battleBackground.className = "battle-background";
    battleBackground.setAttribute("aria-hidden", "true");

    const battleLaneLayer = document.createElement("div");
    battleLaneLayer.className = "battle-layer battle-layer--lane";

    const battleLane = document.createElement("div");
    battleLane.className = "battle-lane";
    battleLane.style.cssText = battleRootRectStyle(BATTLE_LANE_RECT);

    const battleFxLayer = document.createElement("div");
    battleFxLayer.className = "battle-layer battle-layer--fx";
    battleFxLayer.setAttribute("aria-hidden", "true");

    const battleHudLayer = document.createElement("div");
    battleHudLayer.className = "battle-layer battle-layer--hud";

    const partyHudSlot = document.createElement("div");
    partyHudSlot.className = "battle-hud-slot battle-hud-slot--party";
    partyHudSlot.setAttribute("data-battle-hud-slot", "party");
    partyHudSlot.style.cssText = battleRootRectStyle(PARTY_HUD_SLOT_RECT);
    this.partyHudSlotEl = partyHudSlot;

    const enemyHudSlot = document.createElement("div");
    enemyHudSlot.className = "battle-hud-slot battle-hud-slot--enemy";
    enemyHudSlot.setAttribute("data-battle-hud-slot", "enemy");
    enemyHudSlot.style.cssText = battleRootRectStyle(ENEMY_HUD_SLOT_RECT);
    this.enemyHudSlotEl = enemyHudSlot;

    const battleTopInfo = document.createElement("div");
    battleTopInfo.className = "battle-top-info";

    const battleDebugOverlay = document.createElement("div");
    battleDebugOverlay.className = "battle-debug-overlay";
    battleDebugOverlay.setAttribute("aria-hidden", "true");
    this.battleDebugOverlay = battleDebugOverlay;

    const hudTooltipLayer = document.createElement("div");
    hudTooltipLayer.className = "battle-layer battle-layer--tooltip";
    hudTooltipLayer.setAttribute("aria-hidden", "true");
    this.hudTooltipLayer = hudTooltipLayer;

    const battleDebugShell = document.createElement("div");
    battleDebugShell.className = "battle-debug-shell";
    battleDebugShell.style.setProperty(
      "--battle-hud-toolbar-top",
      `${battleHudToolbarTopY()}px`,
    );
    battleDebugShell.style.setProperty(
      "--battle-x-debug-top",
      `${BATTLE_X_DEBUG_PANEL_TOP}px`,
    );
    battleDebugShell.style.setProperty(
      "--battle-x-debug-column-width",
      `${BATTLE_SIDE_HUD_WIDTH}px`,
    );
    battleDebugShell.style.setProperty(
      "--battle-transient-controls-top",
      `${BATTLE_TRANSIENT_CONTROLS_TOP}px`,
    );
    battleDebugShell.style.setProperty(
      "--battle-transient-controls-right",
      `${BATTLE_HUD_SIDE_MARGIN}px`,
    );
    this.battleDebugShell = battleDebugShell;
    battleDebugOverlay.appendChild(battleDebugShell);

    const canvasWrap = document.createElement("div");
    canvasWrap.className = "battle-canvas-wrap";
    this.canvasWrap = canvasWrap;

    this.stagePlateEl = document.createElement("div");
    this.stagePlateEl.className = "battle-stage-plate game-panel-surface";

    this.stagePlateStageEl = document.createElement("div");
    this.stagePlateStageEl.className = "battle-stage-plate-stage";

    this.stagePlateWaveEl = document.createElement("div");
    this.stagePlateWaveEl.className = "battle-stage-plate-wave";

    this.stagePlateEl.append(this.stagePlateStageEl, this.stagePlateWaveEl);

    this.verifyBadgeEl = document.createElement("button");
    this.verifyBadgeEl.type = "button";
    this.verifyBadgeEl.className = "battle-verify-badge battle-debug-verify-badge";
    this.verifyBadgeEl.hidden = !verifyModeControls;
    this.verifyBadgeEl.addEventListener("click", () => {
      if (!verifyModeControls) return;
      verifyModeControls.onVerifyModeChange(
        !verifyModeControls.isVerifyMode()
      );
    });

    battleTopInfo.append(this.stagePlateEl);

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
      hudTooltipLayer,
    );

    this.battleRoot.appendChild(this.canvasHost);
    this.battleViewport.appendChild(this.battleRoot);
    this.root.appendChild(this.battleViewport);
    this.mountBattleRootScale();


    const transientControlsDock = document.createElement("div");
    transientControlsDock.className = "battle-transient-controls-dock";

    const debugMenuDock = document.createElement("div");
    debugMenuDock.className = "battle-debug-menu-dock";
    this.debugMenuDock = debugMenuDock;

    const debugMenuToggle = document.createElement("button");
    debugMenuToggle.type = "button";
    debugMenuToggle.className = "battle-debug-menu-toggle";
    debugMenuToggle.textContent = "Debug";
    const setDebugMenuDockOpen = (open: boolean) => {
      debugMenuDock.classList.toggle("battle-debug-menu-dock--open", open);
      debugMenuToggle.setAttribute("aria-expanded", open ? "true" : "false");
    };
    debugMenuToggle.addEventListener("click", () => {
      setDebugMenuDockOpen(
        !debugMenuDock.classList.contains("battle-debug-menu-dock--open"),
      );
    });
    debugMenuToggle.setAttribute("aria-expanded", "false");
    debugMenuDock.appendChild(debugMenuToggle);

    this.debugMenu = new DebugMenuPanel(
      this.gameData,
      {
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
      },
      () => {
        setDebugMenuDockOpen(false);
      },
    );
    this.debugMenu.mount(debugMenuDock);

    this.menuButton = this.createPartyMenuButton();
    this.menuButton.addEventListener("click", () => {
      verifyModeControls?.onOpenMetaMenu();
    });
    transientControlsDock.appendChild(debugMenuDock);
    transientControlsDock.appendChild(this.menuButton);
    battleDebugShell.appendChild(transientControlsDock);
    battleDebugShell.appendChild(this.verifyBadgeEl);

    this.battleXDebugCanvas = new BattleXDebugCanvas();
    this.battleXDebugCanvas.mount(battleDebugShell);
    this.syncBattleXDebugDisplay();

    container.appendChild(this.root);

    this.canvas = new BattleCanvas();
    this.canvas.mount(canvasWrap);
    this.canvas.setFieldHoverListener((unitId) => {
      if (unitId === null) {
        if (this.hoverHighlight.source === "field") {
          this.setHoverHighlight(null, null);
        }
        return;
      }
      if (this.hoverHighlight.source === "hud") {
        return;
      }
      this.setHoverHighlight(unitId, "field");
    });

    this.hudFloatingTooltip = new PartyHudFloatingTooltip(this.hudTooltipLayer);

    this.gameTermPanel = new GameTermPanel(this.canvasHost, {
      locale: getLocale() as GameTermLocale,
      frameMount: this.hudTooltipLayer,
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
      onHoverHighlightStart: (unitId) => {
        this.setHoverHighlight(unitId, "hud");
      },
      onHoverHighlightEnd: () => {
        if (this.hoverHighlight.source === "hud") {
          this.setHoverHighlight(null, null);
        }
      },
      floatingTooltip: this.hudFloatingTooltip,
      gameTermPanel: this.gameTermPanel,
      onScrollReposition: () => {
        if (this.memberStatsPanel.isVisible()) {
          this.memberStatsPanel.reposition();
        }
      },
    });
    this.partyHud.mount(this.partyHudSlotEl);

    this.enemyHud = new EnemyHudPanel(this.canvasHost, {
      layout: "overlay-top",
      floatingTooltip: this.hudFloatingTooltip,
      gameTermPanel: this.gameTermPanel,
      onHoverHighlightStart: (unitIds) => {
        this.setHoverHighlight(unitIds[0] ?? null, "hud", unitIds);
      },
      onHoverHighlightEnd: () => {
        if (this.hoverHighlight.source === "hud") {
          this.setHoverHighlight(null, null);
        }
      },
    });
    this.enemyHud.mount(this.enemyHudSlotEl);

    const statsPanelStorage = document.createElement('div');
    statsPanelStorage.hidden = true;
    this.hudTooltipLayer.appendChild(statsPanelStorage);

    this.memberStatsPanel = new PartyMemberEffectiveStatsPanel(
      statsPanelStorage,
      this.root,
      {
        frameMount: this.hudTooltipLayer,
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
      const snapshot = this.engine.getSnapshot();
      const save = this.getSave();
      const partyMeta = buildPartyHudMetaBySlot(
        save.party,
        this.gameData.classRegistry,
      );
      this.partyHud.update(buildPartyHudEntries(snapshot, partyMeta));
      this.partyHud.refreshLocale();
      this.enemyHud.update(buildEnemyHudGroups(snapshot.enemies), {
        waveIndex: snapshot.waveIndex,
      });
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

    const slotRoot = this.partyHud.getMemberStatsAnchor(
      this.hoveredMemberStatsSlotIndex,
    );
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

  private resolveMemberStatsPanelData(visualSlotIndex: number) {
    const snapshot = this.engine.getSnapshot();
    const save = this.getSave();
    const partyMeta = buildPartyHudMetaBySlot(
      save.party,
      this.gameData.classRegistry,
    );
    const hudEntry = buildPartyHudEntries(snapshot, partyMeta)[visualSlotIndex];
    if (!hudEntry) return null;

    const partySlotIndex = hudEntry.partySlotIndex;
    const meta = partyMeta[partySlotIndex];
    const member = save.party[partySlotIndex];
    if (!meta || !member) return null;

    const ally = snapshot.allies.find(
      (unit) => unit.partySlotIndex === partySlotIndex,
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
    this.enemyHud.update(buildEnemyHudGroups(snapshot.enemies), {
      waveIndex: snapshot.waveIndex,
    });
  }

  private setHoverHighlight(
    unitId: string | null,
    source: BattleHoverHighlightSource | null,
    highlightUnitIds: readonly string[] = unitId ? [unitId] : [],
  ): void {
    const next = { unitId, source, highlightUnitIds };
    if (isSameHoverHighlight(this.hoverHighlight, next)) return;
    this.hoverHighlight = next;
    this.applyHoverHighlight();
    this.applyTargetIndicators();
  }

  private applyHoverHighlight(): void {
    const { unitId } = this.hoverHighlight;
    const highlightUnitIds = resolveHoverHighlightUnitIds(this.hoverHighlight);
    this.canvas.setHoverHighlightUnitIds(
      highlightUnitIds.length > 0 ? highlightUnitIds : null,
    );
    this.enemyHud.setHoverHighlightUnitIds(highlightUnitIds);
    this.partyHud.setHoverHighlightUnitId(unitId);
  }

  private noteTargetIndicator(actorId: string, targetId: string): void {
    const changed = this.targetIndicatorTracker.note(
      actorId,
      targetId,
      this.battleElapsedMs,
    );
    if (changed) {
      this.applyTargetIndicators();
    }
  }

  private applyTargetIndicators(): void {
    const targetedUnitIds = this.resolveVisibleTargetIndicatorUnitIds();
    this.canvas.setTargetIndicatorUnitIds(targetedUnitIds);
  }

  private resolveVisibleTargetIndicatorUnitIds(): string[] {
    if (this.hoverHighlight.source !== "hud" || !this.hoverHighlight.unitId) {
      return [];
    }
    const targetId = this.targetIndicatorTracker.getTargetIdForActor(
      this.hoverHighlight.unitId,
    );
    return targetId ? [targetId] : [];
  }

  private onBattleEvent(event: BattleEvent): void {
    if (event.type === 'skillWindup') {
      this.noteTargetIndicator(event.actorId, event.targetId);
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
      this.noteTargetIndicator(event.actorId, event.targetId);
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
    this.battleElapsedMs += deltaMs;
    const targetIndicatorsChanged = this.targetIndicatorTracker.prune(
      this.battleElapsedMs,
    );
    if (targetIndicatorsChanged) {
      this.applyTargetIndicators();
    }

    const snapshot = this.engine.getSnapshot();
    const save = this.getSave();
    const stage = getStageById(
      this.gameData.stages,
      save.stageProgress.currentStageId
    );
    const stageId = stage?.id ?? save.stageProgress.currentStageId;
    const waveNum = snapshot.waveIndex + 1;
    const waveTotal = snapshot.waveCount;
    const stagePlateLabel = t("battle.stagePlate", { stage: stageId });
    const wavePlateLabel = t("battle.wavePlate", {
      current: waveNum,
      total: waveTotal,
    });
    if (stagePlateLabel !== this.lastStagePlateLabel) {
      this.lastStagePlateLabel = stagePlateLabel;
      this.stagePlateStageEl.textContent = stagePlateLabel;
    }
    if (wavePlateLabel !== this.lastWavePlateLabel) {
      this.lastWavePlateLabel = wavePlateLabel;
      this.stagePlateWaveEl.textContent = wavePlateLabel;
    }

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
    this.enemyHud.update(buildEnemyHudGroups(snapshot.enemies), {
      waveIndex: snapshot.waveIndex,
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

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
    this.root.setAttribute('aria-hidden', visible ? 'false' : 'true');
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
    this.debugMenuDock.hidden = !enabled;
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
    this.memberStatsPanel.destroy();
    this.canvas.destroy();
    this.battleXDebugCanvas.destroy();
    this.partyHud.destroy();
    this.enemyHud.destroy();
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
