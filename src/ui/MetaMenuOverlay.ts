import "../styles/game-ui-chrome.css";
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
  private readonly brandEl: HTMLElement;
  private readonly titleEl: HTMLElement;
  private readonly subtitleEl: HTMLElement;
  private readonly statusEl: HTMLElement;
  private readonly playerLevelEl: HTMLElement;
  private readonly bodyEl: HTMLElement;
  private readonly footerEl: HTMLElement;
  private readonly footerButton: HTMLButtonElement;
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

    const brandGroup = document.createElement("div");
    brandGroup.className = "meta-menu-board-brand-group";

    this.brandEl = document.createElement("span");
    this.brandEl.className = "meta-menu-board-brand";
    this.brandEl.hidden = true;

    this.titleEl = document.createElement("h2");
    this.titleEl.className = "meta-menu-title meta-menu-board-title";

    this.subtitleEl = document.createElement("span");
    this.subtitleEl.className = "meta-menu-board-subtitle";
    this.subtitleEl.hidden = true;

    brandGroup.append(this.brandEl, this.titleEl, this.subtitleEl);

    this.statusEl = document.createElement("span");
    this.statusEl.className = "meta-menu-board-status";
    this.statusEl.hidden = true;

    this.playerLevelEl = document.createElement("span");
    this.playerLevelEl.className = "meta-menu-player-level";
    this.playerLevelEl.hidden = true;

    titleBar.append(brandGroup, this.statusEl, this.playerLevelEl);

    this.bodyEl = document.createElement("div");
    this.bodyEl.className = "meta-menu-window-body";

    this.footerEl = document.createElement("div");
    this.footerEl.className = "meta-menu-window-footer";

    this.footerButton = document.createElement("button");
    this.footerButton.type = "button";
    this.footerButton.className = "game-ui-button meta-menu-footer-button";
    this.footerButton.addEventListener("click", () => this.handleFooterAction());

    this.footerEl.appendChild(this.footerButton);

    this.windowEl.append(titleBar, this.bodyEl, this.footerEl);
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
      this.updatePartyChrome();
      this.updatePlayerLevelDisplay();
      this.updateFooterButton();
      return;
    }
    this.renderHub();
  }

  private refreshChrome(): void {
    this.backdrop?.setAttribute("aria-label", t("menu.closeBackdrop"));
  }

  private updatePartyHeader(): void {
    if (!this.skillPanel) return;
    this.statusEl.textContent = t("party.headerStatus", {
      filled: this.skillPanel.getFilledSlotCount(),
      total: 4,
      slot: this.skillPanel.getSelectedSlotIndex() + 1,
    });
  }

  private updatePartyChrome(): void {
    this.brandEl.textContent = t("party.boardBrand");
    this.brandEl.hidden = false;
    this.titleEl.textContent = t("party.boardTitle");
    this.subtitleEl.textContent = t("party.boardSubtitle");
    this.subtitleEl.hidden = false;
    this.statusEl.hidden = false;
    this.updatePartyHeader();
  }

  private updateFooterButton(): void {
    if (this.skillPanel) {
      this.footerButton.textContent = this.directPartyEntry
        ? t("menu.close")
        : t("party.back");
      this.footerButton.setAttribute(
        "aria-label",
        this.directPartyEntry ? t("menu.close") : t("party.back")
      );
      return;
    }
    this.footerButton.textContent = t("menu.close");
    this.footerButton.setAttribute("aria-label", t("menu.close"));
  }

  private handleFooterAction(): void {
    if (this.skillPanel) {
      if (this.directPartyEntry) {
        this.callbacks.onClose();
      } else {
        this.renderHub();
      }
      return;
    }
    this.callbacks.onClose();
  }

  private renderHub(): void {
    this.destroySkillPanel();
    this.windowEl.classList.remove("meta-menu-window--party");
    this.refreshChrome();
    this.brandEl.hidden = true;
    this.subtitleEl.hidden = true;
    this.statusEl.hidden = true;
    this.titleEl.textContent = t("menu.title");
    this.playerLevelEl.hidden = true;
    this.updateFooterButton();
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
    this.windowEl.classList.add("meta-menu-window--party");
    this.refreshChrome();
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
        onPartyDraftChange: () => {
          this.updatePartyHeader();
        },
      },
    );
    this.updatePartyChrome();
    this.updatePlayerLevelDisplay();
    this.updateFooterButton();
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
