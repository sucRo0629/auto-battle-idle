import { resolveClassIconKey } from '../battle/classVisuals.ts';
import type {
  ClassPreset,
  GameData,
  PartyMemberState,
} from '../battle/types.ts';
import { getClassIconUrl } from '../render/IconRegistry.ts';
import {
  canEquipActive,
  cloneBuild,
  equipActiveSlot,
  getUnlockedActiveSlotCount,
  MAX_ACTIVE_SLOTS,
  normalizeEquippedSlots,
} from '../progression/skillBuild.ts';
import {
  formatActiveDescription,
  formatPassiveDescription,
} from './formatSkillText.ts';

export interface SkillMenuPanelCallbacks {
  onBuildChanged: (partyIndex: number, build: PartyMemberState['build']) => void;
  onBack: () => void;
}

export class SkillMenuPanel {
  private readonly root: HTMLElement;
  private readonly tabsEl: HTMLElement;
  private readonly bodyEl: HTMLElement;
  private readonly draftParty: PartyMemberState[];
  private selectedIndex = 0;
  private pickerSlotIndex: number | null = null;

  constructor(
    private readonly container: HTMLElement,
    private readonly gameData: GameData,
    sourceParty: PartyMemberState[],
    private readonly callbacks: SkillMenuPanelCallbacks,
  ) {
    this.draftParty = sourceParty.map((member) => ({
      classId: member.classId,
      progress: structuredClone(member.progress),
      build: normalizeEquippedSlots(cloneBuild(member.build)),
    }));

    this.root = document.createElement('div');
    this.root.className = 'meta-menu-screen skill-menu-panel';

    const header = document.createElement('div');
    header.className = 'skill-menu-header';

    const backButton = document.createElement('button');
    backButton.type = 'button';
    backButton.className = 'skill-menu-back';
    backButton.textContent = '← 戻る';
    backButton.addEventListener('click', () => this.callbacks.onBack());

    header.appendChild(backButton);

    this.tabsEl = document.createElement('div');
    this.tabsEl.className = 'skill-menu-tabs';
    this.tabsEl.addEventListener('click', (event) => {
      const tab = (event.target as Element | null)?.closest('.skill-menu-tab');
      if (!(tab instanceof HTMLButtonElement)) return;
      const index = Number(tab.dataset.memberIndex);
      if (Number.isNaN(index)) return;
      this.selectedIndex = index;
      this.pickerSlotIndex = null;
      this.render();
    });

    this.bodyEl = document.createElement('div');
    this.bodyEl.className = 'skill-menu-body';
    this.bodyEl.addEventListener('click', (event) => {
      const slot = (event.target as Element | null)?.closest('.skill-menu-slot');
      if (slot instanceof HTMLElement && slot.dataset.slotIndex !== undefined) {
        const slotIndex = Number(slot.dataset.slotIndex);
        if (Number.isNaN(slotIndex)) return;
        this.pickerSlotIndex = slotIndex;
        this.render();
        return;
      }

      const pickerRow = (event.target as Element | null)?.closest('.skill-menu-picker-row');
      if (!(pickerRow instanceof HTMLElement)) return;
      const skillId = pickerRow.dataset.skillId ?? '';
      const slotIndex = this.pickerSlotIndex;
      if (slotIndex === null) return;

      const member = this.draftParty[this.selectedIndex];
      if (!member) return;

      if (skillId && !canEquipActive(member.build, skillId, this.gameData, member.classId)) {
        return;
      }

      member.build = equipActiveSlot(member.build, skillId, slotIndex);
      this.commitBuildChange(this.selectedIndex);
      this.pickerSlotIndex = null;
      this.render();
    });

    this.root.append(header, this.tabsEl, this.bodyEl);
    this.container.appendChild(this.root);
    this.render();
  }

  private commitBuildChange(partyIndex: number): void {
    const member = this.draftParty[partyIndex];
    if (!member) return;
    member.build = normalizeEquippedSlots(member.build);
    this.callbacks.onBuildChanged(partyIndex, member.build);
  }

  private render(): void {
    this.renderTabs();
    this.renderBody();
  }

  private renderTabs(): void {
    this.tabsEl.replaceChildren();
    this.draftParty.forEach((member, index) => {
      const preset = this.gameData.classRegistry[member.classId];
      const label = preset?.displayName ?? member.classId;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'skill-menu-tab';
      if (index === this.selectedIndex) {
        button.classList.add('skill-menu-tab--active');
      }
      button.dataset.memberIndex = String(index);
      button.setAttribute('aria-label', label);
      button.appendChild(this.createTabIcon(preset, label));
      const labelEl = document.createElement('span');
      labelEl.className = 'skill-menu-tab-label';
      labelEl.textContent = label;
      button.appendChild(labelEl);
      this.tabsEl.appendChild(button);
    });
  }

  private createTabIcon(preset: ClassPreset | undefined, label: string): HTMLElement {
    const iconWrap = document.createElement('span');
    iconWrap.className = 'skill-menu-tab-icon';
    const img = document.createElement('img');
    img.className = 'skill-menu-tab-icon-img';
    img.alt = '';
    img.decoding = 'async';
    if (preset) {
      const iconKey = resolveClassIconKey(preset);
      img.src = getClassIconUrl(iconKey);
    }
    img.setAttribute('aria-hidden', 'true');
    iconWrap.title = label;
    iconWrap.appendChild(img);
    return iconWrap;
  }

  private renderBody(): void {
    const member = this.draftParty[this.selectedIndex];
    if (!member) {
      this.bodyEl.replaceChildren();
      return;
    }

    this.bodyEl.replaceChildren();

    if (this.pickerSlotIndex !== null) {
      this.bodyEl.appendChild(this.renderPicker(member, this.pickerSlotIndex));
      return;
    }

    const preset = this.gameData.classRegistry[member.classId];
    const summary = document.createElement('div');
    summary.className = 'skill-menu-member-summary';
    summary.textContent = `${preset?.displayName ?? member.classId} / Lv ${member.progress.level}`;
    this.bodyEl.appendChild(summary);

    this.bodyEl.appendChild(this.createActiveSlotsSection(member));
    this.bodyEl.appendChild(this.createPassiveSection(member));
  }

  private createActiveSlotsSection(member: PartyMemberState): HTMLElement {
    const unlockedCount = getUnlockedActiveSlotCount(member, this.gameData);
    const section = document.createElement('section');
    section.className = 'skill-menu-section';

    const heading = document.createElement('h3');
    heading.className = 'skill-menu-section-title';
    heading.textContent = 'アクティブスキル';

    const row = document.createElement('div');
    row.className = 'skill-menu-slot-row';

    for (let slotIndex = 0; slotIndex < MAX_ACTIVE_SLOTS; slotIndex++) {
      const skillId = member.build.equippedActiveSlots[slotIndex] ?? '';
      const def = skillId ? this.gameData.skillRegistry.actives[skillId] : undefined;
      const slot = document.createElement('button');
      slot.type = 'button';
      slot.className = 'skill-menu-slot';
      slot.dataset.slotIndex = String(slotIndex);

      if (skillId) {
        slot.classList.add('skill-menu-slot--filled');
      }

      if (slotIndex >= unlockedCount) {
        slot.classList.add('skill-menu-slot--locked');
        slot.disabled = true;
      }

      const nameEl = document.createElement('div');
      nameEl.className = 'skill-menu-slot-name';
      nameEl.textContent = def?.name ?? (skillId || '未セット');

      const descEl = document.createElement('div');
      descEl.className = 'skill-menu-slot-desc';
      if (def) {
        descEl.textContent = formatActiveDescription(def);
      } else if (slotIndex >= unlockedCount) {
        descEl.textContent = '未解放';
      } else {
        descEl.textContent = 'タップしてセット';
      }

      slot.append(nameEl, descEl);
      row.appendChild(slot);
    }

    section.append(heading, row);
    return section;
  }

  private createPassiveSection(member: PartyMemberState): HTMLElement {
    return this.createSection('パッシブ（常時発動）', () => {
      const list = document.createElement('div');
      list.className = 'skill-menu-skill-list';
      for (const skillId of member.build.learnedPassiveIds) {
        const def = this.gameData.skillRegistry.passives[skillId];
        list.appendChild(this.createSkillRow(
          def?.name ?? skillId,
          def ? formatPassiveDescription(def) : '',
        ));
      }
      return list;
    });
  }

  private renderPicker(member: PartyMemberState, slotIndex: number): HTMLElement {
    const picker = document.createElement('div');
    picker.className = 'skill-menu-picker';

    const heading = document.createElement('h3');
    heading.className = 'skill-menu-section-title';
    heading.textContent = `スロット ${slotIndex + 1} をセット`;

    const list = document.createElement('div');
    list.className = 'skill-menu-skill-list';

    list.appendChild(this.createPickerRow('外す', 'スロットを空にする', ''));

    for (const skillId of member.build.learnedActiveIds) {
      const def = this.gameData.skillRegistry.actives[skillId];
      if (!canEquipActive(member.build, skillId, this.gameData, member.classId)) {
        continue;
      }
      list.appendChild(this.createPickerRow(
        def?.name ?? skillId,
        def ? formatActiveDescription(def) : '',
        skillId,
      ));
    }

    picker.append(heading, list);
    return picker;
  }

  private createPickerRow(
    name: string,
    description: string,
    skillId: string,
  ): HTMLElement {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'skill-menu-picker-row';
    row.dataset.skillId = skillId;

    const nameEl = document.createElement('div');
    nameEl.className = 'skill-menu-skill-name';
    nameEl.textContent = name;

    const descEl = document.createElement('div');
    descEl.className = 'skill-menu-skill-desc';
    descEl.textContent = description;

    row.append(nameEl, descEl);
    return row;
  }

  private createSection(
    title: string,
    renderContent: () => HTMLElement,
  ): HTMLElement {
    const section = document.createElement('section');
    section.className = 'skill-menu-section';

    const heading = document.createElement('h3');
    heading.className = 'skill-menu-section-title';
    heading.textContent = title;

    section.append(heading, renderContent());
    return section;
  }

  private createSkillRow(name: string, description: string): HTMLElement {
    const row = document.createElement('div');
    row.className = 'skill-menu-skill-row';

    const nameEl = document.createElement('div');
    nameEl.className = 'skill-menu-skill-name';
    nameEl.textContent = name;

    const descEl = document.createElement('div');
    descEl.className = 'skill-menu-skill-desc';
    descEl.textContent = description;

    row.append(nameEl, descEl);
    return row;
  }

  destroy(): void {
    this.root.remove();
  }
}
