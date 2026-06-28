import "../styles/skill-menu-panel.css";
import { MEMBER_STAT_LABELS } from "../battle/data/gameDataSchema.ts";
import {
  resolveClassIconKey,
  resolveClassSpriteKey,
} from "../render/entityVisuals.ts";
import type {
  ActiveSkillDef,
  ClassId,
  ClassPreset,
  GameData,
  PassiveSkillDef,
  PartyMemberState,
  PartySlotState,
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
import { formatSkillCardLines } from "./formatSkillText.ts";
import { annotateGameTerms } from "./annotateGameTerms.ts";
import { GameTermPanel } from "./GameTermPanel.ts";

const FORMATION_ROW_LABELS: Record<string, string> = {
  front: "前衛",
  middle: "中衛",
  back: "後衛",
};

const ROLE_LABELS: Record<string, string> = {
  defender: "ディフェンダー",
  attacker: "アタッカー",
  supporter: "サポーター",
};

const PICKER_ROLE_BLOCKS: { role: ClassPreset["role"]; label: string }[] = [
  { role: "defender", label: "ディフェンダー" },
  { role: "attacker", label: "アタッカー" },
  { role: "supporter", label: "サポーター" },
];

type PickerTarget = { kind: "class" } | null;

export interface SkillMenuPanelCallbacks {
  onBuildChanged: (
    partyIndex: number,
    build: PartyMemberState["build"]
  ) => void;
  onPartySlotChanged: (slotIndex: number, member: PartySlotState) => void;
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
    noteEl.textContent =
      "メンバー枠の並びは戦闘位置に影響しません。前衛 / 後衛はクラスごとに決まります。";

    this.rosterSlotsEl = document.createElement("div");
    this.rosterSlotsEl.className = "skill-menu-roster-slots";
    this.rosterSlotsEl.dataset.section = "roster-slots";
    this.rosterSlotsEl.addEventListener("click", (event) => {
      const card = (event.target as Element | null)?.closest(".skill-menu-roster-card");
      if (!(card instanceof HTMLButtonElement)) return;
      const index = Number(card.dataset.memberIndex);
      if (Number.isNaN(index)) return;
      this.selectedIndex = index;
      if (!this.draftParty[index]) {
        this.pickerTarget = { kind: "class" };
      } else {
        this.pickerTarget = null;
      }
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
        this.pickerTarget = { kind: "class" };
        this.render();
      }
    });

    this.pickerOverlayEl = document.createElement("div");
    this.pickerOverlayEl.className = "skill-menu-picker-overlay";
    this.pickerOverlayEl.hidden = true;
    this.pickerOverlayEl.addEventListener("click", (event) => {
      if (event.target === this.pickerOverlayEl) {
        this.pickerTarget = null;
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
      }
    });

    this.detailWrapEl = document.createElement("div");
    this.detailWrapEl.className = "skill-menu-detail-wrap";
    this.detailWrapEl.append(this.bodyEl);

    this.gameTermPanel = new GameTermPanel(this.root, {
      locale: "ja",
      detailScrollRoot: this.bodyEl,
    });
    this.gameTermPanel.mount();

    this.formationBlockEl.append(this.rosterSlotsEl, noteEl);
    this.root.append(
      this.formationBlockEl,
      this.detailWrapEl
    );
    this.pickerHost.appendChild(this.pickerOverlayEl);
    this.container.appendChild(this.root);
    this.render();
  }

  private getPlayerLevel(): number {
    return resolvePlayerDisplayLevel(this.draftParty);
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

  private render(): void {
    this.renderRoster();
    this.renderBody();
    this.renderPickerOverlay();
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
        const ariaParts = [
          preset.displayName,
          FORMATION_ROW_LABELS[preset.formationRow] ?? preset.formationRow,
          ROLE_LABELS[preset.role] ?? preset.role,
        ];
        button.setAttribute("aria-label", ariaParts.join(" "));
        button.appendChild(this.createRosterCharacterDisplay(preset));
        button.appendChild(this.createRosterTextBlock(preset));
      } else {
        button.setAttribute("aria-label", "空き枠");
        const plusEl = document.createElement("span");
        plusEl.className = "skill-menu-roster-card-plus";
        plusEl.textContent = "＋";
        plusEl.setAttribute("aria-hidden", "true");
        const hintEl = document.createElement("span");
        hintEl.className = "skill-menu-roster-card-empty-label";
        hintEl.textContent = "クラスを追加";
        button.append(plusEl, hintEl);
      }

      this.rosterSlotsEl.appendChild(button);
    });
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

    const metaEl = document.createElement("span");
    metaEl.className = "skill-menu-roster-card-meta";
    metaEl.textContent = this.formatClassFormationRole(preset);

    wrap.append(nameEl, epithetEl, metaEl);
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
    message.textContent = "クラスを選んでください";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "skill-menu-open-picker-button";
    button.dataset.action = "open-class-picker";
    button.textContent = "クラスを選ぶ";

    section.append(message, button);
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
    heading.textContent = "クラス情報";

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

    const changeButton = document.createElement("button");
    changeButton.type = "button";
    changeButton.className =
      "skill-menu-open-picker-button skill-menu-open-picker-button--inline";
    changeButton.dataset.action = "open-class-picker";
    changeButton.textContent = "変更";

    topRow.append(identityWrap, changeButton);

    const metaEl = document.createElement("div");
    metaEl.className = "skill-menu-class-info-meta";
    metaEl.textContent = this.formatClassFormationRole(preset);

    textWrap.append(topRow, metaEl);
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
    heading.textContent = "ステータス";
    section.appendChild(heading);

    const grid = document.createElement("dl");
    grid.className = "skill-menu-stats-grid";

    const rows: { label: string; value: string; latin?: boolean }[] = [
      { label: MEMBER_STAT_LABELS.hp, value: String(stats.maxHp), latin: true },
      { label: MEMBER_STAT_LABELS.atk, value: String(stats.atk) },
      { label: MEMBER_STAT_LABELS.def, value: String(stats.def) },
      { label: MEMBER_STAT_LABELS.reg, value: String(stats.reg) + "%" },
      { label: MEMBER_STAT_LABELS.spd, value: stats.spdLabel },
    ];

    const basicAttack = resolveMemberBasicAttackDisplay(
      preset,
      this.gameData.skillRegistry
    );
    if (basicAttack) {
      rows.push(
        { label: MEMBER_STAT_LABELS.range, value: basicAttack.rangeLabel },
        {
          label: MEMBER_STAT_LABELS.basicAttack,
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
    heading.textContent = "Active Skills";

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
      list.appendChild(this.createLockedSlotCard(slotIndex));
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
    heading.textContent = "Passive Skills";

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
      list.appendChild(this.createLockedSlotCard(slotIndex));
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
      const lines = formatSkillCardLines(def, { locale: "ja" });

      const metaEl = document.createElement("div");
      metaEl.className = "skill-menu-skill-view-card-meta";
      metaEl.textContent = lines.metaLine;
      card.appendChild(metaEl);

      const effectsEl = document.createElement("div");
      effectsEl.className = "skill-menu-skill-view-card-effects";
      for (const line of lines.effectLines) {
        const lineEl = document.createElement("div");
        lineEl.className = "skill-menu-skill-view-card-effect-line";
        lineEl.appendChild(
          annotateGameTerms(
            line,
            "ja",
            (termId, anchor) => {
              this.gameTermPanel.openFromTerm(termId, anchor);
            },
            { panelId: this.gameTermPanel.getPanelId() },
          ),
        );
        effectsEl.appendChild(lineEl);
      }
      card.appendChild(effectsEl);
    }

    const footer = document.createElement("div");
    footer.className = "skill-menu-skill-view-card-footer";
    if (unlockLevel !== undefined) {
      footer.textContent =
        unlockLevel <= 0
          ? "初期習得"
          : `プレイヤー Lv${unlockLevel} で習得`;
    }
    card.appendChild(footer);

    return card;
  }

  private createLockedSlotCard(slotIndex: number): HTMLElement {
    const card = document.createElement("article");
    card.className =
      "skill-menu-skill-view-card skill-menu-skill-view-card--locked";
    card.setAttribute("role", "group");
    card.setAttribute("aria-label", "未解放枠");

    const footer = document.createElement("div");
    footer.className = "skill-menu-skill-view-card-footer";
    footer.textContent = this.formatLockedSlotFooter(slotIndex);
    card.appendChild(footer);
    return card;
  }

  private formatLockedSlotFooter(slotIndex: number): string {
    const unlockLevel = slotIndex < 2 ? 0 : slotIndex === 2 ? 10 : 20;
    return `プレイヤー Lv${unlockLevel} で追加`;
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

    const modal = document.createElement("div");
    modal.className = "skill-menu-picker-modal";

    const heading = document.createElement("h3");
    heading.className = "skill-menu-picker-modal-title";
    heading.textContent = "クラスを選ぶ";

    const actions = document.createElement("div");
    actions.className = "skill-menu-picker-actions";
    actions.append(
      this.createCancelPickerRow(),
      this.createClassPickerRow("外す", "スロットを空にする", "")
    );

    const assignable = getAssignableClassIds(
      this.draftParty,
      this.unlockedClassIds,
      this.selectedIndex,
      this.gameData.classOrder
    );

    const blocks = document.createElement("div");
    blocks.className = "skill-menu-picker-role-blocks";

    for (const block of PICKER_ROLE_BLOCKS) {
      const classIds = assignable.filter(
        (classId) => this.gameData.classRegistry[classId]?.role === block.role
      );
      if (classIds.length === 0) continue;

      const blockEl = document.createElement("section");
      blockEl.className = "skill-menu-picker-role-block";

      const blockHeading = document.createElement("h4");
      blockHeading.className = "skill-menu-picker-role-heading";
      blockHeading.textContent = block.label;
      blockEl.appendChild(blockHeading);

      const list = document.createElement("div");
      list.className = "skill-menu-picker-role-list";
      for (const classId of classIds) {
        const preset = this.gameData.classRegistry[classId];
        list.appendChild(
          this.createClassPickerRow(
            preset?.displayName ?? classId,
            this.formatClassFormationRole(preset),
            classId,
            preset
          )
        );
      }
      blockEl.appendChild(list);
      blocks.appendChild(blockEl);
    }

    modal.append(heading, actions, blocks);
    modal.scrollTop = 0;
    this.pickerOverlayEl.appendChild(modal);
  }

  private formatClassFormationRole(preset: ClassPreset | undefined): string {
    if (!preset) return "";
    const row =
      FORMATION_ROW_LABELS[preset.formationRow] ?? preset.formationRow;
    const role = ROLE_LABELS[preset.role] ?? preset.role;
    return `${row} / ${role}`;
  }

  private createCancelPickerRow(): HTMLElement {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "skill-menu-picker-row skill-menu-picker-row--icon";
    row.dataset.pickerAction = "cancel";

    row.appendChild(this.createIconWrap(undefined, ""));

    const text = document.createElement("div");
    text.className = "skill-menu-picker-row-text";

    const nameEl = document.createElement("div");
    nameEl.className = "skill-menu-skill-name";
    nameEl.textContent = "キャンセル";

    const descEl = document.createElement("div");
    descEl.className = "skill-menu-skill-desc";
    descEl.textContent = "変更せず戻る";

    text.append(nameEl, descEl);
    row.appendChild(text);
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

    row.appendChild(this.createIconWrap(preset, name));

    const text = document.createElement("div");
    text.className = "skill-menu-picker-row-text";

    if (preset?.epithetEn) {
      const epithetEl = document.createElement("div");
      epithetEl.className = "skill-menu-picker-row-epithet";
      epithetEl.textContent = preset.epithetEn;
      text.appendChild(epithetEl);
    }

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
    this.gameTermPanel.destroy();
    this.pickerOverlayEl.remove();
    this.root.remove();
  }
}
