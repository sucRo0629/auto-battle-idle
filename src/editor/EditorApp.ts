import type { AttackSpeedTier, ClassId, ClassPreset, CombatModuleDef, EnemyTemplate, OperationPassiveCatalogDef, StageDef } from '../battle/types.ts';
import { DEFAULT_BASIC_ATTACK_INTERVAL_SEC } from '../battle/data/synthesizeBasicAttack.ts';
import { tryLoadGameData } from '../battle/data/loadGameData.ts';
import { normalizePassiveSkillForEditor } from '../battle/data/validateGameData.ts';
import type { ClassPresetBeforeEnrich } from '../progression/skillUnlocks.ts';
import { projectStorageKey } from '../projectIdentity.ts';
import type { BalanceDisplayMode } from './balanceReference.ts';
import { BalanceEditorStep } from './BalanceEditorStep.ts';
import { ClassEditorStep, loadClassDraftById } from './ClassEditorStep.ts';
import { EnemyEditorStep, loadEnemyDraftById } from './EnemyEditorStep.ts';
import { StageEnemyEditorStep } from './StageEnemyEditorStep.ts';
import { OperationPassiveCatalogEditorStep } from './OperationPassiveCatalogEditorStep.ts';
import { CombatModuleEditorStep } from './CombatModuleEditorStep.ts';
import { resolveClassCombatModuleIdsDraft } from './classCombatModulePoolEditor.ts';
import { StatusIconsEditorStep } from './StatusIconsEditorStep.ts';
import {
  applyEnemyAttackSpeedTier,
  applyEnemyCustomBasicAttackInterval,
  buildClassPresetFromDraft,
  buildEnemyFromDraft,
  buildPassiveIdSet,
  buildSkillRegistryFromSkillsJson,
  buildSkillDrafts,
  collectSkillsFromDrafts,
  combatModulesDraftFromModules,
  createBalanceRowsFromClasses,
  createEmptyClassDraft,
  createEmptyEnemyDraft,
  createInitialEnemySkillEntries,
  defaultBasicAttackId,
  ensureClassBasicAttackPool,
  ensureClassGrowthFields,
  createEmptyStageDraft,
  createDefaultStageDraft,
  fetchClasses,
  fetchCombatModules,
  fetchEnemies,
  fetchSkills,
  fetchStages,
  fetchOperationPassiveCatalog,
  operationPassiveCatalogDraftFromCatalog,
  saveCombatModules,
  saveOperationPassiveCatalog,
  validateCombatModulesDraftForSave,
  validateOperationPassiveCatalogDraftForSave,
  initClassSkillEntriesFromPreset,
  initEnemySkillEntriesFromPreset,
  isBalanceRowDirty,
  isBasicAttackSkillId,
  isEnemyBasicAttackEntry,
  loadStageDraftById,
  nextClassSkillId,
  resyncEnemyBasicAttackEntry,
  resolveEnemyAttackSpeedSelect,
  resolveEnemyBasicAttackInterval,
  saveClassBundle,
  saveClassStatsBulk,
  saveEnemyBundle,
  saveStageBundle,
  toClassStatsPatch,
  validateClassDraftForSave,
  validateClassStatsForSave,
  validateEnemyDraftForSave,
  validateStageDraftForSave,
  type BalanceClassRow,
  type ClassDraft,
  type EnemyDraft,
  type StageDraft,
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

type EditorTab =
  | 'class'
  | 'enemy'
  | 'stage'
  | 'combatModule'
  | 'operationPassive'
  | 'balance'
  | 'statusIcons';

const EDITOR_SESSION_KEY = projectStorageKey('editor-session');

interface EditorSessionState {
  tab?: EditorTab;
  selectedClassId?: string;
  selectedEnemyId?: string;
  selectedStageId?: string;
}

export class EditorApp {
  private tab: EditorTab = 'class';
  private classes: ClassPresetBeforeEnrich[] = [];
  private enemies: EnemyTemplate[] = [];
  private stages: StageDef[] = [];
  private skills: SkillsJson = { passives: [], actives: [] };

  private classDraft: ClassDraft = createEmptyClassDraft();
  private selectedClassId = '';
  private classSkillEntries: SkillDraftEntry[] = [];

  private enemyDraft: EnemyDraft = createEmptyEnemyDraft();
  private selectedEnemyId = '';
  private enemySkillEntries: SkillDraftEntry[] = [];

  private stageDraft: StageDraft = createEmptyStageDraft();
  private selectedStageId = '';
  private isCreatingStage = false;
  private operationPassiveCatalogDraft: OperationPassiveCatalogDef = {
    passiveAcquireCost: 1,
    waveClearResourceGrant: 1,
    sameClassStackStep: 0,
    unlockLevelCostTable: { '0': 1, '10': 10, '20': 20 },
    costUnlockLevelByPassiveId: {},
    candidatesByClass: {},
  };
  private combatModulesDraft: CombatModuleDef[] = [];
  private classRegistry: Record<ClassId, ClassPreset> = {};
  private combatModuleRegistry: Record<string, CombatModuleDef> = {};

  private balanceRows: BalanceClassRow[] = [];
  private balanceJobTier = 1;
  private balanceDisplayMode: BalanceDisplayMode = 'all';

  private saving = false;
  private statusMessage = '';
  private statusIsError = false;

  private classStep: ClassEditorStep | null = null;
  private enemyStep: EnemyEditorStep | null = null;
  private stageStep: StageEnemyEditorStep | null = null;
  private combatModuleStep: CombatModuleEditorStep | null = null;
  private operationPassiveStep: OperationPassiveCatalogEditorStep | null = null;
  private skillStep: SkillEditorStep | null = null;
  private balanceStep: BalanceEditorStep | null = null;
  private statusIconsStep: StatusIconsEditorStep | null = null;
  private classSectionExpandedState = new Map<string, boolean>();

  private statusEl!: HTMLElement;
  private contentEl!: HTMLElement;

  constructor(private root: HTMLElement) {
    this.restoreSelectionFromSession();
    this.buildShell();
    void this.loadData();
  }

  private restoreSelectionFromSession(): void {
    try {
      const raw = sessionStorage.getItem(EDITOR_SESSION_KEY);
      if (!raw) return;
      const state = JSON.parse(raw) as EditorSessionState;
      if (
        state.tab === 'class' ||
        state.tab === 'enemy' ||
        state.tab === 'stage' ||
        state.tab === 'combatModule' ||
        state.tab === 'operationPassive' ||
        state.tab === 'balance' ||
        state.tab === 'statusIcons'
      ) {
        this.tab = state.tab;
      }
      if (typeof state.selectedClassId === 'string') {
        this.selectedClassId = state.selectedClassId;
      }
      if (typeof state.selectedEnemyId === 'string') {
        this.selectedEnemyId = state.selectedEnemyId;
      }
      if (typeof state.selectedStageId === 'string') {
        this.selectedStageId = state.selectedStageId;
      }
    } catch {
      // ignore corrupt session data
    }
  }

  private persistSession(): void {
    const state: EditorSessionState = {
      tab: this.tab,
      selectedClassId: this.selectedClassId,
      selectedEnemyId: this.selectedEnemyId,
      selectedStageId: this.selectedStageId,
    };
    sessionStorage.setItem(EDITOR_SESSION_KEY, JSON.stringify(state));
  }

  private restoreDraftsAfterLoad(): void {
    if (
      this.selectedClassId &&
      this.classes.some((cls) => cls.id === this.selectedClassId)
    ) {
      this.classDraft = loadClassDraftById(this.classes, this.selectedClassId);
      this.classSkillEntries = initClassSkillEntriesFromPreset(
        this.classDraft.class,
        this.skills,
      );
    }
    if (
      this.selectedEnemyId &&
      this.enemies.some((enemy) => enemy.id === this.selectedEnemyId)
    ) {
      this.enemyDraft = loadEnemyDraftById(this.enemies, this.selectedEnemyId);
      this.enemySkillEntries = initEnemySkillEntriesFromPreset(
        this.enemyDraft.enemy,
        this.skills,
      );
    }
    if (this.stages.length > 0) {
      if (
        this.selectedStageId &&
        this.stages.some((stage) => stage.id === this.selectedStageId)
      ) {
        this.stageDraft = loadStageDraftById(this.stages, this.selectedStageId);
      } else {
        this.selectedStageId = this.stages[0]!.id;
        this.stageDraft = loadStageDraftById(this.stages, this.selectedStageId);
      }
    }
  }

  private buildShell(): void {
    this.root.replaceChildren();

    const header = createEl('header', 'editor-header');
    header.appendChild(createEl('h1', 'editor-title', 'データ編集（開発用）'));
    header.appendChild(
      createEl(
        'p',
        'editor-subtitle',
        'classes.json / enemies.json / stages.json / data/skills/ などの開発用エディタ。保存後はゲームを再読み込みしてください。',
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
      { id: 'stage', label: 'ステージ' },
      { id: 'combatModule', label: '戦闘方式' },
      { id: 'operationPassive', label: '作戦内パッシブ' },
      { id: 'enemy', label: '敵テンプレ' },
      { id: 'balance', label: 'バランス' },
      { id: 'statusIcons', label: '状態アイコン' },
    ];
    for (const item of items) {
      const btn = createButton(item.label, 'editor-tab', () => {
        if (this.saving) return;
        if (this.tab === item.id) return;
        this.tab = item.id;
        this.clearStatus();
        this.persistSession();
        this.render();
      });
      if (this.tab === item.id) btn.classList.add('is-active');
      btn.disabled = this.saving;
      tabs.appendChild(btn);
    }
  }

  private async loadData(): Promise<void> {
    try {
      const [classes, enemies, stages, skills, operationPassiveCatalog, combatModules] =
        await Promise.all([
        fetchClasses(),
        fetchEnemies(),
        fetchStages(),
        fetchSkills(),
        fetchOperationPassiveCatalog(),
        fetchCombatModules(),
      ]);
      this.classes = classes;
      this.enemies = enemies;
      this.stages = stages;
      this.skills = {
        ...skills,
        passives: skills.passives.map(normalizePassiveSkillForEditor),
      };
      this.operationPassiveCatalogDraft =
        operationPassiveCatalogDraftFromCatalog(operationPassiveCatalog);
      this.combatModulesDraft = combatModulesDraftFromModules(combatModules);
      const gameDataResult = tryLoadGameData();
      if (gameDataResult.ok) {
        this.classRegistry = gameDataResult.data.classRegistry;
        this.combatModuleRegistry = gameDataResult.data.combatModuleRegistry;
      } else {
        this.classRegistry = {};
        this.combatModuleRegistry = Object.fromEntries(
          this.combatModulesDraft.map((module) => [module.id, module]),
        );
      }
      this.syncBalanceRowsFromClasses();
      this.restoreDraftsAfterLoad();
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
    this.stageStep?.destroy();
    this.combatModuleStep?.destroy();
    this.operationPassiveStep?.destroy();
    this.skillStep?.destroy();
    this.balanceStep?.destroy();
    this.statusIconsStep?.destroy();
    this.classStep = null;
    this.enemyStep = null;
    this.stageStep = null;
    this.combatModuleStep = null;
    this.operationPassiveStep = null;
    this.skillStep = null;
    this.balanceStep = null;
    this.statusIconsStep = null;

    preserveScrollDuring(() => {
      this.contentEl.replaceChildren();

      if (this.tab === 'statusIcons') {
        this.renderStatusIconsEditor();
        return;
      }

      if (this.tab === 'class') {
        this.renderClassEditor();
        return;
      }

      if (this.tab === 'balance') {
        this.renderBalanceEditor();
        return;
      }

      if (this.tab === 'stage') {
        this.renderStageEditor();
        return;
      }

      if (this.tab === 'combatModule') {
        this.renderCombatModuleEditor();
        return;
      }

      if (this.tab === 'operationPassive') {
        this.renderOperationPassiveEditor();
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
      renderClassIdentity(headerHost, {
        ...classOptions.classIdentity,
        sectionExpandedState: this.classSectionExpandedState,
      });
    }

    this.classStep = new ClassEditorStep(classHost, {
      getDraft: () => this.classDraft,
      getPreviewClassPreset: () =>
        buildClassPresetFromDraft(this.classDraft, this.classSkillEntries),
      getSkillRegistry: () => buildSkillRegistryFromSkillsJson(this.skills),
      combatModuleRegistry: this.combatModuleRegistry,
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
      sectionExpandedState: this.classSectionExpandedState,
    });

    this.skillStep = new SkillEditorStep(skillsHost, {
      ...classOptions,
      hideSave: true,
      hideEntityHeader: true,
    });

    this.appendSaveActions(() => void this.saveClass());
  }

  private renderStatusIconsEditor(): void {
    const host = createEl('div', 'editor-panel editor-panel-status-icons');
    this.contentEl.appendChild(host);
    this.statusIconsStep = new StatusIconsEditorStep(host);
  }

  private renderBalanceEditor(): void {
    const host = createEl('div', 'editor-panel editor-panel-balance');
    this.contentEl.appendChild(host);

    this.balanceStep = new BalanceEditorStep(host, {
      getRows: () => this.balanceRows,
      getSkillRegistry: () => buildSkillRegistryFromSkillsJson(this.skills),
      getClassOrder: () => this.classes.map((cls) => cls.id),
      displayMode: this.balanceDisplayMode,
      onDisplayModeChange: (mode) => {
        this.balanceDisplayMode = mode;
        this.render();
      },
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
      for (const row of dirtyRows) {
        validateClassStatsForSave(row.current);
      }
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

  private renderStageEditor(): void {
    const host = createEl('div', 'editor-panel editor-panel-stage');
    this.contentEl.appendChild(host);

    this.stageStep = new StageEnemyEditorStep(host, {
      getDraft: () => this.stageDraft,
      stages: this.stages,
      selectedStageId: this.selectedStageId,
      isCreatingStage: this.isCreatingStage,
      classOptions: this.buildClassPickerItems(),
      classRegistry: this.classRegistry,
      combatModuleRegistry: this.combatModuleRegistry,
      onSelectStage: (stageId) => this.selectStage(stageId),
      onCreateStage: () => this.createStage(),
      onDraftChange: (draft) => {
        this.stageDraft = draft;
      },
      onSave: () => void this.saveStage(),
      saving: this.saving,
    });
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
      onSelectEnemy: (enemyId) => void this.selectEnemy(enemyId),
      onSave: () => void this.saveEnemy(),
      saving: this.saving,
      hidePicker: true,
      hideSkillIds: true,
      hideSave: true,
      attackSpeed: this.buildEnemyAttackSpeedOptions(),
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
        this.classStep?.updatePreview();
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
        items: this.buildClassPickerItems(),
        selectedId: this.selectedClassId,
        onSelect: (classId: string) => this.selectClass(classId),
      },
      classIdentity: {
        classId: this.classDraft.class.id,
        displayName: this.classDraft.class.displayName,
        onClassIdChange: (classId: string) => {
          this.classDraft.class.id = classId;
          const trimmed = classId.trim();
          if (trimmed && this.classes.some((cls) => cls.id === trimmed)) {
            this.selectedClassId = trimmed;
          }
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
            this.refreshSkillEditor();
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
      getTraitsRangePx: () => this.classDraft.class.traits.rangePx ?? 0,
      getTraitsDamageType: () =>
        this.classDraft.class.traits.damageType ?? 'physical',
      onTraitsDamageTypeChange: (damageType) => {
        this.classDraft.class.traits.damageType = damageType;
      },
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
        onSelect: (enemyId: string) => void this.selectEnemy(enemyId),
      },
      onSave: () => void this.saveEnemy(),
      saving: this.saving,
      getTraitsRangePx: () => this.enemyDraft.enemy.traits?.rangePx ?? 0,
      getTraitsDamageType: () =>
        this.enemyDraft.enemy.traits?.damageType ?? 'physical',
      onTraitsDamageTypeChange: (damageType) => {
        if (!this.enemyDraft.enemy.traits) {
          this.enemyDraft.enemy.traits = {};
        }
        this.enemyDraft.enemy.traits.damageType = damageType;
      },
    };
  }

  private buildEnemyAttackSpeedOptions() {
    const enemyId = () => this.enemyDraft.enemy.id.trim();
    const tier = () => this.enemyDraft.enemy.attackSpeedTier ?? 'normal';
    return {
      getSelect: () =>
        resolveEnemyAttackSpeedSelect(
          this.enemySkillEntries,
          enemyId(),
          tier(),
        ),
      getCustomInterval: () =>
        resolveEnemyBasicAttackInterval(this.enemySkillEntries, enemyId()),
      onTierChange: (nextTier: AttackSpeedTier) => {
        this.enemyDraft.enemy.attackSpeedTier = nextTier;
        this.enemySkillEntries = applyEnemyAttackSpeedTier(
          this.enemySkillEntries,
          enemyId(),
        );
        this.refreshSkillEditor();
      },
      onSelectCustom: () => {
        const interval = resolveEnemyBasicAttackInterval(
          this.enemySkillEntries,
          enemyId(),
        );
        const nextInterval =
          interval === DEFAULT_BASIC_ATTACK_INTERVAL_SEC ? 10 : interval;
        this.enemySkillEntries = applyEnemyCustomBasicAttackInterval(
          this.enemySkillEntries,
          enemyId(),
          nextInterval,
        );
        this.refreshSkillEditor();
      },
      onCustomIntervalChange: (intervalSec: number) => {
        this.enemySkillEntries = applyEnemyCustomBasicAttackInterval(
          this.enemySkillEntries,
          enemyId(),
          intervalSec,
        );
        this.refreshSkillEditor();
      },
    };
  }

  private buildClassPickerItems(): { id: string; label: string }[] {
    const items = this.classes.map((cls) => ({
      id: cls.id,
      label: `${cls.displayName} (${cls.id})`,
    }));
    const selectedId = this.selectedClassId.trim();
    if (selectedId && !items.some((item) => item.id === selectedId)) {
      const displayName = this.classDraft.class.displayName.trim() || selectedId;
      items.push({ id: selectedId, label: `${displayName} (${selectedId})` });
    }
    return items;
  }

  private selectStage(stageId: string): void {
    this.isCreatingStage = false;
    this.selectedStageId = stageId;
    this.stageDraft = loadStageDraftById(this.stages, stageId);
    this.persistSession();
    this.render();
  }

  private createStage(): void {
    const defaultClassId = this.buildClassPickerItems()[0]?.id ?? 'df_paladin';
    this.isCreatingStage = true;
    this.selectedStageId = '';
    this.stageDraft = createDefaultStageDraft({ defaultClassId });
    this.persistSession();
    this.render();
  }

  private async saveStage(): Promise<void> {
    if (!this.isCreatingStage && !this.selectedStageId) {
      this.setStatus('ステージを選択してください', true);
      return;
    }

    const validationError = validateStageDraftForSave(this.stageDraft, {
      classRegistry: this.classRegistry,
      combatModuleRegistry: this.combatModuleRegistry,
      existingStageIds: this.stages.map((stage) => stage.id),
      isNewStage: this.isCreatingStage,
    });
    if (validationError) {
      this.setStatus(validationError, true);
      return;
    }

    const savedId = this.stageDraft.id.trim();
    this.saving = true;
    this.render();
    try {
      await saveStageBundle({ stage: this.stageDraft });
      this.stages = await fetchStages();
      this.isCreatingStage = false;
      this.selectedStageId = savedId;
      this.stageDraft = loadStageDraftById(this.stages, savedId);
      this.setStatus(`保存しました: ${this.stageDraft.displayName}`, false);
      this.persistSession();
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

  private renderOperationPassiveEditor(): void {
    const host = createEl('div', 'editor-panel editor-panel-operation-passive');
    this.contentEl.appendChild(host);

    this.operationPassiveStep = new OperationPassiveCatalogEditorStep(host, {
      getDraft: () => this.operationPassiveCatalogDraft,
      classRegistry: this.classRegistry,
      passives: this.skills.passives,
      onDraftChange: (draft) => {
        this.operationPassiveCatalogDraft = draft;
      },
      onSave: () => void this.saveOperationPassiveCatalog(),
      saving: this.saving,
    });
  }

  private renderCombatModuleEditor(): void {
    const host = createEl('div', 'editor-panel editor-panel-combat-modules');
    this.contentEl.appendChild(host);

    this.combatModuleStep = new CombatModuleEditorStep(host, {
      getDraft: () => this.combatModulesDraft,
      classRegistry: this.classRegistry,
      onDraftChange: (draft) => {
        this.combatModulesDraft = draft;
        this.combatModuleRegistry = Object.fromEntries(
          draft.map((module) => [module.id, module]),
        );
      },
      onSave: () => void this.saveCombatModules(),
      saving: this.saving,
    });
  }

  private async saveCombatModules(): Promise<void> {
    const validationError = validateCombatModulesDraftForSave(
      this.combatModulesDraft,
    );
    if (validationError) {
      this.setStatus(validationError, true);
      return;
    }

    this.saving = true;
    this.render();
    try {
      await saveCombatModules(this.combatModulesDraft);
      const reloaded = await fetchCombatModules();
      this.combatModulesDraft = combatModulesDraftFromModules(reloaded);
      this.combatModuleRegistry = Object.fromEntries(
        this.combatModulesDraft.map((module) => [module.id, module]),
      );
      this.setStatus('戦闘方式を保存しました', false);
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

  private async saveOperationPassiveCatalog(): Promise<void> {
    const validationError = validateOperationPassiveCatalogDraftForSave(
      this.operationPassiveCatalogDraft,
      {
        classRegistry: this.classRegistry,
        passiveIds: buildPassiveIdSet(this.skills.passives),
      },
    );
    if (validationError) {
      this.setStatus(validationError, true);
      return;
    }

    this.saving = true;
    this.render();
    try {
      await saveOperationPassiveCatalog(this.operationPassiveCatalogDraft);
      const reloaded = await fetchOperationPassiveCatalog();
      this.operationPassiveCatalogDraft =
        operationPassiveCatalogDraftFromCatalog(reloaded);
      this.setStatus('作戦内パッシブ catalog を保存しました', false);
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

  private selectClass(classId: string): void {
    this.selectedClassId = classId;
    this.classDraft = loadClassDraftById(this.classes, classId);
    const resolvedPool = resolveClassCombatModuleIdsDraft(
      classId,
      this.classDraft.class.combatModuleIds,
      this.combatModuleRegistry,
    );
    if (resolvedPool) {
      this.classDraft.class.combatModuleIds = resolvedPool;
    }
    this.classSkillEntries = initClassSkillEntriesFromPreset(this.classDraft.class, this.skills);
    this.persistSession();
    this.render();
  }

  private async selectEnemy(enemyId: string): Promise<void> {
    try {
      const [enemies, skills] = await Promise.all([fetchEnemies(), fetchSkills()]);
      this.enemies = enemies;
      this.skills = {
        ...skills,
        passives: skills.passives.map(normalizePassiveSkillForEditor),
      };
      this.selectedEnemyId = enemyId;
      this.enemyDraft = loadEnemyDraftById(this.enemies, enemyId);
      this.enemySkillEntries = initEnemySkillEntriesFromPreset(
        this.enemyDraft.enemy,
        this.skills,
      );
      this.persistSession();
      this.render();
    } catch (error) {
      this.setStatus(
        error instanceof Error ? error.message : '敵データの読み込みに失敗しました',
        true,
      );
    }
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
    this.skillStep?.expandSkill(skillId);
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
    this.skillStep?.expandSkill(skillId);
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

  private refreshClassTabUi(options?: { reheader?: boolean }): void {
    preserveScrollDuring(() => {
      if (options?.reheader) {
        const headerHost = this.contentEl.querySelector('.editor-panel-header');
        if (headerHost instanceof HTMLElement) {
          headerHost.replaceChildren();
          const classOptions = this.buildClassSkillOptions();
          if (classOptions.entityPicker) {
            renderEntityPicker(headerHost, classOptions.entityPicker);
          }
          if (classOptions.classIdentity) {
            renderClassIdentity(headerHost, classOptions.classIdentity);
          }
        }
      }

      this.classStep?.update({
        getDraft: () => this.classDraft,
        getPreviewClassPreset: () =>
          buildClassPresetFromDraft(this.classDraft, this.classSkillEntries),
        getSkillRegistry: () => buildSkillRegistryFromSkillsJson(this.skills),
        combatModuleRegistry: this.combatModuleRegistry,
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

      this.skillStep?.update({
        ...this.buildClassSkillOptions(),
        hideSave: true,
        hideEntityHeader: true,
      });

      const saveBtn = this.contentEl.querySelector(
        '.editor-actions .editor-btn-primary',
      );
      if (saveBtn instanceof HTMLButtonElement) {
        saveBtn.disabled = this.saving;
        saveBtn.textContent = this.saving ? '保存中…' : '保存';
      }

      const tabs = this.root.querySelector('.editor-tabs');
      if (tabs) this.renderTabs(tabs as HTMLElement);
      this.renderStatus();
    });
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

    this.tab = 'class';
    const savedClassId = this.classDraft.class.id.trim();
    const loadedClassId = this.selectedClassId || savedClassId;
    this.saving = true;
    this.refreshClassTabUi();
    try {
      const resolvedPool = resolveClassCombatModuleIdsDraft(
        savedClassId,
        this.classDraft.class.combatModuleIds,
        this.combatModuleRegistry,
      );
      if (resolvedPool) {
        this.classDraft.class.combatModuleIds = resolvedPool;
      }
      validateClassDraftForSave(this.classDraft, {
        combatModuleRegistry: this.combatModuleRegistry,
      });
      this.prepareClassSkillEntriesForSave();
      const cls = buildClassPresetFromDraft(this.classDraft, this.classSkillEntries);
      const { passives, actives } = collectSkillsFromDrafts(this.classSkillEntries);
      await saveClassBundle({ class: cls, passives, actives });
      this.classes = await fetchClasses();
      this.skills = await fetchSkills();
      this.syncBalanceRowsFromClasses();
      const nextClassId = cls.id.trim() || loadedClassId;
      this.selectedClassId = nextClassId;
      this.classDraft = loadClassDraftById(this.classes, nextClassId);
      this.classSkillEntries = initClassSkillEntriesFromPreset(this.classDraft.class, this.skills);
      this.setStatus(`保存しました: ${cls.displayName}`, false);
      this.persistSession();
    } catch (error) {
      this.setStatus(
        error instanceof Error ? error.message : '保存に失敗しました',
        true,
      );
    } finally {
      this.saving = false;
      this.refreshClassTabUi({ reheader: true });
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

    this.tab = 'enemy';
    this.saving = true;
    this.render();
    try {
      validateEnemyDraftForSave(this.enemyDraft);
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
      this.persistSession();
    } catch (error) {
      this.setStatus(
        error instanceof Error ? error.message : '保存に失敗しました',
        true,
      );
    } finally {
      this.saving = false;
      this.tab = 'enemy';
      this.render();
    }
  }
}
