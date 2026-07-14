import type {
  ActiveSkillDef,
  ClassPreset,
  CombatModuleDef,
  PassiveSkillDef,
  SkillEffectDef,
  TargetShape,
  TargetSpec,
} from '../battle/types.ts';
import { synthesizeCombatModuleSkill } from '../battle/data/synthesizeCombatModuleSkill.ts';
import { TARGET_SHAPE_LABELS } from '../battle/data/gameDataSchema.ts';
import { resolveSelectedCombatModuleId } from '../battle/data/resolveCombatModuleBasic.ts';
import { isDefaultHostileChaseSpec } from '../battle/skills/targetSpec.ts';
import { formatSkillCardLines } from './formatSkillText.ts';
import { getSkillTextLocale, skillText } from './skillTextLocale.ts';

/** 戦闘方式候補の準備 UI 表示モデル（R9.6-A）。内部 ID を主表示にしない。 */
export type CombatModuleCandidateView = {
  moduleId: string;
  displayName: string;
  description: string;
  /** 例: `攻撃間隔 2.5 秒` */
  attackIntervalText: string;
  /**
   * 攻撃手段・範囲・効果本文を 1 文にまとめた差分テキスト。
   * デフォルト敵対ターゲットは表記せず、優先ターゲットは「攻撃力の〜」文に織り込む。
   */
  effectSummary: string;
  selected: boolean;
  selectable: boolean;
  unavailableReason: string | null;
  statusLabel: string;
};

export type CombatModulePrepViews = {
  candidates: CombatModuleCandidateView[];
  selectedModuleId: string | null;
};

export type CombatModuleDiffSummary = {
  attackIntervalText: string;
  effectSummary: string;
};

function attackMethodLabel(
  attackMethod: CombatModuleDef['action']['attackMethod'],
): string | null {
  if (attackMethod === 'melee') return '近接';
  if (attackMethod === 'ranged') return '遠隔';
  return null;
}

function effectRangeBits(module: CombatModuleDef): string[] {
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
  return bits;
}

/** 効果本文に既に含まれる範囲情報は載せない（重複回避）。 */
function rangeBitsMissingFromEffect(
  bits: string[],
  effectParts: string[],
): string[] {
  const effectText = effectParts.join(skillText().metaJoiner);
  return bits.filter((bit) => {
    if (effectText.includes(bit)) return false;
    if (bit.startsWith('マルチロック') && effectText.includes('マルチロック')) {
      return false;
    }
    if (bit.startsWith('Multi-Lock') && effectText.includes('Multi-Lock')) {
      return false;
    }
    const hit = /^Hit (\d+)$/.exec(bit);
    if (hit) {
      const n = hit[1];
      if (
        effectText.includes(`マルチロック ${n}`) ||
        effectText.includes(`Multi-Lock ${n}`)
      ) {
        return false;
      }
    }
    return true;
  });
}

/**
 * metaLine から「再使用 / Recast」を除く。
 * CombatModule 準備 UI では攻撃間隔と重複するため。
 */
function metaLineWithoutRecast(metaLine: string): string {
  const st = skillText();
  const recastPrefix = `${st.recast}${st.labelColon}`;
  return metaLine
    .split(st.metaJoiner)
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && !part.startsWith(recastPrefix))
    .join(st.metaJoiner);
}

/** 兵科の固定優先ターゲット（hostile targetRuleOverride）。無ければ undefined。 */
export function resolveClassHostilePriorityTarget(
  preset: ClassPreset,
  passives: Record<string, PassiveSkillDef>,
): TargetSpec | undefined {
  const ids = new Set<string>([
    ...(preset.passiveIds ?? []),
    ...preset.starterPassiveIds,
    ...preset.classSkillIds,
  ]);
  for (const id of ids) {
    const def = passives[id];
    if (!def || def.effect !== 'targetRuleOverride' || !def.targetRuleOverride) {
      continue;
    }
    if ((def.targetRuleOverrideApplyTo ?? 'enemy') !== 'enemy') continue;
    if (isDefaultHostileChaseSpec(def.targetRuleOverride)) continue;
    return def.targetRuleOverride;
  }
  return undefined;
}

function resolveEffectHostileTarget(
  effect: SkillEffectDef,
): TargetSpec {
  if (effect.target) return effect.target;
  return { kind: 'distance', side: 'enemy', order: 'nearest' };
}

/**
 * 表示用: 効果側がデフォルト敵対のときだけ、兵科の優先ターゲットを載せる。
 * 既に優先ターゲットが書いてある効果は上書きしない。
 */
function applyHostilePriorityForDisplay(
  skill: ActiveSkillDef,
  hostilePriority: TargetSpec | undefined,
): ActiveSkillDef {
  if (!hostilePriority) return skill;
  return {
    ...skill,
    effect: skill.effect.map((effect) => {
      if (effect.type !== 'damage') return effect;
      const current = resolveEffectHostileTarget(effect);
      if (!isDefaultHostileChaseSpec(current)) return effect;
      return { ...effect, target: hostilePriority };
    }),
  };
}

/**
 * 候補プレート用の差分テキスト。
 * 再使用は攻撃間隔と重複するため含めない。優先ターゲットは効果本文へ織り込む。
 */
export function buildCombatModuleDiffSummary(
  module: CombatModuleDef,
  options?: {
    hostilePriorityTarget?: TargetSpec;
  },
): CombatModuleDiffSummary {
  const synthesized = applyHostilePriorityForDisplay(
    synthesizeCombatModuleSkill(module),
    options?.hostilePriorityTarget,
  );
  const card = formatSkillCardLines(synthesized, {
    locale: getSkillTextLocale(),
  });
  const metaWithoutRecast = metaLineWithoutRecast(card.metaLine);
  const effectBodyParts = [
    ...(metaWithoutRecast ? [metaWithoutRecast] : []),
    ...card.effectLines.map((line) => line.trim()).filter(Boolean),
  ];
  const method = attackMethodLabel(module.action.attackMethod);
  const methodParts =
    method && !effectBodyParts.join(skillText().metaJoiner).includes(method)
      ? [method]
      : [];
  const effectParts = [
    ...methodParts,
    ...rangeBitsMissingFromEffect(effectRangeBits(module), effectBodyParts),
    ...effectBodyParts,
  ];
  return {
    attackIntervalText: `攻撃間隔 ${module.attackIntervalSec} 秒`,
    effectSummary: effectParts.join(skillText().metaJoiner),
  };
}

export function buildCombatModuleCandidateView(
  module: CombatModuleDef,
  options: {
    selectedModuleId: string | null;
    selectable?: boolean;
    unavailableReason?: string | null;
    hostilePriorityTarget?: TargetSpec;
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
  const summary = buildCombatModuleDiffSummary(module, {
    hostilePriorityTarget: options.hostilePriorityTarget,
  });
  return {
    moduleId: module.id,
    displayName: module.displayName || module.id,
    description: module.description ?? '',
    attackIntervalText: summary.attackIntervalText,
    effectSummary: summary.effectSummary,
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
  options?: {
    passives?: Record<string, PassiveSkillDef>;
  },
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

  const hostilePriorityTarget =
    options?.passives !== undefined
      ? resolveClassHostilePriorityTarget(preset, options.passives)
      : undefined;

  const candidates: CombatModuleCandidateView[] = [];
  for (const moduleId of moduleIds) {
    const moduleDef = combatModuleRegistry[moduleId];
    if (!moduleDef) continue;
    candidates.push(
      buildCombatModuleCandidateView(moduleDef, {
        selectedModuleId,
        hostilePriorityTarget,
      }),
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

    const interval = document.createElement('p');
    interval.className = 'combat-module-prep__attack-interval';
    interval.textContent = candidate.attackIntervalText;

    card.append(header, interval);

    if (candidate.effectSummary) {
      const effect = document.createElement('p');
      effect.className = 'combat-module-prep__effect-summary';
      effect.textContent = candidate.effectSummary;
      card.appendChild(effect);
    }

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
