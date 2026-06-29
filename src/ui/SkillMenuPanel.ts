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
import { GameTermPanel } from "./GameTermPanel.ts";
import { GameTermTooltip } from "./GameTermTooltip.ts";
import type { GameTermLocale } from "./gameTermGlossary.ts";
import {
  resolveSkillCardDisplay,
  resolveStatusChipTooltip,
  resolveTagTooltip,
} from "./skillCardDisplay.ts";

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
  /** 確認モード（デバッグ）時のみスロットクリア UI を表示 */
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
  private readonly classArchiveFooterEl: HTMLElement;
  private readonly classArchiveClearButton: HTMLButtonElement;
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
  private selectedIndex = 0;

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
      const index = Number(card.dataset.memberIndex);
      if (Number.isNaN(index)) return;
      this.selectedIndex = index;
      this.render();
    });

    const classArchiveEl = document.createElement("section");
    classArchiveEl.className =
      "skill-menu-zone skill-menu-zone--class-archive";

    this.classArchiveHeaderEl = document.createElement("div");
    this.classArchiveHeaderEl.className = "skill-menu-zone-header";

    this.classArchiveListEl = document.createElement("div");
    this.classArchiveListEl.className =
      "skill-menu-class-archive-list game-ui-scroll-pane";
    this.classArchiveListEl.addEventListener("click", (event) => {
      const listItem = (event.target as Element | null)?.closest(
        ".skill-menu-picker-list-item"
      );
      if (!(listItem instanceof HTMLButtonElement)) return;
      const classId = listItem.dataset.pickerClassId;
      if (!classId) return;
      this.assignClassToSlot(classId);
    });

    this.classArchiveFooterEl = document.createElement("div");
    this.classArchiveFooterEl.className = "skill-menu-class-archive-footer";
    this.classArchiveFooterEl.hidden = true;

    this.classArchiveClearButton = document.createElement("button");
    this.classArchiveClearButton.type = "button";
    this.classArchiveClearButton.className =
      "game-ui-button game-ui-button--danger skill-menu-class-archive-clear";
    this.classArchiveClearButton.addEventListener("click", () => {
      this.assignClassToSlot("");
    });
    this.classArchiveFooterEl.appendChild(this.classArchiveClearButton);

    classArchiveEl.append(
      this.classArchiveHeaderEl,
      this.classArchiveListEl,
      this.classArchiveFooterEl
    );

    this.formationBlockEl.append(this.rosterSlotsEl, noteEl);
    formationZoneEl.append(this.formationZoneHeaderEl, this.formationBlockEl);

    boardUpperEl.append(formationZoneEl, classArchiveEl);

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

    this.gameTermPanel = new GameTermPanel(this.root, {
      locale: getLocale() as GameTermLocale,
      detailScrollRoot: this.bodyEl,
    });
    this.gameTermPanel.mount();
    this.gameTermTooltip = new GameTermTooltip(this.root);

    this.boardEl.append(boardUpperEl, detailZoneEl);
    this.root.appendChild(this.boardEl);
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

  private assignClassToSlot(classId: string): void {
    const slotIndex = this.selectedIndex;
    if (classId) {
      const member = createMemberFromClass(classId, this.gameData);
      this.draftParty[slotIndex] = member;
      this.callbacks.onPartySlotChanged(slotIndex, structuredClone(member));
    } else {
      this.draftParty[slotIndex] = null;
      this.callbacks.onPartySlotChanged(slotIndex, null);
    }
    this.render();
  }

  private render(): void {
    this.formationZoneHeaderEl.textContent = t("party.zonePartySetup");
    this.classArchiveHeaderEl.textContent = t("party.zoneChooseClass");
    this.detailZoneHeaderEl.textContent = t("party.zoneTacticalData");
    const verifyMode = this.isVerifyMode();
    this.classArchiveFooterEl.hidden = !verifyMode;
    if (verifyMode) {
      this.classArchiveClearButton.textContent = t("party.clearSlot");
      this.classArchiveClearButton.disabled =
        !this.draftParty[this.selectedIndex];
    }
    this.formationNoteEl.textContent = t("party.formationNote");
    this.renderRoster();
    this.renderClassArchive();
    this.renderBody();
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

      const slotLabelEl = document.createElement("span");
      slotLabelEl.className = "skill-menu-roster-card-slot-label";
      slotLabelEl.textContent = t("party.slotLabel", { n: index + 1 });
      button.appendChild(slotLabelEl);

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

    const layout = document.createElement("div");
    layout.className = "skill-menu-tactical-layout";

    const upper = document.createElement("div");
    upper.className = "skill-menu-tactical-upper";

    const classStatsRow = document.createElement("div");
    classStatsRow.className = "skill-menu-class-stats-row";
    classStatsRow.append(
      this.createClassInfoSection(member, preset),
      this.createStatsSection(preset)
    );
    upper.appendChild(classStatsRow);

    const lower = document.createElement("div");
    lower.className = "skill-menu-tactical-lower";
    lower.appendChild(this.createSkillsSummarySection(preset));

    layout.append(upper, lower);
    this.bodyEl.appendChild(layout);
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

  private createClassInfoSection(
    _member: PartyMemberState,
    preset: ClassPreset
  ): HTMLElement {
    const section = document.createElement("section");
    section.className = "skill-menu-section skill-menu-class-info";

    const heading = document.createElement("h3");
    heading.className = "skill-menu-section-title";
    heading.textContent = t("party.classSummary");

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

    const roleEl = document.createElement("div");
    roleEl.className = "skill-menu-class-info-role";
    if (preset.role === "attacker") {
      roleEl.textContent = `${roleLabel(preset.role)} · ${attackerSubRoleLabel(resolveAttackerSubRole(preset))}`;
    } else {
      roleEl.textContent = roleLabel(preset.role);
    }

    identityWrap.append(nameEl, epithetEl, roleEl);

    topRow.appendChild(identityWrap);

    textWrap.appendChild(topRow);

    const summary = formatClassSummary(preset, getLocale());
    if (summary) {
      const summaryEl = document.createElement("p");
      summaryEl.className = "skill-menu-class-info-summary";
      summaryEl.textContent = summary;
      this.gameTermTooltip.bind(summaryEl, () => ({
        title: preset.displayName,
        body: summary,
      }));
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

  private createSkillsSummarySection(preset: ClassPreset): HTMLElement {
    const playerLevel = this.getPlayerLevel();
    const learned = resolveLearnedSkills(
      preset,
      playerLevel,
      this.gameData.skillRegistry
    );
    const unlockedSlots = getUnlockedSkillSlotCount(playerLevel);

    const section = document.createElement("section");
    section.className = "skill-menu-skill-summary-section";

    const heading = document.createElement("h3");
    heading.className = "skill-menu-section-title";
    heading.textContent = t("party.skills");

    const grid = document.createElement("div");
    grid.className = "skill-menu-skill-summary-grid";

    for (const skillId of learned.learnedActiveIds) {
      const def = this.gameData.skillRegistry.actives[skillId];
      grid.appendChild(
        this.createSkillSummaryCard({
          skillId,
          def,
          preset,
          kind: "active",
        })
      );
    }

    for (const skillId of learned.learnedPassiveIds) {
      const def = this.gameData.skillRegistry.passives[skillId];
      grid.appendChild(
        this.createSkillSummaryCard({
          skillId,
          def,
          preset,
          kind: "passive",
        })
      );
    }

    for (let slotIndex = unlockedSlots; slotIndex < MAX_ACTIVE_SLOTS; slotIndex++) {
      grid.appendChild(this.createLockedSlotCard(slotIndex, preset, "active"));
    }
    for (let slotIndex = unlockedSlots; slotIndex < MAX_ACTIVE_SLOTS; slotIndex++) {
      grid.appendChild(this.createLockedSlotCard(slotIndex, preset, "passive"));
    }

    section.append(heading, grid);
    return section;
  }

  private createSkillSummaryCard(options: {
    skillId: string;
    def?: ActiveSkillDef | PassiveSkillDef;
    preset: ClassPreset;
    kind: "active" | "passive";
  }): HTMLElement {
    const { skillId, def, preset, kind } = options;
    const label = def?.name ?? skillId;
    const kindLabel = kind === "active" ? t("party.activeSkills") : t("party.passiveSkills");

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
      const lines = formatSkillCardLines(def, { locale: getLocale() });
      const display = resolveSkillCardDisplay(
        lines,
        def,
        getLocale() as GameTermLocale
      );

      const metaEl = document.createElement("div");
      metaEl.className = "skill-menu-skill-summary-card-meta";
      metaEl.textContent = `${kindLabel} · ${display.metaLine}`;
      card.appendChild(metaEl);

      const headline = display.headlineLines[0];
      if (headline) {
        const headlineEl = document.createElement("p");
        headlineEl.className = "skill-menu-skill-summary-card-headline";
        headlineEl.textContent = headline;
        card.appendChild(headlineEl);
      }

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

      for (const tag of display.tags) {
        hasChips = true;
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "skill-menu-tag-chip skill-menu-tag-chip--compact";
        chip.textContent = tag.label;
        const tooltip = resolveTagTooltip(tag, getLocale() as GameTermLocale);
        if (tooltip) {
          this.gameTermTooltip.bind(chip, () => tooltip);
        }
        chipsRow.appendChild(chip);
      }

      if (hasChips) {
        card.appendChild(chipsRow);
      }

      this.gameTermTooltip.bind(card, () => ({
        title: label,
        body: this.buildSkillSummaryTooltipBody(display),
      }));
    }

    return card;
  }

  private buildSkillSummaryTooltipBody(display: {
    metaLine: string;
    headlineLines: string[];
  }): string {
    return [display.metaLine, ...display.headlineLines]
      .filter((line) => line.length > 0)
      .join("\n");
  }

  private createLockedSlotCard(
    slotIndex: number,
    preset: ClassPreset,
    kind: "active" | "passive"
  ): HTMLElement {
    const kindLabel =
      kind === "active" ? t("party.activeSkills") : t("party.passiveSkills");
    const footerText = this.formatLockedSlotFooter(slotIndex, preset, kind);

    const card = document.createElement("article");
    card.className =
      "skill-menu-skill-summary-card skill-menu-skill-summary-card--locked";
    card.setAttribute("role", "group");
    card.setAttribute("aria-label", t("party.lockedSlot"));

    const nameEl = document.createElement("div");
    nameEl.className = "skill-menu-skill-summary-card-name";
    nameEl.textContent = t("party.lockedSlot");

    const metaEl = document.createElement("div");
    metaEl.className = "skill-menu-skill-summary-card-meta";
    metaEl.textContent = `${kindLabel} · ${footerText}`;

    card.append(nameEl, metaEl);
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
    row.dataset.pickerClassId = classId;
    const assignedClassId = this.draftParty[this.selectedIndex]?.classId;
    if (classId === assignedClassId) {
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

  destroy(): void {
    this.unsubscribeLocale();
    this.gameTermTooltip.destroy();
    this.gameTermPanel.destroy();
    this.root.remove();
  }
}
