/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import classesJson from '../../data/classes.json';
import enemiesJson from '../../data/enemies.json';
import partiesJson from '../../data/parties.json';
import stagesDemoJson from '../../data/stages-demo.json';
import problemSeriesCatalogJson from '../../data/problem-series-catalog.json';
import type { ActiveSkillDef, CombatModuleDef, GameData, PassiveSkillDef } from '../battle/types.ts';
import { tryLoadGameData } from '../battle/data/loadGameData.ts';
import { parseAndValidateGameDataJson } from '../battle/data/validateGameData.ts';
import { createProblemSeriesOperationStartSnapshot } from '../battle/problemSeries/operationStartSnapshot.ts';
import * as operationStartSnapshotModule from '../battle/problemSeries/operationStartSnapshot.ts';
import { resolveProblemSeriesFromSeed } from '../battle/problemSeries/seedResolve.ts';
import * as seedResolveModule from '../battle/problemSeries/seedResolve.ts';
import type { ProblemSeriesOperationStartSnapshot } from '../battle/problemSeries/operationStartSnapshot.ts';
import { StageSelectionScreenHost } from './StageSelectionScreenHost.ts';
import { STAGE_FIRST_PLAY_GUIDANCE_CLASS } from '../ui/stageDetailDom.ts';

const RAW_FIXTURE_SEED = '  fixture-a  ';
const NORMALIZED_FIXTURE_SEED = 'fixture-a';

const passiveModules = import.meta.glob<PassiveSkillDef[]>(
  '../../data/skills/passives/*.json',
  { eager: true, import: 'default' },
);

const activeModules = import.meta.glob<ActiveSkillDef[]>(
  '../../data/skills/actives/*.json',
  { eager: true, import: 'default' },
);

const combatModuleFiles = import.meta.glob<CombatModuleDef[]>(
  '../../data/combat-modules/*.json',
  { eager: true, import: 'default' },
);

function loadDemoGameDataForTest(): GameData {
  const loaded = tryLoadGameData();
  if (!loaded.ok) {
    throw new Error(loaded.error);
  }

  const parsed = parseAndValidateGameDataJson({
    classes: classesJson,
    enemies: enemiesJson,
    skills: {
      passives: Object.values(passiveModules).flat(),
      actives: Object.values(activeModules).flat(),
    },
    combatModules: Object.values(combatModuleFiles).flat(),
    stages: stagesDemoJson,
    parties: partiesJson,
    problemSeriesCatalog: problemSeriesCatalogJson,
  });

  return {
    ...loaded.data,
    stages: parsed.stages,
  };
}

function createProductionPreparedSnapshot(
  gameData: GameData,
  normalizedSeed: string = NORMALIZED_FIXTURE_SEED,
): ProblemSeriesOperationStartSnapshot {
  const resolved = resolveProblemSeriesFromSeed(
    gameData.problemSeriesCatalog,
    normalizedSeed,
  );
  return createProblemSeriesOperationStartSnapshot(resolved);
}

describe('StageSelectionScreenHost', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('syncs selected stage from getCurrentStageId on show', () => {
    const gameData = loadDemoGameDataForTest();
    const host = document.createElement('div');
    let currentStageId = 'demo_ch1_01';
    const onSortie = vi.fn();

    const screenHost = new StageSelectionScreenHost(host, gameData, {
      getCurrentStageId: () => currentStageId,
      onSortie,
    });

    screenHost.show();
    expect(host.querySelector('.stage-selection-list-item--selected')?.textContent).toBe(
      '前線の張り',
    );

    currentStageId = 'demo_ch1_05';
    screenHost.show();
    expect(host.querySelector('.stage-selection-list-item--selected')?.textContent).toBe(
      '炎と刃',
    );

    screenHost.destroy();
  });

  it('forwards clearedStageIds from getClearedStageIds on show', () => {
    const gameData = loadDemoGameDataForTest();
    const host = document.createElement('div');

    const screenHost = new StageSelectionScreenHost(host, gameData, {
      getCurrentStageId: () => 'demo_ch1_01',
      getClearedStageIds: () => ['demo_ch1_01', 'demo_ch1_03'],
      onSortie: vi.fn(),
    });

    screenHost.show();
    expect(host.querySelectorAll('.stage-selection-list-item-cleared')).toHaveLength(2);

    screenHost.destroy();
  });

  it('forwards sortie to onSortie with selected stage id', () => {
    const gameData = loadDemoGameDataForTest();
    const host = document.createElement('div');
    const onSortie = vi.fn();

    const screenHost = new StageSelectionScreenHost(host, gameData, {
      getCurrentStageId: () => 'demo_ch1_05',
      onSortie,
    });

    screenHost.show();
    const sortieButton = host.querySelector<HTMLButtonElement>(
      '.stage-selection-sortie',
    );
    sortieButton?.click();

    expect(onSortie).toHaveBeenCalledWith('demo_ch1_05');

    screenHost.destroy();
  });

  it('shows first-play guidance when showFirstPlayGuidance is enabled', () => {
    const gameData = loadDemoGameDataForTest();
    const host = document.createElement('div');

    const screenHost = new StageSelectionScreenHost(
      host,
      gameData,
      {
        getCurrentStageId: () => 'demo_ch1_01',
        onSortie: vi.fn(),
      },
      true,
    );

    screenHost.show();
    expect(host.querySelector(`.${STAGE_FIRST_PLAY_GUIDANCE_CLASS}`)).not.toBeNull();

    screenHost.destroy();
  });

  it('hides first-play guidance when showFirstPlayGuidance is disabled', () => {
    const gameData = loadDemoGameDataForTest();
    const host = document.createElement('div');

    const screenHost = new StageSelectionScreenHost(host, gameData, {
      getCurrentStageId: () => 'demo_ch1_01',
      onSortie: vi.fn(),
    });

    screenHost.show();
    expect(host.querySelector(`.${STAGE_FIRST_PLAY_GUIDANCE_CLASS}`)).toBeNull();

    screenHost.destroy();
  });

  it('wires fixedStages → mainEntry → seed prepare → back → fixed sortie substate', () => {
    const gameData = loadDemoGameDataForTest();
    const host = document.createElement('div');
    document.body.appendChild(host);

    const currentStageId = 'demo_ch1_05';
    const onSortie = vi.fn();
    const onOpenMainOperation = vi.fn();
    const onPrepareMainOperation = vi.fn();

    const screenHost = new StageSelectionScreenHost(host, gameData, {
      getCurrentStageId: () => currentStageId,
      onSortie,
      onOpenMainOperation,
      onPrepareMainOperation,
    });

    const fixedChild = host.querySelector('.stage-selection-fixed-host') as HTMLElement;
    const entryChild = host.querySelector('.problem-series-entry-screen-host') as HTMLElement;

    // --- initial fixed ---
    screenHost.show();

    expect(host.hidden).toBe(false);
    expect(fixedChild.hidden).toBe(false);
    expect(entryChild.hidden).toBe(true);
    expect(host.querySelectorAll('.stage-selection-panel')).toHaveLength(1);
    expect(host.querySelectorAll('.problem-series-entry-panel')).toHaveLength(0);
    expect(host.querySelector('.stage-selection-list-item--selected')?.textContent).toBe(
      '炎と刃',
    );
    expect(onOpenMainOperation).toHaveBeenCalledTimes(0);
    expect(onPrepareMainOperation).toHaveBeenCalledTimes(0);
    expect(onSortie).toHaveBeenCalledTimes(0);

    // --- main button click ---
    const mainButton = host.querySelector<HTMLButtonElement>(
      '.stage-selection-main-operation',
    );
    mainButton?.click();

    expect(onOpenMainOperation).toHaveBeenCalledTimes(1);
    expect(onSortie).toHaveBeenCalledTimes(0);
    expect(fixedChild.hidden).toBe(true);
    expect(entryChild.hidden).toBe(false);
    expect(host.querySelectorAll('.stage-selection-panel')).toHaveLength(0);
    expect(host.querySelectorAll('.problem-series-entry-panel')).toHaveLength(1);
    expect(document.querySelector('.problem-series-overview-panel')).toBeNull();
    expect(document.querySelector('.battle-view')).toBeNull();

    // --- seed prepare ---
    const seedInput = host.querySelector(
      '.problem-series-entry-seed-input',
    ) as HTMLInputElement;
    const prepareButton = host.querySelector(
      '.problem-series-entry-prepare',
    ) as HTMLButtonElement;

    seedInput.value = RAW_FIXTURE_SEED;
    seedInput.dispatchEvent(new Event('input', { bubbles: true }));

    expect(prepareButton.disabled).toBe(false);

    prepareButton.click();

    expect(onPrepareMainOperation).toHaveBeenCalledTimes(1);
    expect(onPrepareMainOperation).toHaveBeenCalledWith(NORMALIZED_FIXTURE_SEED);
    expect(onPrepareMainOperation.mock.calls[0]?.[0]).not.toBe(RAW_FIXTURE_SEED);
    expect(host.querySelectorAll('.problem-series-entry-panel')).toHaveLength(1);
    expect(host.querySelectorAll('.stage-selection-panel')).toHaveLength(0);
    expect(onSortie).toHaveBeenCalledTimes(0);

    // --- back ---
    const backButton = host.querySelector<HTMLButtonElement>(
      '.problem-series-entry-back',
    );
    backButton?.click();

    expect(host.querySelectorAll('.problem-series-entry-panel')).toHaveLength(0);
    expect(host.querySelectorAll('.stage-selection-panel')).toHaveLength(1);
    expect(fixedChild.hidden).toBe(false);
    expect(entryChild.hidden).toBe(true);
    expect(host.querySelector('.stage-selection-list-item--selected')?.textContent).toBe(
      '炎と刃',
    );
    expect(onOpenMainOperation).toHaveBeenCalledTimes(1);
    expect(onPrepareMainOperation).toHaveBeenCalledTimes(1);
    expect(onSortie).toHaveBeenCalledTimes(0);

    // --- fixed sortie ---
    const sortieButton = host.querySelector<HTMLButtonElement>(
      '.stage-selection-sortie',
    );
    sortieButton?.click();

    expect(onSortie).toHaveBeenCalledTimes(1);
    expect(onSortie).toHaveBeenCalledWith(currentStageId);
    expect(onOpenMainOperation).toHaveBeenCalledTimes(1);
    expect(onPrepareMainOperation).toHaveBeenCalledTimes(1);

    // --- callback omission ---
    const omissionHost = document.createElement('div');
    document.body.appendChild(omissionHost);
    const omissionScreenHost = new StageSelectionScreenHost(omissionHost, gameData, {
      getCurrentStageId: () => 'demo_ch1_01',
      onSortie: vi.fn(),
    });
    omissionScreenHost.show();

    const omissionMainButton = omissionHost.querySelector<HTMLButtonElement>(
      '.stage-selection-main-operation',
    );
    expect(() => omissionMainButton?.click()).not.toThrow();

    const omissionSeedInput = omissionHost.querySelector(
      '.problem-series-entry-seed-input',
    ) as HTMLInputElement;
    const omissionPrepareButton = omissionHost.querySelector(
      '.problem-series-entry-prepare',
    ) as HTMLButtonElement;
    omissionSeedInput.value = NORMALIZED_FIXTURE_SEED;
    omissionSeedInput.dispatchEvent(new Event('input', { bubbles: true }));
    expect(() => omissionPrepareButton?.click()).not.toThrow();

    const omissionBackButton = omissionHost.querySelector<HTMLButtonElement>(
      '.problem-series-entry-back',
    );
    expect(() => omissionBackButton?.click()).not.toThrow();

    // --- destroy ownership boundary ---
    const existingChild = document.createElement('p');
    existingChild.textContent = 'existing-host-child';
    host.insertBefore(existingChild, host.firstChild);

    const callbackCountsBeforeDestroy = {
      onOpenMainOperation: onOpenMainOperation.mock.calls.length,
      onPrepareMainOperation: onPrepareMainOperation.mock.calls.length,
      onSortie: onSortie.mock.calls.length,
    };

    screenHost.destroy();

    expect(host.querySelector('.stage-selection-fixed-host')).toBeNull();
    expect(host.querySelector('.problem-series-entry-screen-host')).toBeNull();
    expect(host.querySelector('.problem-series-overview-screen-host')).toBeNull();
    expect(host.querySelector('p')?.textContent).toBe('existing-host-child');
    expect(onOpenMainOperation.mock.calls.length).toBe(
      callbackCountsBeforeDestroy.onOpenMainOperation,
    );
    expect(onPrepareMainOperation.mock.calls.length).toBe(
      callbackCountsBeforeDestroy.onPrepareMainOperation,
    );
    expect(onSortie.mock.calls.length).toBe(callbackCountsBeforeDestroy.onSortie);

    omissionScreenHost.destroy();
    host.remove();
    omissionHost.remove();
  });

  it('wires fixedStages → mainEntry → prepare → mainOverview → back → re-prepare → confirm (R12m unit2K4)', () => {
    const gameData = loadDemoGameDataForTest();
    const host = document.createElement('div');
    document.body.appendChild(host);

    const resolveSpy = vi.spyOn(seedResolveModule, 'resolveProblemSeriesFromSeed');
    const snapshotFactorySpy = vi.spyOn(
      operationStartSnapshotModule,
      'createProblemSeriesOperationStartSnapshot',
    );

    let preparedSnapshot: ProblemSeriesOperationStartSnapshot | null = null;

    const onSortie = vi.fn();
    const onOpenMainOperation = vi.fn();
    const onPrepareMainOperation = vi.fn((normalizedSeed: string) => {
      const resolved = resolveProblemSeriesFromSeed(
        gameData.problemSeriesCatalog,
        normalizedSeed,
      );
      preparedSnapshot = createProblemSeriesOperationStartSnapshot(resolved);
    });
    const getPreparedProblemSeriesOperationStartSnapshot = vi.fn(
      () => preparedSnapshot,
    );
    const onBackFromMainOperationOverview = vi.fn(() => {
      preparedSnapshot = null;
    });
    const onConfirmMainOperation = vi.fn();

    const screenHost = new StageSelectionScreenHost(host, gameData, {
      getCurrentStageId: () => 'demo_ch1_05',
      onSortie,
      onOpenMainOperation,
      onPrepareMainOperation,
      getPreparedProblemSeriesOperationStartSnapshot,
      onBackFromMainOperationOverview,
      onConfirmMainOperation,
    });

    const fixedChild = host.querySelector('.stage-selection-fixed-host') as HTMLElement;
    const entryChild = host.querySelector('.problem-series-entry-screen-host') as HTMLElement;
    const overviewChild = host.querySelector(
      '.problem-series-overview-screen-host',
    ) as HTMLElement;

    // 1. fixedStages → mainEntry
    screenHost.show();
    expect(host.querySelectorAll('.stage-selection-panel')).toHaveLength(1);
    expect(host.querySelectorAll('.problem-series-entry-panel')).toHaveLength(0);
    expect(host.querySelectorAll('.problem-series-overview-panel')).toHaveLength(0);

    const mainButton = host.querySelector<HTMLButtonElement>(
      '.stage-selection-main-operation',
    )!;
    mainButton.click();

    expect(onOpenMainOperation).toHaveBeenCalledTimes(1);
    expect(fixedChild.hidden).toBe(true);
    expect(entryChild.hidden).toBe(false);
    expect(overviewChild.hidden).toBe(true);
    expect(host.querySelectorAll('.stage-selection-panel')).toHaveLength(0);
    expect(host.querySelectorAll('.problem-series-entry-panel')).toHaveLength(1);

    // 2–3. prepare → overview from getter snapshot
    const seedInput = host.querySelector(
      '.problem-series-entry-seed-input',
    ) as HTMLInputElement;
    const prepareButton = host.querySelector(
      '.problem-series-entry-prepare',
    ) as HTMLButtonElement;

    seedInput.value = RAW_FIXTURE_SEED;
    seedInput.dispatchEvent(new Event('input', { bubbles: true }));
    prepareButton.click();

    expect(onPrepareMainOperation).toHaveBeenCalledTimes(1);
    expect(onPrepareMainOperation).toHaveBeenCalledWith(NORMALIZED_FIXTURE_SEED);
    expect(getPreparedProblemSeriesOperationStartSnapshot).toHaveBeenCalledTimes(1);
    expect(preparedSnapshot).not.toBeNull();

    const resolveCallsAfterFirstPrepare = resolveSpy.mock.calls.length;
    const factoryCallsAfterFirstPrepare = snapshotFactorySpy.mock.calls.length;
    expect(resolveCallsAfterFirstPrepare).toBeGreaterThan(0);
    expect(factoryCallsAfterFirstPrepare).toBeGreaterThan(0);

    // 4–5. overview visible; fixed + entry panels absent
    expect(fixedChild.hidden).toBe(true);
    expect(entryChild.hidden).toBe(true);
    expect(overviewChild.hidden).toBe(false);
    expect(host.querySelectorAll('.stage-selection-panel')).toHaveLength(0);
    expect(host.querySelectorAll('.problem-series-entry-panel')).toHaveLength(0);
    expect(host.querySelectorAll('.problem-series-overview-panel')).toHaveLength(1);

    const waveEls = host.querySelectorAll('.problem-series-overview-wave');
    expect(waveEls).toHaveLength(3);

    const groupEls = host.querySelectorAll('.problem-series-overview-enemy-group');
    expect(groupEls.length).toBeGreaterThan(0);

    // 6. Host did not re-run resolver/factory beyond prepare callback
    expect(resolveSpy.mock.calls.length).toBe(resolveCallsAfterFirstPrepare);
    expect(snapshotFactorySpy.mock.calls.length).toBe(factoryCallsAfterFirstPrepare);

    // 7–10. overview back → seed entry (not fixed stages)
    const overviewBackButton = host.querySelector<HTMLButtonElement>(
      '.problem-series-overview-back',
    )!;
    overviewBackButton.click();

    expect(onBackFromMainOperationOverview).toHaveBeenCalledTimes(1);
    expect(host.querySelectorAll('.problem-series-entry-panel')).toHaveLength(1);
    expect(host.querySelectorAll('.problem-series-overview-panel')).toHaveLength(0);
    expect(onPrepareMainOperation).toHaveBeenCalledTimes(1);
    expect(fixedChild.hidden).toBe(true);
    expect(entryChild.hidden).toBe(false);
    expect(overviewChild.hidden).toBe(true);
    expect(host.querySelectorAll('.stage-selection-panel')).toHaveLength(0);
    expect(resolveSpy.mock.calls.length).toBe(resolveCallsAfterFirstPrepare);
    expect(snapshotFactorySpy.mock.calls.length).toBe(factoryCallsAfterFirstPrepare);

    // 11. re-prepare → overview → confirm
    const seedInputAfterBack = host.querySelector(
      '.problem-series-entry-seed-input',
    ) as HTMLInputElement;
    const prepareButtonAfterBack = host.querySelector(
      '.problem-series-entry-prepare',
    ) as HTMLButtonElement;

    seedInputAfterBack.value = NORMALIZED_FIXTURE_SEED;
    seedInputAfterBack.dispatchEvent(new Event('input', { bubbles: true }));
    prepareButtonAfterBack.click();

    expect(onPrepareMainOperation).toHaveBeenCalledTimes(2);
    expect(host.querySelectorAll('.problem-series-overview-panel')).toHaveLength(1);
    expect(host.querySelectorAll('.problem-series-entry-panel')).toHaveLength(0);

    const confirmButton = host.querySelector<HTMLButtonElement>(
      '.problem-series-overview-confirm',
    )!;
    confirmButton.click();

    expect(onConfirmMainOperation).toHaveBeenCalledTimes(1);
    expect(onSortie).toHaveBeenCalledTimes(0);

    // 13–14. destroy ownership boundary
    const existingChild = document.createElement('p');
    existingChild.textContent = 'existing-host-child-2k4';
    host.insertBefore(existingChild, host.firstChild);

    const callbackCountsBeforeDestroy = {
      onOpenMainOperation: onOpenMainOperation.mock.calls.length,
      onPrepareMainOperation: onPrepareMainOperation.mock.calls.length,
      onBackFromMainOperationOverview: onBackFromMainOperationOverview.mock.calls.length,
      onConfirmMainOperation: onConfirmMainOperation.mock.calls.length,
      onSortie: onSortie.mock.calls.length,
    };

    screenHost.destroy();

    expect(host.querySelector('.stage-selection-fixed-host')).toBeNull();
    expect(host.querySelector('.problem-series-entry-screen-host')).toBeNull();
    expect(host.querySelector('.problem-series-overview-screen-host')).toBeNull();
    expect(host.querySelector('p')?.textContent).toBe('existing-host-child-2k4');
    expect(onOpenMainOperation.mock.calls.length).toBe(
      callbackCountsBeforeDestroy.onOpenMainOperation,
    );
    expect(onPrepareMainOperation.mock.calls.length).toBe(
      callbackCountsBeforeDestroy.onPrepareMainOperation,
    );
    expect(onBackFromMainOperationOverview.mock.calls.length).toBe(
      callbackCountsBeforeDestroy.onBackFromMainOperationOverview,
    );
    expect(onConfirmMainOperation.mock.calls.length).toBe(
      callbackCountsBeforeDestroy.onConfirmMainOperation,
    );
    expect(onSortie.mock.calls.length).toBe(callbackCountsBeforeDestroy.onSortie);

    host.remove();
  });

  it('showPreparedMainOperationOverview opens overview from prepared snapshot without prepare (R12m unit2O1)', () => {
    const gameData = loadDemoGameDataForTest();
    const host = document.createElement('div');
    document.body.appendChild(host);

    const preparedSnapshot = createProductionPreparedSnapshot(gameData);
    const snapshotBefore = structuredClone(preparedSnapshot);

    const onPrepareMainOperation = vi.fn();
    const getPreparedProblemSeriesOperationStartSnapshot = vi.fn(
      () => preparedSnapshot,
    );
    const onBackFromMainOperationOverview = vi.fn();
    const onConfirmMainOperation = vi.fn();

    const screenHost = new StageSelectionScreenHost(host, gameData, {
      getCurrentStageId: () => 'demo_ch1_05',
      onSortie: vi.fn(),
      onPrepareMainOperation,
      getPreparedProblemSeriesOperationStartSnapshot,
      onBackFromMainOperationOverview,
      onConfirmMainOperation,
    });

    const fixedChild = host.querySelector('.stage-selection-fixed-host') as HTMLElement;
    const entryChild = host.querySelector('.problem-series-entry-screen-host') as HTMLElement;
    const overviewChild = host.querySelector(
      '.problem-series-overview-screen-host',
    ) as HTMLElement;

    screenHost.show();

    expect(fixedChild.hidden).toBe(false);
    expect(host.querySelectorAll('.stage-selection-panel')).toHaveLength(1);

    const result = screenHost.showPreparedMainOperationOverview();

    expect(result).toBe(true);
    expect(onPrepareMainOperation).toHaveBeenCalledTimes(0);
    expect(getPreparedProblemSeriesOperationStartSnapshot).toHaveBeenCalled();

    expect(fixedChild.hidden).toBe(true);
    expect(host.querySelectorAll('.stage-selection-panel')).toHaveLength(0);
    expect(entryChild.hidden).toBe(true);
    expect(host.querySelectorAll('.problem-series-entry-panel')).toHaveLength(0);
    expect(overviewChild.hidden).toBe(false);
    expect(host.querySelectorAll('.problem-series-overview-panel')).toHaveLength(1);

    const seedEl = host.querySelector('.problem-series-overview-seed');
    expect(seedEl).not.toBeNull();
    expect(seedEl?.textContent).toContain(NORMALIZED_FIXTURE_SEED);

    const waveEls = host.querySelectorAll('.problem-series-overview-wave');
    expect(waveEls).toHaveLength(3);

    const groupEls = host.querySelectorAll('.problem-series-overview-enemy-group');
    expect(groupEls.length).toBeGreaterThan(0);

    const confirmButton = host.querySelector<HTMLButtonElement>(
      '.problem-series-overview-confirm',
    );
    const backButton = host.querySelector<HTMLButtonElement>(
      '.problem-series-overview-back',
    );
    expect(confirmButton).not.toBeNull();
    expect(backButton).not.toBeNull();

    confirmButton!.click();
    expect(onConfirmMainOperation).toHaveBeenCalledTimes(1);

    backButton!.click();
    expect(onBackFromMainOperationOverview).toHaveBeenCalledTimes(1);

    expect(preparedSnapshot).toEqual(snapshotBefore);
    expect(preparedSnapshot.seed).toBe(NORMALIZED_FIXTURE_SEED);

    screenHost.destroy();
    host.remove();
  });

  it('showPreparedMainOperationOverview returns false when prepared snapshot is missing (R12m unit2O1)', () => {
    const gameData = loadDemoGameDataForTest();
    const host = document.createElement('div');
    document.body.appendChild(host);

    const onPrepareMainOperation = vi.fn();
    const getPreparedProblemSeriesOperationStartSnapshot = vi.fn(() => null);
    const onBackFromMainOperationOverview = vi.fn();
    const onConfirmMainOperation = vi.fn();

    const screenHost = new StageSelectionScreenHost(host, gameData, {
      getCurrentStageId: () => 'demo_ch1_05',
      onSortie: vi.fn(),
      onPrepareMainOperation,
      getPreparedProblemSeriesOperationStartSnapshot,
      onBackFromMainOperationOverview,
      onConfirmMainOperation,
    });

    const fixedChild = host.querySelector('.stage-selection-fixed-host') as HTMLElement;
    const entryChild = host.querySelector('.problem-series-entry-screen-host') as HTMLElement;
    const overviewChild = host.querySelector(
      '.problem-series-overview-screen-host',
    ) as HTMLElement;

    screenHost.show();

    const result = screenHost.showPreparedMainOperationOverview();

    expect(result).toBe(false);
    expect(fixedChild.hidden).toBe(false);
    expect(host.querySelectorAll('.stage-selection-panel')).toHaveLength(1);
    expect(entryChild.hidden).toBe(true);
    expect(host.querySelectorAll('.problem-series-entry-panel')).toHaveLength(0);
    expect(overviewChild.hidden).toBe(true);
    expect(host.querySelectorAll('.problem-series-overview-panel')).toHaveLength(0);
    expect(onPrepareMainOperation).toHaveBeenCalledTimes(0);
    expect(onConfirmMainOperation).toHaveBeenCalledTimes(0);
    expect(onBackFromMainOperationOverview).toHaveBeenCalledTimes(0);

    screenHost.destroy();
    host.remove();
  });

  it('showPreparedMainOperationOverview returns false when host is hidden (R12m unit2O1)', () => {
    const gameData = loadDemoGameDataForTest();
    const host = document.createElement('div');
    document.body.appendChild(host);

    const preparedSnapshot = createProductionPreparedSnapshot(gameData);

    const onPrepareMainOperation = vi.fn();
    const getPreparedProblemSeriesOperationStartSnapshot = vi.fn(
      () => preparedSnapshot,
    );
    const onBackFromMainOperationOverview = vi.fn();
    const onConfirmMainOperation = vi.fn();

    const screenHost = new StageSelectionScreenHost(host, gameData, {
      getCurrentStageId: () => 'demo_ch1_05',
      onSortie: vi.fn(),
      onPrepareMainOperation,
      getPreparedProblemSeriesOperationStartSnapshot,
      onBackFromMainOperationOverview,
      onConfirmMainOperation,
    });

    const fixedChild = host.querySelector('.stage-selection-fixed-host') as HTMLElement;
    const entryChild = host.querySelector('.problem-series-entry-screen-host') as HTMLElement;
    const overviewChild = host.querySelector(
      '.problem-series-overview-screen-host',
    ) as HTMLElement;

    screenHost.show();
    screenHost.hide();

    expect(host.hidden).toBe(true);

    const result = screenHost.showPreparedMainOperationOverview();

    expect(result).toBe(false);
    expect(host.hidden).toBe(true);
    expect(fixedChild.hidden).toBe(false);
    expect(host.querySelectorAll('.stage-selection-panel')).toHaveLength(1);
    expect(entryChild.hidden).toBe(true);
    expect(host.querySelectorAll('.problem-series-entry-panel')).toHaveLength(0);
    expect(overviewChild.hidden).toBe(true);
    expect(host.querySelectorAll('.problem-series-overview-panel')).toHaveLength(0);
    expect(onPrepareMainOperation).toHaveBeenCalledTimes(0);
    expect(getPreparedProblemSeriesOperationStartSnapshot).toHaveBeenCalledTimes(0);
    expect(onConfirmMainOperation).toHaveBeenCalledTimes(0);
    expect(onBackFromMainOperationOverview).toHaveBeenCalledTimes(0);

    screenHost.destroy();
    host.remove();
  });

  it('showMainOperationEntry opens empty seed entry from fixed stages (R12m unit2P1)', () => {
    const gameData = loadDemoGameDataForTest();
    const host = document.createElement('div');
    document.body.appendChild(host);

    const resolveSpy = vi.spyOn(seedResolveModule, 'resolveProblemSeriesFromSeed');
    const snapshotFactorySpy = vi.spyOn(
      operationStartSnapshotModule,
      'createProblemSeriesOperationStartSnapshot',
    );

    const onOpenMainOperation = vi.fn();
    const onPrepareMainOperation = vi.fn();
    const getPreparedProblemSeriesOperationStartSnapshot = vi.fn(() => null);
    const onBackFromMainOperationOverview = vi.fn();
    const onConfirmMainOperation = vi.fn();

    const screenHost = new StageSelectionScreenHost(host, gameData, {
      getCurrentStageId: () => 'demo_ch1_05',
      onSortie: vi.fn(),
      onOpenMainOperation,
      onPrepareMainOperation,
      getPreparedProblemSeriesOperationStartSnapshot,
      onBackFromMainOperationOverview,
      onConfirmMainOperation,
    });

    const fixedChild = host.querySelector('.stage-selection-fixed-host') as HTMLElement;
    const entryChild = host.querySelector('.problem-series-entry-screen-host') as HTMLElement;

    screenHost.show();

    const result = screenHost.showMainOperationEntry();

    expect(result).toBe(true);
    expect(fixedChild.hidden).toBe(true);
    expect(host.querySelectorAll('.stage-selection-panel')).toHaveLength(0);
    expect(host.querySelectorAll('.problem-series-overview-panel')).toHaveLength(0);
    expect(entryChild.hidden).toBe(false);
    expect(host.querySelectorAll('.problem-series-entry-panel')).toHaveLength(1);

    const seedInput = host.querySelector(
      '.problem-series-entry-seed-input',
    ) as HTMLInputElement;
    const prepareButton = host.querySelector(
      '.problem-series-entry-prepare',
    ) as HTMLButtonElement;
    const errorEl = host.querySelector('.problem-series-entry-seed-error');

    expect(seedInput).not.toBeNull();
    expect(seedInput.value).toBe('');
    expect(prepareButton.disabled).toBe(true);
    expect(errorEl?.textContent).toBe('seedを入力してください');

    expect(onOpenMainOperation).toHaveBeenCalledTimes(1);
    expect(onPrepareMainOperation).toHaveBeenCalledTimes(0);
    expect(getPreparedProblemSeriesOperationStartSnapshot).toHaveBeenCalledTimes(0);
    expect(onBackFromMainOperationOverview).toHaveBeenCalledTimes(0);
    expect(onConfirmMainOperation).toHaveBeenCalledTimes(0);
    expect(resolveSpy).toHaveBeenCalledTimes(0);
    expect(snapshotFactorySpy).toHaveBeenCalledTimes(0);

    screenHost.destroy();
    host.remove();
  });

  it('showMainOperationEntry resets seed after returning to fixed stages (R12m unit2P1)', () => {
    const gameData = loadDemoGameDataForTest();
    const host = document.createElement('div');
    document.body.appendChild(host);

    const onOpenMainOperation = vi.fn();

    const screenHost = new StageSelectionScreenHost(host, gameData, {
      getCurrentStageId: () => 'demo_ch1_05',
      onSortie: vi.fn(),
      onOpenMainOperation,
    });

    screenHost.show();
    expect(screenHost.showMainOperationEntry()).toBe(true);

    const firstSeedInput = host.querySelector(
      '.problem-series-entry-seed-input',
    ) as HTMLInputElement;
    firstSeedInput.value = NORMALIZED_FIXTURE_SEED;
    firstSeedInput.dispatchEvent(new Event('input', { bubbles: true }));

    const backButton = host.querySelector<HTMLButtonElement>(
      '.problem-series-entry-back',
    )!;
    backButton.click();

    expect(host.querySelectorAll('.stage-selection-panel')).toHaveLength(1);
    expect(host.querySelectorAll('.problem-series-entry-panel')).toHaveLength(0);

    expect(screenHost.showMainOperationEntry()).toBe(true);

    const secondSeedInput = host.querySelector(
      '.problem-series-entry-seed-input',
    ) as HTMLInputElement;
    const prepareButton = host.querySelector(
      '.problem-series-entry-prepare',
    ) as HTMLButtonElement;
    const errorEl = host.querySelector('.problem-series-entry-seed-error');

    expect(secondSeedInput).not.toBe(firstSeedInput);
    expect(secondSeedInput.value).toBe('');
    expect(prepareButton.disabled).toBe(true);
    expect(errorEl?.textContent).toBe('seedを入力してください');
    expect(onOpenMainOperation).toHaveBeenCalledTimes(2);

    screenHost.destroy();
    host.remove();
  });

  it('showMainOperationEntry returns false when host is hidden (R12m unit2P1)', () => {
    const gameData = loadDemoGameDataForTest();
    const host = document.createElement('div');
    document.body.appendChild(host);

    const onOpenMainOperation = vi.fn();
    const onPrepareMainOperation = vi.fn();
    const getPreparedProblemSeriesOperationStartSnapshot = vi.fn(() => null);
    const onBackFromMainOperationOverview = vi.fn();
    const onConfirmMainOperation = vi.fn();

    const screenHost = new StageSelectionScreenHost(host, gameData, {
      getCurrentStageId: () => 'demo_ch1_05',
      onSortie: vi.fn(),
      onOpenMainOperation,
      onPrepareMainOperation,
      getPreparedProblemSeriesOperationStartSnapshot,
      onBackFromMainOperationOverview,
      onConfirmMainOperation,
    });

    const fixedChild = host.querySelector('.stage-selection-fixed-host') as HTMLElement;
    const entryChild = host.querySelector('.problem-series-entry-screen-host') as HTMLElement;
    const overviewChild = host.querySelector(
      '.problem-series-overview-screen-host',
    ) as HTMLElement;

    screenHost.show();
    screenHost.hide();

    const result = screenHost.showMainOperationEntry();

    expect(result).toBe(false);
    expect(host.hidden).toBe(true);
    expect(fixedChild.hidden).toBe(false);
    expect(host.querySelectorAll('.stage-selection-panel')).toHaveLength(1);
    expect(entryChild.hidden).toBe(true);
    expect(host.querySelectorAll('.problem-series-entry-panel')).toHaveLength(0);
    expect(overviewChild.hidden).toBe(true);
    expect(host.querySelectorAll('.problem-series-overview-panel')).toHaveLength(0);
    expect(onOpenMainOperation).toHaveBeenCalledTimes(0);
    expect(onPrepareMainOperation).toHaveBeenCalledTimes(0);
    expect(getPreparedProblemSeriesOperationStartSnapshot).toHaveBeenCalledTimes(0);
    expect(onBackFromMainOperationOverview).toHaveBeenCalledTimes(0);
    expect(onConfirmMainOperation).toHaveBeenCalledTimes(0);

    screenHost.destroy();
    host.remove();
  });

  it('main operation button opens entry with empty seed (R12m unit2P1 regression)', () => {
    const gameData = loadDemoGameDataForTest();
    const host = document.createElement('div');
    document.body.appendChild(host);

    const onOpenMainOperation = vi.fn();

    const screenHost = new StageSelectionScreenHost(host, gameData, {
      getCurrentStageId: () => 'demo_ch1_05',
      onSortie: vi.fn(),
      onOpenMainOperation,
    });

    screenHost.show();

    const mainButton = host.querySelector<HTMLButtonElement>(
      '.stage-selection-main-operation',
    )!;
    mainButton.click();

    expect(host.querySelectorAll('.problem-series-entry-panel')).toHaveLength(1);

    const seedInput = host.querySelector(
      '.problem-series-entry-seed-input',
    ) as HTMLInputElement;
    expect(seedInput.value).toBe('');
    expect(onOpenMainOperation).toHaveBeenCalledTimes(1);

    screenHost.destroy();
    host.remove();
  });
});
