import type {
  ClassPreset,
  CombatModuleDef,
  TargetShape,
} from '../battle/types.ts';
import { synthesizeCombatModuleSkill } from '../battle/data/synthesizeCombatModuleSkill.ts';
import { TARGET_SHAPE_LABELS } from '../battle/data/gameDataSchema.ts';
import { resolveSelectedCombatModuleId } from '../battle/data/resolveCombatModuleBasic.ts';
import { formatActiveDescription } from './formatSkillText.ts';

/** 戦闘方式候補の準備 UI 表示モデル（R9.6-A）。内部 ID を主表示にしない。 */
export type CombatModuleCandidateView = {
  moduleId: string;
  displayName: string;
  description: string;
  behaviorLines: string[];
  selected: boolean;
  selectable: boolean;
  unavailableReason: string | null;
  statusLabel: string;
};

export type CombatModulePrepViews = {
  candidates: CombatModuleCandidateView[];
  selectedModuleId: string | null;
};

function attackMethodLabel(
  attackMethod: CombatModuleDef['action']['attackMethod'],
): string | null {
  if (attackMethod === 'melee') return '近接';
  if (attackMethod === 'ranged') return '遠隔';
  return null;
}

function effectRangeLabel(module: CombatModuleDef): string {
  const shape = (module.action.targetShape ?? 'single') as TargetShape;
  const bits = [TARGET_SHAPE_LABELS[shape]];
  if (shape === 'aoe' && typeof module.action.aoeRadiusPx === 'number') {
    bits.push(`半径 ${module.action.aoeRadiusPx}`);
  }
  if (typeof module.action.range === 'number') {
    bits.push(`射程 ${module.action.range}`);
  }
  if (
    typeof module.action.hitCount === 'number' &&
    module.action.hitCount > 1
  ) {
    bits.push(`Hit ${module.action.hitCount}`);
  }
  return bits.join(' / ');
}

/**
 * データから得られる戦闘挙動の差分行。無い情報は推測しない。
 */
export function buildCombatModuleBehaviorLines(
  module: CombatModuleDef,
): string[] {
  const lines: string[] = [
    `攻撃間隔 ${module.attackIntervalSec} 秒`,
    `効果範囲 ${effectRangeLabel(module)}`,
  ];
  const method = attackMethodLabel(module.action.attackMethod);
  if (method) {
    lines.push(`攻撃手段 ${method}`);
  }
  const synthesized = synthesizeCombatModuleSkill(module);
  const effectText = formatActiveDescription(synthesized).trim();
  if (effectText) {
    lines.push(`挙動 ${effectText}`);
  }
  return lines;
}

export function buildCombatModuleCandidateView(
  module: CombatModuleDef,
  options: {
    selectedModuleId: string | null;
    selectable?: boolean;
    unavailableReason?: string | null;
  },
): CombatModuleCandidateView {
  const selectable = options.selectable !== false;
  const selected =
    options.selectedModuleId !== null &&
    options.selectedModuleId === module.id;
  const unavailableReason = selectable
    ? null
    : (options.unavailableReason ?? '選択できません');
  let statusLabel = '選択可能';
  if (!selectable) {
    statusLabel = unavailableReason;
  } else if (selected) {
    statusLabel = '選択中';
  }
  return {
    moduleId: module.id,
    displayName: module.displayName || module.id,
    description: module.description ?? '',
    behaviorLines: buildCombatModuleBehaviorLines(module),
    selected,
    selectable,
    unavailableReason,
    statusLabel,
  };
}

export function buildCombatModulePrepViews(
  preset: ClassPreset | undefined,
  combatModuleRegistry: Record<string, CombatModuleDef>,
  selectedRaw: string | undefined,
): CombatModulePrepViews {
  const moduleIds = preset?.combatModuleIds ?? [];
  if (!preset || moduleIds.length === 0) {
    return { candidates: [], selectedModuleId: null };
  }

  const selectedModuleId =
    resolveSelectedCombatModuleId(
      preset,
      combatModuleRegistry,
      selectedRaw,
    ) ?? null;

  const candidates: CombatModuleCandidateView[] = [];
  for (const moduleId of moduleIds) {
    const moduleDef = combatModuleRegistry[moduleId];
    if (!moduleDef) continue;
    candidates.push(
      buildCombatModuleCandidateView(moduleDef, { selectedModuleId }),
    );
  }

  return { candidates, selectedModuleId };
}

export function createCombatModulePrepSection(options: {
  views: CombatModulePrepViews;
  onSelect: (moduleId: string) => void;
  /** CSS 修飾用（例: skill-menu / wave-prep） */
  variantClass?: string;
}): HTMLElement {
  const section = document.createElement('section');
  section.className = [
    'combat-module-prep',
    options.variantClass,
  ]
    .filter(Boolean)
    .join(' ');
  section.dataset.prepKind = 'combat-module';

  const title = document.createElement('h3');
  title.className = 'combat-module-prep__title';
  title.textContent = '戦闘方式';
  section.appendChild(title);

  const hint = document.createElement('p');
  hint.className = 'combat-module-prep__hint';
  hint.textContent = '兵科ごとの通常行動。候補を比較して選択する。';
  section.appendChild(hint);

  const list = document.createElement('div');
  list.className = 'combat-module-prep__candidates';
  list.setAttribute('role', 'radiogroup');
  list.setAttribute('aria-label', '戦闘方式');

  if (options.views.candidates.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'combat-module-prep__empty';
    empty.textContent = 'この兵科に選択できる戦闘方式はありません';
    section.appendChild(empty);
    return section;
  }

  for (const candidate of options.views.candidates) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className =
      'combat-module-prep__candidate game-panel-surface';
    card.setAttribute('role', 'radio');
    card.setAttribute(
      'aria-checked',
      candidate.selected ? 'true' : 'false',
    );
    card.dataset.moduleId = candidate.moduleId;
    card.dataset.selected = candidate.selected ? 'true' : 'false';
    card.dataset.selectable = candidate.selectable ? 'true' : 'false';
    card.disabled = !candidate.selectable;

    if (candidate.selected) {
      card.classList.add('combat-module-prep__candidate--selected');
    }

    const header = document.createElement('div');
    header.className = 'combat-module-prep__candidate-header';

    const name = document.createElement('span');
    name.className = 'combat-module-prep__name';
    name.textContent = candidate.displayName;

    const status = document.createElement('span');
    status.className = 'combat-module-prep__status';
    status.textContent = candidate.statusLabel;

    header.append(name, status);

    const description = document.createElement('p');
    description.className = 'combat-module-prep__description';
    description.textContent = candidate.description;

    const behavior = document.createElement('ul');
    behavior.className = 'combat-module-prep__behavior';
    for (const line of candidate.behaviorLines) {
      const item = document.createElement('li');
      item.textContent = line;
      behavior.appendChild(item);
    }

    card.append(header, description, behavior);

    if (candidate.unavailableReason) {
      const reason = document.createElement('p');
      reason.className = 'combat-module-prep__reason';
      reason.textContent = candidate.unavailableReason;
      card.appendChild(reason);
    }

    card.addEventListener('click', () => {
      if (!candidate.selectable || candidate.selected) return;
      options.onSelect(candidate.moduleId);
    });

    list.appendChild(card);
  }

  section.appendChild(list);
  return section;
}
