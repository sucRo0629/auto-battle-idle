import "../styles/skill-menu-panel.css";
import { MEMBER_STAT_LABELS } from "../battle/data/gameDataSchema.ts";
import {
  resolveClassIconKey,
  resolveClassSpriteKey,
} from "../battle/classVisuals.ts";
import type {
  ClassId,
  ClassPreset,
  GameData,
  PartyMemberState,
  PartySlotState,
} from "../battle/types.ts";
import { getClassIconUrl, getSkillIconUrl } from "../render/IconRegistry.ts";
import { getSpriteUrl } from "../render/SpriteRegistry.ts";
import {
  createMemberFromClass,
  getAssignableClassIds,
} from "../progression/partyCompose.ts";
import { type LevelCurvesConfig } from "../progression/levelGrowth.ts";
import { resolveMemberDisplayStats } from "../progression/memberStatsDisplay.ts";
import {
  canSetActive,
  cloneBuild,
  getUnlockedActiveSlotCount,
  MAX_ACTIVE_SLOTS,
  normalizeActiveSlots,
  setActiveSlot,
} from "../progression/skillBuild.ts";
import { resolveLearnedSkills } from "../progression/skillUnlocks.ts";
import {
  formatActiveDescription,
  formatPassiveDescription,
} from "./formatSkillText.ts";

type PickerTarget =
  | { kind: "class" }
  | { kind: "activeSkill"; slotIndex: number }
  | null;

export interface SkillMenuPanelCallbacks {
  onBuildChanged: (
    partyIndex: number,
    build: PartyMemberState["build"]
  ) => void;
  onPartySlotChanged: (slotIndex: number, member: PartySlotState) => void;
}

export class SkillMenuPanel {
  private readonly root: HTMLElement;
  private readonly formationBlockEl: HTMLElement;
  private readonly tabsEl: HTMLElement;
  private readonly bodyEl: HTMLElement;
  private readonly draftParty: PartySlotState[];
  private readonly unlockedClassIds: ClassId[];
  private selectedIndex = 0;
  private pickerTarget: PickerTarget = null;

  constructor(
    private readonly container: HTMLElement,
    private readonly gameData: GameData,
    private readonly levelCurves: LevelCurvesConfig,
    sourceParty: PartySlotState[],
    unlockedClassIds: ClassId[],
    private readonly callbacks: SkillMenuPanelCallbacks
  ) {
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

    const formationTitleEl = document.createElement("h3");
    formationTitleEl.className = "skill-menu-section-title";
    formationTitleEl.textContent = "編成枠";

    this.tabsEl = document.createElement("div");
    this.tabsEl.className = "skill-menu-tabs";
    this.tabsEl.addEventListener("click", (event) => {
      const tab = (event.target as Element | null)?.closest(".skill-menu-tab");
      if (!(tab instanceof HTMLButtonElement)) return;
      const index = Number(tab.dataset.memberIndex);
      if (Number.isNaN(index)) return;
      this.selectedIndex = index;
      this.pickerTarget = null;
      this.render();
    });

    this.bodyEl = document.createElement("div");
    this.bodyEl.className = "skill-menu-body";
    this.bodyEl.addEventListener("click", (event) => {
      const classSlot = (event.target as Element | null)?.closest(
        '[data-picker-kind="class"]'
      );
      if (classSlot instanceof HTMLElement) {
        this.pickerTarget = { kind: "class" };
        this.render();
        return;
      }

      const skillSlot = (event.target as Element | null)?.closest(
        ".skill-menu-skill-icon-slot"
      );
      if (
        skillSlot instanceof HTMLElement &&
        skillSlot.dataset.slotIndex !== undefined
      ) {
        if (skillSlot.dataset.locked === "true") return;
        const slotIndex = Number(skillSlot.dataset.slotIndex);
        if (Number.isNaN(slotIndex)) return;
        this.pickerTarget = { kind: "activeSkill", slotIndex };
        this.render();
        return;
      }

      const pickerRow = (event.target as Element | null)?.closest(
        ".skill-menu-picker-row"
      );
      if (!(pickerRow instanceof HTMLElement)) return;

      if (pickerRow.dataset.pickerAction === "cancel") {
        this.pickerTarget = null;
        this.render();
        return;
      }

      if (pickerRow.dataset.classId !== undefined) {
        this.handleClassPickerSelection(pickerRow.dataset.classId);
        return;
      }

      const skillId = pickerRow.dataset.skillId ?? "";
      if (this.pickerTarget?.kind !== "activeSkill") return;
      const slotIndex = this.pickerTarget.slotIndex;

      const member = this.draftParty[this.selectedIndex];
      if (!member) return;

      if (
        skillId &&
        !canSetActive(
          member.build,
          skillId,
          this.gameData,
          member.classId,
          slotIndex
        )
      ) {
        return;
      }

      member.build = setActiveSlot(member.build, skillId, slotIndex);
      this.commitBuildChange(this.selectedIndex);
      this.pickerTarget = null;
      this.render();
    });

    this.formationBlockEl.append(formationTitleEl, this.tabsEl);
    this.root.append(this.formationBlockEl, this.bodyEl);
    this.container.appendChild(this.root);
    this.render();
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
    this.pickerTarget = null;
    this.render();
  }

  private commitBuildChange(partyIndex: number): void {
    const member = this.draftParty[partyIndex];
    if (!member) return;
    member.build = normalizeActiveSlots(member.build);
    this.callbacks.onBuildChanged(partyIndex, member.build);
  }

  private render(): void {
    this.formationBlockEl.hidden = this.pickerTarget !== null;
    this.renderTabs();
    this.renderBody();
  }

  private renderTabs(): void {
    this.tabsEl.replaceChildren();
    this.draftParty.forEach((member, index) => {
      const preset = member
        ? this.gameData.classRegistry[member.classId]
        : undefined;
      const label = member ? preset?.displayName ?? member.classId : "空";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "skill-menu-tab";
      if (!member) {
        button.classList.add("skill-menu-tab--empty");
      }
      if (index === this.selectedIndex) {
        button.classList.add("skill-menu-tab--active");
      }
      button.dataset.memberIndex = String(index);
      button.setAttribute("aria-label", label);
      button.appendChild(this.createTabCharacterDisplay(preset, label));
      const labelEl = document.createElement("span");
      labelEl.className = "skill-menu-tab-label";
      labelEl.textContent = label;
      button.appendChild(labelEl);
      this.tabsEl.appendChild(button);
    });
  }

  /** 編成枠タブ上部。クラスごとの仮スプライト（将来は本番スプライトアニメに差し替え） */
  private createTabCharacterDisplay(
    preset: ClassPreset | undefined,
    label: string,
  ): HTMLElement {
    const character = document.createElement("span");
    character.className = "skill-menu-tab-character";

    const spriteWrap = document.createElement("span");
    spriteWrap.className = "skill-menu-tab-sprite";
    if (!preset) {
      spriteWrap.classList.add("skill-menu-tab-sprite--empty");
      spriteWrap.setAttribute("aria-hidden", "true");
    } else {
      const img = document.createElement("img");
      img.className = "skill-menu-tab-sprite-img skill-menu-tab-sprite-img--idle";
      img.alt = "";
      img.decoding = "async";
      img.src = getSpriteUrl(resolveClassSpriteKey(preset));
      img.setAttribute("aria-hidden", "true");
      spriteWrap.title = label;
      spriteWrap.appendChild(img);
    }

    character.appendChild(spriteWrap);
    return character;
  }

  private createIconWrap(
    preset: ClassPreset | undefined,
    label: string,
    iconUrl?: string
  ): HTMLElement {
    const iconWrap = document.createElement("span");
    iconWrap.className = "skill-menu-tab-icon";
    const img = document.createElement("img");
    img.className = "skill-menu-tab-icon-img";
    img.alt = "";
    img.decoding = "async";
    if (iconUrl) {
      img.src = iconUrl;
    } else if (preset) {
      img.src = getClassIconUrl(resolveClassIconKey(preset));
    }
    img.setAttribute("aria-hidden", "true");
    iconWrap.title = label;
    iconWrap.appendChild(img);
    return iconWrap;
  }

  private renderBody(): void {
    this.bodyEl.replaceChildren();
    const member = this.draftParty[this.selectedIndex];

    if (this.pickerTarget?.kind === "class") {
      this.bodyEl.appendChild(this.renderClassPicker());
      return;
    }

    if (member && this.pickerTarget?.kind === "activeSkill") {
      this.bodyEl.appendChild(
        this.renderSkillPicker(member, this.pickerTarget.slotIndex)
      );
      return;
    }

    this.bodyEl.appendChild(this.createClassSettingsSection(member));
    if (member) {
      this.bodyEl.appendChild(this.createPassiveSkillsSection(member));
    }
  }

  private createClassSettingsSection(
    member: PartyMemberState | null
  ): HTMLElement {
    const preset = member
      ? this.gameData.classRegistry[member.classId]
      : undefined;
    const section = document.createElement("section");
    section.className = "skill-menu-section skill-menu-section--compose";

    const classGroup = document.createElement("div");
    classGroup.className = "skill-menu-compose-group skill-menu-compose-group--class";

    const classHeading = document.createElement("h3");
    classHeading.className = "skill-menu-section-title";
    classHeading.textContent = "クラス設定";

    classGroup.append(classHeading);
    if (member && preset) {
      classGroup.appendChild(
        this.createStatsSection(member, preset)
      );
    }
    classGroup.appendChild(this.createClassSlotButton(member, preset));
    section.appendChild(classGroup);

    if (member) {
      const activeGroup = document.createElement("div");
      activeGroup.className =
        "skill-menu-compose-group skill-menu-compose-group--active";

      const activeHeading = document.createElement("h3");
      activeHeading.className = "skill-menu-section-title";
      activeHeading.textContent = "アクティブスキル";

      const activeSlots = document.createElement("div");
      activeSlots.className = "skill-menu-active-skill-slots";

      const unlockedCount = getUnlockedActiveSlotCount(member, this.gameData);
      for (let slotIndex = 0; slotIndex < MAX_ACTIVE_SLOTS; slotIndex++) {
        activeSlots.appendChild(
          this.createSkillIconSlot(member, slotIndex, unlockedCount)
        );
      }

      activeGroup.append(activeHeading, activeSlots);
      section.appendChild(activeGroup);
    }

    return section;
  }

  private createStatsSection(
    member: PartyMemberState,
    preset: ClassPreset
  ): HTMLElement {
    const stats = resolveMemberDisplayStats(
      preset,
      member.progress.level,
      this.levelCurves
    );

    const section = document.createElement("section");
    section.className = "skill-menu-stats";

    const heading = document.createElement("h4");
    heading.className = "skill-menu-stats-title";
    heading.textContent = `ステータス（Lv ${stats.level}）`;
    section.appendChild(heading);

    const grid = document.createElement("dl");
    grid.className = "skill-menu-stats-grid";

    const rows: { label: string; value: string; latin?: boolean }[] = [
      { label: MEMBER_STAT_LABELS.hp, value: String(stats.maxHp), latin: true },
      { label: MEMBER_STAT_LABELS.atk, value: String(stats.atk) },
      { label: MEMBER_STAT_LABELS.def, value: String(stats.def) },
      { label: MEMBER_STAT_LABELS.reg, value: String(stats.reg) },
      { label: MEMBER_STAT_LABELS.spd, value: stats.spdLabel },
    ];

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

  private createClassSlotButton(
    member: PartyMemberState | null,
    preset: ClassPreset | undefined
  ): HTMLElement {
    const slot = document.createElement("button");
    slot.type = "button";
    slot.className = "skill-menu-slot skill-menu-class-slot";
    slot.dataset.pickerKind = "class";

    if (member) {
      slot.classList.add("skill-menu-slot--filled");
    }

    const label = member ? preset?.displayName ?? member.classId : "未編成";
    slot.appendChild(this.createIconWrap(preset, label));

    const textWrap = document.createElement("span");
    textWrap.className = "skill-menu-class-slot-text";

    const nameEl = document.createElement("span");
    nameEl.className = "skill-menu-class-slot-name";
    nameEl.textContent = label;
    textWrap.appendChild(nameEl);

    if (member) {
      const levelEl = document.createElement("span");
      levelEl.className = "skill-menu-class-slot-level";
      levelEl.textContent = `Lv ${member.progress.level}`;
      textWrap.appendChild(levelEl);
    }

    slot.appendChild(textWrap);
    return slot;
  }

  private createSkillIconSlot(
    member: PartyMemberState,
    slotIndex: number,
    unlockedCount: number
  ): HTMLElement {
    const skillId = member.build.equippedActiveSlots[slotIndex] ?? "";
    const def = skillId
      ? this.gameData.skillRegistry.actives[skillId]
      : undefined;
    const label = def?.name ?? (skillId || "未セット");

    const slot = document.createElement("button");
    slot.type = "button";
    slot.className = "skill-menu-skill-icon-slot";
    slot.dataset.slotIndex = String(slotIndex);
    slot.setAttribute("aria-label", label);

    if (skillId) {
      slot.classList.add("skill-menu-skill-icon-slot--filled");
    }

    if (slotIndex >= unlockedCount) {
      slot.classList.add("skill-menu-skill-icon-slot--locked");
      slot.dataset.locked = "true";
      slot.setAttribute("aria-disabled", "true");
    }

    const iconUrl = skillId ? getSkillIconUrl(skillId) : undefined;
    slot.appendChild(this.createIconWrap(undefined, label, iconUrl));

    let tooltipDesc: string;
    if (slotIndex >= unlockedCount) {
      tooltipDesc = "未解放";
    } else if (def) {
      tooltipDesc = formatActiveDescription(def);
    } else {
      tooltipDesc = "タップしてセット";
    }
    slot.appendChild(this.createFloatingTooltip(label, tooltipDesc));

    return slot;
  }

  private createFloatingTooltip(
    name: string,
    description: string
  ): HTMLElement {
    const tooltip = document.createElement("div");
    tooltip.className = "skill-menu-floating-tooltip";
    tooltip.setAttribute("role", "tooltip");

    const nameEl = document.createElement("div");
    nameEl.className = "skill-menu-floating-tooltip-name";
    nameEl.textContent = name;

    const descEl = document.createElement("div");
    descEl.className = "skill-menu-floating-tooltip-desc";
    descEl.textContent = description;

    tooltip.append(nameEl, descEl);
    return tooltip;
  }

  private createPassiveSkillsSection(member: PartyMemberState): HTMLElement {
    const preset = this.gameData.classRegistry[member.classId];
    const learned = preset
      ? resolveLearnedSkills(
          preset,
          member.progress.level,
          this.gameData.skillRegistry
        )
      : { learnedPassiveIds: [] as string[], learnedActiveIds: [] as string[] };

    const section = document.createElement("section");
    section.className = "skill-menu-section";

    const heading = document.createElement("h3");
    heading.className = "skill-menu-section-title";
    heading.textContent = "パッシブスキル";

    const row = document.createElement("div");
    row.className = "skill-menu-skill-icon-row";

    for (const skillId of learned.learnedPassiveIds) {
      const def = this.gameData.skillRegistry.passives[skillId];
      row.appendChild(
        this.createPassiveIconSlot(
          skillId,
          def?.name ?? skillId,
          def ? formatPassiveDescription(def) : ""
        )
      );
    }

    section.append(heading, row);
    return section;
  }

  private createPassiveIconSlot(
    skillId: string,
    name: string,
    description: string
  ): HTMLElement {
    const slot = document.createElement("div");
    slot.className =
      "skill-menu-skill-icon-slot skill-menu-skill-icon-slot--passive skill-menu-skill-icon-slot--filled";
    slot.setAttribute("role", "img");
    slot.setAttribute("aria-label", name);
    slot.tabIndex = 0;

    slot.appendChild(
      this.createIconWrap(undefined, name, getSkillIconUrl(skillId))
    );
    slot.appendChild(this.createFloatingTooltip(name, description));
    return slot;
  }

  private renderClassPicker(): HTMLElement {
    const picker = document.createElement("div");
    picker.className = "skill-menu-picker";

    const heading = document.createElement("h3");
    heading.className = "skill-menu-section-title";
    heading.textContent = "クラスをセット";

    const list = document.createElement("div");
    list.className = "skill-menu-skill-list";

    list.appendChild(this.createCancelPickerRow());
    list.appendChild(
      this.createClassPickerRow("外す", "スロットを空にする", "")
    );

    for (const classId of getAssignableClassIds(
      this.draftParty,
      this.unlockedClassIds,
      this.selectedIndex
    )) {
      const preset = this.gameData.classRegistry[classId];
      list.appendChild(
        this.createClassPickerRow(
          preset?.displayName ?? classId,
          this.formatClassDescription(preset),
          classId,
          preset
        )
      );
    }

    picker.append(heading, list);
    return picker;
  }

  private formatClassDescription(preset: ClassPreset | undefined): string {
    if (!preset) return "";
    const rowLabels: Record<string, string> = {
      front: "前衛",
      middle: "中衛",
      back: "後衛",
    };
    const roleLabels: Record<string, string> = {
      defender: "ディフェンダー",
      attacker: "アタッカー",
      supporter: "サポーター",
    };
    return `${rowLabels[preset.formationRow] ?? preset.formationRow} / ${
      roleLabels[preset.role] ?? preset.role
    }`;
  }

  private renderSkillPicker(
    member: PartyMemberState,
    slotIndex: number
  ): HTMLElement {
    const picker = document.createElement("div");
    picker.className = "skill-menu-picker";

    const heading = document.createElement("h3");
    heading.className = "skill-menu-section-title";
    heading.textContent = `スロット ${slotIndex + 1} をセット`;

    const list = document.createElement("div");
    list.className = "skill-menu-skill-list";

    list.appendChild(this.createCancelPickerRow());
    list.appendChild(
      this.createSkillPickerRow("外す", "スロットを空にする", "")
    );

    for (const skillId of member.build.learnedActiveIds) {
      const def = this.gameData.skillRegistry.actives[skillId];
      if (
        !canSetActive(
          member.build,
          skillId,
          this.gameData,
          member.classId,
          slotIndex
        )
      ) {
        continue;
      }
      list.appendChild(
        this.createSkillPickerRow(
          def?.name ?? skillId,
          def ? formatActiveDescription(def) : "",
          skillId
        )
      );
    }

    picker.append(heading, list);
    return picker;
  }

  private createCancelPickerRow(): HTMLElement {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "skill-menu-picker-row";
    row.dataset.pickerAction = "cancel";

    const nameEl = document.createElement("div");
    nameEl.className = "skill-menu-skill-name";
    nameEl.textContent = "キャンセル";

    const descEl = document.createElement("div");
    descEl.className = "skill-menu-skill-desc";
    descEl.textContent = "変更せず戻る";

    row.append(nameEl, descEl);
    return row;
  }

  private createClassPickerRow(
    name: string,
    description: string,
    classId: string,
    preset?: ClassPreset
  ): HTMLElement {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "skill-menu-picker-row skill-menu-picker-row--icon";
    row.dataset.classId = classId;

    if (preset) {
      row.appendChild(this.createIconWrap(preset, name));
    } else {
      row.appendChild(this.createIconWrap(undefined, name));
    }

    const text = document.createElement("div");
    text.className = "skill-menu-picker-row-text";

    const nameEl = document.createElement("div");
    nameEl.className = "skill-menu-skill-name";
    nameEl.textContent = name;

    const descEl = document.createElement("div");
    descEl.className = "skill-menu-skill-desc";
    descEl.textContent = description;

    text.append(nameEl, descEl);
    row.appendChild(text);
    return row;
  }

  private createSkillPickerRow(
    name: string,
    description: string,
    skillId: string
  ): HTMLElement {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "skill-menu-picker-row skill-menu-picker-row--icon";
    row.dataset.skillId = skillId;

    const iconUrl = skillId ? getSkillIconUrl(skillId) : undefined;
    row.appendChild(this.createIconWrap(undefined, name, iconUrl));

    const text = document.createElement("div");
    text.className = "skill-menu-picker-row-text";

    const nameEl = document.createElement("div");
    nameEl.className = "skill-menu-skill-name";
    nameEl.textContent = name;

    const descEl = document.createElement("div");
    descEl.className = "skill-menu-skill-desc";
    descEl.textContent = description;

    text.append(nameEl, descEl);
    row.appendChild(text);
    return row;
  }

  destroy(): void {
    this.root.remove();
  }
}
