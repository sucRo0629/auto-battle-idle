import "../styles/game-ui-chrome.css";
import "../styles/game-term-tooltip.css";
import "../styles/skill-menu-panel.css";
import { getMemberStatLabels } from "../i18n/memberStatLabels.ts";
import { getLocale, subscribeLocaleChange } from "../i18n/locale.ts";
import { t } from "../i18n/t.ts";
import {
  resolveClassIconKey,
  resolveClassSpriteKey,
} from "../render/entityVisuals.ts";
import {
  isMeleeRangePx,
  type ActiveSkillDef,
  type ClassId,
  type ClassPreset,
  type GameData,
  type PassiveSkillDef,
  type PartyMemberState,
  type PartySlotState,
  type Role,
} from "../battle/types.ts";
import type { StatusDisplayCategory } from "../battle/statusEffectDisplay.ts";
import { getClassIconUrl, getSkillIconUrlForSkill } from "../render/IconRegistry.ts";
import {
  getEntityAnimLayout,
  getEntityAnimSpriteDef,
  getEntityBodyUrl,
  hasEntityBodyAtlas,
} from "../render/entityAtlas.ts";
import { getSpriteUrl } from "../render/SpriteRegistry.ts";
import { getStatusIconUrl } from "../render/StatusIconRegistry.ts";
import {
  createMemberFromClass,
  getAssignableClassIds,
} from "../progression/partyCompose.ts";
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
import {
  formatSkillCardLines,
} from "./formatSkillText.ts";
import { formatClassSummary, formatClassSummaryForAria } from "./formatClassSummary.ts";
import { annotateGameTerms, annotateGameTermsWithTooltip } from "./annotateGameTerms.ts";
import { GameTermPanel } from "./GameTermPanel.ts";
import { GameTermTooltip } from "./GameTermTooltip.ts";
import type { GameTermLocale } from "./gameTermGlossary.ts";
import {
  resolveSkillCardDisplay,
  resolveStatusChipTooltip,
  resolveTagTooltip,
  type SkillCardStatusChip,
  type SkillCardTag,
} from "./skillCardDisplay.ts";
import { SKILL_CARD_BODY_TERM_EXCLUDE_IDS } from "./skillCardDisplayRules.ts";

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

const ROLE_STATUS_ICON: Record<Role, StatusDisplayCategory> = {
  defender: "def",
  attacker: "atk",
  supporter: "hot",
};

type PickerTarget = { kind: "class" } | null;

export interface SkillMenuPanelCallbacks {
  onBuildChanged: (
    partyIndex: number,
    build: PartyMemberState["build"]
  ) => void;
  onPartySlotChanged: (slotIndex: number, member: PartySlotState) => void;
  onPartyDraftChange?: () => void;
}

export interface SkillMenuPanelOptions {
  /** Picker オーバーレイのマウント先。省略時は `.meta-menu-overlay` または `document.body` */
  pickerHost?: HTMLElement;
}

export class SkillMenuPanel {
  private readonly root: HTMLElement;
  private readonly formationBlockEl: HTMLElement;
  private readonly rosterSlotsEl: HTMLElement;
  private readonly detailWrapEl: HTMLElement;
  private readonly bodyEl: HTMLElement;
  private readonly pickerOverlayEl: HTMLElement;
  private readonly pickerHost: HTMLElement;
  private readonly gameTermPanel: GameTermPanel;
  private readonly gameTermTooltip: GameTermTooltip;
  private readonly formationNoteEl: HTMLElement;
  private readonly unsubscribeLocale: () => void;
  private readonly draftParty: PartySlotState[];
  private readonly unlockedClassIds: ClassId[];
  private selectedIndex = 0;
  private pickerTarget: PickerTarget = null;
  private pickerPreviewClassId: ClassId | null = null;
  private userSelectedRoster = false;

  constructor(
    private readonly container: HTMLElement,
    private readonly gameData: GameData,
    private readonly levelCurves: LevelCurvesConfig,
    sourceParty: PartySlotState[],
    unlockedClassIds: ClassId[],
    private readonly callbacks: SkillMenuPanelCallbacks,
    options: SkillMenuPanelOptions = {}
  ) {
    this.pickerHost =
      options.pickerHost ?? document.body;
    this.unlockedClassIds = [...unlockedClassIds];
    this.draftParty = sourceParty.map((member) =>
      member
        ? {
            classId: member.classId,
            progress: structuredClone(member.progress),
            build: normalizeActiveSlots(cloneBuild(member.build)),
          }
        : null
    );

    this.root = document.createElement("div");
    this.root.className = "meta-menu-screen skill-menu-panel";

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
      const index = Number(card.dataset.memberIndex);
      if (Number.isNaN(index)) return;
      const wasSelected = index === this.selectedIndex;
      this.selectedIndex = index;
      if (!this.draftParty[index]) {
        this.openClassPicker();
      } else if (wasSelected && this.userSelectedRoster) {
        this.openClassPicker();
      } else {
        this.closeClassPicker();
      }
      this.userSelectedRoster = true;
      this.render();
    });

    this.bodyEl = document.createElement("div");
    this.bodyEl.className = "skill-menu-body";
    this.bodyEl.dataset.section = "detail";
    this.bodyEl.addEventListener("click", (event) => {
      const openPicker = (event.target as Element | null)?.closest(
        '[data-action="open-class-picker"]'
      );
      if (openPicker instanceof HTMLElement) {
        this.openClassPicker();
        this.render();
      }
    });

    this.pickerOverlayEl = document.createElement("div");
    this.pickerOverlayEl.className = "skill-menu-picker-overlay";
    this.pickerOverlayEl.hidden = true;
    this.pickerOverlayEl.addEventListener("click", (event) => {
      if (event.target === this.pickerOverlayEl) {
        this.closeClassPicker();
        this.render();
        return;
      }

      const actionButton = (event.target as Element | null)?.closest(
        "[data-picker-action]"
      );
      if (actionButton instanceof HTMLButtonElement) {
        const action = actionButton.dataset.pickerAction;
        if (action === "cancel") {
          this.closeClassPicker();
          this.render();
        } else if (action === "confirm" && this.pickerPreviewClassId) {
          this.handleClassPickerSelection(this.pickerPreviewClassId);
        } else if (action === "clear") {
          this.handleClassPickerSelection("");
        }
        return;
      }

      const listItem = (event.target as Element | null)?.closest(
        ".skill-menu-picker-list-item"
      );
      if (!(listItem instanceof HTMLButtonElement)) return;
      const classId = listItem.dataset.pickerPreviewClassId;
      if (!classId || classId === this.pickerPreviewClassId) return;
      this.pickerPreviewClassId = classId;
      this.renderPickerOverlay();
    });

    this.detailWrapEl = document.createElement("div");
    this.detailWrapEl.className = "skill-menu-detail-wrap";
    this.detailWrapEl.append(this.bodyEl);

    this.gameTermPanel = new GameTermPanel(this.root, {
      locale: getLocale() as GameTermLocale,
      detailScrollRoot: this.bodyEl,
    });
    this.gameTermPanel.mount();
    this.gameTermTooltip = new GameTermTooltip(this.root);
    this.bodyEl.addEventListener("scroll", () => {
      this.gameTermTooltip.reposition();
      this.gameTermTooltip.hide();
    });

    this.formationBlockEl.append(this.rosterSlotsEl, noteEl);
    this.root.append(
      this.formationBlockEl,
      this.detailWrapEl
    );
    this.pickerHost.appendChild(this.pickerOverlayEl);
    this.container.appendChild(this.root);
    this.unsubscribeLocale = subscribeLocaleChange(() => this.render());
    this.render();
  }

  private getPlayerLevel(): number {
    return resolvePlayerDisplayLevel(this.draftParty);
  }

  getFilledSlotCount(): number {
    return this.draftParty.filter((member) => member !== null).length;
  }

  getSelectedSlotIndex(): number {
    return this.selectedIndex;
  }

  private getAssignableClassIdsForPicker(): ClassId[] {
    return getAssignableClassIds(
      this.draftParty,
      this.unlockedClassIds,
      this.selectedIndex,
      this.gameData.classOrder
    );
  }

  private openClassPicker(): void {
    const assignable = this.getAssignableClassIdsForPicker();
    const current = this.draftParty[this.selectedIndex]?.classId ?? null;
    this.pickerPreviewClassId =
      current && assignable.includes(current)
        ? current
        : assignable[0] ?? null;
    this.pickerTarget = { kind: "class" };
  }

  private closeClassPicker(): void {
    this.pickerTarget = null;
    this.pickerPreviewClassId = null;
  }

  private handleClassPickerSelection(classId: string): void {
    const slotIndex = this.selectedIndex;
    if (classId) {
      const member = createMemberFromClass(classId, this.gameData);
      this.draftParty[slotIndex] = member;
      this.callbacks.onPartySlotChanged(slotIndex, structuredClone(member));
    } else {
      this.draftParty[slotIndex] = null;
      this.callbacks.onPartySlotChanged(slotIndex, null);
    }
    this.closeClassPicker();
    this.render();
  }

  private render(): void {
    this.formationNoteEl.textContent = t("party.formationNote");
    this.renderRoster();
    this.renderBody();
    this.renderPickerOverlay();
    this.callbacks.onPartyDraftChange?.();
  }

  private renderRoster(): void {
    this.rosterSlotsEl.replaceChildren();
    this.draftParty.forEach((member, index) => {
      const preset = member
        ? this.gameData.classRegistry[member.classId]
        : undefined;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "skill-menu-roster-card";
      if (!member) {
        button.classList.add("skill-menu-roster-card--empty");
      }
      if (index === this.selectedIndex) {
        button.classList.add("skill-menu-roster-card--active");
      }
      button.dataset.memberIndex = String(index);

      if (member && preset) {
        const summary = formatClassSummary(preset, getLocale());
        const ariaParts = summary
          ? [preset.displayName, formatClassSummaryForAria(summary)]
          : [preset.displayName];
        button.setAttribute("aria-label", ariaParts.join(" "));
        button.appendChild(this.createRosterRoleIcon(preset.role));
        button.appendChild(this.createRosterCharacterDisplay(preset));
        button.appendChild(this.createRosterTextBlock(preset));
      } else {
        button.setAttribute("aria-label", t("party.emptySlot"));
        const plusEl = document.createElement("span");
        plusEl.className = "skill-menu-roster-card-plus";
        plusEl.textContent = "＋";
        plusEl.setAttribute("aria-hidden", "true");
        const hintEl = document.createElement("span");
        hintEl.className = "skill-menu-roster-card-empty-label";
        hintEl.textContent = t("party.addClass");
        button.append(plusEl, hintEl);
      }

      this.rosterSlotsEl.appendChild(button);
    });
  }

  private createRosterRoleIcon(role: Role): HTMLElement {
    const wrap = document.createElement("span");
    wrap.className = "skill-menu-roster-card-role-icon";
    wrap.setAttribute("aria-hidden", "true");

    const url = getStatusIconUrl(ROLE_STATUS_ICON[role]);
    if (url) {
      const img = document.createElement("img");
      img.className = "skill-menu-roster-card-role-icon-img";
      img.src = url;
      img.alt = "";
      img.decoding = "async";
      wrap.appendChild(img);
    }

    return wrap;
  }

  private createRosterTextBlock(preset: ClassPreset): HTMLElement {
    const wrap = document.createElement("span");
    wrap.className = "skill-menu-roster-card-text";

    const nameEl = document.createElement("span");
    nameEl.className = "skill-menu-roster-card-name";
    nameEl.textContent = preset.displayName;

    const epithetEl = document.createElement("span");
    epithetEl.className = "skill-menu-roster-card-epithet";
    epithetEl.textContent = preset.epithetEn ?? "";

    wrap.append(nameEl, epithetEl);

    return wrap;
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
    const member = this.draftParty[this.selectedIndex];

    if (!member) {
      this.bodyEl.appendChild(this.createEmptySlotDetail());
      return;
    }

    const preset = this.gameData.classRegistry[member.classId];
    if (!preset) return;

    const classStatsRow = document.createElement("div");
    classStatsRow.className = "skill-menu-class-stats-row";
    classStatsRow.append(
      this.createClassInfoSection(member, preset),
      this.createStatsSection(preset)
    );

    this.bodyEl.append(
      classStatsRow,
      this.createActiveSkillsSection(preset),
      this.createPassiveSkillsSection(preset)
    );
  }

  private createEmptySlotDetail(): HTMLElement {
    const section = document.createElement("section");
    section.className = "skill-menu-section skill-menu-empty-slot";

    const message = document.createElement("p");
    message.className = "skill-menu-empty-slot-message";
    message.textContent = t("party.selectClassPrompt");

    section.appendChild(message);
    return section;
  }

  private createClassInfoSection(
    _member: PartyMemberState,
    preset: ClassPreset
  ): HTMLElement {
    const section = document.createElement("section");
    section.className = "skill-menu-section skill-menu-class-info";

    const heading = document.createElement("h3");
    heading.className = "skill-menu-section-title";
    heading.textContent = t("party.classInfo");

    const header = document.createElement("div");
    header.className = "skill-menu-class-info-header";

    header.appendChild(
      this.createIconWrap(preset, preset.displayName)
    );

    const textWrap = document.createElement("div");
    textWrap.className = "skill-menu-class-info-text";

    const topRow = document.createElement("div");
    topRow.className = "skill-menu-class-info-top-row";

    const identityWrap = document.createElement("div");
    identityWrap.className = "skill-menu-class-info-identity";

    const nameEl = document.createElement("div");
    nameEl.className = "skill-menu-class-info-name";
    nameEl.textContent = preset.displayName;

    const epithetEl = document.createElement("div");
    epithetEl.className = "skill-menu-class-info-epithet";
    epithetEl.textContent = preset.epithetEn ?? "";

    identityWrap.append(nameEl, epithetEl);

    topRow.appendChild(identityWrap);

    textWrap.appendChild(topRow);

    const summary = formatClassSummary(preset, getLocale());
    if (summary) {
      const summaryEl = document.createElement("p");
      summaryEl.className = "skill-menu-class-info-summary";
      summaryEl.textContent = summary;
      textWrap.appendChild(summaryEl);
    }

    header.appendChild(textWrap);

    section.append(heading, header);
    return section;
  }

  private createStatsSection(preset: ClassPreset): HTMLElement {
    const playerLevel = this.getPlayerLevel();
    const stats = resolveMemberDisplayStats(
      preset,
      playerLevel,
      this.levelCurves
    );

    const section = document.createElement("section");
    section.className = "skill-menu-stats";

    const heading = document.createElement("h3");
    heading.className = "skill-menu-section-title";
    heading.textContent = t("party.stats");
    section.appendChild(heading);

    const grid = document.createElement("dl");
    grid.className = "skill-menu-stats-grid";

    const statLabels = getMemberStatLabels();
    const rows: { label: string; value: string; latin?: boolean }[] = [
      { label: statLabels.hp, value: String(stats.maxHp), latin: true },
      { label: statLabels.atk, value: String(stats.atk) },
      { label: statLabels.def, value: String(stats.def) },
      { label: statLabels.reg, value: String(stats.reg) + "%" },
      { label: statLabels.spd, value: stats.spdLabel },
    ];

    const basicAttack = resolveMemberBasicAttackDisplay(
      preset,
      this.gameData.skillRegistry
    );
    if (basicAttack) {
      rows.push(
        { label: statLabels.range, value: basicAttack.rangeLabel },
        {
          label: statLabels.basicAttack,
          value: basicAttack.attributeLabel,
        }
      );
    }

    for (const row of rows) {
      const dt = document.createElement("dt");
      dt.className = "skill-menu-stats-label";
      if (row.latin) {
        dt.classList.add("skill-menu-stats-label--latin");
      }
      dt.textContent = row.label;

      const dd = document.createElement("dd");
      dd.className = "skill-menu-stats-value";
      dd.textContent = row.value;

      grid.append(dt, dd);
    }

    section.appendChild(grid);
    return section;
  }

  private createActiveSkillsSection(preset: ClassPreset): HTMLElement {
    const playerLevel = this.getPlayerLevel();
    const learned = resolveLearnedSkills(
      preset,
      playerLevel,
      this.gameData.skillRegistry
    );
    const unlockedSlots = getUnlockedSkillSlotCount(playerLevel);

    const section = document.createElement("section");
    section.className = "skill-menu-section skill-menu-skill-section";

    const heading = document.createElement("h3");
    heading.className = "skill-menu-section-title";
    heading.textContent = t("party.activeSkills");

    const list = document.createElement("div");
    list.className = "skill-menu-skill-view-list";

    for (const skillId of learned.learnedActiveIds) {
      const def = this.gameData.skillRegistry.actives[skillId];
      list.appendChild(
        this.createSkillViewCard({
          skillId,
          def,
          preset,
          unlockLevel: this.getSkillUnlockLevel(preset, skillId),
        })
      );
    }

    for (let slotIndex = unlockedSlots; slotIndex < MAX_ACTIVE_SLOTS; slotIndex++) {
      list.appendChild(this.createLockedSlotCard(slotIndex, preset, "active"));
    }

    section.append(heading, list);
    return section;
  }

  private createPassiveSkillsSection(preset: ClassPreset): HTMLElement {
    const playerLevel = this.getPlayerLevel();
    const learned = resolveLearnedSkills(
      preset,
      playerLevel,
      this.gameData.skillRegistry
    );
    const unlockedSlots = getUnlockedSkillSlotCount(playerLevel);

    const section = document.createElement("section");
    section.className = "skill-menu-section skill-menu-skill-section";

    const heading = document.createElement("h3");
    heading.className = "skill-menu-section-title";
    heading.textContent = t("party.passiveSkills");

    const list = document.createElement("div");
    list.className = "skill-menu-skill-view-list";

    for (const skillId of learned.learnedPassiveIds) {
      const def = this.gameData.skillRegistry.passives[skillId];
      list.appendChild(
        this.createSkillViewCard({
          skillId,
          def,
          preset,
          unlockLevel: this.getSkillUnlockLevel(preset, skillId),
          compact: true,
        })
      );
    }

    for (let slotIndex = unlockedSlots; slotIndex < MAX_ACTIVE_SLOTS; slotIndex++) {
      list.appendChild(this.createLockedSlotCard(slotIndex, preset, "passive"));
    }

    section.append(heading, list);
    return section;
  }

  private createSkillViewCard(options: {
    skillId: string;
    def?: ActiveSkillDef | PassiveSkillDef;
    preset: ClassPreset;
    unlockLevel?: number;
    compact?: boolean;
  }): HTMLElement {
    const { skillId, def, preset, unlockLevel, compact } = options;
    const label = def?.name ?? skillId;

    const card = document.createElement("article");
    card.className = "skill-menu-skill-view-card";
    if (compact) {
      card.classList.add("skill-menu-skill-view-card--compact");
    }
    card.setAttribute("role", "group");
    card.setAttribute("aria-label", label);

    const header = document.createElement("div");
    header.className = "skill-menu-skill-view-card-header";

    const nameEl = document.createElement("span");
    nameEl.className = "skill-menu-skill-view-card-name";
    nameEl.textContent = label;

    header.appendChild(
      this.createIconWrap(preset, label, skillId, def)
    );
    header.appendChild(nameEl);
    card.appendChild(header);

    if (def) {
      const lines = formatSkillCardLines(def, { locale: getLocale() });
      const display = resolveSkillCardDisplay(
        lines,
        def,
        getLocale() as GameTermLocale
      );
      const kindLabel =
        def && "cooldownSec" in def ? "Active" : "Passive";

      const metaEl = document.createElement("div");
      metaEl.className = "skill-menu-skill-view-card-kind-meta";
      metaEl.textContent = `${kindLabel} / ${display.metaLine}`;
      card.appendChild(metaEl);

      const effectsEl = document.createElement("div");
      effectsEl.className = "skill-menu-skill-view-card-effects";
      for (const headline of display.headlineLines) {
        const lineEl = document.createElement("div");
        lineEl.className = "skill-menu-skill-view-card-effect-line";
        this.appendSkillCardAnnotatedText(lineEl, headline);
        effectsEl.appendChild(lineEl);
      }
      card.appendChild(effectsEl);

      if (display.statusChips.length > 0) {
        card.appendChild(this.createStatusChipSection(display.statusChips));
      }
      if (display.tags.length > 0) {
        card.appendChild(this.createTagSection(display.tags));
      }
    }

    const footer = document.createElement("div");
    footer.className = "skill-menu-skill-view-card-footer";
    if (unlockLevel !== undefined) {
      footer.textContent =
        unlockLevel <= 0
          ? t("party.skillLearnedAtStart")
          : t("party.skillUnlockAtLevel", { level: unlockLevel });
    }
    card.appendChild(footer);

    return card;
  }

  private appendSkillCardAnnotatedText(parent: HTMLElement, text: string): void {
    parent.appendChild(
      annotateGameTermsWithTooltip(
        text,
        getLocale() as GameTermLocale,
        this.gameTermTooltip,
        { excludeTermIds: SKILL_CARD_BODY_TERM_EXCLUDE_IDS },
      )
    );
  }

  private createStatusChipSection(
    chips: SkillCardStatusChip[]
  ): HTMLElement {
    const section = document.createElement("div");
    section.className = "skill-menu-skill-view-card-status";

    const label = document.createElement("p");
    label.className = "skill-menu-skill-view-card-status-label";
    label.textContent = t("party.skillCardStatus");
    section.appendChild(label);

    for (const chip of chips) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "skill-menu-status-chip";

      const nameEl = document.createElement("span");
      nameEl.className = "skill-menu-status-chip-name";
      nameEl.textContent = chip.title;

      button.appendChild(nameEl);
      if (chip.summary.length > 0) {
        const summaryEl = document.createElement("span");
        summaryEl.className = "skill-menu-status-chip-summary";
        summaryEl.textContent = chip.summary;
        button.appendChild(summaryEl);
      }

      this.gameTermTooltip.bind(button, () =>
        resolveStatusChipTooltip(chip, getLocale() as GameTermLocale)
      );
      section.appendChild(button);
    }

    return section;
  }

  private createTagSection(tags: SkillCardTag[]): HTMLElement {
    const section = document.createElement("div");
    section.className = "skill-menu-skill-view-card-tags";

    const label = document.createElement("p");
    label.className = "skill-menu-skill-view-card-tags-label";
    label.textContent = t("party.skillCardTags");
    section.appendChild(label);

    for (const tag of tags) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "skill-menu-tag-chip";
      chip.textContent = tag.label;

      const tooltip = resolveTagTooltip(tag, getLocale() as GameTermLocale);
      if (tooltip) {
        this.gameTermTooltip.bind(chip, () => tooltip);
      }

      section.appendChild(chip);
    }

    return section;
  }

  private appendAnnotatedSkillText(parent: HTMLElement, text: string): void {
    parent.appendChild(
      annotateGameTerms(
        text,
        getLocale() as GameTermLocale,
        (termId, anchor) => {
          this.gameTermPanel.openFromTerm(termId, anchor);
        },
        { panelId: this.gameTermPanel.getPanelId() },
      ),
    );
  }

  private createLockedSlotCard(
    slotIndex: number,
    preset: ClassPreset,
    kind: "active" | "passive"
  ): HTMLElement {
    const card = document.createElement("article");
    card.className =
      "skill-menu-skill-view-card skill-menu-skill-view-card--locked";
    card.setAttribute("role", "group");
    card.setAttribute("aria-label", t("party.lockedSlot"));

    const footer = document.createElement("div");
    footer.className = "skill-menu-skill-view-card-footer";
    footer.textContent = this.formatLockedSlotFooter(slotIndex, preset, kind);
    card.appendChild(footer);
    return card;
  }

  private formatLockedSlotFooter(
    slotIndex: number,
    preset: ClassPreset,
    kind: "active" | "passive"
  ): string {
    const unlockLevel = slotIndex < 2 ? 0 : slotIndex === 2 ? 10 : 20;
    const unlockText = t("party.slotUnlockAtLevel", { level: unlockLevel });
    const skillName = this.resolveLockedSlotSkillName(preset, slotIndex, kind);
    return skillName ? `${skillName}　${unlockText}` : unlockText;
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

  private getSkillUnlockLevel(
    preset: ClassPreset,
    skillId: string
  ): number | undefined {
    let found: number | undefined;
    for (const entry of preset.skills) {
      if (!entry.skillIds.includes(skillId)) continue;
      if (found === undefined || entry.level < found) {
        found = entry.level;
      }
    }
    return found;
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

  private renderPickerOverlay(): void {
    if (this.pickerTarget?.kind !== "class") {
      this.pickerOverlayEl.hidden = true;
      this.pickerOverlayEl.replaceChildren();
      return;
    }

    this.pickerOverlayEl.hidden = false;
    this.pickerOverlayEl.replaceChildren();

    const panel = document.createElement("div");
    panel.className = "skill-menu-picker-panel game-panel-surface";

    const heading = document.createElement("h3");
    heading.className = "skill-menu-picker-panel-title";
    heading.textContent = t("party.pickClass");

    const split = document.createElement("div");
    split.className = "skill-menu-picker-split";

    const listPane = document.createElement("div");
    listPane.className =
      "skill-menu-picker-list-pane game-ui-scroll-pane";
    listPane.appendChild(this.createPickerRoleBlocks());

    const detailPane = document.createElement("div");
    detailPane.className =
      "skill-menu-picker-detail-pane game-ui-scroll-pane";
    detailPane.appendChild(this.createPickerDetailContent());

    split.append(listPane, detailPane);

    const footer = document.createElement("div");
    footer.className = "skill-menu-picker-footer";

    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.className = "game-ui-button";
    cancelButton.dataset.pickerAction = "cancel";
    cancelButton.textContent = t("party.back");

    const clearButton = document.createElement("button");
    clearButton.type = "button";
    clearButton.className = "game-ui-button";
    clearButton.dataset.pickerAction = "clear";
    clearButton.textContent = t("party.clearSlot");
    clearButton.disabled = !this.draftParty[this.selectedIndex];

    const confirmButton = document.createElement("button");
    confirmButton.type = "button";
    confirmButton.className = "game-ui-button game-ui-button--primary";
    confirmButton.dataset.pickerAction = "confirm";
    confirmButton.textContent = t("party.confirmClass");
    confirmButton.disabled = !this.pickerPreviewClassId;

    footer.append(cancelButton, clearButton, confirmButton);
    panel.append(heading, split, footer);
    this.pickerOverlayEl.appendChild(panel);
  }

  private createPickerRoleBlocks(): HTMLElement {
    const assignable = this.getAssignableClassIdsForPicker();
    const blocks = document.createElement("div");
    blocks.className = "skill-menu-picker-role-blocks";

    for (const role of PICKER_ROLES) {
      const classIds = assignable.filter(
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
    row.dataset.pickerPreviewClassId = classId;
    if (classId === this.pickerPreviewClassId) {
      row.classList.add("skill-menu-picker-list-item--active");
    }

    row.appendChild(this.createIconWrap(preset, name));

    const text = document.createElement("div");
    text.className = "skill-menu-picker-list-item-text";

    if (preset?.epithetEn) {
      const epithetEl = document.createElement("div");
      epithetEl.className = "skill-menu-picker-list-item-epithet";
      epithetEl.textContent = preset.epithetEn;
      text.appendChild(epithetEl);
    }

    const nameEl = document.createElement("div");
    nameEl.className = "skill-menu-picker-list-item-name";
    nameEl.textContent = name;
    text.appendChild(nameEl);

    row.appendChild(text);
    return row;
  }

  private createPickerDetailContent(): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "skill-menu-picker-detail";

    const preset = this.pickerPreviewClassId
      ? this.gameData.classRegistry[this.pickerPreviewClassId]
      : undefined;

    if (!preset) {
      const empty = document.createElement("p");
      empty.className = "skill-menu-picker-detail-empty";
      empty.textContent = t("party.pickerDetailEmpty");
      wrap.appendChild(empty);
      return wrap;
    }

    const header = document.createElement("div");
    header.className = "skill-menu-picker-detail-header";
    header.appendChild(this.createIconWrap(preset, preset.displayName));

    const identity = document.createElement("div");
    identity.className = "skill-menu-picker-detail-identity";

    const roleEl = document.createElement("div");
    roleEl.className = "skill-menu-picker-detail-role";
    roleEl.textContent = roleLabel(preset.role);

    const nameEl = document.createElement("div");
    nameEl.className = "skill-menu-picker-detail-name";
    nameEl.textContent = preset.displayName;

    const epithetEl = document.createElement("div");
    epithetEl.className = "skill-menu-picker-detail-epithet";
    epithetEl.textContent = preset.epithetEn ?? "";

    identity.append(roleEl, nameEl, epithetEl);
    header.appendChild(identity);
    wrap.appendChild(header);

    const summary = formatClassSummary(preset, getLocale());
    if (summary) {
      const summaryEl = document.createElement("div");
      summaryEl.className = "skill-menu-picker-detail-summary";
      this.appendAnnotatedSkillText(summaryEl, summary);
      wrap.appendChild(summaryEl);
    }

    return wrap;
  }

  destroy(): void {
    this.unsubscribeLocale();
    this.gameTermTooltip.destroy();
    this.gameTermPanel.destroy();
    this.pickerOverlayEl.remove();
    this.root.remove();
  }
}
