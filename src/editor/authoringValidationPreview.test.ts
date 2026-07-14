import { describe, expect, it } from 'vitest';
import { loadGameData } from '../battle/data/loadGameData.ts';
import { resolveSelectedCombatModuleId } from '../battle/data/resolveCombatModuleBasic.ts';
import {
  collectOperationPassiveCatalogAuthoringIssues,
  collectStageEnemyAuthoringIssues,
  firstAuthoringErrorMessage,
  formatStageEnemyGroupModulePreviewLabel,
  resolveStageEnemyGroupModulePreview,
} from './authoringValidationPreview.ts';
import {
  buildPassiveIdSet,
  validateOperationPassiveCatalogDraftForSave,
  validateStageDraftForSave,
} from './editorApi.ts';

describe('authoringValidationPreview (R9e)', () => {
  const gameData = loadGameData();
  const context = {
    classRegistry: gameData.classRegistry,
    combatModuleRegistry: gameData.combatModuleRegistry,
  };
  const passiveIds = buildPassiveIdSet(
    Object.values(gameData.skillRegistry.passives),
  );
  const catalogCtx = {
    classRegistry: gameData.classRegistry,
    combatModuleRegistry: gameData.combatModuleRegistry,
    passiveIds,
  };

  it('resolves unset CombatModule the same as runtime', () => {
    const group = { classId: 'df_guardian', count: 1 };
    const preview = resolveStageEnemyGroupModulePreview(group, context);
    const runtimeId = resolveSelectedCombatModuleId(
      gameData.classRegistry.df_guardian!,
      gameData.combatModuleRegistry,
      undefined,
    );

    expect(preview.resolvedModuleId).toBe(runtimeId);
    expect(preview.usesDefaultModule).toBe(true);
    expect(formatStageEnemyGroupModulePreviewLabel(preview)).toContain('既定');
  });

  it('flags unknown classId as error', () => {
    const issues = collectStageEnemyAuthoringIssues(
      {
        id: 'x',
        displayName: 'X',
        recommendedLevel: 10,
        enemyGroups: [{ classId: 'missing_class', count: 1 }],
      },
      context,
    );
    expect(firstAuthoringErrorMessage(issues)).toMatch(/未知の classId/);
  });

  it('flags unknown selectedCombatModuleId as error', () => {
    const issues = collectStageEnemyAuthoringIssues(
      {
        id: 'x',
        displayName: 'X',
        recommendedLevel: 10,
        enemyGroups: [
          {
            classId: 'df_guardian',
            count: 1,
            selectedCombatModuleId: 'missing_module',
          },
        ],
      },
      context,
    );
    expect(firstAuthoringErrorMessage(issues)).toMatch(
      /未知の selectedCombatModuleId/,
    );
  });

  it('flags module from another class as error', () => {
    const issues = collectStageEnemyAuthoringIssues(
      {
        id: 'x',
        displayName: 'X',
        recommendedLevel: 10,
        enemyGroups: [
          {
            classId: 'df_guardian',
            count: 1,
            selectedCombatModuleId: 'at_sorcerer_mod_twin_bolt',
          },
        ],
      },
      context,
    );
    expect(firstAuthoringErrorMessage(issues)).toMatch(/方式 pool にありません/);
  });

  it('warns when CombatModule is unset for module class', () => {
    const issues = collectStageEnemyAuthoringIssues(
      {
        id: 'x',
        displayName: 'X',
        recommendedLevel: 10,
        enemyGroups: [{ classId: 'df_guardian', count: 1 }],
      },
      context,
    );
    expect(issues.some((issue) => issue.code === 'module_unset')).toBe(true);
    expect(firstAuthoringErrorMessage(issues)).toBeNull();
  });

  it('warns on duplicate classId within the same groups', () => {
    const issues = collectStageEnemyAuthoringIssues(
      {
        id: 'x',
        displayName: 'X',
        recommendedLevel: 10,
        enemyGroups: [
          { classId: 'df_guardian', count: 1 },
          { classId: 'df_guardian', count: 2 },
        ],
      },
      context,
    );
    expect(
      issues.some((issue) => issue.code === 'duplicate_class_in_groups'),
    ).toBe(true);
  });

  it('validateStageDraftForSave blocks invalid module when context is provided', () => {
    expect(
      validateStageDraftForSave(
        {
          id: 'x',
          displayName: 'X',
          recommendedLevel: 10,
          enemyGroups: [
            {
              classId: 'df_guardian',
              count: 1,
              selectedCombatModuleId: 'missing_module',
            },
          ],
          waves: [{ enemies: [] }],
        },
        context,
      ),
    ).toMatch(/未知の selectedCombatModuleId/);

    expect(
      validateStageDraftForSave(
        {
          id: 'x',
          displayName: 'X',
          recommendedLevel: 10,
          enemyGroups: [{ classId: 'df_guardian', count: 1 }],
          waves: [{ enemies: [] }],
        },
        context,
      ),
    ).toBeNull();
  });

  it('flags unknown catalog passive and duplicate ids', () => {
    const issues = collectOperationPassiveCatalogAuthoringIssues(
      {
        passiveAcquireCost: 1,
        waveClearResourceGrant: 1,
        candidatesByClass: {
          df_guardian: ['missing_passive', 'missing_passive'],
        },
      },
      catalogCtx,
    );
    expect(issues.some((issue) => issue.code === 'duplicate_passive')).toBe(
      true,
    );
    expect(issues.some((issue) => issue.code === 'unknown_passive')).toBe(true);
  });

  it('warns when R5 class has empty passive candidates', () => {
    const issues = collectOperationPassiveCatalogAuthoringIssues(
      {
        passiveAcquireCost: 1,
        waveClearResourceGrant: 1,
        candidatesByClass: {},
      },
      catalogCtx,
    );
    expect(
      issues.filter((issue) => issue.code === 'empty_passive_candidates'),
    ).toHaveLength(4);
  });

  it('validateOperationPassiveCatalogDraftForSave blocks unknown passive with context', () => {
    expect(
      validateOperationPassiveCatalogDraftForSave(
        {
          passiveAcquireCost: 1,
          waveClearResourceGrant: 1,
          candidatesByClass: {
            df_guardian: ['not_a_real_passive'],
          },
        },
        {
          classRegistry: gameData.classRegistry,
          passiveIds,
        },
      ),
    ).toMatch(/未知の passiveId/);
  });
});
