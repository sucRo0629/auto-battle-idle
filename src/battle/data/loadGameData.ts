import classesJson from '../../../data/classes.json';
import skillsJson from '../../../data/skills.json';
import enemiesJson from '../../../data/enemies.json';
import stagesJson from '../../../data/stages.json';
import partiesJson from '../../../data/parties.json';
import type {
  ClassPreset,
  ClassTraits,
  EnemyTemplate,
  GameData,
} from '../types.ts';
import { DEFAULT_MELEE_RANGE_PX } from '../types.ts';
import { parseAndValidateGameDataJson } from './validateGameData.ts';

function indexById<T extends { id: string }>(items: T[]): Record<string, T> {
  return Object.fromEntries(items.map((item) => [item.id, item]));
}

function normalizeTraits(
  traits: ClassTraits,
  context: string,
): ClassTraits {
  if (traits.rangePx !== undefined) {
    return { ...traits, rangePx: traits.rangePx };
  }
  if (traits.attackRange === 'melee') {
    return { ...traits, rangePx: DEFAULT_MELEE_RANGE_PX };
  }
  throw new Error(`rangePx required for ranged class: ${context}`);
}

function normalizeClass(cls: ClassPreset): ClassPreset {
  return {
    ...cls,
    traits: normalizeTraits(cls.traits, cls.id),
  };
}

function normalizeEnemy(enemy: EnemyTemplate): EnemyTemplate {
  return {
    ...enemy,
    rangePx: enemy.rangePx ?? DEFAULT_MELEE_RANGE_PX,
  };
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
  const parsed = parseAndValidateGameDataJson({
    classes: classesJson,
    skills: skillsJson,
    enemies: enemiesJson,
    stages: stagesJson,
    parties: partiesJson,
  });

  const classes = parsed.classes.map(normalizeClass);
  const enemies = parsed.enemies.map(normalizeEnemy);

  return {
    classRegistry: indexById(classes),
    skillRegistry: {
      passives: indexById(parsed.passives),
      actives: indexById(parsed.actives),
    },
    enemyRegistry: indexById(enemies),
    stages: parsed.stages,
    parties: parsed.parties,
  };
}
