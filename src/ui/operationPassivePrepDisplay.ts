import type {
  PassiveSkillDef,
  StatBuffTarget,
  TargetSpec,
} from '../battle/types.ts';
import { formatTargetLabel } from '../battle/skills/targetSpec.ts';
import {
  formatStatBuffModifierEntries,
  parseStatBuffModifiers,
} from '../battle/statBuffModifiers.ts';
import { TARGET_STAT_LABELS } from '../battle/data/gameDataSchema.ts';
import { formatPassiveDescription } from './formatSkillText.ts';

/**
 * 作戦内パッシブ候補の取得状態（文言でも区別する。色だけにしない）。
 * Backend で判定可能なもののみ。未実装の条件ゲートは推測しない。
 */
export type OperationPassiveAcquireState =
  | 'available'
  | 'insufficient_resource'
  | 'acquired'
  | 'no_candidates'
  | 'out_of_scope';

export type OperationPassiveCandidateView = {
  passiveId: string;
  displayName: string;
  acquireCost: number;
  currentResource: number;
  effectDescription: string;
  effectTarget: string | null;
  effectAmount: string | null;
  conditions: string | null;
  durationScope: string;
  stackNote: string | null;
  acquired: boolean;
  acquireState: OperationPassiveAcquireState;
  statusLabel: string;
  canAcquire: boolean;
  unavailableReason: string | null;
};

export type OperationPassivePrepViews = {
  currentResource: number;
  acquireCost: number;
  acquired: OperationPassiveCandidateView[];
  candidates: OperationPassiveCandidateView[];
  emptyStateLabel: string | null;
};

const OPERATION_PASSIVE_DURATION_SCOPE = '作戦終了まで維持';

function resolvePassiveTargetSpec(
  def: PassiveSkillDef,
): TargetSpec | null {
  if (def.buffTargetRule) return def.buffTargetRule;
  if (def.hotTargetRule) return def.hotTargetRule;
  if (def.damageReductionTargetRule) return def.damageReductionTargetRule;
  if (def.debuffTargetRule) return def.debuffTargetRule;
  if (def.effect === 'buff' || def.effect === 'heal') {
    return { kind: 'self' };
  }
  return null;
}

function formatStatModifierLabel(
  stat: StatBuffTarget,
  multiplier: number | undefined,
  flatBonus: number | undefined,
): string {
  const statLabel =
    stat === 'atk' ||
    stat === 'def' ||
    stat === 'res' ||
    stat === 'hp' ||
    stat === 'maxHp'
      ? TARGET_STAT_LABELS[stat]
      : String(stat);
  const bits: string[] = [];
  if (typeof multiplier === 'number') {
    bits.push(`×${multiplier}`);
  }
  if (typeof flatBonus === 'number') {
    bits.push(flatBonus >= 0 ? `+${flatBonus}` : String(flatBonus));
  }
  return bits.length > 0 ? `${statLabel}${bits.join('')}` : statLabel;
}

function resolvePassiveEffectAmount(def: PassiveSkillDef): string | null {
  if (def.effect === 'buff' && (def.buffSubKind ?? 'stat') === 'stat') {
    const label = formatStatBuffModifierEntries(
      parseStatBuffModifiers({
        buffStat: def.buffStat,
        buffMultiplier: def.buffMultiplier,
        buffFlatBonus: def.buffFlatBonus,
        buffStatModifiers: def.buffStatModifiers,
      }),
      formatStatModifierLabel,
    );
    if (label && label !== '—') return label;
  }
  if (
    def.effect === 'damageReduction' &&
    typeof def.damageReductionPercent === 'number'
  ) {
    return `被ダメージ軽減 ${Math.round(def.damageReductionPercent * 100)}%`;
  }
  if (typeof def.ratio === 'number') {
    return `倍率 ${def.ratio}`;
  }
  return null;
}

function resolvePassiveConditions(def: PassiveSkillDef): string | null {
  if (typeof def.chance === 'number' && def.chance < 1) {
    return `発動確率 ${Math.round(def.chance * 100)}%`;
  }
  return null;
}

function resolvePassiveStackNote(def: PassiveSkillDef): string | null {
  if (def.barrierStack === true) return 'Barrier は既存に加算';
  if (def.barrierStack === false) return 'Barrier は上書き';
  return null;
}

export function resolveOperationPassiveAcquireState(options: {
  acquired: boolean;
  isCandidate: boolean;
  currentResource: number;
  acquireCost: number;
}): OperationPassiveAcquireState {
  if (options.acquired) return 'acquired';
  if (!options.isCandidate) return 'out_of_scope';
  if (options.currentResource < options.acquireCost) {
    return 'insufficient_resource';
  }
  return 'available';
}

export function statusLabelForAcquireState(
  state: OperationPassiveAcquireState,
): string {
  switch (state) {
    case 'available':
      return '未取得・取得可能';
    case 'insufficient_resource':
      return '未取得・リソース不足';
    case 'acquired':
      return '取得済み';
    case 'no_candidates':
      return '候補なし';
    case 'out_of_scope':
      return '選択対象外';
  }
}

export function unavailableReasonForAcquireState(
  state: OperationPassiveAcquireState,
  options: { acquireCost: number; currentResource: number },
): string | null {
  switch (state) {
    case 'insufficient_resource':
      return `リソース不足（必要 ${options.acquireCost} / 残 ${options.currentResource}）`;
    case 'acquired':
      return 'すでに取得済みです';
    case 'out_of_scope':
      return 'この兵科の候補ではありません';
    case 'no_candidates':
      return '取得できる候補がありません';
    case 'available':
      return null;
  }
}

export function buildOperationPassiveCandidateView(
  def: PassiveSkillDef,
  options: {
    acquireCost: number;
    currentResource: number;
    acquired: boolean;
    isCandidate: boolean;
  },
): OperationPassiveCandidateView {
  const acquireState = resolveOperationPassiveAcquireState(options);
  const unavailableReason = unavailableReasonForAcquireState(acquireState, {
    acquireCost: options.acquireCost,
    currentResource: options.currentResource,
  });
  const targetSpec = resolvePassiveTargetSpec(def);
  return {
    passiveId: def.id,
    displayName: def.name || def.id,
    acquireCost: options.acquireCost,
    currentResource: options.currentResource,
    effectDescription: formatPassiveDescription(def),
    effectTarget: targetSpec ? formatTargetLabel(targetSpec) : null,
    effectAmount: resolvePassiveEffectAmount(def),
    conditions: resolvePassiveConditions(def),
    durationScope: OPERATION_PASSIVE_DURATION_SCOPE,
    stackNote: resolvePassiveStackNote(def),
    acquired: options.acquired,
    acquireState,
    statusLabel: statusLabelForAcquireState(acquireState),
    canAcquire: acquireState === 'available',
    unavailableReason,
  };
}

export function buildOperationPassivePrepViews(options: {
  candidateIds: readonly string[];
  acquiredIds: readonly string[];
  acquireCost: number;
  currentResource: number;
  getPassiveDef: (passiveId: string) => PassiveSkillDef | undefined;
}): OperationPassivePrepViews {
  const acquiredSet = new Set(options.acquiredIds);
  const candidateSet = new Set(options.candidateIds);

  const acquired: OperationPassiveCandidateView[] = [];
  for (const passiveId of options.acquiredIds) {
    const def = options.getPassiveDef(passiveId);
    if (!def) continue;
    acquired.push(
      buildOperationPassiveCandidateView(def, {
        acquireCost: options.acquireCost,
        currentResource: options.currentResource,
        acquired: true,
        isCandidate: candidateSet.has(passiveId),
      }),
    );
  }

  const candidates: OperationPassiveCandidateView[] = [];
  for (const passiveId of options.candidateIds) {
    if (acquiredSet.has(passiveId)) continue;
    const def = options.getPassiveDef(passiveId);
    if (!def) continue;
    candidates.push(
      buildOperationPassiveCandidateView(def, {
        acquireCost: options.acquireCost,
        currentResource: options.currentResource,
        acquired: false,
        isCandidate: true,
      }),
    );
  }

  let emptyStateLabel: string | null = null;
  if (candidates.length === 0 && acquired.length === 0) {
    emptyStateLabel = '候補なし';
  } else if (candidates.length === 0 && acquired.length > 0) {
    emptyStateLabel = '未取得の候補はありません';
  }

  return {
    currentResource: options.currentResource,
    acquireCost: options.acquireCost,
    acquired,
    candidates,
    emptyStateLabel,
  };
}

function appendFact(
  list: HTMLElement,
  label: string,
  value: string | null | undefined,
): void {
  if (!value) return;
  const row = document.createElement('div');
  row.className = 'operation-passive-prep__fact';
  const dt = document.createElement('span');
  dt.className = 'operation-passive-prep__fact-label';
  dt.textContent = label;
  const dd = document.createElement('span');
  dd.className = 'operation-passive-prep__fact-value';
  dd.textContent = value;
  row.append(dt, dd);
  list.appendChild(row);
}

function createPassiveCard(
  view: OperationPassiveCandidateView,
  options: {
    showAcquireButton: boolean;
    onAcquire?: (passiveId: string) => void;
  },
): HTMLElement {
  const card = document.createElement('article');
  card.className =
    'operation-passive-prep__candidate game-panel-surface';
  card.dataset.passiveId = view.passiveId;
  card.dataset.acquireState = view.acquireState;
  card.dataset.acquired = view.acquired ? 'true' : 'false';
  card.dataset.canAcquire = view.canAcquire ? 'true' : 'false';

  const header = document.createElement('div');
  header.className = 'operation-passive-prep__candidate-header';

  const name = document.createElement('span');
  name.className = 'operation-passive-prep__name';
  name.textContent = view.displayName;

  const status = document.createElement('span');
  status.className = 'operation-passive-prep__status';
  status.textContent = view.statusLabel;

  header.append(name, status);

  const cost = document.createElement('p');
  cost.className = 'operation-passive-prep__cost';
  cost.textContent =
    `消費 ${view.acquireCost}（所持 ${view.currentResource}）`;

  const effect = document.createElement('p');
  effect.className = 'operation-passive-prep__effect';
  effect.textContent = view.effectDescription;

  const facts = document.createElement('div');
  facts.className = 'operation-passive-prep__facts';
  appendFact(facts, '効果対象', view.effectTarget);
  appendFact(facts, '効果量', view.effectAmount);
  appendFact(facts, '条件', view.conditions);
  appendFact(facts, '維持', view.durationScope);
  appendFact(facts, '重複', view.stackNote);

  card.append(header, cost, effect, facts);

  if (view.unavailableReason && view.acquireState !== 'available') {
    const reason = document.createElement('p');
    reason.className = 'operation-passive-prep__reason';
    reason.textContent = view.unavailableReason;
    card.appendChild(reason);
  }

  if (options.showAcquireButton) {
    const acquire = document.createElement('button');
    acquire.type = 'button';
    acquire.className =
      'operation-passive-prep__acquire game-ui-button';
    acquire.textContent = 'パッシブ取得';
    acquire.disabled = !view.canAcquire;
    acquire.addEventListener('click', () => {
      if (!view.canAcquire) return;
      options.onAcquire?.(view.passiveId);
    });
    card.appendChild(acquire);
  }

  return card;
}

export function createOperationPassivePrepSection(options: {
  views: OperationPassivePrepViews;
  onAcquire: (passiveId: string) => void;
  /** ヘッダの資源表示をセクション内に出すか（Wave 画面では外でも可） */
  includeResourceLine?: boolean;
  variantClass?: string;
}): HTMLElement {
  const section = document.createElement('section');
  section.className = [
    'operation-passive-prep',
    options.variantClass,
  ]
    .filter(Boolean)
    .join(' ');
  section.dataset.prepKind = 'operation-passive';

  const title = document.createElement('h3');
  title.className = 'operation-passive-prep__title';
  title.textContent = '作戦内パッシブ';
  section.appendChild(title);

  const hint = document.createElement('p');
  hint.className = 'operation-passive-prep__hint';
  hint.textContent =
    'リソースを消費して作戦中の強化を取得する。戦闘方式の選択とは別。';
  section.appendChild(hint);

  if (options.includeResourceLine !== false) {
    const resource = document.createElement('p');
    resource.className = 'operation-passive-prep__resource';
    resource.textContent =
      `作戦内リソース: ${options.views.currentResource}`;
    section.appendChild(resource);
  }

  const acquiredHost = document.createElement('div');
  acquiredHost.className = 'operation-passive-prep__acquired';
  if (options.views.acquired.length === 0) {
    acquiredHost.textContent = '取得済み: なし';
  } else {
    const acquiredTitle = document.createElement('p');
    acquiredTitle.className = 'operation-passive-prep__acquired-title';
    acquiredTitle.textContent = '取得済み';
    acquiredHost.appendChild(acquiredTitle);
    for (const view of options.views.acquired) {
      acquiredHost.appendChild(
        createPassiveCard(view, { showAcquireButton: false }),
      );
    }
  }
  section.appendChild(acquiredHost);

  const candidatesHost = document.createElement('div');
  candidatesHost.className = 'operation-passive-prep__candidates';

  if (options.views.candidates.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'operation-passive-prep__empty';
    empty.textContent = options.views.emptyStateLabel ?? '候補なし';
    candidatesHost.appendChild(empty);
  } else {
    for (const view of options.views.candidates) {
      candidatesHost.appendChild(
        createPassiveCard(view, {
          showAcquireButton: true,
          onAcquire: options.onAcquire,
        }),
      );
    }
  }

  section.appendChild(candidatesHost);
  return section;
}
