import type { AttackSpeedTier, EnemyTemplate } from '../battle/types.ts';
import type { ClassPresetBeforeEnrich } from '../progression/skillUnlocks.ts';
import { BalanceEditorStep } from './BalanceEditorStep.ts';
import { ClassEditorStep, loadClassDraftById } from './ClassEditorStep.ts';
import { EnemyEditorStep, loadEnemyDraftById } from './EnemyEditorStep.ts';
import {
  buildClassPresetFromDraft,
  buildEnemyFromDraft,
  buildSkillDrafts,
  collectSkillsFromDrafts,
  createBalanceRowsFromClasses,
  createEmptyClassDraft,
  createEmptyEnemyDraft,
  createInitialEnemySkillEntries,
  defaultBasicAttackId,
  ensureClassBasicAttackPool,
  ensureClassGrowthFields,
  fetchClasses,
  fetchEnemies,
  fetchSkills,
  initClassSkillEntriesFromPreset,
  initEnemySkillEntriesFromPreset,
  isBalanceRowDirty,
  isBasicAttackSkillId,
  isEnemyBasicAttackEntry,
  nextClassSkillId,
  resyncEnemyBasicAttackEntry,
  saveClassBundle,
  saveClassStatsBulk,
  saveEnemyBundle,
  toClassStatsPatch,
  type BalanceClassRow,
  type ClassDraft,
  type EnemyDraft,
  type SkillDraftEntry,
  type SkillSlotKind,
  type SkillsJson,
} from './editorApi.ts';
import {
  renderClassIdentity,
  renderEntityPicker,
  SkillEditorStep,
} from './SkillEditorStep.ts';
import { createActionButton, createButton, createEl, preserveScrollDuring } from './formUtils.ts';

type EditorTab = 'class' | 'enemy' | 'balance';

export class EditorApp {
  private tab: EditorTab = 'class';
  private classes: ClassPresetBeforeEnrich[] = [];
  private enemies: EnemyTemplate[] = [];
  private skills: SkillsJson = { passives: [], actives: [] };

  private classDraft: ClassDraft = createEmptyClassDraft();
  private selectedClassId = '';
  private classSkillEntries: SkillDraftEntry[] = [];

  private enemyDraft: EnemyDraft = createEmptyEnemyDraft();
  private selectedEnemyId = '';
  private enemySkillEntries: SkillDraftEntry[] = [];

  private balanceRows: BalanceClassRow[] = [];
  private balanceJobTier = 1;

  private saving = false;
  private statusMessage = '';
  private statusIsError = false;

  private classStep: ClassEditorStep | null = null;
  private enemyStep: EnemyEditorStep | null = null;
  private skillStep: SkillEditorStep | null = null;
  private balanceStep: BalanceEditorStep | null = null;

  private statusEl!: HTMLElement;
  private contentEl!: HTMLElement;

  constructor(private root: HTMLElement) {
    this.buildShell();
    void this.loadData();
  }

  private buildShell(): void {
    this.root.replaceChildren();

    const header = createEl('header', 'editor-header');
    header.appendChild(createEl('h1', 'editor-title', 'データ編集（開発用）'));
    header.appendChild(
      createEl(
        'p',
        'editor-subtitle',
        'classes.json / skills.json / enemies.json を編集します。保存後はゲームを再読み込みしてください。',
      ),
    );
    this.root.appendChild(header);

    const tabs = createEl('nav', 'editor-tabs');
    this.root.appendChild(tabs);
    this.renderTabs(tabs);

    this.statusEl = createEl('div', 'editor-status');
    this.root.appendChild(this.statusEl);

    this.contentEl = createEl('main', 'editor-content');
    this.root.appendChild(this.contentEl);
  }

  private renderTabs(tabs: HTMLElement): void {
    tabs.replaceChildren();
    const items: { id: EditorTab; label: string }[] = [
      { id: 'class', label: 'クラス' },
      { id: 'enemy', label: '敵' },
      { id: 'balance', label: 'バランス' },
    ];
    for (const item of items) {
      const btn = createButton(item.label, 'editor-tab', () => {
        if (this.saving) return;
        if (this.tab === item.id) return;
        this.tab = item.id;
        this.clearStatus();
        this.render();
      });
      if (this.tab === item.id) btn.classList.add('is-active');
      btn.disabled = this.saving;
      tabs.appendChild(btn);
    }
  }

  private async loadData(): Promise<void> {
    try {
      const [classes, enemies, skills] = await Promise.all([
        fetchClasses(),
        fetchEnemies(),
        fetchSkills(),
      ]);
      this.classes = classes;
      this.enemies = enemies;
      this.skills = skills;
      this.syncBalanceRowsFromClasses();
      this.render();
    } catch (error) {
      this.setStatus(
        error instanceof Error ? error.message : 'データの読み込みに失敗しました',
        true,
      );
    }
  }

  private setStatus(message: string, isError: boolean): void {
    this.statusMessage = message;
    this.statusIsError = isError;
    this.renderStatus();
  }

  private clearStatus(): void {
    this.statusMessage = '';
    this.statusIsError = false;
    this.renderStatus();
  }

  private renderStatus(): void {
    this.statusEl.className = 'editor-status';
    if (!this.statusMessage) {
      this.statusEl.replaceChildren();
      return;
    }
    if (this.statusIsError) this.statusEl.classList.add('is-error');
    else this.statusEl.classList.add('is-success');
    this.statusEl.textContent = this.statusMessage;
  }

  private render(): void {
    const tabs = this.root.querySelector('.editor-tabs');
    if (tabs) this.renderTabs(tabs as HTMLElement);
    this.renderStatus();

    this.classStep?.destroy();
    this.enemyStep?.destroy();
    this.skillStep?.destroy();
    this.balanceStep?.destroy();
    this.classStep = null;
    this.enemyStep = null;
    this.skillStep = null;
    this.balanceStep = null;

    preserveScrollDuring(() => {
      this.contentEl.replaceChildren();

      if (this.tab === 'class') {
        this.renderClassEditor();
        return;
      }

      if (this.tab === 'balance') {
        this.renderBalanceEditor();
        return;
      }

      this.renderEnemyEditor();
    });
  }

  private renderClassEditor(): void {
    const classOptions = this.buildClassSkillOptions();
    const headerHost = createEl('div', 'editor-panel editor-panel-header');
    const classHost = createEl('div', 'editor-panel editor-panel-class');
    const skillsHost = createEl('div', 'editor-panel editor-panel-skills');
    this.contentEl.appendChild(headerHost);
    this.contentEl.appendChild(classHost);
    this.contentEl.appendChild(skillsHost);

    if (classOptions.entityPicker) {
      renderEntityPicker(headerHost, classOptions.entityPicker);
    }
    if (classOptions.classIdentity) {
      renderClassIdentity(headerHost, classOptions.classIdentity);
    }

    this.classStep = new ClassEditorStep(classHost, {
      getDraft: () => this.classDraft,
      classes: this.classes,
      selectedClassId: this.selectedClassId,
      onDraftChange: (draft) => {
        this.classDraft = draft;
      },
      onSelectClass: (classId) => this.selectClass(classId),
      onSave: () => void this.saveClass(),
      saving: this.saving,
      hidePicker: true,
      hideSave: true,
    });

    this.skillStep = new SkillEditorStep(skillsHost, {
      ...classOptions,
      hideSave: true,
      hideEntityHeader: true,
    });

    this.appendSaveActions(() => void this.saveClass());
  }

  private renderBalanceEditor(): void {
    const host = createEl('div', 'editor-panel editor-panel-balance');
    this.contentEl.appendChild(host);

    this.balanceStep = new BalanceEditorStep(host, {
      getRows: () => this.balanceRows,
      jobTier: this.balanceJobTier,
      onJobTierChange: (tier) => {
        this.balanceJobTier = tier;
        this.render();
      },
      onRowChange: (classId, mutate) => {
        const row = this.balanceRows.find((entry) => entry.id === classId);
        if (!row) return;
        mutate(row.current);
        ensureClassGrowthFields(row.current);
        this.balanceStep?.refreshRow(classId);
      },
      onSave: () => void this.saveBalance(),
      saving: this.saving,
    });
  }

  private syncBalanceRowsFromClasses(): void {
    this.balanceRows = createBalanceRowsFromClasses(this.classes);
  }

  private async saveBalance(): Promise<void> {
    const dirtyRows = this.balanceRows.filter(isBalanceRowDirty);
    if (dirtyRows.length === 0) return;

    this.tab = 'balance';
    this.saving = true;
    this.render();
    try {
      const patches = dirtyRows.map((row) => toClassStatsPatch(row.current));
      await saveClassStatsBulk(patches);
      this.classes = await fetchClasses();
      this.syncBalanceRowsFromClasses();
      this.setStatus(`保存しました: ${patches.length} 件`, false);
    } catch (error) {
      this.setStatus(
        error instanceof Error ? error.message : '保存に失敗しました',
        true,
      );
    } finally {
      this.saving = false;
      this.tab = 'balance';
      this.render();
    }
  }

  private renderEnemyEditor(): void {
    if (this.enemySkillEntries.length === 0) {
      this.enemySkillEntries = createInitialEnemySkillEntries(this.skills);
    }
    const enemyOptions = this.buildEnemySkillOptions();
    const headerHost = createEl('div', 'editor-panel editor-panel-header');
    const enemyHost = createEl('div', 'editor-panel editor-panel-enemy');
    const skillsHost = createEl('div', 'editor-panel editor-panel-skills');
    this.contentEl.appendChild(headerHost);
    this.contentEl.appendChild(enemyHost);
    this.contentEl.appendChild(skillsHost);

    if (enemyOptions.entityPicker) {
      renderEntityPicker(headerHost, enemyOptions.entityPicker);
    }

    this.enemyStep = new EnemyEditorStep(enemyHost, {
      getDraft: () => this.enemyDraft,
      enemies: this.enemies,
      selectedEnemyId: this.selectedEnemyId,
      onDraftChange: (draft) => {
        const prevId = this.enemyDraft.enemy.id.trim();
        this.enemyDraft = draft;
        const nextId = draft.enemy.id.trim();
        if (nextId) {
          this.enemyDraft.enemy.basicAttackSkillId = defaultBasicAttackId(nextId);
        } else {
          this.enemyDraft.enemy.basicAttackSkillId = '';
        }
        if (nextId !== prevId) {
          this.enemySkillEntries = resyncEnemyBasicAttackEntry(
            this.enemySkillEntries,
            nextId,
            this.skills,
          );
          this.refreshSkillEditor();
        }
      },
      onSelectEnemy: (enemyId) => this.selectEnemy(enemyId),
      onSave: () => void this.saveEnemy(),
      saving: this.saving,
      hidePicker: true,
      hideSkillIds: true,
      hideSave: true,
    });

    this.skillStep = new SkillEditorStep(skillsHost, {
      ...enemyOptions,
      hideSave: true,
      hideEntityHeader: true,
    });

    this.appendSaveActions(() => void this.saveEnemy());
  }

  private appendSaveActions(onSave: () => void): void {
    const actions = createEl('div', 'editor-actions');
    const saveBtn = createActionButton(
      this.saving ? '保存中…' : '保存',
      'editor-btn editor-btn-primary',
      onSave,
    );
    saveBtn.disabled = this.saving;
    actions.appendChild(saveBtn);
    this.contentEl.appendChild(actions);
  }

  private refreshSkillEditor(): void {
    if (this.tab === 'class' && this.skillStep) {
      this.skillStep.update({
        ...this.buildClassSkillOptions(),
        hideSave: true,
        hideEntityHeader: true,
      });
      return;
    }
    if (this.tab === 'enemy' && this.skillStep) {
      this.skillStep.update({
        ...this.buildEnemySkillOptions(),
        hideSave: true,
        hideEntityHeader: true,
      });
    }
  }

  private buildClassSkillOptions() {
    return {
      getEntries: () => this.classSkillEntries,
      onChange: (next: SkillDraftEntry[]) => {
        this.classSkillEntries = next;
      },
      isIdReadonly: (entry: SkillDraftEntry) =>
        entry.ref.kind === 'active' &&
        isBasicAttackSkillId(entry.ref.skillId, this.classDraft.class.id),
      onSkillIdChange: (_oldId: string, _newId: string, _kind: SkillSlotKind) => {},
      onRemoveSkill: (index: number) => {
        this.removeClassSkill(index);
      },
      entityPicker: {
        label: '既存クラス',
        items: this.classes.map((cls) => ({
          id: cls.id,
          label: `${cls.displayName} (${cls.id})`,
        })),
        selectedId: this.selectedClassId,
        onSelect: (classId: string) => this.selectClass(classId),
      },
      classIdentity: {
        classId: this.classDraft.class.id,
        displayName: this.classDraft.class.displayName,
        onClassIdChange: (classId: string) => {
          this.classDraft.class.id = classId;
          const trimmed = classId.trim();
          const prevCount = this.classSkillEntries.length;
          if (trimmed) {
            this.classDraft.class.basicAttackSkillId = defaultBasicAttackId(trimmed);
            this.classSkillEntries = ensureClassBasicAttackPool(
              trimmed,
              this.classSkillEntries,
              this.skills,
            );
          } else {
            this.classSkillEntries = [];
          }
          if (this.classSkillEntries.length !== prevCount) {
            this.render();
          }
        },
        onDisplayNameChange: (displayName: string) => {
          this.classDraft.class.displayName = displayName;
        },
      },
      onAddSkill: (kind: SkillSlotKind) => {
        this.addClassSkill(kind);
      },
      onSave: () => void this.saveClass(),
      saving: this.saving,
    };
  }

  private buildEnemySkillOptions() {
    const enemyId = this.enemyDraft.enemy.id.trim();
    return {
      getEntries: () => this.enemySkillEntries,
      onChange: (next: SkillDraftEntry[]) => {
        this.enemySkillEntries = next;
      },
      isIdReadonly: (entry: SkillDraftEntry) =>
        isEnemyBasicAttackEntry(entry, enemyId),
      basicAttackSpeedTier: {
        get: (): AttackSpeedTier =>
          this.enemyDraft.enemy.attackSpeedTier ?? 'normal',
        onChange: (tier: AttackSpeedTier) => {
          this.enemyDraft.enemy.attackSpeedTier = tier;
        },
      },
      onSkillIdChange: (oldId: string, newId: string, kind: SkillSlotKind) => {
        if (
          kind === 'active' &&
          isEnemyBasicAttackEntry({ ref: { skillId: oldId, kind: 'active' } }, enemyId)
        ) {
          this.enemyDraft.enemy.basicAttackSkillId = newId;
          return;
        }
        this.applyEnemySkillIdRename(oldId, newId, kind);
      },
      onAddSkill: (kind: SkillSlotKind) => {
        this.addEnemySkill(kind);
      },
      onRemoveSkill: (index: number) => {
        const entry = this.enemySkillEntries[index];
        if (entry && isEnemyBasicAttackEntry(entry, enemyId)) {
          return;
        }
        this.enemySkillEntries = this.enemySkillEntries.filter((_, i) => i !== index);
        this.refreshSkillEditor();
      },
      entityPicker: {
        label: '既存の敵',
        items: this.enemies.map((enemy) => ({
          id: enemy.id,
          label: `${enemy.displayName} (${enemy.id})`,
        })),
        selectedId: this.selectedEnemyId,
        onSelect: (enemyId: string) => this.selectEnemy(enemyId),
      },
      onSave: () => void this.saveEnemy(),
      saving: this.saving,
    };
  }

  private selectClass(classId: string): void {
    this.selectedClassId = classId;
    this.classDraft = loadClassDraftById(this.classes, classId);
    this.classSkillEntries = initClassSkillEntriesFromPreset(this.classDraft.class, this.skills);
    this.render();
  }

  private selectEnemy(enemyId: string): void {
    this.selectedEnemyId = enemyId;
    this.enemyDraft = loadEnemyDraftById(this.enemies, enemyId);
    this.enemySkillEntries = initEnemySkillEntriesFromPreset(
      this.enemyDraft.enemy,
      this.skills,
    );
    this.render();
  }

  private addClassSkill(kind: SkillSlotKind): void {
    const classId = this.classDraft.class.id.trim();
    if (!classId) {
      this.setStatus('classId を入力してください', true);
      return;
    }
    this.classDraft.class.basicAttackSkillId = defaultBasicAttackId(classId);
    this.classSkillEntries = ensureClassBasicAttackPool(
      classId,
      this.classSkillEntries,
      this.skills,
    );
    const skillId = nextClassSkillId(classId, kind, this.classSkillEntries);
    const built = buildSkillDrafts([{ skillId, kind }], this.skills).map((entry) => ({
      ...entry,
      unlockLevel: 0,
    }));
    this.classSkillEntries = [...this.classSkillEntries, ...built];
    this.refreshSkillEditor();
  }

  private addEnemySkill(kind: SkillSlotKind): void {
    const enemyId = this.enemyDraft.enemy.id.trim();
    if (!enemyId) {
      this.setStatus('enemyId を入力してください', true);
      return;
    }
    const skillId = nextClassSkillId(enemyId, kind, this.enemySkillEntries);
    const built = buildSkillDrafts([{ skillId, kind }], this.skills);
    this.enemySkillEntries = [...this.enemySkillEntries, ...built];
    this.refreshSkillEditor();
  }

  private removeClassSkill(index: number): void {
    const entry = this.classSkillEntries[index];
    if (!entry) return;
    if (
      entry.ref.kind === 'active' &&
      isBasicAttackSkillId(entry.ref.skillId, this.classDraft.class.id)
    ) {
      return;
    }
    this.classSkillEntries = this.classSkillEntries.filter((_, i) => i !== index);
    this.refreshSkillEditor();
  }

  private applyEnemySkillIdRename(oldId: string, newId: string, kind: SkillSlotKind): void {
    const draft = structuredClone(this.enemyDraft);
    if (kind === 'passive') {
      draft.passiveIds = draft.passiveIds.map((id) => (id === oldId ? newId : id));
    } else {
      draft.activeIds = draft.activeIds.map((id) => (id === oldId ? newId : id));
    }
    this.enemyDraft = draft;
  }

  private prepareClassSkillEntriesForSave(): void {
    ensureClassGrowthFields(this.classDraft.class);
    const classId = this.classDraft.class.id.trim();
    if (!classId) return;
    this.classDraft.class.basicAttackSkillId = defaultBasicAttackId(classId);
    this.classSkillEntries = ensureClassBasicAttackPool(
      classId,
      this.classSkillEntries,
      this.skills,
    );
  }

  private async saveClass(): Promise<void> {
    if (!this.classDraft.class.id.trim()) {
      this.setStatus('classId を入力してください', true);
      return;
    }
    if (!this.classDraft.class.displayName.trim()) {
      this.setStatus('表示名を入力してください', true);
      return;
    }

    this.saving = true;
    this.render();
    try {
      this.prepareClassSkillEntriesForSave();
      const cls = buildClassPresetFromDraft(this.classDraft, this.classSkillEntries);
      const { passives, actives } = collectSkillsFromDrafts(this.classSkillEntries);
      await saveClassBundle({ class: cls, passives, actives });
      this.classes = await fetchClasses();
      this.skills = await fetchSkills();
      this.syncBalanceRowsFromClasses();
      this.selectedClassId = cls.id;
      this.classDraft = loadClassDraftById(this.classes, cls.id);
      this.classSkillEntries = initClassSkillEntriesFromPreset(this.classDraft.class, this.skills);
      this.setStatus(`保存しました: ${cls.displayName}`, false);
    } catch (error) {
      this.setStatus(
        error instanceof Error ? error.message : '保存に失敗しました',
        true,
      );
    } finally {
      this.saving = false;
      this.render();
    }
  }

  private prepareEnemySkillEntriesForSave(): void {
    const enemyId = this.enemyDraft.enemy.id.trim();
    if (!enemyId) return;
    this.enemyDraft.enemy.basicAttackSkillId = defaultBasicAttackId(enemyId);
    this.enemySkillEntries = resyncEnemyBasicAttackEntry(
      this.enemySkillEntries,
      enemyId,
      this.skills,
    );
  }

  private async saveEnemy(): Promise<void> {
    if (!this.enemyDraft.enemy.id.trim()) {
      this.setStatus('enemyId を入力してください', true);
      return;
    }
    if (!this.enemyDraft.enemy.displayName.trim()) {
      this.setStatus('表示名を入力してください', true);
      return;
    }

    this.saving = true;
    this.render();
    try {
      this.prepareEnemySkillEntriesForSave();
      const enemy = buildEnemyFromDraft(this.enemyDraft, this.enemySkillEntries);
      const { passives, actives } = collectSkillsFromDrafts(this.enemySkillEntries);
      await saveEnemyBundle({ enemy, passives, actives });
      this.enemies = await fetchEnemies();
      this.skills = await fetchSkills();
      this.selectedEnemyId = enemy.id;
      this.enemyDraft = loadEnemyDraftById(this.enemies, enemy.id);
      this.enemySkillEntries = initEnemySkillEntriesFromPreset(
        this.enemyDraft.enemy,
        this.skills,
      );
      this.setStatus(`保存しました: ${enemy.displayName}`, false);
    } catch (error) {
      this.setStatus(
        error instanceof Error ? error.message : '保存に失敗しました',
        true,
      );
    } finally {
      this.saving = false;
      this.render();
    }
  }
}
