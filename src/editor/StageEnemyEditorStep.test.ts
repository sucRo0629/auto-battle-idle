/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadGameData } from '../battle/data/loadGameData.ts';
import { StageEnemyEditorStep } from './StageEnemyEditorStep.ts';
import type { StageDef } from '../battle/types.ts';
import {
  loadStageDraftById,
  normalizeStageDraftForSave,
  resolveStageDraftCompositionMode,
  type StageDraft,
} from './editorApi.ts';

function makeStage(overrides: Partial<StageDef> = {}): StageDef {
  return {
    id: 'stage_test',
    displayName: 'Test Stage',
    waves: [{ enemies: [] }],
    ...overrides,
  };
}

function editorRegistries() {
  const gameData = loadGameData();
  return {
    classRegistry: gameData.classRegistry,
    combatModuleRegistry: gameData.combatModuleRegistry,
    classOptions: gameData.classOrder.map((id) => ({
      id,
      label: gameData.classRegistry[id]?.displayName ?? id,
    })),
  };
}

function makeOptions(
  draft: StageDraft,
  stages: StageDef[] = [draft as StageDef],
  overrides: Partial<ConstructorParameters<typeof StageEnemyEditorStep>[1]> = {},
) {
  const registries = editorRegistries();
  return {
    getDraft: () => draft,
    stages,
    selectedStageId: draft.id,
    classOptions: registries.classOptions,
    classRegistry: registries.classRegistry,
    combatModuleRegistry: registries.combatModuleRegistry,
    onSelectStage: vi.fn(),
    onDraftChange: vi.fn(),
    onSave: vi.fn(),
    ...overrides,
  };
}

function findCombatModuleSelects(host: HTMLElement): HTMLSelectElement[] {
  return Array.from(
    host.querySelectorAll<HTMLSelectElement>('select[data-editor-field="combatModule"]'),
  );
}

function findCombatModuleDescription(host: HTMLElement, index = 0): HTMLElement | null {
  const descriptions = host.querySelectorAll<HTMLElement>(
    '[data-editor-field="combatModuleDescription"]',
  );
  return descriptions[index] ?? null;
}

describe('StageEnemyEditorStep', () => {
  let host: HTMLElement;

  afterEach(() => {
    host?.remove();
  });

  it('shows enemyGroups preview with recommendedLevel, scales, and large-party warning', () => {
    const draft: StageDraft = {
      id: 'stage_groups',
      displayName: 'Groups Stage',
      recommendedLevel: 15,
      enemyGroups: [
        { classId: 'df_paladin', count: 2 },
        { classId: 'at_hunter', count: 3, atkScale: 1.2 },
      ],
      waves: [{ enemies: [] }],
    };

    host = document.createElement('div');
    new StageEnemyEditorStep(host, makeOptions(draft));

    expect(host.textContent).toContain('recommendedLevel');
    expect(host.textContent).toContain('15');
    expect(host.textContent).toContain('stage 直下 enemyGroups（編集中）');
    expect(host.textContent).toContain('総体数');
    expect(host.textContent).toContain('5');
    expect(host.textContent).toContain('df_paladin ×2');
    expect(host.textContent).toContain('at_hunter ×3');
    expect(host.textContent).toContain('atk×1.2');
    expect(host.textContent).toContain('5体以上は表示・配置の後続調整対象');
  });

  it('shows legacy preview with enemyGroups unset and templateIds', () => {
    const draft: StageDraft = {
      id: 'stage_legacy',
      displayName: 'Legacy Stage',
      waves: [
        { enemies: [{ templateId: 'enemy_a', spawnX: 80 }] },
        {
          enemies: [
            { templateId: 'enemy_b', spawnX: 120 },
            { templateId: 'enemy_c', spawnX: 160 },
          ],
        },
      ],
    };

    host = document.createElement('div');
    new StageEnemyEditorStep(host, makeOptions(draft));

    expect(host.textContent).toContain('legacy（waves / templateId）');
    expect(host.textContent).toContain('enemyGroups');
    expect(host.textContent).toContain('未設定');
    expect(host.textContent).toContain('enemy_a');
    expect(host.textContent).toContain('enemy_b');
    expect(host.textContent).toContain('enemy_c');
    expect(host.textContent).not.toContain('5体以上は表示・配置の後続調整対象');
  });

  it('renders eg_smoke as enemyGroups stage from loaded game data', () => {
    const { stages } = loadGameData();
    const draft = loadStageDraftById(stages, 'eg_smoke');

    host = document.createElement('div');
    new StageEnemyEditorStep(host, makeOptions(draft, stages));

    expect(host.textContent).toContain('stage 直下 enemyGroups（編集中）');
    expect(host.textContent).toContain('10');
    expect(host.textContent).toContain('df_guardian ×1');
    expect(host.textContent).toContain('at_hunter ×1');
    expect(host.textContent).not.toContain('legacy（waves / templateId）');
    expect(host.textContent).not.toContain('stage 直下 enemyGroups 編集を開始');
    expect(host.textContent).not.toContain('Wave ごと enemyGroups 編集を開始');
    expect(host.querySelector('button[data-editor-action="addWave"]')).toBeTruthy();
  });

  it('adds a second wave from eg_smoke stage authoring UI', () => {
    const { stages } = loadGameData();
    const draft = loadStageDraftById(stages, 'eg_smoke');
    const onDraftChange = vi.fn();

    host = document.createElement('div');
    new StageEnemyEditorStep(host, makeOptions(draft, stages, { onDraftChange }));

    const addBtn = host.querySelector<HTMLButtonElement>(
      'button[data-editor-action="addWave"]',
    );
    expect(addBtn).toBeTruthy();
    addBtn!.click();

    const nextDraft = onDraftChange.mock.calls.at(-1)?.[0] as StageDraft;
    expect(resolveStageDraftCompositionMode(nextDraft)).toBe('waveEnemyGroups');
    expect(nextDraft.waves).toHaveLength(2);
    expect(nextDraft.waves?.[0]?.enemyGroups).toHaveLength(2);
    expect(nextDraft.waves?.[1]?.enemyGroups?.[0]?.classId).toBeTruthy();
  });

  it('renders ranged_test as enemyGroups stage from loaded game data', () => {
    const { stages } = loadGameData();
    const draft = loadStageDraftById(stages, 'ranged_test');

    host = document.createElement('div');
    new StageEnemyEditorStep(host, makeOptions(draft, stages));

    expect(host.textContent).toContain('stage 直下 enemyGroups（編集中）');
    expect(host.textContent).toContain('10');
    expect(host.textContent).toContain('df_guardian ×1');
    expect(host.textContent).toContain('at_hunter ×2');
    expect(host.textContent).not.toContain('legacy（waves / templateId）');
    expect(host.textContent).not.toContain('Wave ごと enemyGroups 編集を開始');
  });

  it('loads and previews waves[].enemyGroups per wave', () => {
    const draft: StageDraft = {
      id: 'wave_groups',
      displayName: 'Wave Groups',
      recommendedLevel: 12,
      waves: [
        {
          enemies: [],
          enemyGroups: [{ classId: 'df_paladin', count: 2 }],
        },
        {
          enemies: [],
          enemyGroups: [{ classId: 'at_hunter', count: 1, atkScale: 1.2 }],
        },
      ],
    };

    host = document.createElement('div');
    new StageEnemyEditorStep(host, makeOptions(draft));

    expect(host.textContent).toContain('waves[].enemyGroups（編集中）');
    expect(host.textContent).toContain('Wave 0');
    expect(host.textContent).toContain('Wave 1');
    expect(host.textContent).toContain('df_paladin ×2');
    expect(host.textContent).toContain('at_hunter ×1');
    expect(host.textContent).toContain('wave 0:');
    expect(host.textContent).toContain('wave 1:');
  });

  it('shows legacy wave alongside wave enemyGroups editing entry points', () => {
    const draft: StageDraft = {
      id: 'mixed_wave',
      displayName: 'Mixed Wave',
      recommendedLevel: 10,
      waves: [
        {
          enemies: [],
          enemyGroups: [{ classId: 'df_paladin', count: 1 }],
        },
        {
          enemies: [{ templateId: 'enemy_b', spawnX: 120 }],
        },
      ],
    };

    host = document.createElement('div');
    new StageEnemyEditorStep(host, makeOptions(draft));

    expect(host.textContent).toContain('waves[].enemyGroups（編集中）');
    expect(host.textContent).toContain('legacy enemies');
    expect(host.textContent).toContain('enemy_b');
    expect(host.textContent).toContain('この Wave の enemyGroups を編集');
  });

  describe('CombatModule selection (R9b)', () => {
    const registries = editorRegistries();
    const guardianModuleA = 'df_guardian_mod_nearest_strike';
    const guardianModuleB = 'df_guardian_mod_guard_focus';
    const swordsmanModule = 'at_swordsman_mod_pierce_slash';

    it('shows class-specific combat module options with display names and description', () => {
      const draft: StageDraft = {
        id: 'module_stage',
        displayName: 'Module Stage',
        recommendedLevel: 10,
        enemyGroups: [{ classId: 'df_guardian', count: 1, selectedCombatModuleId: guardianModuleA }],
        waves: [{ enemies: [] }],
      };

      host = document.createElement('div');
      new StageEnemyEditorStep(host, makeOptions(draft));

      const [moduleSelect] = findCombatModuleSelects(host);
      expect(moduleSelect).toBeTruthy();
      expect(moduleSelect!.value).toBe(guardianModuleA);

      const optionLabels = Array.from(moduleSelect!.options).map((option) => option.textContent);
      expect(optionLabels).toContain('既定値を使用（未指定）');
      expect(optionLabels).toContain(
        registries.combatModuleRegistry[guardianModuleA]!.displayName,
      );
      expect(optionLabels).toContain(
        registries.combatModuleRegistry[guardianModuleB]!.displayName,
      );
      expect(optionLabels).not.toContain(swordsmanModule);

      const description = findCombatModuleDescription(host);
      expect(description?.textContent).toBe(
        registries.combatModuleRegistry[guardianModuleA]!.description,
      );
    });

    it('does not show combat module field for legacy classes without modules', () => {
      const draft: StageDraft = {
        id: 'legacy_class_stage',
        displayName: 'Legacy Class Stage',
        recommendedLevel: 10,
        enemyGroups: [{ classId: 'df_paladin', count: 1 }],
        waves: [{ enemies: [] }],
      };

      host = document.createElement('div');
      new StageEnemyEditorStep(host, makeOptions(draft));

      expect(findCombatModuleSelects(host)).toHaveLength(0);
    });

    it('updates only the targeted enemyGroup selectedCombatModuleId', () => {
      const draft: StageDraft = {
        id: 'two_groups',
        displayName: 'Two Groups',
        recommendedLevel: 10,
        enemyGroups: [
          { classId: 'df_guardian', count: 1 },
          { classId: 'df_guardian', count: 2, selectedCombatModuleId: guardianModuleA },
        ],
        waves: [{ enemies: [] }],
      };
      const onDraftChange = vi.fn();

      host = document.createElement('div');
      new StageEnemyEditorStep(host, makeOptions(draft, [draft as StageDef], { onDraftChange }));

      const moduleSelects = findCombatModuleSelects(host);
      expect(moduleSelects).toHaveLength(2);

      moduleSelects[0]!.value = guardianModuleB;
      moduleSelects[0]!.dispatchEvent(new Event('change', { bubbles: true }));

      const nextDraft = onDraftChange.mock.calls.at(-1)?.[0] as StageDraft;
      expect(nextDraft.enemyGroups?.[0]?.selectedCombatModuleId).toBe(guardianModuleB);
      expect(nextDraft.enemyGroups?.[1]?.selectedCombatModuleId).toBe(guardianModuleA);
    });

    it('updates wave enemyGroups selectedCombatModuleId independently', () => {
      const draft: StageDraft = {
        id: 'wave_module_stage',
        displayName: 'Wave Module Stage',
        recommendedLevel: 10,
        waves: [
          {
            enemies: [],
            enemyGroups: [{ classId: 'df_guardian', count: 1 }],
          },
          {
            enemies: [],
            enemyGroups: [{ classId: 'at_swordsman', count: 1 }],
          },
        ],
      };
      const onDraftChange = vi.fn();

      host = document.createElement('div');
      new StageEnemyEditorStep(host, makeOptions(draft, [draft as StageDef], { onDraftChange }));

      const moduleSelects = findCombatModuleSelects(host);
      expect(moduleSelects).toHaveLength(2);

      moduleSelects[1]!.value = swordsmanModule;
      moduleSelects[1]!.dispatchEvent(new Event('change', { bubbles: true }));

      const nextDraft = onDraftChange.mock.calls.at(-1)?.[0] as StageDraft;
      expect(nextDraft.waves?.[0]?.enemyGroups?.[0]?.selectedCombatModuleId).toBeUndefined();
      expect(nextDraft.waves?.[1]?.enemyGroups?.[0]?.selectedCombatModuleId).toBe(
        swordsmanModule,
      );
    });

    it('clears invalid module when classId changes to another branch', () => {
      const draft: StageDraft = {
        id: 'class_change',
        displayName: 'Class Change',
        recommendedLevel: 10,
        enemyGroups: [
          {
            classId: 'df_guardian',
            count: 1,
            selectedCombatModuleId: guardianModuleA,
          },
        ],
        waves: [{ enemies: [] }],
      };
      const onDraftChange = vi.fn();

      host = document.createElement('div');
      new StageEnemyEditorStep(host, makeOptions(draft, [draft as StageDef], { onDraftChange }));

      const groupSection = Array.from(host.querySelectorAll('section.editor-section')).find(
        (section) => section.textContent?.includes('グループ 1'),
      );
      const classSelect = groupSection?.querySelector(
        'select.editor-select',
      ) as HTMLSelectElement;
      expect(classSelect).toBeTruthy();
      classSelect.value = 'at_swordsman';
      classSelect.dispatchEvent(new Event('change', { bubbles: true }));

      const nextDraft = onDraftChange.mock.calls.at(-1)?.[0] as StageDraft;
      expect(nextDraft.enemyGroups?.[0]?.classId).toBe('at_swordsman');
      expect(nextDraft.enemyGroups?.[0]?.selectedCombatModuleId).toBeUndefined();
    });

    it('keeps unspecified state and round-trips through normalizeStageDraftForSave', () => {
      const draft: StageDraft = {
        id: 'unspecified_module',
        displayName: 'Unspecified Module',
        recommendedLevel: 10,
        enemyGroups: [{ classId: 'df_guardian', count: 1 }],
        waves: [{ enemies: [] }],
      };
      const onDraftChange = vi.fn();

      host = document.createElement('div');
      new StageEnemyEditorStep(host, makeOptions(draft, [draft as StageDef], { onDraftChange }));

      const [moduleSelect] = findCombatModuleSelects(host);
      moduleSelect!.value = '';
      moduleSelect!.dispatchEvent(new Event('change', { bubbles: true }));

      const editedDraft = onDraftChange.mock.calls.at(-1)?.[0] as StageDraft;
      expect(editedDraft.enemyGroups?.[0]?.selectedCombatModuleId).toBeUndefined();

      const normalized = normalizeStageDraftForSave(editedDraft);
      expect(normalized.enemyGroups?.[0]?.selectedCombatModuleId).toBeUndefined();
    });

    it('persists explicit module through normalizeStageDraftForSave for stage and wave groups', () => {
      const stageDraft: StageDraft = {
        id: 'persist_module',
        displayName: 'Persist Module',
        recommendedLevel: 10,
        enemyGroups: [
          {
            classId: 'df_guardian',
            count: 1,
            selectedCombatModuleId: guardianModuleB,
          },
        ],
        waves: [{ enemies: [] }],
      };
      const waveDraft: StageDraft = {
        id: 'persist_wave_module',
        displayName: 'Persist Wave Module',
        recommendedLevel: 10,
        waves: [
          {
            enemies: [],
            enemyGroups: [
              {
                classId: 'at_swordsman',
                count: 1,
                selectedCombatModuleId: swordsmanModule,
              },
            ],
          },
        ],
      };

      expect(normalizeStageDraftForSave(stageDraft).enemyGroups?.[0]).toMatchObject({
        selectedCombatModuleId: guardianModuleB,
      });
      expect(
        normalizeStageDraftForSave(waveDraft).waves?.[0]?.enemyGroups?.[0],
      ).toMatchObject({
        selectedCombatModuleId: swordsmanModule,
      });
    });

    it('reloads explicit and unspecified module selections from stage draft', () => {
      const draft: StageDraft = {
        id: 'reload_module',
        displayName: 'Reload Module',
        recommendedLevel: 10,
        enemyGroups: [
          { classId: 'df_guardian', count: 1, selectedCombatModuleId: guardianModuleA },
          { classId: 'df_guardian', count: 1 },
        ],
        waves: [{ enemies: [] }],
      };

      host = document.createElement('div');
      new StageEnemyEditorStep(host, makeOptions(draft));

      const moduleSelects = findCombatModuleSelects(host);
      expect(moduleSelects[0]!.value).toBe(guardianModuleA);
      expect(moduleSelects[1]!.value).toBe('');
    });
  });

  describe('wave structure authoring (R9c)', () => {
    it('adds a second wave from the editor UI', () => {
      const draft: StageDraft = {
        id: 'add_wave_ui',
        displayName: 'Add Wave UI',
        recommendedLevel: 10,
        waves: [
          { enemies: [], enemyGroups: [{ classId: 'df_paladin', count: 1 }] },
        ],
      };
      const onDraftChange = vi.fn();

      host = document.createElement('div');
      new StageEnemyEditorStep(host, makeOptions(draft, [draft as StageDef], { onDraftChange }));

      const addBtn = host.querySelector<HTMLButtonElement>(
        'button[data-editor-action="addWave"]',
      );
      expect(addBtn).toBeTruthy();
      addBtn!.click();

      const nextDraft = onDraftChange.mock.calls.at(-1)?.[0] as StageDraft;
      expect(nextDraft.waves).toHaveLength(2);
      expect(nextDraft.waves?.[1]?.enemyGroups?.[0]?.classId).toBeTruthy();
    });

    it('removes a wave from a two-wave draft', () => {
      const draft: StageDraft = {
        id: 'remove_wave_ui',
        displayName: 'Remove Wave UI',
        recommendedLevel: 10,
        waves: [
          { enemies: [], enemyGroups: [{ classId: 'df_paladin', count: 1 }] },
          { enemies: [], enemyGroups: [{ classId: 'at_hunter', count: 2 }] },
        ],
      };
      const onDraftChange = vi.fn();

      host = document.createElement('div');
      new StageEnemyEditorStep(host, makeOptions(draft, [draft as StageDef], { onDraftChange }));

      const removeBtn = host.querySelector<HTMLButtonElement>(
        'button[data-editor-action="removeWave"][data-wave-index="1"]',
      );
      expect(removeBtn).toBeTruthy();
      removeBtn!.click();

      const nextDraft = onDraftChange.mock.calls.at(-1)?.[0] as StageDraft;
      expect(nextDraft.waves).toHaveLength(1);
      expect(nextDraft.waves?.[0]?.enemyGroups?.[0]?.classId).toBe('df_paladin');
    });

    it('does not show remove wave when only one wave exists', () => {
      const draft: StageDraft = {
        id: 'single_wave_ui',
        displayName: 'Single Wave UI',
        recommendedLevel: 10,
        waves: [
          { enemies: [], enemyGroups: [{ classId: 'df_paladin', count: 1 }] },
        ],
      };

      host = document.createElement('div');
      new StageEnemyEditorStep(host, makeOptions(draft));

      expect(
        host.querySelector('button[data-editor-action="removeWave"]'),
      ).toBeNull();
      expect(host.querySelector('button[data-editor-action="addWave"]')).toBeTruthy();
    });
  });

  describe('R9e preview / authoring issues', () => {
    it('shows runtime-resolved CombatModule label and unset warning', () => {
      const draft: StageDraft = {
        id: 'r9e_module_preview',
        displayName: 'R9e Preview',
        recommendedLevel: 10,
        enemyGroups: [{ classId: 'df_guardian', count: 1 }],
        waves: [{ enemies: [] }],
      };

      host = document.createElement('div');
      new StageEnemyEditorStep(host, makeOptions(draft));

      expect(host.textContent).toContain('df_guardian ×1');
      expect(host.textContent).toMatch(/既定/);
      expect(host.textContent).toContain('参照整合');
      expect(host.textContent).toContain('CombatModule 未設定');
    });

    it('shows error for unknown selectedCombatModuleId', () => {
      const draft: StageDraft = {
        id: 'r9e_bad_module',
        displayName: 'R9e Bad Module',
        recommendedLevel: 10,
        enemyGroups: [
          {
            classId: 'df_guardian',
            count: 1,
            selectedCombatModuleId: 'missing_module',
          },
        ],
        waves: [{ enemies: [] }],
      };

      host = document.createElement('div');
      new StageEnemyEditorStep(host, makeOptions(draft));

      expect(host.textContent).toContain('参照整合');
      expect(host.textContent).toContain('未知の selectedCombatModuleId');
    });
  });
});
