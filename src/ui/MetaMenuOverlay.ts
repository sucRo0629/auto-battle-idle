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
import type { FormationReturnOptions } from "../platform/menuHost.ts";
import { SkillMenuPanel } from "./SkillMenuPanel.ts";

export type MetaMenuPresentation = "modal" | "window" | "formation-screen";
export type MetaMenuInitialView = "hub" | "party";

export interface MetaMenuOverlayOptions {
  presentation?: MetaMenuPresentation;
  initialView?: MetaMenuInitialView;
  isVerifyMode?: () => boolean;
  getFormationReturnOptions?: () => FormationReturnOptions | undefined;
  /** R12m: Formation Class Select 候補の許可兵科（省略時は全 runtime 兵科） */
  getFormationAllowedClassIds?: () => readonly ClassId[] | undefined;
}

export interface MetaMenuOverlayCallbacks {
  onBuildChanged: (partyIndex: number, build: CharacterBuild) => void;
  onPartySlotChanged: (slotIndex: number, member: PartySlotState) => void;
  /** R9.5c: party slot ごとの combat module 選択 */
  getPartySlotCombatModule?: (slotIndex: number) => string | undefined;
  onPartySlotCombatModuleChanged?: (slotIndex: number, moduleId: string) => void;
  onClose: () => void;
}

export class MetaMenuOverlay {
  private readonly root: HTMLElement;
  private readonly windowEl: HTMLElement;
  private readonly titleBarEl: HTMLElement;
  private readonly titleEl: HTMLElement;
  private readonly bodyEl: HTMLElement;
  private readonly footerEl: HTMLElement;
  private readonly footerButton: HTMLButtonElement;
  private backdrop: HTMLButtonElement | null = null;
  private skillPanel: SkillMenuPanel | null = null;
  private readonly presentation: MetaMenuPresentation;
  private readonly directPartyEntry: boolean;
  private readonly isVerifyMode: () => boolean;
  private readonly getFormationReturnOptions?: () => FormationReturnOptions | undefined;
  private readonly getFormationAllowedClassIds?: () => readonly ClassId[] | undefined;
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
    this.presentation = presentation;
    this.directPartyEntry = initialView === "party";
    this.isVerifyMode = options.isVerifyMode ?? (() => false);
    this.getFormationReturnOptions = options.getFormationReturnOptions;
    this.getFormationAllowedClassIds = options.getFormationAllowedClassIds;

    this.root = document.createElement("div");
    const overlayClasses = ["meta-menu-overlay"];
    if (presentation === "window") {
      overlayClasses.push("meta-menu-overlay--window");
    } else if (presentation === "formation-screen") {
      overlayClasses.push("meta-menu-overlay--formation-screen");
    }
    this.root.className = overlayClasses.join(" ");

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
    if (presentation === "formation-screen") {
      this.windowEl.classList.add("meta-menu-window--party");
    }
    this.windowEl.addEventListener("click", (event) => event.stopPropagation());

    const titleBar = document.createElement("div");
    titleBar.className = "meta-menu-window-bar";
    this.titleBarEl = titleBar;

    this.titleEl = document.createElement("h2");
    this.titleEl.className = "meta-menu-title meta-menu-board-title";

    titleBar.appendChild(this.titleEl);

    this.bodyEl = document.createElement("div");
    this.bodyEl.className = "meta-menu-window-body";

    this.footerEl = document.createElement("div");
    this.footerEl.className = "meta-menu-window-footer";

    this.footerButton = document.createElement("button");
    this.footerButton.type = "button";
    this.footerButton.className = "game-ui-button meta-menu-footer-button";
    this.footerButton.addEventListener("click", () => this.handleFooterAction());

    this.footerEl.appendChild(this.footerButton);

    const windowChildren: HTMLElement[] = [titleBar, this.bodyEl];
    if (presentation !== "formation-screen") {
      windowChildren.push(this.footerEl);
    }
    this.windowEl.append(...windowChildren);
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
      this.updateFooterButton();
      return;
    }
    this.renderHub();
  }

  private refreshChrome(): void {
    this.backdrop?.setAttribute("aria-label", t("menu.closeBackdrop"));
  }

  private updateFooterButton(): void {
    if (this.skillPanel) {
      if (this.presentation === "formation-screen") {
        return;
      }
      const exitLabel = this.directPartyEntry
        ? t("menu.close")
        : t("party.back");
      this.footerButton.textContent = exitLabel;
      this.footerButton.setAttribute("aria-label", exitLabel);
      this.footerButton.disabled = false;
      return;
    }
    this.footerButton.textContent = t("menu.close");
    this.footerButton.setAttribute("aria-label", t("menu.close"));
    this.footerButton.disabled = false;
  }

  private handleFooterAction(): void {
    if (this.footerButton.disabled) return;
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
    this.titleBarEl.hidden = false;
    this.refreshChrome();
    this.titleEl.textContent = t("menu.title");
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

  private openParty(): void {
    this.windowEl.classList.add("meta-menu-window--party");
    this.titleBarEl.hidden = true;
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
          this.callbacks.onPartySlotChanged(slotIndex, member);
        },
        onPartyDraftChange: () => this.updateFooterButton(),
        getSelectedCombatModuleId: (slotIndex) =>
          this.callbacks.getPartySlotCombatModule?.(slotIndex),
        onCombatModuleChanged: (slotIndex, moduleId) => {
          this.callbacks.onPartySlotCombatModuleChanged?.(slotIndex, moduleId);
        },
      },
      {
        isVerifyMode: this.isVerifyMode,
        allowedClassIds: this.getFormationAllowedClassIds?.(),
        returnToBattle:
          this.presentation === "formation-screen" && this.directPartyEntry
            ? {
                onClick: () => {
                  if (!this.skillPanel?.canReturnToBattle()) return;
                  this.callbacks.onClose();
                },
                getLabel: () =>
                  this.getFormationReturnOptions?.()?.label ??
                  t("party.backToBattle"),
                canReturn: () => this.getFormationReturnOptions?.()?.canReturn(),
              }
            : undefined,
      },
    );
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
