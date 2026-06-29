import "../styles/meta-menu-overlay.css";
import type {
  CharacterBuild,
  ClassId,
  GameData,
  PartySlotState,
} from "../battle/types.ts";
import {
  getLocale,
  setLocale,
  subscribeLocaleChange,
  type AppLocale,
} from "../i18n/locale.ts";
import { t } from "../i18n/t.ts";
import type { LevelCurvesConfig } from "../progression/levelGrowth.ts";
import { resolvePlayerDisplayLevel } from "../progression/resolvePlayerDisplayLevel.ts";
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
  private readonly playerLevelEl: HTMLElement;
  private readonly bodyEl: HTMLElement;
  private readonly closeButton: HTMLButtonElement;
  private backdrop: HTMLButtonElement | null = null;
  private skillPanel: SkillMenuPanel | null = null;
  private readonly directPartyEntry: boolean;
  private readonly unsubscribeLocale: () => void;

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
      backdrop.addEventListener("click", () => this.callbacks.onClose());
      this.backdrop = backdrop;
      this.root.appendChild(backdrop);
    }

    this.windowEl = document.createElement("div");
    this.windowEl.className = "meta-menu-window";
    this.windowEl.addEventListener("click", (event) => event.stopPropagation());

    const titleBar = document.createElement("div");
    titleBar.className = "meta-menu-window-bar";

    this.titleEl = document.createElement("h2");
    this.titleEl.className = "meta-menu-title";

    this.playerLevelEl = document.createElement("span");
    this.playerLevelEl.className = "meta-menu-player-level";
    this.playerLevelEl.hidden = true;

    this.closeButton = document.createElement("button");
    this.closeButton.type = "button";
    this.closeButton.className = "meta-menu-close";
    this.closeButton.textContent = "×";
    this.closeButton.addEventListener("click", () => this.callbacks.onClose());

    titleBar.append(this.titleEl, this.playerLevelEl, this.closeButton);

    this.bodyEl = document.createElement("div");
    this.bodyEl.className = "meta-menu-window-body";

    this.windowEl.append(titleBar, this.bodyEl);
    this.root.appendChild(this.windowEl);
    this.host.appendChild(this.root);

    this.unsubscribeLocale = subscribeLocaleChange(() => this.refreshLocale());

    if (this.directPartyEntry) {
      this.openParty();
    } else {
      this.renderHub();
    }
  }

  private refreshLocale(): void {
    this.refreshChrome();
    if (this.skillPanel) {
      this.titleEl.textContent = t("party.title");
      this.updatePlayerLevelDisplay();
      return;
    }
    this.renderHub();
  }

  private refreshChrome(): void {
    this.closeButton.setAttribute("aria-label", t("menu.close"));
    this.backdrop?.setAttribute("aria-label", t("menu.closeBackdrop"));
  }

  private renderHub(): void {
    this.destroySkillPanel();
    this.refreshChrome();
    this.titleEl.textContent = t("menu.title");
    this.playerLevelEl.hidden = true;
    this.bodyEl.replaceChildren();

    const hub = document.createElement("div");
    hub.className = "meta-menu-hub";

    const partyButton = document.createElement("button");
    partyButton.type = "button";
    partyButton.className = "meta-menu-item";
    partyButton.textContent = t("menu.party");
    partyButton.addEventListener("click", () => this.openParty());

    const localeSection = document.createElement("div");
    localeSection.className = "meta-menu-locale";

    const localeLabel = document.createElement("span");
    localeLabel.className = "meta-menu-locale-label";
    localeLabel.textContent = t("menu.language");

    const localeButtons = document.createElement("div");
    localeButtons.className = "meta-menu-locale-buttons";

    for (const locale of ["ja", "en"] as const satisfies readonly AppLocale[]) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "meta-menu-locale-button";
      button.textContent =
        locale === "ja" ? t("menu.languageJa") : t("menu.languageEn");
      button.setAttribute("aria-pressed", getLocale() === locale ? "true" : "false");
      if (getLocale() === locale) {
        button.classList.add("meta-menu-locale-button--active");
      }
      button.addEventListener("click", () => {
        if (getLocale() === locale) return;
        setLocale(locale);
      });
      localeButtons.appendChild(button);
    }

    localeSection.append(localeLabel, localeButtons);
    hub.append(partyButton, localeSection);
    this.bodyEl.appendChild(hub);
  }

  private updatePlayerLevelDisplay(): void {
    const level = resolvePlayerDisplayLevel(this.getParty());
    this.playerLevelEl.textContent = t("common.playerLevel", { level });
    this.playerLevelEl.hidden = false;
  }

  private openParty(): void {
    this.titleEl.textContent = t("party.title");
    this.refreshChrome();
    this.updatePlayerLevelDisplay();
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
          this.updatePlayerLevelDisplay();
          this.callbacks.onPartySlotChanged(slotIndex, member);
        },
      },
    );
  }

  private destroySkillPanel(): void {
    this.skillPanel?.destroy();
    this.skillPanel = null;
  }

  destroy(): void {
    this.unsubscribeLocale();
    this.destroySkillPanel();
    this.root.remove();
  }
}
