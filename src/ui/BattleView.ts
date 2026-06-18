import "../styles/battle-view.css";
import type { BattleEngine } from "../battle/BattleEngine.ts";
import type { BattleEvent } from "../battle/events.ts";
import type { GameData, SaveGameState } from "../battle/types.ts";
import {
  expRequiredForLevel,
  type LevelCurvesConfig,
} from "../progression/levelGrowth.ts";
import {
  getNextStageId,
  getStageById,
} from "../progression/stageProgression.ts";
import type { StageDamageDisplayRow } from "../battle/stageDamageStats.ts";
import { BattleCanvas } from "../render/BattleCanvas.ts";
import {
  buildSkillPresentationContext,
  playSkillBody,
  playSkillHitFeedback,
  resolveSkillPresentation,
} from "../render/skillPresentation.ts";
import { PartyHudPanel } from "./PartyHudPanel.ts";
import {
  buildPartyHudEntries,
  buildPartyHudMetaBySlot,
} from "./partyHudTypes.ts";
import { BattleStatsOverlay } from "./BattleStatsOverlay.ts";
import { BattleXDebugCanvas } from "./BattleXDebugCanvas.ts";
import { DebugMenuPanel } from "./DebugMenuPanel.ts";
import type { PartyMemberProgress } from "./PartyMemberStatsDisplay.ts";

export interface VerifyModeControls {
  isVerifyMode: () => boolean;
  onVerifyModeChange: (enabled: boolean) => void;
  onOpenMetaMenu: () => void;
  onMemberLevelChange?: (partyIndex: number, level: number) => void;
  getLoopStageId?: () => string | null;
  getLoopWaveIndex?: () => number | null;
  onLoopStageChange?: (stageId: string | null) => void;
  onLoopWaveChange?: (waveIndex: number | null) => void;
  getStageDamageDisplayRows?: () => StageDamageDisplayRow[];
  getCurrentStageId?: () => string;
  onStatsOverlayOpenChange?: (open: boolean) => void;
}

export class BattleView {
  private readonly root: HTMLElement;
  private readonly canvasHost: HTMLElement;
  private readonly stageLabelEl: HTMLElement;
  private readonly verifyModeInput: HTMLInputElement;
  private readonly menuButton: HTMLButtonElement;
  private readonly statsButton: HTMLButtonElement;
  private readonly enhancementTreeButton: HTMLButtonElement;
  private readonly canvas: BattleCanvas;
  private readonly partyHud: PartyHudPanel;
  private readonly debugMenu: DebugMenuPanel;
  private readonly battleXDebugCanvas: BattleXDebugCanvas;
  private statsOverlay: BattleStatsOverlay | null = null;
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

    const title = document.createElement("span");
    title.className = "battle-header-title";
    title.textContent = "Auto Battle Idle";
    header.appendChild(title);

    const verifyLabel = document.createElement("label");
    verifyLabel.className = "verify-mode-toggle";

    this.verifyModeInput = document.createElement("input");
    this.verifyModeInput.type = "checkbox";
    this.verifyModeInput.checked = verifyModeControls?.isVerifyMode() ?? true;
    this.verifyModeInput.addEventListener("change", () => {
      verifyModeControls?.onVerifyModeChange(this.verifyModeInput.checked);
    });

    const verifyText = document.createElement("span");
    verifyText.textContent = "確認モード";

    verifyLabel.append(this.verifyModeInput, verifyText);
    header.appendChild(verifyLabel);
    this.root.appendChild(header);

    this.canvasHost = document.createElement("div");
    this.canvasHost.className = "battle-canvas-host";

    const canvasFrame = document.createElement("div");
    canvasFrame.className = "battle-canvas-frame";

    const canvasWrap = document.createElement("div");
    canvasWrap.className = "battle-canvas-wrap";

    this.stageLabelEl = document.createElement("div");
    this.stageLabelEl.className = "battle-stage-label";
    canvasWrap.appendChild(this.stageLabelEl);

    const menuButtons = document.createElement("div");
    menuButtons.className = "battle-menu-buttons";

    this.enhancementTreeButton = this.createBattleMenuButton(
      "flowchart",
      "強化ツリー（準備中）"
    );
    this.enhancementTreeButton.disabled = true;

    this.menuButton = this.createBattleMenuButton("group", "パーティ");
    this.menuButton.addEventListener("click", () => {
      verifyModeControls?.onOpenMetaMenu();
    });

    this.statsButton = this.createBattleMenuButton("analytics", "統計情報");
    this.statsButton.addEventListener("click", () => {
      this.openStatsOverlay(verifyModeControls);
    });

    menuButtons.append(
      this.enhancementTreeButton,
      this.menuButton,
      this.statsButton
    );
    canvasWrap.appendChild(menuButtons);
    canvasFrame.appendChild(canvasWrap);
    this.canvasHost.appendChild(canvasFrame);

    this.root.appendChild(this.canvasHost);

    this.debugMenu = new DebugMenuPanel(this.gameData, {
      isVerifyMode: () => verifyModeControls?.isVerifyMode() ?? false,
      getSave: this.getSave,
      getAllySnapshots: () => this.engine.getSnapshot().allies,
      getPartyProgress: () => this.getPartyProgress(),
      getStageDamageDisplayRows: () =>
        verifyModeControls?.getStageDamageDisplayRows?.() ?? [],
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
      onMemberLevelChange: (partyIndex, level) => {
        verifyModeControls?.onMemberLevelChange?.(partyIndex, level);
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

    this.partyHud = new PartyHudPanel(this.canvasHost);
    this.partyHud.mount(canvasFrame);

    this.engine.onEvent((event) => this.onBattleEvent(event));
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
        event.slotKind === "basic" ? "通常攻撃" : event.skillName;
      if (event.effect === "counter") {
        this.canvas.showCounterPopup(event.actorId);
      }
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
        this.pushLog(`${slotLabel} → 移動`);
      } else {
        this.pushLog(`${slotLabel} (${event.effect})`);
      }

      const snapshot = this.engine.getSnapshot();
      const actor = [...snapshot.allies, ...snapshot.enemies].find(
        (c) => c.id === event.actorId
      );
      const slotKind = event.slotKind ?? "active";
      const skillDef = this.gameData.skillRegistry.actives[event.skillId];
      if (!skillDef) return;
      const effectDef = skillDef?.effect[event.effectIndex ?? 0];
      if (effectDef) {
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
          popupDedupeKey:
            event.amount !== undefined &&
            (event.effect === "damage" || event.effect === "dot")
              ? [
                  event.vfxSourceId ?? event.actorId,
                  event.targetId,
                  event.skillId,
                  event.effectIndex ?? 0,
                  event.hitIndex ?? -1,
                  event.effect,
                  event.amount,
                ].join(":")
              : undefined,
          skipMainVfx: (event.hitIndex ?? 0) > 0,
        });
      }
    } else if (event.type === "basicAttackCountCharged") {
      this.refreshPartyHud();
    } else if (event.type === "evade") {
      this.canvas.showEvadePopup(event.targetId);
    } else if (event.type === "block") {
      this.canvas.showBlockPopup(event.targetId);
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
    console.log(`[battle] ${message}`);
  }

  private getPartyProgress(): PartyMemberProgress[] {
    const save = this.getSave();
    const rows: PartyMemberProgress[] = [];
    save.party.forEach((member, slotIndex) => {
      if (!member) return;
      rows.push({
        slotIndex,
        level: member.progress.level,
        exp: member.progress.exp,
        expRequired: expRequiredForLevel(
          member.progress.level,
          this.levelCurves,
        ),
      });
    });
    return rows;
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
    this.stageLabelEl.textContent = stageLabel;
    this.canvas.syncFromSnapshot(snapshot);
    this.battleXDebugCanvas.syncFromSnapshot(snapshot);
    this.partyHud.update(
      buildPartyHudEntries(
        snapshot,
        buildPartyHudMetaBySlot(save.party, this.gameData.classRegistry),
      ),
    );
    this.canvas.tick(deltaMs);
    this.battleXDebugCanvas.tick(deltaMs);
    this.debugMenu.updateThreatDisplay();
    this.debugMenu.updateExpDisplay();
    this.debugMenu.updateDamageDisplay();
    this.statsOverlay?.update();
  }

  setMenuButtonDisabled(disabled: boolean): void {
    this.menuButton.disabled = disabled;
  }

  setStatsButtonDisabled(disabled: boolean): void {
    this.statsButton.disabled = disabled;
  }

  private openStatsOverlay(controls?: VerifyModeControls): void {
    if (
      this.statsOverlay ||
      !controls?.getStageDamageDisplayRows ||
      !controls.getCurrentStageId
    ) {
      return;
    }

    controls.onStatsOverlayOpenChange?.(true);
    this.statsOverlay = new BattleStatsOverlay(document.body, this.gameData, {
      getDisplayRows: controls.getStageDamageDisplayRows,
      getAllySnapshots: () => this.engine.getSnapshot().allies,
      getPartyProgress: () => this.getPartyProgress(),
      getCurrentStageId: controls.getCurrentStageId,
      onClose: () => this.closeStatsOverlay(controls),
    });
  }

  private closeStatsOverlay(controls?: VerifyModeControls): void {
    if (!this.statsOverlay) return;
    this.statsOverlay.destroy();
    this.statsOverlay = null;
    controls?.onStatsOverlayOpenChange?.(false);
  }

  private createBattleMenuButton(
    iconName: string,
    ariaLabel: string
  ): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "battle-menu-button";
    button.setAttribute("aria-label", ariaLabel);
    const icon = document.createElement("span");
    icon.className = "material-symbols-outlined";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = iconName;
    button.appendChild(icon);
    return button;
  }

  destroy(): void {
    this.statsOverlay?.destroy();
    this.statsOverlay = null;
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
}
