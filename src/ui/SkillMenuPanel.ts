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
import { createMemberFromClass } from "../progression/partyCompose.ts";
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
import { annotateGameTermsWithTooltip } from "./annotateGameTerms.ts";
import { formatClassSummary, formatClassSummaryForAria } from "./formatClassSummary.ts";
import { GameTermPanel } from "./GameTermPanel.ts";
import { GameTermTooltip } from "./GameTermTooltip.ts";
import type { GameTermLocale } from "./gameTermGlossary.ts";
import {
  resolveSkillCardDisplay,
  resolveStatusChipTooltip,
} from "./skillCardDisplay.ts";
import {
  SKILL_CARD_BODY_TERM_EXCLUDE_IDS,
  SKILL_CARD_BODY_TERM_INCLUDE_IDS,
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

export interface SkillMenuPanelOptions {
  /** @deprecated Picker is inline; host is unused. */
  pickerHost?: HTMLElement;
  /** 確認モードでは4人未満でも戦闘へ戻れる。解除 UI は Class Select 再クリックのみ。 */
  isVerifyMode?: () => boolean;
}

export class SkillMenuPanel {
  private readonly root: HTMLElement;
  private readonly boardEl: HTMLElement;
  private readonly formationZoneHeaderEl: HTMLElement;
  private readonly formationBlockEl: HTMLElement;
  private readonly rosterSlotsEl: HTMLElement;
  private readonly classArchiveHeaderEl: HTMLElement;
  private readonly classArchiveListEl: HTMLElement;
  private readonly classArchiveSummaryEl: HTMLElement;
  private readonly detailZoneHeaderEl: HTMLElement;
  private readonly detailWrapEl: HTMLElement;
  private readonly bodyEl: HTMLElement;
  private readonly gameTermPanel: GameTermPanel;
  private readonly gameTermTooltip: GameTermTooltip;
  private readonly formationNoteEl: HTMLElement;
  private readonly unsubscribeLocale: () => void;
  private readonly draftParty: PartySlotState[];
  private readonly unlockedClassIds: ClassId[];
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
    unlockedClassIds: ClassId[],
    private readonly callbacks: SkillMenuPanelCallbacks,
    options: SkillMenuPanelOptions = {}
  ) {
    this.isVerifyMode = options.isVerifyMode ?? (() => false);
    this.unlockedClassIds = [...unlockedClassIds];
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

    const boardUpperEl = document.createElement("div");
    boardUpperEl.className = "skill-menu-board-upper";

    const formationZoneEl = document.createElement("section");
    formationZoneEl.className =
      "skill-menu-zone skill-menu-zone--formation";

    this.formationZoneHeaderEl = document.createElement("div");
    this.formationZoneHeaderEl.className = "skill-menu-zone-header";

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

    this.classArchiveSummaryEl = document.createElement("div");
    this.classArchiveSummaryEl.className = "skill-menu-class-archive-summary";

    classArchiveEl.append(
      this.classArchiveHeaderEl,
      this.classArchiveListEl,
      this.classArchiveSummaryEl
    );

    this.formationBlockEl.append(noteEl, this.rosterSlotsEl);
    formationZoneEl.append(this.formationBlockEl);

    const detailZoneEl = document.createElement("section");
    detailZoneEl.className = "skill-menu-zone skill-menu-zone--detail";

    this.detailZoneHeaderEl = document.createElement("div");
    this.detailZoneHeaderEl.className = "skill-menu-zone-header";

    this.bodyEl = document.createElement("div");
    this.bodyEl.className = "skill-menu-body";
    this.bodyEl.dataset.section = "detail";
    this.bodyEl.addEventListener("scroll", () => {
      this.gameTermTooltip.reposition();
      this.gameTermTooltip.hide();
    });

    this.detailWrapEl = document.createElement("div");
    this.detailWrapEl.className = "skill-menu-detail-wrap";
    this.detailWrapEl.append(this.bodyEl);

    detailZoneEl.append(this.detailZoneHeaderEl, this.detailWrapEl);
    boardUpperEl.append(classArchiveEl, detailZoneEl);

    this.gameTermPanel = new GameTermPanel(this.root, {
      locale: getLocale() as GameTermLocale,
      detailScrollRoot: this.bodyEl,
    });
    this.gameTermPanel.mount();
    this.gameTermTooltip = new GameTermTooltip(this.root);

    this.boardEl.append(boardUpperEl, formationZoneEl);
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
    return this.isVerifyMode() || this.selectedClassIds.length === 4;
  }

  private getPickerVisibleClassIds(): ClassId[] {
    return sortClassIdsByListOrder(
      this.unlockedClassIds,
      this.gameData.classOrder
    );
  }

  private focusClass(classId: ClassId): void {
    if (this.focusedClassId === classId) return;
    this.focusedClassId = classId;
    this.renderRoster();
    this.renderClassArchiveSummary();
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
    this.formationZoneHeaderEl.textContent = t("party.zonePartySummary");
    this.classArchiveHeaderEl.textContent = t("party.zoneClassSelect");
    this.detailZoneHeaderEl.textContent = t("party.skills");
    this.formationNoteEl.textContent = this.selectionFeedback;
    this.renderRoster();
    this.renderClassArchive();
    this.renderClassArchiveSummary();
    this.renderBody();
    this.callbacks.onPartyDraftChange?.();
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
      character.classList.remove("skill-menu-roster-card-character--enter");
      void character.offsetWidth;
      character.classList.add("skill-menu-roster-card-character--enter");
      character.addEventListener(
        "animationend",
        () => {
          character.classList.remove("skill-menu-roster-card-character--enter");
        },
        { once: true }
      );
    }

    const footer = card.querySelector(".skill-menu-roster-card-footer");
    if (footer instanceof HTMLElement) {
      footer.classList.remove("skill-menu-roster-card-footer--enter");
      void footer.offsetWidth;
      footer.classList.add("skill-menu-roster-card-footer--enter");
      footer.addEventListener(
        "animationend",
        () => {
          footer.classList.remove("skill-menu-roster-card-footer--enter");
        },
        { once: true }
      );
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
  }

  private renderClassArchiveSummary(): void {
    this.classArchiveSummaryEl.replaceChildren();
    const focusedClassId =
      this.focusedClassId ??
      this.selectedClassIds[0] ??
      this.getPickerVisibleClassIds()[0];

    if (!focusedClassId) {
      this.classArchiveSummaryEl.appendChild(this.createEmptySlotDetail());
      return;
    }

    const preset = this.gameData.classRegistry[focusedClassId];
    if (!preset) return;
    this.classArchiveSummaryEl.appendChild(this.createClassSummaryBand(preset));
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
    body.appendChild(identityEl);

    const summary = formatClassSummary(preset, getLocale());
    if (summary) {
      const summaryEl = document.createElement("p");
      summaryEl.className = "skill-menu-class-summary-text";
      summaryEl.textContent = summary;
      this.gameTermTooltip.bind(summaryEl, () => ({
        title: preset.displayName,
        body: summary,
      }));
      body.appendChild(summaryEl);
    }

    body.appendChild(this.createStatChipRow(preset));
    section.appendChild(body);
    return section;
  }

  private createStatChipRow(preset: ClassPreset): HTMLElement {
    const playerLevel = this.getPlayerLevel();
    const stats = resolveMemberDisplayStats(
      preset,
      playerLevel,
      this.levelCurves
    );
    const statLabels = getMemberStatLabels();

    const row = document.createElement("div");
    row.className = "skill-menu-class-summary-stats";

    const chips: { label: string; value: string }[] = [
      { label: statLabels.hp, value: String(stats.maxHp) },
      { label: statLabels.atk, value: String(stats.atk) },
      { label: statLabels.def, value: String(stats.def) },
      { label: statLabels.reg, value: `${stats.reg}%` },
      { label: statLabels.spd, value: stats.spdLabel },
    ];

    const basicAttack = resolveMemberBasicAttackDisplay(
      preset,
      this.gameData.skillRegistry
    );
    if (basicAttack) {
      chips.push(
        { label: statLabels.range, value: basicAttack.rangeLabel },
        {
          label: statLabels.basicAttack,
          value: basicAttack.attributeLabel,
        }
      );
    }

    for (const chip of chips) {
      const el = document.createElement("span");
      el.className = "skill-menu-stat-chip";
      el.textContent = `${chip.label} ${chip.value}`;
      row.appendChild(el);
    }

    return row;
  }

  private createSkillKindSection(
    kind: "active" | "passive",
    preset: ClassPreset,
    learned: ReturnType<typeof resolveLearnedSkills>,
    unlockedSlots: number
  ): HTMLElement {
    const section = document.createElement("section");
    section.className = "skill-menu-skill-kind-section";

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
    for (let slotIndex = unlockedSlots; slotIndex < MAX_ACTIVE_SLOTS; slotIndex++) {
      lockedList.appendChild(
        this.createLockedSkillRow(slotIndex, preset, kind)
      );
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
    card.className = "skill-menu-skill-summary-card";
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

      if (display.metaLine) {
        const metaEl = document.createElement("div");
        metaEl.className = "skill-menu-skill-summary-card-meta";
        metaEl.textContent = display.metaLine;
        card.appendChild(metaEl);
      }

      this.appendSkillCardEffects(card, display.headlineLines);

      const chipsRow = document.createElement("div");
      chipsRow.className = "skill-menu-skill-summary-card-chips";
      let hasChips = false;

      for (const chip of display.statusChips) {
        hasChips = true;
        const button = document.createElement("button");
        button.type = "button";
        button.className = "skill-menu-status-chip skill-menu-status-chip--compact";
        button.textContent = chip.title;
        this.gameTermTooltip.bind(button, () =>
          resolveStatusChipTooltip(chip, getLocale() as GameTermLocale)
        );
        chipsRow.appendChild(button);
      }

      if (hasChips) {
        card.appendChild(chipsRow);
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

  private createAnnotatedFragment(text: string): DocumentFragment {
    return annotateGameTermsWithTooltip(
      text,
      getLocale() as GameTermLocale,
      this.gameTermTooltip,
      {
        excludeTermIds: SKILL_CARD_BODY_TERM_EXCLUDE_IDS,
        includeTermIds: SKILL_CARD_BODY_TERM_INCLUDE_IDS,
      },
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

          for (const classId of subClassIds) {
            const preset = this.gameData.classRegistry[classId];
            list.appendChild(
              this.createPickerListItem(
                preset?.displayName ?? classId,
                classId,
                preset
              )
            );
          }
        }
      } else {
        for (const classId of classIds) {
          const preset = this.gameData.classRegistry[classId];
          list.appendChild(
            this.createPickerListItem(
              preset?.displayName ?? classId,
              classId,
              preset
            )
          );
        }
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
