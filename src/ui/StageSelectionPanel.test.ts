/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest';
import classesJson from '../../data/classes.json';
import enemiesJson from '../../data/enemies.json';
import partiesJson from '../../data/parties.json';
import stagesDemoJson from '../../data/stages-demo.json';
import type { ActiveSkillDef, GameData, PassiveSkillDef } from '../battle/types.ts';
import { tryLoadGameData } from '../battle/data/loadGameData.ts';
import { parseAndValidateGameDataJson } from '../battle/data/validateGameData.ts';
import {
  STAGE_DETAIL_FORMATION_HINT_CLASS,
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
    stages: stagesDemoJson,
    parties: partiesJson,
  });

  return {
    ...loaded.data,
    stages: parsed.stages,
  };
}

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
