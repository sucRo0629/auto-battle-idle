/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest';
import classesJson from '../../data/classes.json';
import enemiesJson from '../../data/enemies.json';
import partiesJson from '../../data/parties.json';
import stagesDemoJson from '../../data/stages-demo.json';
import problemSeriesCatalogJson from '../../data/problem-series-catalog.json';
import type {
  ActiveSkillDef,
  CombatModuleDef,
  GameData,
  PassiveSkillDef,
} from '../battle/types.ts';
import { tryLoadGameData } from '../battle/data/loadGameData.ts';
import { parseAndValidateGameDataJson } from '../battle/data/validateGameData.ts';
import {
  FIRST_PLAY_GUIDANCE_JA,
  STAGE_DETAIL_FORMATION_HINT_CLASS,
  STAGE_FIRST_PLAY_GUIDANCE_CLASS,
  STAGE_SELECTION_PANEL_TITLE_CLASS,
  STAGE_SELECTION_PANEL_TITLE_JA,
  appendStageFormationHintPlate,
} from './stageDetailDom.ts';
import { StageSelectionPanel } from './StageSelectionPanel.ts';

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

describe('StageSelectionPanel title', () => {
  it('shows stage-selection title at panel top', () => {
    const gameData = loadDemoGameDataForTest();
    const host = document.createElement('div');

    const panel = new StageSelectionPanel(host, gameData);
    const title = host.querySelector(`.${STAGE_SELECTION_PANEL_TITLE_CLASS}`);
    expect(title?.textContent).toBe(STAGE_SELECTION_PANEL_TITLE_JA);
    expect(host.querySelector('.stage-selection-panel')?.firstElementChild).toBe(
      title,
    );

    panel.destroy();
  });
});

describe('StageSelectionPanel first-play guidance', () => {
  it('shows generic guidance below title when showFirstPlayGuidance is true', () => {
    const gameData = loadDemoGameDataForTest();
    const host = document.createElement('div');

    const panel = new StageSelectionPanel(host, gameData, {}, {
      showFirstPlayGuidance: true,
    });

    const guidance = host.querySelector(`.${STAGE_FIRST_PLAY_GUIDANCE_CLASS}`);
    expect(guidance?.textContent).toBe(FIRST_PLAY_GUIDANCE_JA);
    expect(guidance?.previousElementSibling?.className).toContain(
      STAGE_SELECTION_PANEL_TITLE_CLASS,
    );

    panel.destroy();
  });

  it('hides generic guidance when showFirstPlayGuidance is false', () => {
    const gameData = loadDemoGameDataForTest();
    const host = document.createElement('div');

    const panel = new StageSelectionPanel(host, gameData);
    expect(host.querySelector(`.${STAGE_FIRST_PLAY_GUIDANCE_CLASS}`)).toBeNull();

    panel.destroy();
  });
});

describe('StageSelectionPanel cleared label', () => {
  it('shows cleared label for stages in clearedStageIds', () => {
    const gameData = loadDemoGameDataForTest();
    const host = document.createElement('div');

    const panel = new StageSelectionPanel(host, gameData, {}, {
      clearedStageIds: ['demo_ch1_01', 'demo_ch1_05'],
    });

    const clearedLabels = host.querySelectorAll('.stage-selection-list-item-cleared');
    expect(clearedLabels).toHaveLength(2);
    expect(clearedLabels[0]?.textContent).toBe('クリア済み');

    const ch1_01Button = host.querySelector(
      '.stage-selection-list-item--selected',
    );
    expect(ch1_01Button?.querySelector('.stage-selection-list-item-cleared')).not.toBeNull();
    expect(host.querySelector('.stage-selection-sortie')?.hasAttribute('disabled')).toBe(false);

    panel.destroy();
  });

  it('updates cleared labels when setClearedStageIds is called', () => {
    const gameData = loadDemoGameDataForTest();
    const host = document.createElement('div');

    const panel = new StageSelectionPanel(host, gameData);
    expect(host.querySelector('.stage-selection-list-item-cleared')).toBeNull();

    panel.setClearedStageIds(['demo_ch1_02']);
    expect(host.querySelectorAll('.stage-selection-list-item-cleared')).toHaveLength(1);

    panel.destroy();
  });
});

describe('StageSelectionPanel formationHintJa', () => {
  it('shows formationHintJa below enemy composition for demo_ch1_05 only', () => {
    const gameData = loadDemoGameDataForTest();
    const host = document.createElement('div');

    const panel = new StageSelectionPanel(host, gameData, {}, {
      initialStageId: 'demo_ch1_05',
    });

    const hint = host.querySelector(`.${STAGE_DETAIL_FORMATION_HINT_CLASS}`);
    expect(hint?.textContent).toBe(
      '双刃士は低HPの敵を優先します。削れた後衛や瀕死の敵を仕留める役として試してみましょう。',
    );

    const enemySection = host.querySelector('.stage-selection-detail-enemy-section');
    expect(enemySection?.querySelector('.stage-detail-enemy-list')).not.toBeNull();
    expect(enemySection?.lastElementChild).toBe(hint);

    panel.selectStage('demo_ch1_01');
    expect(host.querySelector(`.${STAGE_DETAIL_FORMATION_HINT_CLASS}`)).toBeNull();

    panel.destroy();
  });
});

describe('appendStageFormationHintPlate', () => {
  it('returns null when formationHintJa is absent', () => {
    const parent = document.createElement('div');
    const result = appendStageFormationHintPlate(parent, {
      id: 'test',
      displayName: 'Test',
      waves: [{ enemies: [] }],
    });

    expect(result).toBeNull();
    expect(parent.childElementCount).toBe(0);
  });
});
