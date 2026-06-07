import "../styles/meta-menu-overlay.css";
import type {
  CharacterBuild,
  ClassId,
  GameData,
  PartySlotState,
} from "../battle/types.ts";
import type { LevelCurvesConfig } from "../progression/levelGrowth.ts";
import { SkillMenuPanel } from "./SkillMenuPanel.ts";

export type MetaMenuPresentation = "modal" | "window";
export type MetaMenuInitialView = "hub" | "party";

export interface MetaMenuOverlayOptions {
  presentation?: MetaMenuPresentation;
  initialView?: MetaMenuInitialView;
}

export interface MetaMenuOverlayCallbacks {
  onBuildChanged: (partyIndex: number, build: CharacterBuild) => void;
  onPartySlotChanged: (slotIndex: number, member: PartySlotState) => void;
  onClose: () => void;
}

export class MetaMenuOverlay {
  private readonly root: HTMLElement;
  private readonly windowEl: HTMLElement;
  private readonly titleEl: HTMLElement;
  private readonly bodyEl: HTMLElement;
  private skillPanel: SkillMenuPanel | null = null;
  private readonly directPartyEntry: boolean;

  constructor(
    private readonly host: HTMLElement,
    private readonly gameData: GameData,
    private readonly levelCurves: LevelCurvesConfig,
    private readonly getParty: () => PartySlotState[],
    private readonly getUnlockedClassIds: () => ClassId[],
    private readonly callbacks: MetaMenuOverlayCallbacks,
    options: MetaMenuOverlayOptions = {}
  ) {
    const presentation = options.presentation ?? "modal";
    const initialView = options.initialView ?? "hub";
    this.directPartyEntry = initialView === "party";

    this.root = document.createElement("div");
    this.root.className =
      presentation === "window"
        ? "meta-menu-overlay meta-menu-overlay--window"
        : "meta-menu-overlay";

    if (presentation === "modal") {
      const backdrop = document.createElement("button");
      backdrop.type = "button";
      backdrop.className = "meta-menu-backdrop";
      backdrop.setAttribute("aria-label", "メニューを閉じる");
      backdrop.addEventListener("click", () => this.callbacks.onClose());
      this.root.appendChild(backdrop);
    }

    this.windowEl = document.createElement("div");
    this.windowEl.className = "meta-menu-window";
    this.windowEl.addEventListener("click", (event) => event.stopPropagation());

    const titleBar = document.createElement("div");
    titleBar.className = "meta-menu-window-bar";

    this.titleEl = document.createElement("h2");
    this.titleEl.className = "meta-menu-title";
    this.titleEl.textContent = "メニュー";

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "meta-menu-close";
    closeButton.setAttribute("aria-label", "閉じる");
    closeButton.textContent = "×";
    closeButton.addEventListener("click", () => this.callbacks.onClose());

    titleBar.append(this.titleEl, closeButton);

    this.bodyEl = document.createElement("div");
    this.bodyEl.className = "meta-menu-window-body";

    this.windowEl.append(titleBar, this.bodyEl);
    this.root.appendChild(this.windowEl);
    this.host.appendChild(this.root);
    if (this.directPartyEntry) {
      this.openParty();
    } else {
      this.renderHub();
    }
  }

  private renderHub(): void {
    this.destroySkillPanel();
    this.titleEl.textContent = "メニュー";
    this.bodyEl.replaceChildren();

    const hub = document.createElement("div");
    hub.className = "meta-menu-hub";

    const partyButton = document.createElement("button");
    partyButton.type = "button";
    partyButton.className = "meta-menu-item";
    partyButton.textContent = "パーティ";
    partyButton.addEventListener("click", () => this.openParty());

    const enhancementButton = document.createElement("button");
    enhancementButton.type = "button";
    enhancementButton.className = "meta-menu-item meta-menu-item--disabled";
    enhancementButton.disabled = true;
    enhancementButton.textContent = "強化ツリー（準備中）";

    hub.append(partyButton, enhancementButton);
    this.bodyEl.appendChild(hub);
  }

  private openParty(): void {
    this.titleEl.textContent = "パーティ設定";
    this.bodyEl.replaceChildren();
    this.skillPanel = new SkillMenuPanel(
      this.bodyEl,
      this.gameData,
      this.levelCurves,
      this.getParty().map((member) =>
        member
          ? {
              classId: member.classId,
              progress: structuredClone(member.progress),
              build: structuredClone(member.build),
            }
          : null
      ),
      this.getUnlockedClassIds(),
      {
        onBuildChanged: (partyIndex, build) => {
          const member = this.getParty()[partyIndex];
          if (member) {
            member.build = structuredClone(build);
          }
          this.callbacks.onBuildChanged(partyIndex, build);
        },
        onPartySlotChanged: (slotIndex, member) => {
          this.getParty()[slotIndex] = member ? structuredClone(member) : null;
          this.callbacks.onPartySlotChanged(slotIndex, member);
        },
      }
    );
  }

  private destroySkillPanel(): void {
    this.skillPanel?.destroy();
    this.skillPanel = null;
  }

  destroy(): void {
    this.destroySkillPanel();
    this.root.remove();
  }
}
