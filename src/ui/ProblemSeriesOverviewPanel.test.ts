/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi } from 'vitest';
import { ProblemSeriesOverviewPanel } from './ProblemSeriesOverviewPanel.ts';
import type { ProblemSeriesOverviewDisplay } from './problemSeriesOverviewViewModel.ts';

type DeepMutable<T> =
  T extends readonly (infer Item)[]
    ? DeepMutable<Item>[]
    : T extends object
      ? { -readonly [Key in keyof T]: DeepMutable<T[Key]> }
      : T;

const R12M_ALLOWED_CLASS_IDS = [
  'df_guardian',
  'at_swordsman',
  'at_sorcerer',
  'sp_cleric',
] as const;

const WAVE_ADJUSTMENT_NOTE_TEXT =
  'Wave間準備では、編成・CombatModule・作戦内パッシブを変更できます。';

const FORBIDDEN_DOM_SUBSTRINGS = [
  'r12m_series_a',
  'r12m-v1',
  'seriesId',
  'generatorVersion',
  'internalProblemClass',
  'expectedFailureModes',
  'connection',
  'operationConditions',
  'waveRelationSummary',
  'finalWaveCompositeOf',
  'single_protection',
  '推奨編成',
  '推奨撃破順',
  '撃破順',
  '勝率',
  '正解説明',
] as const;

const FORBIDDEN_FIXTURE_SUBSTRINGS = [
  'as_assassin',
  '影刃',
  'as_assassin_mod_focus_strike',
  '単体急襲',
  'he_priest',
  '癒手',
  'he_priest_mod_group_heal',
  '全体回復',
] as const;

const NON_STANDARD_SCALE_SUMMARY = ' (hp×1.5 atk×2)';

function createThreeWaveFixture(): ProblemSeriesOverviewDisplay {
  return {
    seed: 'fixture-a',
    operationConditions: [],
    waves: [
      {
        waveNumber: 1,
        prepResourceGrant: 0,
        enemyGroups: [
          {
            classId: 'df_guardian',
            classDisplayName: '鉄衛士',
            count: 2,
            selectedCombatModuleId: 'df_guardian_mod_nearest_strike',
            combatModuleDisplayName: '物理堅守',
            scaleSummary: '',
          },
        ],
      },
      {
        waveNumber: 2,
        prepResourceGrant: 12,
        enemyGroups: [
          {
            classId: 'at_swordsman',
            classDisplayName: '剣術士',
            count: 1,
            selectedCombatModuleId: 'at_swordsman_mod_single_slash',
            combatModuleDisplayName: '正面集中',
            scaleSummary: '',
          },
          {
            classId: 'at_sorcerer',
            classDisplayName: '魔術師',
            count: 3,
            selectedCombatModuleId: 'at_sorcerer_mod_chain',
            combatModuleDisplayName: '連鎖',
            scaleSummary: NON_STANDARD_SCALE_SUMMARY,
          },
        ],
      },
      {
        waveNumber: 3,
        prepResourceGrant: 12,
        enemyGroups: [
          {
            classId: 'sp_cleric',
            classDisplayName: '療養師',
            count: 2,
            selectedCombatModuleId: 'sp_cleric_mod_party_mend',
            combatModuleDisplayName: '分散回復',
            scaleSummary: '',
          },
        ],
      },
    ],
  };
}

function assertFixtureUsesOnlyR12mClasses(fixture: ProblemSeriesOverviewDisplay): number {
  const expectedGroupCount = fixture.waves.reduce(
    (sum, wave) => sum + wave.enemyGroups.length,
    0,
  );
  expect(expectedGroupCount).toBeGreaterThan(0);

  const classIds = new Set<string>();
  let inspectedGroupCount = 0;

  for (const wave of fixture.waves) {
    for (const group of wave.enemyGroups) {
      inspectedGroupCount += 1;
      expect(R12M_ALLOWED_CLASS_IDS).toContain(group.classId);
      classIds.add(group.classId);
    }
  }

  expect(inspectedGroupCount).toBe(expectedGroupCount);

  for (const classId of R12M_ALLOWED_CLASS_IDS) {
    expect(classIds.has(classId)).toBe(true);
  }
  expect(classIds.size).toBe(R12M_ALLOWED_CLASS_IDS.length);
  expect([...classIds].sort()).toEqual([...R12M_ALLOWED_CLASS_IDS].sort());

  const fixtureJson = JSON.stringify(fixture);
  for (const forbidden of FORBIDDEN_FIXTURE_SUBSTRINGS) {
    expect(fixtureJson).not.toContain(forbidden);
  }

  return inspectedGroupCount;
}

function assertNonDisclosure(root: HTMLElement): void {
  const textContent = root.textContent ?? '';
  const outerHTML = root.outerHTML;
  for (const forbidden of FORBIDDEN_DOM_SUBSTRINGS) {
    expect(textContent).not.toContain(forbidden);
    expect(outerHTML).not.toContain(forbidden);
  }
}

function assertElementPrecedes(
  root: ParentNode,
  earlierSelector: string,
  laterSelector: string,
): void {
  const earlierEls = root.querySelectorAll(earlierSelector);
  const laterEls = root.querySelectorAll(laterSelector);
  expect(earlierEls).toHaveLength(1);
  expect(laterEls).toHaveLength(1);
  const earlier = earlierEls[0]!;
  const later = laterEls[0]!;
  expect(
    earlier.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
}

function assertEmptyOperationConditionsDom(root: ParentNode): void {
  const conditionsSections = root.querySelectorAll('.problem-series-overview-conditions');
  expect(conditionsSections).toHaveLength(1);
  const conditionsSection = conditionsSections[0]!;

  expect(conditionsSection.querySelector('h2')?.textContent).toBe('作戦固有条件');

  const emptyEls = conditionsSection.querySelectorAll(
    '.problem-series-overview-conditions-empty',
  );
  expect(emptyEls).toHaveLength(1);
  expect(emptyEls[0]?.textContent).toBe('なし');

  const conditionEls = conditionsSection.querySelectorAll(
    '.problem-series-overview-condition',
  );
  expect(conditionEls).toHaveLength(0);

  const waveAdjustmentNotes = root.querySelectorAll(
    '.problem-series-overview-wave-adjustment-note',
  );
  expect(waveAdjustmentNotes).toHaveLength(1);
  expect(waveAdjustmentNotes[0]?.textContent).toBe(WAVE_ADJUSTMENT_NOTE_TEXT);

  assertElementPrecedes(
    root,
    '.problem-series-overview-conditions',
    '.problem-series-overview-waves',
  );
  assertElementPrecedes(
    root,
    '.problem-series-overview-wave-adjustment-note',
    '.problem-series-overview-waves',
  );
}

describe('ProblemSeriesOverviewPanel', () => {
  it('renders all 3 waves with seed, grants, enemy groups, and scale display', () => {
    const fixture = createThreeWaveFixture();
    const fixtureBefore = structuredClone(fixture);
    const inspectedGroupCount = assertFixtureUsesOnlyR12mClasses(fixture);
    const host = document.createElement('div');

    const panel = new ProblemSeriesOverviewPanel(host, fixture);

    const roots = host.querySelectorAll('.problem-series-overview-panel');
    expect(roots).toHaveLength(1);
    const root = roots[0]!;

    expect(root.querySelector('h1')?.textContent).toBe('作戦概要');

    const seedEl = root.querySelector('.problem-series-overview-seed');
    expect(seedEl?.textContent).toContain('fixture-a');

    const waveEls = root.querySelectorAll('.problem-series-overview-wave');
    expect(waveEls).toHaveLength(3);

    const waveHeadings = [...root.querySelectorAll('.problem-series-overview-wave h2')].map(
      (el) => el.textContent,
    );
    expect(waveHeadings).toEqual(['Wave 1', 'Wave 2', 'Wave 3']);

    const grantEls = root.querySelectorAll('.problem-series-overview-wave-grant');
    expect(grantEls).toHaveLength(3);
    expect(grantEls[0]?.textContent).toBe('作戦ポイント付与予定: 0');
    expect(grantEls[1]?.textContent).toBe('作戦ポイント付与予定: 12');
    expect(grantEls[2]?.textContent).toBe('作戦ポイント付与予定: 12');

    const groupEls = root.querySelectorAll('.problem-series-overview-enemy-group');
    const expectedGroupCount = fixture.waves.reduce(
      (sum, wave) => sum + wave.enemyGroups.length,
      0,
    );
    expect(expectedGroupCount).toBeGreaterThan(0);
    expect(groupEls).toHaveLength(expectedGroupCount);
    expect(inspectedGroupCount).toBe(expectedGroupCount);

    for (const wave of fixture.waves) {
      for (const group of wave.enemyGroups) {
        expect(root.textContent).toContain(group.classDisplayName);
        expect(root.textContent).toContain(`×${group.count}`);
        expect(root.textContent).toContain(
          `CombatModule: ${group.combatModuleDisplayName}`,
        );
      }
    }

    const standardGroups = root.querySelectorAll(
      '.problem-series-overview-enemy-group:not(:has(.problem-series-overview-enemy-scale))',
    );
    expect(standardGroups.length).toBeGreaterThan(0);

    const scaleEls = root.querySelectorAll('.problem-series-overview-enemy-scale');
    expect(scaleEls).toHaveLength(1);
    expect(scaleEls[0]?.textContent).toBe(NON_STANDARD_SCALE_SUMMARY);

    for (const groupEl of groupEls) {
      const scaleEl = groupEl.querySelector('.problem-series-overview-enemy-scale');
      const groupIndex = [...groupEls].indexOf(groupEl);
      const flatGroups = fixture.waves.flatMap((wave) => wave.enemyGroups);
      const group = flatGroups[groupIndex]!;
      if (group.scaleSummary === '') {
        expect(scaleEl).toBeNull();
      } else {
        expect(scaleEl?.textContent).toBe(group.scaleSummary);
      }
    }

    assertNonDisclosure(root);
    assertEmptyOperationConditionsDom(root);
    expect(fixture).toEqual(fixtureBefore);

    panel.destroy();
  });

  it('destroy removes only the panel root and leaves other host children', () => {
    const fixture = createThreeWaveFixture();
    assertFixtureUsesOnlyR12mClasses(fixture);
    const host = document.createElement('div');
    const existing = document.createElement('p');
    existing.textContent = 'existing-host-child';
    host.appendChild(existing);

    const panel = new ProblemSeriesOverviewPanel(host, fixture);

    expect(host.querySelector('.problem-series-overview-panel')).not.toBeNull();

    panel.destroy();

    expect(host.querySelector('.problem-series-overview-panel')).toBeNull();
    expect(host.contains(existing)).toBe(true);
    expect(existing.textContent).toBe('existing-host-child');
  });

  it('invokes onBack and onConfirm when action buttons are clicked', () => {
    const fixture = createThreeWaveFixture();
    assertFixtureUsesOnlyR12mClasses(fixture);
    const host = document.createElement('div');
    const onBack = vi.fn();
    const onConfirm = vi.fn();

    new ProblemSeriesOverviewPanel(host, fixture, { onBack, onConfirm });

    const backButtons = host.querySelectorAll('.problem-series-overview-back');
    expect(backButtons).toHaveLength(1);
    const confirmButtons = host.querySelectorAll('.problem-series-overview-confirm');
    expect(confirmButtons).toHaveLength(1);

    const backButton = backButtons[0]!;
    const confirmButton = confirmButtons[0]!;

    expect(backButton).toBeInstanceOf(HTMLButtonElement);
    expect(confirmButton).toBeInstanceOf(HTMLButtonElement);
    expect(backButton.type).toBe('button');
    expect(confirmButton.type).toBe('button');
    expect(backButton.textContent).toBe('戻る');
    expect(confirmButton.textContent).toBe('初期準備へ');

    expect(onBack).toHaveBeenCalledTimes(0);
    expect(onConfirm).toHaveBeenCalledTimes(0);

    backButton.click();
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledTimes(0);

    confirmButton.click();
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

describe('ProblemSeriesOverviewPanel (focused: non-empty operationConditions)', () => {
  it('renders each condition in order without なし or empty element', () => {
    const baseFixture = createThreeWaveFixture();
    const fixture: DeepMutable<ProblemSeriesOverviewDisplay> =
      structuredClone(baseFixture);

    fixture.operationConditions = ['condition one', 'condition two'];
    const fixtureBefore = structuredClone(fixture);
    assertFixtureUsesOnlyR12mClasses(fixture);

    const host = document.createElement('div');
    const panel = new ProblemSeriesOverviewPanel(host, fixture);
    const roots = host.querySelectorAll('.problem-series-overview-panel');
    expect(roots).toHaveLength(1);
    const root = roots[0]!;

    const conditionsSections = root.querySelectorAll(
      '.problem-series-overview-conditions',
    );
    expect(conditionsSections).toHaveLength(1);
    const conditionsSection = conditionsSections[0]!;
    const conditionEls = conditionsSection.querySelectorAll(
      '.problem-series-overview-condition',
    );
    expect(conditionEls).toHaveLength(2);
    expect(conditionEls[0]?.textContent).toBe('condition one');
    expect(conditionEls[1]?.textContent).toBe('condition two');

    expect(
      conditionsSection.querySelectorAll('.problem-series-overview-conditions-empty'),
    ).toHaveLength(0);
    expect(conditionsSection.textContent).not.toContain('なし');

    const waveAdjustmentNotes = root.querySelectorAll(
      '.problem-series-overview-wave-adjustment-note',
    );
    expect(waveAdjustmentNotes).toHaveLength(1);
    expect(waveAdjustmentNotes[0]?.textContent).toBe(WAVE_ADJUSTMENT_NOTE_TEXT);

    assertElementPrecedes(
      root,
      '.problem-series-overview-conditions',
      '.problem-series-overview-waves',
    );
    assertElementPrecedes(
      root,
      '.problem-series-overview-wave-adjustment-note',
      '.problem-series-overview-waves',
    );

    assertNonDisclosure(root);
    expect(fixture).toEqual(fixtureBefore);
    expect(baseFixture.operationConditions).toEqual([]);

    panel.destroy();
  });
});
