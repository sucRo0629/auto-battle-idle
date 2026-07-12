import "../styles/game-ui-chrome.css";
import "../styles/game-term-tooltip.css";
import "../styles/skill-menu-panel.css";
import { getMemberStatLabels } from "../i18n/memberStatLabels.ts";
import { getLocale, subscribeLocaleChange } from "../i18n/locale.ts";
import { t } from "../i18n/t.ts";
import { resolveClassIconKey, resolveClassSpriteKey } from "../render/entityVisuals.ts";
import {
  isMeleeRangePx,
  type ActiveSkillDef,
  type ClassId,
  type ClassPreset,
  type GameData,
  type PassiveSkillDef,
  PARTY_SLOT_COUNT,
  type PartyMemberState,
  type PartySlotState,
  type Role,
} from "../battle/types.ts";
import { getClassIconUrl, getSkillIconUrlForSkill } from "../render/IconRegistry.ts";
import {
  getEntityAnimLayout,
  getEntityAnimSpriteDef,
  getEntityBodyUrl,
  hasEntityBodyAtlas,
} from "../render/entityAtlas.ts";
import { getSpriteUrl } from "../render/SpriteRegistry.ts";
import {
  compareByClassListOrder,
  sortClassIdsByListOrder,
} from "../battle/data/classListOrder.ts";
import { createMemberFromClass, PARTY_DUPLICATE_CLASS_MESSAGE, validatePartyClassAssignment } from "../progression/partyCompose.ts";
import { type LevelCurvesConfig } from "../progression/levelGrowth.ts";
import { resolveMemberDisplayStats } from "../progression/memberStatsDisplay.ts";
import { resolveMemberBasicAttackDisplay } from "../progression/memberBasicAttackDisplay.ts";
import { resolvePlayerDisplayLevel } from "../progression/resolvePlayerDisplayLevel.ts";
import {
  cloneBuild,
  getUnlockedSkillSlotCount,
  MAX_ACTIVE_SLOTS,
  normalizeActiveSlots,
} from "../progression/skillBuild.ts";
import { resolveLearnedSkills } from "../progression/skillUnlocks.ts";
import { formatSkillCardLines } from "./formatSkillText.ts";
import { annotateGameTerms } from "./annotateGameTerms.ts";
import { formatClassFeatureTags, formatClassSummary, formatClassSummaryForAria } from "./formatClassSummary.ts";
import { GameTermPanel } from "./GameTermPanel.ts";
import { GameTermTooltip } from "./GameTermTooltip.ts";
import type { GameTermId, GameTermLocale } from "./gameTermGlossary.ts";
import {
  resolveSkillCardDisplay,
} from "./skillCardDisplay.ts";
import {
  SKILL_CARD_META_LINE_TERM_IDS,
} from "./skillCardDisplayRules.ts";

const PICKER_ROLES: ClassPreset["role"][] = [
  "defender",
  "attacker",
  "supporter",
];

type AttackerSubRole = "fighter" | "shooter" | "caster";

const ATTACKER_SUB_ROLES: AttackerSubRole[] = [
  "fighter",
  "shooter",
  "caster",
];

export function getClassSelectionVisibleClassIds(gameData: GameData): ClassId[] {
  return sortClassIdsByListOrder(
    Object.keys(gameData.classRegistry),
    gameData.classOrder,
  );
}

function roleLabel(role: Role): string {
  return t(`role.${role}`);
}

function attackerSubRoleLabel(subRole: AttackerSubRole): string {
  return t(`role.${subRole}`);
}

function resolveAttackerSubRole(preset: ClassPreset): AttackerSubRole {
  if (preset.traits.damageType === "magic") return "caster";
  if (isMeleeRangePx(preset.traits.rangePx)) return "fighter";
  return "shooter";
}

export interface SkillMenuPanelCallbacks {
  onBuildChanged: (
    partyIndex: number,
    build: PartyMemberState["build"]
  ) => void;
  onPartySlotChanged: (slotIndex: number, member: PartySlotState) => void;
  onPartyDraftChange?: () => void;
}

export interface SkillMenuPanelReturnToBattleOptions {
  onClick: () => void;
  getLabel?: () => string;
  canReturn?: () => boolean;
}

export interface SkillMenuPanelOptions {
  /** @deprecated Picker is inline; host is unused. */
  pickerHost?: HTMLElement;
  /** 確認モードでは4人未満でも戦闘へ戻れる。解除 UI は Class Select 再クリックのみ。 */
  isVerifyMode?: () => boolean;
  /** Formation Screen: 左ペイン最下部フッターの補助導線 */
  returnToBattle?: SkillMenuPanelReturnToBattleOptions;
}

export class SkillMenuPanel {
  private readonly root: HTMLElement;
  private readonly boardEl: HTMLElement;
  private readonly formationZoneHeaderEl: HTMLElement;
  private readonly formationZoneHeaderTitleEl: HTMLElement;
  private readonly leftRailFooterEl: HTMLElement | null;
  private readonly returnToBattleButton: HTMLButtonElement | null;
  private readonly returnToBattleOptions: SkillMenuPanelReturnToBattleOptions | undefined;
  private readonly formationBlockEl: HTMLElement;
  private readonly rosterSlotsEl: HTMLElement;
  private readonly classArchiveHeaderEl: HTMLElement;
  private readonly classArchiveListEl: HTMLElement;
  private readonly detailZoneHeaderEl: HTMLElement;
  private readonly detailWrapEl: HTMLElement;
  private readonly detailOverviewEl: HTMLElement;
  private readonly detailScrollEl: HTMLElement;
  private readonly bodyEl: HTMLElement;
  private readonly gameTermPanel: GameTermPanel;
  private readonly gameTermTooltip: GameTermTooltip;
  private readonly formationNoteEl: HTMLElement;
  private readonly unsubscribeLocale: () => void;
  private readonly draftParty: PartySlotState[];
  private readonly isVerifyMode: () => boolean;
  private selectedClassIds: ClassId[];
  private focusedClassId: ClassId | null = null;
  private rosterAnimationFromSlots: (ClassId | null)[] | null = null;
  private selectionFeedback = "";

  constructor(
    private readonly container: HTMLElement,
    private readonly gameData: GameData,
    private readonly levelCurves: LevelCurvesConfig,
    sourceParty: PartySlotState[],
    _unlockedClassIds: ClassId[],
    private readonly callbacks: SkillMenuPanelCallbacks,
    options: SkillMenuPanelOptions = {}
  ) {
    this.isVerifyMode = options.isVerifyMode ?? (() => false);
    this.draftParty = Array.from({ length: PARTY_SLOT_COUNT }, (_, index) => {
      const member = sourceParty[index];
      return member
        ? {
            classId: member.classId,
            progress: structuredClone(member.progress),
            build: normalizeActiveSlots(cloneBuild(member.build)),
          }
        : null;
    });
    this.selectedClassIds = this.draftParty
      .flatMap((member) => (member ? [member.classId] : []))
      .slice(0, 4);
    this.focusedClassId =
      this.selectedClassIds[0] ?? this.getPickerVisibleClassIds()[0] ?? null;

    this.root = document.createElement("div");
    this.root.className = "meta-menu-screen skill-menu-panel";

    this.boardEl = document.createElement("div");
    this.boardEl.className = "skill-menu-tactical-board";

    const formationZoneEl = document.createElement("section");
    formationZoneEl.className =
      "skill-menu-zone skill-menu-zone--formation";

    this.formationZoneHeaderEl = document.createElement("div");
    this.formationZoneHeaderEl.className = "skill-menu-zone-header";
    this.formationZoneHeaderTitleEl = document.createElement("span");
    this.formationZoneHeaderTitleEl.className = "skill-menu-zone-header-title";
    this.formationZoneHeaderEl.append(this.formationZoneHeaderTitleEl);

    let leftRailFooterEl: HTMLElement | null = null;
    let returnToBattleButton: HTMLButtonElement | null = null;
    if (options.returnToBattle) {
      leftRailFooterEl = document.createElement("div");
      leftRailFooterEl.className = "skill-menu-left-rail-footer";
      leftRailFooterEl.dataset.section = "left-rail-footer";

      returnToBattleButton = document.createElement("button");
      returnToBattleButton.type = "button";
      returnToBattleButton.className = "skill-menu-return-to-battle-button";
      returnToBattleButton.addEventListener("click", () => {
        if (returnToBattleButton?.disabled) return;
        options.returnToBattle?.onClick();
      });
      leftRailFooterEl.appendChild(returnToBattleButton);
    }
    this.leftRailFooterEl = leftRailFooterEl;
    this.returnToBattleButton = returnToBattleButton;
    this.returnToBattleOptions = options.returnToBattle;

    this.formationBlockEl = document.createElement("div");
    this.formationBlockEl.className = "skill-menu-formation-block";
    this.formationBlockEl.dataset.section = "roster";

    const noteEl = document.createElement("p");
    noteEl.className = "skill-menu-formation-note";
    this.formationNoteEl = noteEl;

    this.rosterSlotsEl = document.createElement("div");
    this.rosterSlotsEl.className = "skill-menu-roster-slots";
    this.rosterSlotsEl.dataset.section = "roster-slots";
    this.rosterSlotsEl.addEventListener("click", (event) => {
      const card = (event.target as Element | null)?.closest(".skill-menu-roster-card");
      if (!(card instanceof HTMLButtonElement)) return;
      const classId = card.dataset.summaryClassId;
      if (!classId) return;
      this.focusClass(classId);
    });

    const classArchiveEl = document.createElement("section");
    classArchiveEl.className =
      "skill-menu-zone skill-menu-zone--class-archive";

    this.classArchiveHeaderEl = document.createElement("div");
    this.classArchiveHeaderEl.className = "skill-menu-zone-header";

    this.classArchiveListEl = document.createElement("div");
    this.classArchiveListEl.className =
      "skill-menu-class-archive-list";
    this.classArchiveListEl.addEventListener("click", (event) => {
      const listItem = (event.target as Element | null)?.closest(
        ".skill-menu-picker-list-item"
      );
      if (!(listItem instanceof HTMLButtonElement)) return;
      const classId = listItem.dataset.pickerClassId;
      if (!classId) return;
      this.toggleClassSelection(classId);
    });
    this.classArchiveListEl.addEventListener("mouseover", (event) => {
      const listItem = (event.target as Element | null)?.closest(
        ".skill-menu-picker-list-item"
      );
      if (!(listItem instanceof HTMLButtonElement)) return;
      const classId = listItem.dataset.pickerClassId;
      if (!classId) return;
      this.focusClass(classId);
    });
    this.classArchiveListEl.addEventListener("focusin", (event) => {
      const listItem = (event.target as Element | null)?.closest(
        ".skill-menu-picker-list-item"
      );
      if (!(listItem instanceof HTMLButtonElement)) return;
      const classId = listItem.dataset.pickerClassId;
      if (!classId) return;
      this.focusClass(classId);
    });

    classArchiveEl.append(this.classArchiveHeaderEl, this.classArchiveListEl);

    this.formationBlockEl.append(noteEl, this.rosterSlotsEl);
    formationZoneEl.append(this.formationZoneHeaderEl, this.formationBlockEl);

    const detailZoneEl = document.createElement("section");
    detailZoneEl.className = "skill-menu-zone skill-menu-zone--detail";

    this.detailZoneHeaderEl = document.createElement("div");
    this.detailZoneHeaderEl.className = "skill-menu-zone-header";

    this.detailOverviewEl = document.createElement("div");
    this.detailOverviewEl.className = "skill-menu-detail-overview";
    this.detailOverviewEl.dataset.section = "detail-overview";

    this.detailScrollEl = document.createElement("div");
    this.detailScrollEl.className =
      "skill-menu-detail-scroll game-ui-scroll-pane";
    this.detailScrollEl.dataset.section = "detail-scroll";
    this.detailScrollEl.addEventListener("scroll", () => {
      this.gameTermTooltip.reposition();
      this.gameTermTooltip.hide();
      this.updateDetailScrollFade();
    });

    this.bodyEl = document.createElement("div");
    this.bodyEl.className = "skill-menu-body";
    this.bodyEl.dataset.section = "detail";
    this.detailScrollEl.appendChild(this.bodyEl);

    this.detailWrapEl = document.createElement("div");
    this.detailWrapEl.className = "skill-menu-detail-wrap";
    this.detailWrapEl.append(this.detailOverviewEl, this.detailScrollEl);

    const leftRailEl = document.createElement("div");
    leftRailEl.className = "skill-menu-left-rail";

    detailZoneEl.append(this.detailZoneHeaderEl, this.detailWrapEl);
    leftRailEl.append(classArchiveEl, formationZoneEl);
    if (this.leftRailFooterEl) {
      leftRailEl.appendChild(this.leftRailFooterEl);
    }
    this.boardEl.append(leftRailEl, detailZoneEl);

    this.gameTermPanel = new GameTermPanel(this.root, {
      locale: getLocale() as GameTermLocale,
      detailScrollRoot: this.detailScrollEl,
    });
    this.gameTermPanel.mount();
    this.gameTermTooltip = new GameTermTooltip(this.root);

    this.root.appendChild(this.boardEl);
    this.container.appendChild(this.root);
    this.unsubscribeLocale = subscribeLocaleChange(() => this.render());
    this.render();
  }

  private getPlayerLevel(): number {
    return resolvePlayerDisplayLevel(this.draftParty);
  }

  getSelectedSlotIndex(): number {
    const focusedIndex = this.draftParty.findIndex(
      (member) => member?.classId === this.focusedClassId
    );
    return focusedIndex >= 0 ? focusedIndex : 0;
  }

  canReturnToBattle(): boolean {
    const override = this.returnToBattleOptions?.canReturn?.();
    if (override !== undefined) {
      return override;
    }
    return this.isVerifyMode() || this.selectedClassIds.length === 4;
  }

  private updateReturnToBattleButton(): void {
    if (!this.returnToBattleButton) return;
    const label =
      this.returnToBattleOptions?.getLabel?.() ?? t("party.backToBattle");
    this.returnToBattleButton.textContent = label;
    this.returnToBattleButton.setAttribute("aria-label", label);
    this.returnToBattleButton.disabled = !this.canReturnToBattle();
  }

  private getPickerVisibleClassIds(): ClassId[] {
    return getClassSelectionVisibleClassIds(this.gameData);
  }

  private focusClass(classId: ClassId): void {
    if (this.focusedClassId === classId) return;
    this.focusedClassId = classId;
    this.renderRoster();
    this.renderDetailOverview();
    this.renderBody();
    this.refreshClassArchiveFocusStyles();
  }

  private toggleClassSelection(classId: ClassId): void {
    this.focusedClassId = classId;
    const selectedIndex = this.selectedClassIds.indexOf(classId);
    if (selectedIndex >= 0) {
      this.rosterAnimationFromSlots = this.getSummarySlots();
      this.selectedClassIds.splice(selectedIndex, 1);
      this.selectionFeedback = "";
      this.syncDraftPartyToSelection();
      this.render();
      return;
    }

    if (this.selectedClassIds.length >= 4) {
      this.selectionFeedback = t("party.partyFull");
      this.render();
      return;
    }

    this.rosterAnimationFromSlots = this.getSummarySlots();
    this.selectedClassIds.push(classId);
    this.selectionFeedback = "";
    this.syncDraftPartyToSelection();
    this.render();
  }

  private syncDraftPartyToSelection(): void {
    const existingByClassId = new Map<ClassId, PartyMemberState>();
    for (const member of this.draftParty) {
      if (member) existingByClassId.set(member.classId, structuredClone(member));
    }

    const sortedClassIds = this.getSummaryClassIds();
    const nextParty: PartySlotState[] = Array.from(
      { length: this.draftParty.length },
      () => null
    );
    const startIndex = Math.max(0, nextParty.length - sortedClassIds.length);

    sortedClassIds.forEach((classId, index) => {
      nextParty[startIndex + index] =
        existingByClassId.get(classId) ??
        createMemberFromClass(classId, this.gameData);
    });

    nextParty.forEach((member, index) => {
      const current = this.draftParty[index];
      if (member) {
        const validation = validatePartyClassAssignment(
          this.draftParty,
          index,
          member.classId,
        );
        if (!validation.ok) {
          this.selectionFeedback = PARTY_DUPLICATE_CLASS_MESSAGE;
          return;
        }
      }
      if (current?.classId === member?.classId) {
        this.draftParty[index] = member;
        return;
      }
      this.draftParty[index] = member;
      this.callbacks.onPartySlotChanged(
        index,
        member ? structuredClone(member) : null
      );
    });
  }

  private getSummaryClassIds(): ClassId[] {
    return [...this.selectedClassIds].sort((aId, bId) => {
      const a = this.gameData.classRegistry[aId];
      const b = this.gameData.classRegistry[bId];
      const rangeDelta = (b?.traits.rangePx ?? 0) - (a?.traits.rangePx ?? 0);
      if (rangeDelta !== 0) return rangeDelta;
      return compareByClassListOrder(aId, bId, this.gameData.classOrder);
    });
  }

  private getSummarySlots(): (ClassId | null)[] {
    const sortedClassIds = this.getSummaryClassIds();
    const emptyCount = Math.max(0, 4 - sortedClassIds.length);
    return [
      ...Array.from({ length: emptyCount }, () => null),
      ...sortedClassIds,
    ];
  }

  private render(): void {
    this.formationZoneHeaderTitleEl.textContent = t("party.zonePartySummary");
    this.updateReturnToBattleButton();
    this.classArchiveHeaderEl.textContent = t("party.zoneClassSelect");
    this.detailZoneHeaderEl.textContent = "";
    this.detailZoneHeaderEl.setAttribute("aria-hidden", "true");
    this.formationNoteEl.textContent = this.selectionFeedback;
    this.renderRoster();
    this.renderClassArchive();
    this.renderDetailOverview();
    this.renderBody();
    this.callbacks.onPartyDraftChange?.();
  }

  private updateDetailScrollFade(): void {
    const el = this.detailScrollEl;
    const maxScroll = el.scrollHeight - el.clientHeight;
    const canScrollDown = maxScroll > 2 && el.scrollTop < maxScroll - 2;
    el.classList.toggle("skill-menu-detail-scroll--can-scroll", maxScroll > 2);
    el.classList.toggle("skill-menu-detail-scroll--at-bottom", !canScrollDown);
  }

  private refreshClassArchiveFocusStyles(): void {
    const rows = Array.from(
      this.classArchiveListEl.querySelectorAll(".skill-menu-picker-list-item")
    );
    for (const row of rows) {
      if (!(row instanceof HTMLButtonElement)) continue;
      row.classList.toggle(
        "skill-menu-picker-list-item--focused",
        row.dataset.pickerClassId === this.focusedClassId
      );
    }
  }

  private renderRoster(): void {
    const animationFromSlots = this.rosterAnimationFromSlots;
    this.rosterAnimationFromSlots = null;

    this.rosterSlotsEl.replaceChildren();
    this.getSummarySlots().forEach((classId) => {
      const preset = classId
        ? this.gameData.classRegistry[classId]
        : undefined;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "skill-menu-roster-card";
      if (!classId) {
        button.classList.add("skill-menu-roster-card--empty");
      }
      if (classId && classId === this.focusedClassId) {
        button.classList.add("skill-menu-roster-card--active");
        button.setAttribute("aria-current", "true");
      } else {
        button.removeAttribute("aria-current");
      }
      if (classId) {
        button.dataset.summaryClassId = classId;
      } else {
        button.disabled = true;
      }

      const ground = document.createElement("span");
      ground.className = "skill-menu-roster-card-ground";
      ground.setAttribute("aria-hidden", "true");

      const motion = document.createElement("div");
      motion.className = "skill-menu-roster-card-motion";

      if (classId && preset) {
        const summary = formatClassSummary(preset, getLocale());
        const ariaParts = [preset.displayName];
        if (preset.epithetEn) ariaParts.push(preset.epithetEn);
        if (summary) ariaParts.push(formatClassSummaryForAria(summary));
        const featureTags = formatClassFeatureTags(preset, getLocale());
        if (featureTags.length > 0) {
          ariaParts.push(featureTags.join(" / "));
        }
        button.setAttribute("aria-label", ariaParts.join(" "));

        const visual = document.createElement("div");
        visual.className = "skill-menu-roster-card-visual";
        visual.append(
          ground,
          this.createRosterCharacterDisplay(preset)
        );

        const iconEl = this.createIconWrap(preset, preset.displayName);
        iconEl.classList.add("skill-menu-roster-card-icon");

        const textWrap = document.createElement("span");
        textWrap.className = "skill-menu-roster-card-text";

        const nameEl = document.createElement("span");
        nameEl.className = "skill-menu-roster-card-name";
        nameEl.dataset.i18nRole = "primary";
        nameEl.textContent = preset.displayName;

        textWrap.appendChild(nameEl);
        if (preset.epithetEn) {
          const epithetEl = document.createElement("span");
          epithetEl.className = "skill-menu-roster-card-epithet";
          epithetEl.dataset.i18nRole = "secondary";
          epithetEl.textContent = preset.epithetEn;
          textWrap.appendChild(epithetEl);
        }

        const footer = document.createElement("div");
        footer.className = "skill-menu-roster-card-footer";
        footer.append(iconEl, textWrap);

        motion.append(visual, footer);
        button.appendChild(motion);
      } else {
        button.setAttribute("aria-label", t("party.emptySlot"));

        const visual = document.createElement("div");
        visual.className =
          "skill-menu-roster-card-visual skill-menu-roster-card-visual--empty";
        visual.appendChild(ground);
        motion.appendChild(visual);
        button.appendChild(motion);
      }

      this.rosterSlotsEl.appendChild(button);
    });
    this.animateRosterReorder(animationFromSlots);
  }

  private animateRosterReorder(fromSlots: (ClassId | null)[] | null): void {
    if (!fromSlots) return;

    const slotCards = Array.from(
      this.rosterSlotsEl.querySelectorAll(".skill-menu-roster-card")
    );
    const slotRects = slotCards.map((card) => card.getBoundingClientRect());

    for (const card of slotCards) {
      if (!(card instanceof HTMLButtonElement)) continue;
      const classId = card.dataset.summaryClassId;
      if (!classId) continue;
      const fromIndex = fromSlots.indexOf(classId);
      if (fromIndex < 0) {
        this.animateRosterCardEnter(card);
        continue;
      }

      const current = card.getBoundingClientRect();
      const previous = slotRects[fromIndex];
      const deltaX = previous.left - current.left;
      if (Math.abs(deltaX) < 1) continue;

      const motion = card.querySelector(".skill-menu-roster-card-motion");
      if (!(motion instanceof HTMLElement)) continue;
      motion.style.setProperty("--summary-slide-x", `${deltaX}px`);
      motion.classList.remove("skill-menu-roster-card-motion--slide");
      void motion.offsetWidth;
      motion.classList.add("skill-menu-roster-card-motion--slide");
      motion.addEventListener(
        "animationend",
        () => {
          motion.classList.remove("skill-menu-roster-card-motion--slide");
          motion.style.removeProperty("--summary-slide-x");
        },
        { once: true }
      );
    }
  }

  private animateRosterCardEnter(card: HTMLButtonElement): void {
    const character = card.querySelector(".skill-menu-roster-card-character");
    if (character instanceof HTMLElement) {
      const clearEnter = () => {
        character.classList.remove("skill-menu-roster-card-character--enter");
      };
      character.classList.remove("skill-menu-roster-card-character--enter");
      void character.offsetWidth;
      character.classList.add("skill-menu-roster-card-character--enter");
      character.addEventListener("animationend", clearEnter, { once: true });
      window.setTimeout(clearEnter, 700);
    }

    const footer = card.querySelector(".skill-menu-roster-card-footer");
    if (footer instanceof HTMLElement) {
      const clearFooterEnter = () => {
        footer.classList.remove("skill-menu-roster-card-footer--enter");
      };
      footer.classList.remove("skill-menu-roster-card-footer--enter");
      void footer.offsetWidth;
      footer.classList.add("skill-menu-roster-card-footer--enter");
      footer.addEventListener("animationend", clearFooterEnter, { once: true });
      window.setTimeout(clearFooterEnter, 500);
    }
  }

  private createRosterCharacterDisplay(preset: ClassPreset): HTMLElement {
    const character = document.createElement("span");
    character.className = "skill-menu-roster-card-character";

    const spriteWrap = document.createElement("span");
    spriteWrap.className = "skill-menu-roster-card-sprite";
    const bodyUrl = hasEntityBodyAtlas(preset.id)
      ? getEntityBodyUrl(preset.id)
      : undefined;

    if (bodyUrl) {
      const layout = getEntityAnimLayout();
      const idle = getEntityAnimSpriteDef("idle");
      const frame = document.createElement("span");
      frame.className =
        "skill-menu-roster-card-sprite-frame skill-menu-roster-card-sprite-frame--body-atlas";
      frame.setAttribute("aria-hidden", "true");
      frame.style.backgroundImage = `url("${bodyUrl}")`;
      spriteWrap.style.setProperty(
        "--body-atlas-cell-width",
        `${layout.cellWidth}px`
      );
      spriteWrap.style.setProperty(
        "--body-atlas-cell-height",
        `${layout.cellHeight}px`
      );
      frame.style.setProperty(
        "--body-atlas-idle-shift",
        `${-layout.cellWidth * idle.frames}px`
      );
      frame.style.setProperty("--body-atlas-idle-steps", String(idle.frames));
      frame.style.setProperty(
        "--body-atlas-idle-duration",
        `${idle.frames / idle.fps}s`
      );
      spriteWrap.appendChild(frame);
    } else {
      const img = document.createElement("img");
      img.className = "skill-menu-roster-card-sprite-img";
      img.alt = "";
      img.decoding = "async";
      img.src = getSpriteUrl(resolveClassSpriteKey(preset));
      img.setAttribute("aria-hidden", "true");
      spriteWrap.appendChild(img);
    }

    character.appendChild(spriteWrap);
    return character;
  }

  private renderDetailOverview(): void {
    this.detailOverviewEl.replaceChildren();
    const focusedClassId =
      this.focusedClassId ??
      this.selectedClassIds[0] ??
      this.getPickerVisibleClassIds()[0];

    if (!focusedClassId) {
      this.detailOverviewEl.appendChild(this.createEmptySlotDetail());
      return;
    }

    const preset = this.gameData.classRegistry[focusedClassId];
    if (!preset) return;

    this.detailOverviewEl.appendChild(this.createClassSummaryBand(preset));
    requestAnimationFrame(() => this.updateDetailScrollFade());
  }

  private renderBody(): void {
    this.bodyEl.replaceChildren();
    const focusedClassId =
      this.focusedClassId ?? this.selectedClassIds[0] ?? this.getPickerVisibleClassIds()[0];

    if (!focusedClassId) {
      this.bodyEl.appendChild(this.createEmptySlotDetail());
      return;
    }

    const preset = this.gameData.classRegistry[focusedClassId];
    if (!preset) return;

    const layout = document.createElement("div");
    layout.className = "skill-menu-tactical-layout";

    const playerLevel = this.getPlayerLevel();
    const learned = resolveLearnedSkills(
      preset,
      playerLevel,
      this.gameData.skillRegistry
    );
    const unlockedSlots = getUnlockedSkillSlotCount(playerLevel);

    const skillsWrap = document.createElement("div");
    skillsWrap.className = "skill-menu-tactical-skills";
    skillsWrap.append(
      this.createSkillKindSection("passive", preset, learned, unlockedSlots),
      this.createSkillKindSection("active", preset, learned, unlockedSlots)
    );
    layout.appendChild(skillsWrap);

    this.bodyEl.appendChild(layout);
    requestAnimationFrame(() => this.updateDetailScrollFade());
  }

  private shouldHideFutureSkillSlots(): boolean {
    return this.getPlayerLevel() < 10;
  }

  private createEmptySlotDetail(): HTMLElement {
    const section = document.createElement("section");
    section.className = "skill-menu-section skill-menu-empty-slot";

    const message = document.createElement("p");
    message.className = "skill-menu-empty-slot-message";
    message.textContent = t("party.pickerDetailEmpty");

    section.appendChild(message);
    return section;
  }

  private createClassSummaryBand(preset: ClassPreset): HTMLElement {
    const section = document.createElement("section");
    section.className = "skill-menu-class-summary-band";

    const heading = document.createElement("h3");
    heading.className = "skill-menu-section-title skill-menu-class-summary-band-title";
    heading.textContent = t("party.classSummary");

    const identityEl = document.createElement("div");
    identityEl.className = "skill-menu-class-summary-identity";

    const namePart = document.createElement("span");
    namePart.className = "skill-menu-class-summary-name";
    namePart.dataset.i18nRole = "primary";
    namePart.textContent = preset.displayName;

    const rolePart = document.createElement("span");
    rolePart.className = "skill-menu-class-summary-role";
    if (preset.role === "attacker") {
      rolePart.textContent = `${roleLabel(preset.role)} · ${attackerSubRoleLabel(resolveAttackerSubRole(preset))}`;
    } else {
      rolePart.textContent = roleLabel(preset.role);
    }

    identityEl.appendChild(namePart);
    if (preset.epithetEn) {
      const epithetPart = document.createElement("span");
      epithetPart.className = "skill-menu-class-summary-epithet";
      epithetPart.dataset.i18nRole = "secondary";
      epithetPart.textContent = preset.epithetEn;
      identityEl.append(document.createTextNode(" "), epithetPart);
    }
    identityEl.append(document.createTextNode(" / "));
    identityEl.appendChild(rolePart);

    const selectionState = document.createElement("span");
    selectionState.className = "skill-menu-class-summary-selection";
    selectionState.textContent = this.selectedClassIds.includes(preset.id)
      ? t("party.selectedState")
      : t("party.notSelectedState");
    identityEl.append(document.createTextNode(" "));
    identityEl.appendChild(selectionState);

    section.appendChild(heading);

    const body = document.createElement("div");
    body.className = "skill-menu-class-summary-body";

    const textCol = document.createElement("div");
    textCol.className = "skill-menu-class-summary-text-col";
    textCol.appendChild(identityEl);

    const summary = formatClassSummary(preset, getLocale());
    if (summary) {
      const summaryEl = document.createElement("p");
      summaryEl.className = "skill-menu-class-summary-text";
      summaryEl.textContent = summary;
      textCol.appendChild(summaryEl);
    }

    const featureTags = formatClassFeatureTags(preset, getLocale());
    if (featureTags.length > 0) {
      const featuresEl = document.createElement("div");
      featuresEl.className = "skill-menu-class-features";

      const labelEl = document.createElement("span");
      labelEl.className = "skill-menu-class-features-label";
      labelEl.textContent = t("party.classFeatures");

      const tagsEl = document.createElement("p");
      tagsEl.className = "skill-menu-class-features-tags";
      tagsEl.textContent = featureTags.join(" / ");

      featuresEl.append(labelEl, tagsEl);
      textCol.appendChild(featuresEl);
    }

    const columns = document.createElement("div");
    columns.className = "skill-menu-class-summary-columns";
    columns.append(textCol, this.createStatColumn(preset));
    body.appendChild(columns);
    section.appendChild(body);
    return section;
  }

  private createStatColumn(preset: ClassPreset): HTMLElement {
    const playerLevel = this.getPlayerLevel();
    const stats = resolveMemberDisplayStats(
      preset,
      playerLevel,
      this.levelCurves
    );
    const statLabels = getMemberStatLabels();

    const column = document.createElement("div");
    column.className = "skill-menu-class-summary-stats";

    const rows: { label: string; value: string }[] = [
      { label: statLabels.hp, value: String(stats.maxHp) },
      { label: statLabels.atk, value: String(stats.atk) },
      { label: statLabels.def, value: String(stats.def) },
      { label: statLabels.res, value: `${stats.res}%` },
    ];

    const basicAttackLine = this.formatBasicAttackSummary(preset);
    if (basicAttackLine) {
      rows.push({ label: statLabels.basicAttack, value: basicAttackLine });
    }

    rows.push({ label: statLabels.spd, value: stats.spdLabel });

    const basicAttack = resolveMemberBasicAttackDisplay(
      preset,
      this.gameData.skillRegistry
    );
    if (basicAttack) {
      rows.push({ label: statLabels.range, value: basicAttack.rangeLabel });
    }

    for (const row of rows) {
      const rowEl = document.createElement("div");
      rowEl.className = "skill-menu-stat-row";

      const labelEl = document.createElement("span");
      labelEl.className = "skill-menu-stat-row-label";
      labelEl.textContent = row.label;

      const valueEl = document.createElement("span");
      valueEl.className = "skill-menu-stat-row-value";
      valueEl.textContent = row.value;

      rowEl.append(labelEl, valueEl);
      column.appendChild(rowEl);
    }

    return column;
  }

  private formatBasicAttackSummary(preset: ClassPreset): string | null {
    const skill = this.gameData.skillRegistry.actives[preset.basicAttackSkillId];
    if (!skill) return null;

    const basicAttack = resolveMemberBasicAttackDisplay(
      preset,
      this.gameData.skillRegistry
    );
    const lines = formatSkillCardLines(skill, {
      locale: getLocale(),
      basicAttackRangePx: preset.traits.rangePx,
    });
    const display = resolveSkillCardDisplay(
      lines,
      skill,
      getLocale() as GameTermLocale
    );

    const effectParts = display.headlineLines.filter(Boolean);
    const detailParts = [
      basicAttack?.attributeLabel,
      ...effectParts,
    ].filter((part): part is string => Boolean(part && part.trim()));

    return detailParts.length > 0 ? detailParts.join(" / ") : null;
  }

  private createSkillKindSection(
    kind: "active" | "passive",
    preset: ClassPreset,
    learned: ReturnType<typeof resolveLearnedSkills>,
    unlockedSlots: number
  ): HTMLElement {
    const section = document.createElement("section");
    section.className = `skill-menu-skill-kind-section skill-menu-skill-kind-section--${kind}`;

    const heading = document.createElement("h3");
    heading.className = "skill-menu-section-title";
    heading.textContent =
      kind === "active" ? t("party.activeSkills") : t("party.passiveSkills");

    const body = document.createElement("div");
    body.className = "skill-menu-skill-kind-body";

    const grid = document.createElement("div");
    grid.className = "skill-menu-skill-summary-grid";

    const skillIds =
      kind === "active"
        ? learned.learnedActiveIds
        : learned.learnedPassiveIds;
    const registry =
      kind === "active"
        ? this.gameData.skillRegistry.actives
        : this.gameData.skillRegistry.passives;

    const learnedCount = skillIds.length;
    if (learnedCount > 0) {
      grid.style.setProperty(
        "--skill-learned-cols",
        String(Math.min(2, learnedCount))
      );
      for (const skillId of skillIds) {
        grid.appendChild(
          this.createSkillSummaryCard({
            skillId,
            def: registry[skillId],
            preset,
            kind,
          })
        );
      }
      body.appendChild(grid);
    }

    const lockedList = document.createElement("div");
    lockedList.className = "skill-menu-skill-locked-list";
    if (!this.shouldHideFutureSkillSlots()) {
      for (let slotIndex = unlockedSlots; slotIndex < MAX_ACTIVE_SLOTS; slotIndex++) {
        lockedList.appendChild(
          this.createLockedSkillRow(slotIndex, preset, kind)
        );
      }
    }
    if (lockedList.childElementCount > 0) {
      body.appendChild(lockedList);
    }

    section.append(heading, body);
    return section;
  }

  private createSkillSummaryCard(options: {
    skillId: string;
    def?: ActiveSkillDef | PassiveSkillDef;
    preset: ClassPreset;
    kind: "active" | "passive";
  }): HTMLElement {
    const { skillId, def, preset } = options;
    const label = def?.name ?? skillId;

    const card = document.createElement("article");
    card.className = `skill-menu-skill-summary-card skill-menu-skill-summary-card--${options.kind}`;
    card.setAttribute("role", "group");
    card.setAttribute("aria-label", label);

    const header = document.createElement("div");
    header.className = "skill-menu-skill-summary-card-header";

    const nameEl = document.createElement("span");
    nameEl.className = "skill-menu-skill-summary-card-name";
    nameEl.textContent = label;

    header.append(
      this.createIconWrap(preset, label, skillId, def),
      nameEl
    );
    card.appendChild(header);

    if (def) {
      const lines = formatSkillCardLines(def, {
        locale: getLocale(),
        basicAttackRangePx: options.preset.traits.rangePx,
      });
      const display = resolveSkillCardDisplay(
        lines,
        def,
        getLocale() as GameTermLocale
      );

      const body = document.createElement("div");
      body.className = "skill-menu-skill-summary-card-body";

      if (display.metaLine) {
        const metaEl = document.createElement("div");
        metaEl.className = "skill-menu-skill-summary-card-meta";
        metaEl.appendChild(
          this.createAnnotatedFragment(display.metaLine, {
            includeTermIds: new Set(SKILL_CARD_META_LINE_TERM_IDS),
          }),
        );
        body.appendChild(metaEl);
      }

      this.appendSkillCardEffects(body, display.headlineLines);

      if (body.childElementCount > 0) {
        card.appendChild(body);
      }
    }

    return card;
  }

  private appendSkillCardEffects(
    card: HTMLElement,
    effectLines: string[]
  ): void {
    if (effectLines.length === 0) return;

    const wrap = document.createElement("div");
    wrap.className = "skill-menu-skill-summary-card-effects";

    for (const line of effectLines) {
      const paragraph = document.createElement("p");
      paragraph.className = "skill-menu-skill-summary-card-effect-line";
      paragraph.appendChild(this.createAnnotatedFragment(line));
      wrap.appendChild(paragraph);
    }

    card.appendChild(wrap);
  }

  private createAnnotatedFragment(
    text: string,
    options?: { includeTermIds?: ReadonlySet<GameTermId> },
  ): DocumentFragment {
    const locale = getLocale() as GameTermLocale;
    return annotateGameTerms(
      text,
      locale,
      (termId, anchor) => {
        this.gameTermTooltip.openFromTerm(termId, anchor, locale);
      },
      options,
    );
  }

  private createLockedSkillRow(
    slotIndex: number,
    preset: ClassPreset,
    kind: "active" | "passive"
  ): HTMLElement {
    const unlockLevel = slotIndex < 2 ? 0 : slotIndex === 2 ? 10 : 20;
    const skillName = this.resolveLockedSlotSkillName(preset, slotIndex, kind);

    const row = document.createElement("div");
    row.className = "skill-menu-skill-locked-row";
    row.setAttribute(
      "aria-label",
      skillName
        ? t("party.skillLockedPreview", { level: unlockLevel, name: skillName })
        : t("party.slotUnlockAtLevel", { level: unlockLevel })
    );

    const prefix = document.createElement("span");
    prefix.className = "skill-menu-skill-locked-prefix";
    prefix.textContent = "+";
    prefix.setAttribute("aria-hidden", "true");

    const text = document.createElement("span");
    text.className = "skill-menu-skill-locked-text";
    text.textContent = skillName
      ? t("party.skillLockedPreview", { level: unlockLevel, name: skillName })
      : t("party.slotUnlockAtLevel", { level: unlockLevel });

    row.append(prefix, text);
    return row;
  }

  private resolveLockedSlotSkillName(
    preset: ClassPreset,
    slotIndex: number,
    kind: "active" | "passive"
  ): string | undefined {
    const atMaxLevel = resolveLearnedSkills(
      preset,
      20,
      this.gameData.skillRegistry
    );
    const skillIds =
      kind === "passive"
        ? atMaxLevel.learnedPassiveIds
        : atMaxLevel.learnedActiveIds;
    const skillId = skillIds[slotIndex];
    if (!skillId) return undefined;
    const def =
      kind === "passive"
        ? this.gameData.skillRegistry.passives[skillId]
        : this.gameData.skillRegistry.actives[skillId];
    return def?.name;
  }

  private createIconWrap(
    preset: ClassPreset | undefined,
    label: string,
    skillId?: string,
    skill?: PassiveSkillDef | ActiveSkillDef
  ): HTMLElement {
    const iconWrap = document.createElement("span");
    iconWrap.className = "skill-menu-tab-icon";

    let resolvedUrl = "";
    if (skillId && skill) {
      resolvedUrl =
        getSkillIconUrlForSkill(skill, {
          classPreset: preset,
          classRegistry: this.gameData.classRegistry,
        }) ?? "";
    } else if (preset) {
      resolvedUrl = getClassIconUrl(resolveClassIconKey(preset));
    }

    if (!resolvedUrl) {
      iconWrap.classList.add("skill-menu-tab-icon--empty");
      iconWrap.setAttribute("aria-hidden", "true");
      return iconWrap;
    }

    const img = document.createElement("img");
    img.className = "skill-menu-tab-icon-img";
    img.width = 24;
    img.height = 24;
    img.alt = "";
    img.decoding = "async";
    img.src = resolvedUrl;
    img.setAttribute("aria-hidden", "true");
    iconWrap.title = label;
    iconWrap.appendChild(img);
    return iconWrap;
  }

  private renderClassArchive(): void {
    this.classArchiveListEl.replaceChildren();
    this.classArchiveListEl.appendChild(this.createPickerRoleBlocks());
  }

  private createPickerRoleBlocks(): HTMLElement {
    const visible = this.getPickerVisibleClassIds();
    const blocks = document.createElement("div");
    blocks.className = "skill-menu-picker-role-blocks";

    for (const role of PICKER_ROLES) {
      const classIds = visible.filter(
        (classId) => this.gameData.classRegistry[classId]?.role === role
      );
      if (classIds.length === 0) continue;

      const blockEl = document.createElement("section");
      blockEl.className = "skill-menu-picker-role-block";

      const blockHeading = document.createElement("h4");
      blockHeading.className = "skill-menu-picker-role-heading";
      blockHeading.textContent = roleLabel(role);
      blockEl.appendChild(blockHeading);

      const list = document.createElement("div");
      list.className = "skill-menu-picker-role-list";
      if (role === "attacker") {
        for (const subRole of ATTACKER_SUB_ROLES) {
          const subClassIds = classIds.filter((classId) => {
            const preset = this.gameData.classRegistry[classId];
            return (
              preset && resolveAttackerSubRole(preset) === subRole
            );
          });
          if (subClassIds.length === 0) continue;

          const subHeading = document.createElement("div");
          subHeading.className = "skill-menu-picker-role-subheading";
          subHeading.textContent = attackerSubRoleLabel(subRole);
          list.appendChild(subHeading);

          const tierRow = document.createElement("div");
          tierRow.className = "skill-menu-picker-tier-row";
          for (const classId of subClassIds) {
            const preset = this.gameData.classRegistry[classId];
            tierRow.appendChild(
              this.createPickerListItem(
                preset?.displayName ?? classId,
                classId,
                preset
              )
            );
          }
          list.appendChild(tierRow);
        }
      } else {
        const tierRow = document.createElement("div");
        tierRow.className = "skill-menu-picker-tier-row";
        for (const classId of classIds) {
          const preset = this.gameData.classRegistry[classId];
          tierRow.appendChild(
            this.createPickerListItem(
              preset?.displayName ?? classId,
              classId,
              preset
            )
          );
        }
        list.appendChild(tierRow);
      }
      blockEl.appendChild(list);
      blocks.appendChild(blockEl);
    }

    return blocks;
  }

  private createPickerListItem(
    name: string,
    classId: string,
    preset?: ClassPreset
  ): HTMLElement {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "skill-menu-picker-list-item";
    row.dataset.pickerClassId = classId;
    const isSelected = this.selectedClassIds.includes(classId);
    const isFocused = this.focusedClassId === classId;
    const isAtCapacity = this.selectedClassIds.length >= 4;
    row.setAttribute("aria-pressed", isSelected ? "true" : "false");
    if (isSelected) {
      row.classList.add("skill-menu-picker-list-item--active");
      row.title = t("party.classInParty");
    } else if (isAtCapacity) {
      row.classList.add("skill-menu-picker-list-item--unavailable");
      row.title = t("party.partyFull");
    }
    if (isFocused) {
      row.classList.add("skill-menu-picker-list-item--focused");
    }

    row.appendChild(this.createIconWrap(preset, name));

    const text = document.createElement("div");
    text.className = "skill-menu-picker-list-item-text";

    const nameEl = document.createElement("div");
    nameEl.className = "skill-menu-picker-list-item-name";
    nameEl.textContent = name;
    text.appendChild(nameEl);

    if (preset?.epithetEn) {
      const epithetEl = document.createElement("div");
      epithetEl.className = "skill-menu-picker-list-item-epithet";
      epithetEl.textContent = preset.epithetEn;
      text.appendChild(epithetEl);
    }

    row.appendChild(text);
    return row;
  }

  destroy(): void {
    this.unsubscribeLocale();
    this.gameTermTooltip.destroy();
    this.gameTermPanel.destroy();
    this.root.remove();
  }
}
