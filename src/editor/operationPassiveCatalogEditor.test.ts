import { afterEach, describe, expect, it, vi } from 'vitest';
import classesJson from '../../data/classes.json';
import enemiesJson from '../../data/enemies.json';
import operationPassiveCatalogJson from '../../data/operation-passive-catalog.json';
import partiesJson from '../../data/parties.json';
import stagesJson from '@game-data/stages';
import type { CombatModuleDef, PassiveSkillDef } from '../battle/types.ts';
import { loadGameData } from '../battle/data/loadGameData.ts';
import { readSkillsRoot } from '../battle/data/skillsJsonFs.ts';
import {
  getOperationPassiveCandidatesForClass,
  isOperationPassiveCandidateForClass,
} from '../game/operationPassiveCatalogCore.ts';
import {
  normalizeOperationPassiveCatalogForSave,
  parseAndValidateGameDataJson,
  parseOperationPassiveCatalog,
} from '../battle/data/validateGameData.ts';
import {
  collectCatalogPassivesToPreserveOnEntityReplace,
  getOperationPassiveCandidatesForClassDraft,
  listPassiveIdsForClassStem,
  operationPassiveCatalogDraftFromCatalog,
  setOperationPassiveCandidatesForClassDraft,
  validateOperationPassiveCatalogDraftForSave,
} from './editorApi.ts';
import { OperationPassiveCatalogEditorStep } from './OperationPassiveCatalogEditorStep.ts';

const combatModuleFiles = import.meta.glob<CombatModuleDef[]>(
  '../../data/combat-modules/*.json',
  { eager: true, import: 'default' },
);

function loadCombatModules(): CombatModuleDef[] {
  return Object.values(combatModuleFiles).flat();
}

describe('operation passive catalog (R9d)', () => {
  it('loadGameData exposes catalog from JSON', () => {
    const gameData = loadGameData();
    expect(gameData.operationPassiveCatalog.passiveAcquireCost).toBe(1);
    expect(gameData.operationPassiveCatalog.waveClearResourceGrant).toBe(12);
    // R12l: 同兵科加算なし（sameClassStackStep=0）。cost 正本は fixedCostByPassiveId。
    expect(gameData.operationPassiveCatalog.sameClassStackStep).toBe(0);
    expect(gameData.operationPassiveCatalog.unlockLevelCostTable).toEqual({});
    expect(
      gameData.operationPassiveCatalog.candidatesByClass.df_guardian,
    ).toEqual([
      'df_guardian_op_block_rate_up',
      'df_guardian_op_frontline_maintenance',
      'df_guardian_passive_2',
      'df_guardian_op_fortress_stance',
      'df_guardian_passive_4',
    ]);
  });

  it('parseOperationPassiveCatalog rejects duplicate passive ids per class', () => {
    expect(() =>
      parseOperationPassiveCatalog({
        passiveAcquireCost: 1,
        waveClearResourceGrant: 1,
        candidatesByClass: {
          df_guardian: ['df_guardian_op_block_rate_up', 'df_guardian_op_block_rate_up'],
        },
      }),
    ).toThrow(/duplicate/i);
  });

  it('normalizeOperationPassiveCatalogForSave sorts class keys and dedupes', () => {
    const normalized = normalizeOperationPassiveCatalogForSave({
      passiveAcquireCost: 2,
      waveClearResourceGrant: 3,
      sameClassStackStep: 1,
      unlockLevelCostTable: { '0': 1, '10': 2, '20': 3 },
      costUnlockLevelByPassiveId: {
        df_guardian_op_block_rate_up: 0,
        unused_passive: 10,
      },
      candidatesByClass: {
        df_guardian: ['df_guardian_op_block_rate_up', 'df_guardian_op_block_rate_up'],
        at_swordsman: [],
      },
    });
    expect(normalized).toEqual({
      passiveAcquireCost: 2,
      waveClearResourceGrant: 3,
      sameClassStackStep: 1,
      unlockLevelCostTable: { '0': 1, '10': 2, '20': 3 },
      costUnlockLevelByPassiveId: { df_guardian_op_block_rate_up: 0 },
      fixedCostByPassiveId: {},
      candidatesByClass: {
        df_guardian: ['df_guardian_op_block_rate_up'],
      },
    });
  });

  it('editor draft helpers update class candidates', () => {
    const base = parseOperationPassiveCatalog(operationPassiveCatalogJson);
    const next = setOperationPassiveCandidatesForClassDraft(base, 'df_guardian', [
      'df_guardian_op_block_rate_up',
    ]);
    expect(getOperationPassiveCandidatesForClassDraft(next, 'df_guardian')).toEqual(
      ['df_guardian_op_block_rate_up'],
    );
    expect(validateOperationPassiveCatalogDraftForSave(next)).toBeNull();
  });

  it('listPassiveIdsForClassStem filters by class prefix', () => {
    const gameData = loadGameData();
    const passives = Object.values(gameData.skillRegistry.passives);
    const ids = listPassiveIdsForClassStem(passives, 'df_guardian');
    expect(ids).toContain('df_guardian_op_block_rate_up');
    expect(ids).toContain('df_guardian_op_block_rate_up');
    expect(ids.every((id) => id.startsWith('df_guardian_passive_') || id.startsWith('df_guardian_op_'))).toBe(true);
  });

  it('catalog candidates resolve for WavePrep runtime helpers', () => {
    const gameData = loadGameData();
    const catalog = gameData.operationPassiveCatalog;
    expect(
      getOperationPassiveCandidatesForClass(catalog, 'df_guardian'),
    ).toEqual([
      'df_guardian_op_block_rate_up',
      'df_guardian_op_frontline_maintenance',
      'df_guardian_passive_2',
      'df_guardian_op_fortress_stance',
      'df_guardian_passive_4',
    ]);
    expect(
      isOperationPassiveCandidateForClass(
        catalog,
        'df_guardian',
        'df_guardian_op_block_rate_up',
      ),
    ).toBe(true);
    expect(
      isOperationPassiveCandidateForClass(
        catalog,
        'df_guardian',
        'df_guardian_passive_1',
      ),
    ).toBe(false);
  });
});

describe('editor server-side validation payload (R9d regression)', () => {
  it('editor-mode validate passes when combatModules are included (server payload shape)', () => {
    // vite-plugin-editor-api の loadValidationPayload と同じ構成
    expect(() =>
      parseAndValidateGameDataJson(
        {
          classes: classesJson,
          skills: readSkillsRoot(),
          combatModules: loadCombatModules(),
          enemies: enemiesJson,
          stages: stagesJson,
          parties: partiesJson,
          operationPassiveCatalog: operationPassiveCatalogJson,
        },
        { mode: 'editor' },
      ),
    ).not.toThrow();
  });

  it('editor-mode validate without combatModules rejects R5 class module refs', () => {
    // combatModules を渡し忘れると R9d 以前からこのエラーになる（plugin payload の回帰説明）
    expect(() =>
      parseAndValidateGameDataJson(
        {
          classes: classesJson,
          skills: readSkillsRoot(),
          enemies: enemiesJson,
          stages: stagesJson,
          parties: partiesJson,
          operationPassiveCatalog: operationPassiveCatalogJson,
        },
        { mode: 'editor' },
      ),
    ).toThrow(/Unknown combatModuleId/);
  });

  it('class bundle save preserves catalog-referenced passives outside the class pool', () => {
    const skillsRoot = readSkillsRoot();
    const stemPassives = skillsRoot.passives.filter((passive) =>
      passive.id.startsWith('df_guardian_'),
    );

    const catalogOnlyPassive: PassiveSkillDef = {
      id: 'df_guardian_passive_catalog_only',
      name: 'catalog only fixture',
      effect: 'buff',
      buffSubKind: 'stat',
      buffStat: ['def'],
      buffMultiplier: 1.02,
      buffTargetRule: { kind: 'self' },
    };
    const allStemPassives = [...stemPassives, catalogOnlyPassive];

    // class editor draft は初期 pool の passive のみ（catalog-only は含まない）
    const draftPassives = stemPassives.filter(
      (passive) => passive.id !== catalogOnlyPassive.id,
    ) as PassiveSkillDef[];

    const catalog = parseOperationPassiveCatalog({
      ...operationPassiveCatalogJson,
      candidatesByClass: {
        df_guardian: ['df_guardian_op_block_rate_up', catalogOnlyPassive.id],
      },
      costUnlockLevelByPassiveId: {
        df_guardian_op_block_rate_up: 0,
        [catalogOnlyPassive.id]: 10,
      },
    });
    const preserved = collectCatalogPassivesToPreserveOnEntityReplace(
      allStemPassives,
      draftPassives,
      catalog,
    );
    expect(preserved.map((passive) => passive.id)).toEqual([
      catalogOnlyPassive.id,
    ]);

    // draft に既に含まれる場合は重複追加しない
    expect(
      collectCatalogPassivesToPreserveOnEntityReplace(
        allStemPassives,
        allStemPassives,
        catalog,
      ),
    ).toEqual([]);
  });
});

/**
 * @vitest-environment happy-dom
 */
describe('OperationPassiveCatalogEditorStep (R9d UI)', () => {
  let host: HTMLElement;

  afterEach(() => {
    host?.remove();
  });

  it('renders grant fields, class checklist, and save button', () => {
    const gameData = loadGameData();
    const draft = operationPassiveCatalogDraftFromCatalog(
      gameData.operationPassiveCatalog,
    );
    host = document.createElement('div');
    document.body.appendChild(host);

    new OperationPassiveCatalogEditorStep(host, {
      getDraft: () => draft,
      classRegistry: gameData.classRegistry,
      passives: Object.values(gameData.skillRegistry.passives),
      onDraftChange: vi.fn(),
      onSave: vi.fn(),
      saving: false,
    });

    expect(host.textContent).toContain('付与条件');
    expect(host.textContent).toContain('兵科ごとの取得候補');
    expect(host.textContent).toContain('df_guardian_op_block_rate_up');
    expect(host.textContent).toContain('参照プレビュー');
    expect(host.textContent).toContain('df_guardian:');
    expect(host.textContent).toContain('at_swordsman:');
    expect(host.textContent).toContain('at_sorcerer:');
    expect(host.textContent).toContain('sp_cleric:');
    expect(host.querySelector('.editor-actions .editor-btn-primary')).not.toBeNull();
    expect(host.querySelectorAll('input.editor-input').length).toBeGreaterThanOrEqual(2);
  });
});
