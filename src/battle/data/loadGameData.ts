import classesJson from '../../../data/classes.json';
import enemiesJson from '../../../data/enemies.json';
import stagesJson from '../../../data/stages.json';
import partiesJson from '../../../data/parties.json';
import type { ActiveSkillDef, ClassPreset, EnemyTemplate, GameData, PassiveSkillDef } from '../types.ts';
import { parseAndValidateGameDataJson } from './validateGameData.ts';

const passiveModules = import.meta.glob<PassiveSkillDef[]>(
  '../../../data/skills/passives/*.json',
  { eager: true, import: 'default' },
);

const activeModules = import.meta.glob<ActiveSkillDef[]>(
  '../../../data/skills/actives/*.json',
  { eager: true, import: 'default' },
);

function indexById<T extends { id: string }>(items: T[]): Record<string, T> {
  return Object.fromEntries(items.map((item) => [item.id, item]));
}

function loadMergedPassives(): PassiveSkillDef[] {
  return Object.values(passiveModules).flat();
}

function loadMergedActives(): ActiveSkillDef[] {
  return Object.values(activeModules).flat();
}

export type LoadGameDataResult =
  | { ok: true; data: GameData }
  | { ok: false; error: string };

export function tryLoadGameData(): LoadGameDataResult {
  try {
    return { ok: true, data: loadGameData() };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function renderGameDataLoadError(
  container: HTMLElement,
  message: string,
): void {
  container.replaceChildren();
  const panel = document.createElement('div');
  panel.className = 'game-data-error';
  const title = document.createElement('h1');
  title.textContent = 'ゲームデータの読み込みに失敗しました';
  const detail = document.createElement('pre');
  detail.className = 'game-data-error-detail';
  detail.textContent = message;
  const hint = document.createElement('p');
  hint.className = 'game-data-error-hint';
  hint.textContent =
    'data/ の JSON を確認してください。エディタで保存した内容に不整合がある可能性があります。';
  panel.append(title, detail, hint);
  container.appendChild(panel);
}

export function loadGameData(): GameData {
  const passives = loadMergedPassives();
  const actives = loadMergedActives();
  const parsed = parseAndValidateGameDataJson({
    classes: classesJson,
    skills: { passives, actives },
    enemies: enemiesJson,
    stages: stagesJson,
    parties: partiesJson,
  });

  const classes = parsed.classes as ClassPreset[];
  return {
    classOrder: classes.map((cls) => cls.id),
    classRegistry: indexById(classes),
    skillRegistry: {
      passives: indexById(parsed.passives),
      actives: indexById(parsed.actives),
    },
    enemyRegistry: indexById(parsed.enemies as EnemyTemplate[]),
    stages: parsed.stages,
    parties: parsed.parties,
  };
}
