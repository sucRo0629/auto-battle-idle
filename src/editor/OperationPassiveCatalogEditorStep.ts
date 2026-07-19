import type {
  ClassPreset,
  OperationPassiveCatalogDef,
  PassiveSkillDef,
} from '../battle/types.ts';
import { R5_COMBAT_MODULE_CLASS_IDS } from '../battle/types.ts';
import {
  collectOperationPassiveCatalogAuthoringIssues,
  formatAuthoringIssuesForDisplay,
} from './authoringValidationPreview.ts';
import {
  buildPassiveIdSet,
  getOperationPassiveCandidatesForClassDraft,
  listOperationPassiveAuthoringClassIds,
  listPassiveIdsForClassStem,
  setOperationPassiveCandidatesForClassDraft,
  setOperationPassiveFixedCostDraft,
} from './editorApi.ts';
import {
  appendGrid,
  createActionButton,
  createEl,
  createFieldRow,
  createNumberInput,
  createSection,
  preserveScrollDuring,
} from './formUtils.ts';

export interface OperationPassiveCatalogEditorStepOptions {
  getDraft: () => OperationPassiveCatalogDef;
  classRegistry: Record<string, ClassPreset>;
  passives: PassiveSkillDef[];
  onDraftChange: (draft: OperationPassiveCatalogDef) => void;
  onSave: () => void;
  saving: boolean;
}

export class OperationPassiveCatalogEditorStep {
  private readonly host: HTMLElement;
  private readonly options: OperationPassiveCatalogEditorStepOptions;

  constructor(host: HTMLElement, options: OperationPassiveCatalogEditorStepOptions) {
    this.host = host;
    this.options = options;
    this.render();
  }

  refresh(): void {
    this.render();
  }

  private render(): void {
    preserveScrollDuring(() => {
      this.host.replaceChildren();
      this.host.appendChild(this.buildContent());
    });
  }

  destroy(): void {
    this.host.replaceChildren();
  }

  private buildContent(): HTMLElement {
    const draft = this.options.getDraft();
    const root = createEl('div', 'editor-operation-passive-catalog');

    root.appendChild(
      createEl(
        'p',
        'editor-help',
        '作戦内パッシブ候補と付与条件を編集します。候補は既存 passive ID を参照し、Wave 間準備画面へ反映されます。',
      ),
    );

    const grantSection = createSection('付与条件');
    const grantGrid = appendGrid(grantSection);
    grantGrid.appendChild(
      createFieldRow(
        '取得コスト（passiveAcquireCost）',
        createNumberInput(
          draft.passiveAcquireCost,
          (passiveAcquireCost) => {
            if (!Number.isInteger(passiveAcquireCost) || passiveAcquireCost < 1) {
              return;
            }
            this.options.onDraftChange({
              ...this.options.getDraft(),
              passiveAcquireCost,
            });
          },
          { min: 1, step: 1, readonly: this.options.saving },
        ),
      ),
    );
    grantGrid.appendChild(
      createFieldRow(
        'Wave クリア付与（waveClearResourceGrant）',
        createNumberInput(
          draft.waveClearResourceGrant,
          (waveClearResourceGrant) => {
            if (
              !Number.isInteger(waveClearResourceGrant) ||
              waveClearResourceGrant < 0
            ) {
              return;
            }
            this.options.onDraftChange({
              ...this.options.getDraft(),
              waveClearResourceGrant,
            });
          },
          { min: 0, step: 1, readonly: this.options.saving },
        ),
      ),
    );
    grantGrid.appendChild(
      createFieldRow(
        '同一クラス積み上げ（sameClassStackStep）',
        createNumberInput(
          draft.sameClassStackStep,
          (sameClassStackStep) => {
            if (
              !Number.isInteger(sameClassStackStep) ||
              sameClassStackStep < 0
            ) {
              return;
            }
            this.options.onDraftChange({
              ...this.options.getDraft(),
              sameClassStackStep,
            });
          },
          { min: 0, step: 1, readonly: this.options.saving },
        ),
      ),
    );
    root.appendChild(grantSection);

    const candidatesSection = createSection('兵科ごとの取得候補');
    const authoringClassIds = listOperationPassiveAuthoringClassIds(draft);
    for (const classId of authoringClassIds) {
      candidatesSection.appendChild(
        this.buildClassCandidateBlock(classId, draft),
      );
    }
    root.appendChild(candidatesSection);

    const issues = collectOperationPassiveCatalogAuthoringIssues(draft, {
      classRegistry: this.options.classRegistry,
      combatModuleRegistry: {},
      passiveIds: buildPassiveIdSet(this.options.passives),
    });
    const previewSection = createSection('参照プレビュー');
    const previewList = createEl('ul', 'editor-preview-list');
    for (const classId of authoringClassIds) {
      const candidates = getOperationPassiveCandidatesForClassDraft(
        draft,
        classId,
      );
      const item = createEl('li');
      item.textContent =
        candidates.length > 0
          ? `${classId}: ${candidates.join(', ')}`
          : `${classId}: （候補なし）`;
      previewList.appendChild(item);
    }
    previewSection.appendChild(previewList);
    if (issues.length > 0) {
      for (const line of formatAuthoringIssuesForDisplay(issues)) {
        const isError = line.startsWith('エラー');
        previewSection.appendChild(
          createEl(
            'p',
            isError ? 'editor-warning editor-warning-error' : 'editor-warning',
            line,
          ),
        );
      }
    }
    root.appendChild(previewSection);

    const actions = createEl('div', 'editor-actions');
    const saveBtn = createActionButton(
      this.options.saving ? '保存中…' : '保存',
      'editor-btn editor-btn-primary',
      () => this.options.onSave(),
    );
    saveBtn.disabled = this.options.saving;
    actions.appendChild(saveBtn);
    root.appendChild(actions);

    return root;
  }

  private buildClassCandidateBlock(
    classId: string,
    draft: OperationPassiveCatalogDef,
  ): HTMLElement {
    const preset = this.options.classRegistry[classId];
    const block = createEl('div', 'editor-operation-passive-class-block');
    const title = preset
      ? `${preset.displayName} (${classId})`
      : classId;
    block.appendChild(createEl('h3', 'editor-subsection-title', title));

    const isR5Class = (R5_COMBAT_MODULE_CLASS_IDS as readonly string[]).includes(
      classId,
    );
    if (!isR5Class) {
      block.appendChild(
        createEl(
          'p',
          'editor-help',
          'R5 対象外兵科 — 候補の編集は read-only です。',
        ),
      );
    }

    const availableIds = listPassiveIdsForClassStem(
      this.options.passives,
      classId,
    );
    const selected = new Set(
      getOperationPassiveCandidatesForClassDraft(draft, classId),
    );

    if (availableIds.length === 0) {
      block.appendChild(
        createEl('p', 'editor-help', 'この兵科の passive 定義が見つかりません。'),
      );
      return block;
    }

    const list = createEl('div', 'editor-operation-passive-checklist');
    for (const passiveId of availableIds) {
      const passive = this.options.passives.find((entry) => entry.id === passiveId);
      const row = createEl('div', 'editor-operation-passive-check-row');
      const label = document.createElement('label');
      label.className = 'editor-operation-passive-check';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = selected.has(passiveId);
      checkbox.disabled = this.options.saving || !isR5Class;
      checkbox.addEventListener('change', () => {
        const nextSelected = new Set(
          getOperationPassiveCandidatesForClassDraft(
            this.options.getDraft(),
            classId,
          ),
        );
        if (checkbox.checked) {
          nextSelected.add(passiveId);
        } else {
          nextSelected.delete(passiveId);
        }
        const ordered = availableIds.filter((id) => nextSelected.has(id));
        this.options.onDraftChange(
          setOperationPassiveCandidatesForClassDraft(
            this.options.getDraft(),
            classId,
            ordered,
          ),
        );
        this.refresh();
      });
      const text = passive
        ? `${passive.name} (${passiveId})`
        : passiveId;
      label.append(checkbox, document.createTextNode(` ${text}`));
      row.appendChild(label);

      if (selected.has(passiveId)) {
        const fixedCostInput = createNumberInput(
          draft.fixedCostByPassiveId?.[passiveId] ?? 1,
          (fixedCost) => {
            if (!Number.isInteger(fixedCost) || fixedCost < 1) return;
            this.options.onDraftChange(
              setOperationPassiveFixedCostDraft(
                this.options.getDraft(),
                passiveId,
                fixedCost,
              ),
            );
          },
          { min: 1, step: 1, readonly: this.options.saving || !isR5Class },
        );
        row.appendChild(
          createFieldRow('固定コスト', fixedCostInput),
        );
      }
      list.appendChild(row);
    }
    block.appendChild(list);
    return block;
  }
}
