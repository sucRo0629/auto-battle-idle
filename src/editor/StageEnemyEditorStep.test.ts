/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadGameData } from '../battle/data/loadGameData.ts';
import { StageEnemyEditorStep } from './StageEnemyEditorStep.ts';
import type { StageDef } from '../battle/types.ts';
import { loadStageDraftById, type StageDraft } from './editorApi.ts';

function makeStage(overrides: Partial<StageDef> = {}): StageDef {
  return {
    id: 'stage_test',
    displayName: 'Test Stage',
    waves: [{ enemies: [] }],
    ...overrides,
  };
}

function makeOptions(
  draft: StageDraft,
  stages: StageDef[] = [draft as StageDef],
  overrides: Partial<ConstructorParameters<typeof StageEnemyEditorStep>[1]> = {},
) {
  return {
    getDraft: () => draft,
    stages,
    selectedStageId: draft.id,
    classOptions: [{ id: 'df_paladin', label: 'Paladin' }],
    onSelectStage: vi.fn(),
    onDraftChange: vi.fn(),
    onSave: vi.fn(),
    ...overrides,
  };
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
    expect(host.textContent).toContain('enemyGroups（編集中）');
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

    expect(host.textContent).toContain('enemyGroups（編集中）');
    expect(host.textContent).toContain('10');
    expect(host.textContent).toContain('df_guardian ×1');
    expect(host.textContent).toContain('at_hunter ×1');
    expect(host.textContent).not.toContain('legacy（waves / templateId）');
  });

  it('renders ranged_test as enemyGroups stage from loaded game data', () => {
    const { stages } = loadGameData();
    const draft = loadStageDraftById(stages, 'ranged_test');

    host = document.createElement('div');
    new StageEnemyEditorStep(host, makeOptions(draft, stages));

    expect(host.textContent).toContain('enemyGroups（編集中）');
    expect(host.textContent).toContain('10');
    expect(host.textContent).toContain('df_guardian ×1');
    expect(host.textContent).toContain('at_hunter ×2');
    expect(host.textContent).not.toContain('legacy（waves / templateId）');
  });
});
