/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi } from 'vitest';
import classesJson from '../../data/classes.json';
import enemiesJson from '../../data/enemies.json';
import partiesJson from '../../data/parties.json';
import stagesDemoJson from '../../data/stages-demo.json';
import type { ActiveSkillDef, GameData, PassiveSkillDef } from '../battle/types.ts';
import { tryLoadGameData } from '../battle/data/loadGameData.ts';
import { parseAndValidateGameDataJson } from '../battle/data/validateGameData.ts';
import { StageSelectionScreenHost } from './StageSelectionScreenHost.ts';
import { STAGE_FIRST_PLAY_GUIDANCE_CLASS } from '../ui/stageDetailDom.ts';

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

describe('StageSelectionScreenHost', () => {
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
});
