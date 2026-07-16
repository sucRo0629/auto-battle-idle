import type {
  ClassId,
  CombatModuleActionDef,
  CombatModuleDef,
  TargetShape,
} from '../battle/types.ts';
import { R5_COMBAT_MODULE_CLASS_IDS } from '../battle/types.ts';
import {
  EFFECT_APPLY_MODE_LABELS,
  EFFECT_RANGE_FORM_LABELS as EFFECT_RANGE_FORM_LABELS_NEW,
  summarizeEffectRangeSpec,
} from '../battle/skills/effectRangeNormalize.ts';

/** @deprecated legacy targetShape 表示フォールバック。prefer action.effectRange */
export const EFFECT_RANGE_FORM_LABELS: Record<TargetShape, string> = {
  single: '単体',
  aoe: '範囲（ターゲット中心）',
  multiLock: '複数対象（Hit / 対象数）',
  pierce: '前方（進行）',
  chain: '連鎖',
  scatter: '乱打（適用方式）',
  poolEach: 'プール全員（各1回）',
};

export const COMBAT_MODULE_ATTACK_METHOD_OPTIONS: Array<{
  value: '' | 'melee' | 'ranged';
  label: string;
}> = [
  { value: '', label: '未設定（heal / buff 等）' },
  { value: 'melee', label: '近接' },
  { value: 'ranged', label: '遠隔' },
];

export const COMBAT_MODULE_RUNTIME_EFFECT_KIND_OPTIONS: Array<{
  value: '' | 'healOnEnemyAttackHpHit' | 'physicalDamageTakenReduction';
  label: string;
}> = [
  { value: '', label: 'なし' },
  {
    value: 'physicalDamageTakenReduction',
    label: '選択中・自身への物理被ダメ軽減（永続）',
  },
  {
    value: 'healOnEnemyAttackHpHit',
    label: '敵Attack Hit実HPダメージ時・固定自己回復',
  },
];

export const DAMAGE_TAKEN_DAMAGE_TYPE_OPTIONS: Array<{
  value: 'physical' | 'magic' | 'physical,magic' | '';
  label: string;
}> = [
  { value: '', label: '全属性（未指定）' },
  { value: 'physical', label: '物理のみ' },
  { value: 'magic', label: '魔法のみ' },
  { value: 'physical,magic', label: '物理+魔法' },
];

export function runtimeEffectKindValue(
  module: CombatModuleDef,
): '' | 'healOnEnemyAttackHpHit' | 'physicalDamageTakenReduction' {
  const kind = module.runtimeEffect?.kind;
  if (
    kind === 'healOnEnemyAttackHpHit' ||
    kind === 'physicalDamageTakenReduction'
  ) {
    return kind;
  }
  return '';
}

export function damageTakenDamageTypesSelectValue(
  types: readonly string[] | undefined,
): '' | 'physical' | 'magic' | 'physical,magic' {
  if (!types || types.length === 0) return '';
  const set = new Set(types);
  const hasPhysical = set.has('physical');
  const hasMagic = set.has('magic');
  if (hasPhysical && hasMagic) return 'physical,magic';
  if (hasPhysical) return 'physical';
  if (hasMagic) return 'magic';
  return '';
}

export function parseDamageTakenDamageTypesSelect(
  value: string,
): Array<'physical' | 'magic'> | undefined {
  if (value === '') return undefined;
  if (value === 'physical') return ['physical'];
  if (value === 'magic') return ['magic'];
  if (value === 'physical,magic') return ['physical', 'magic'];
  return undefined;
}

export function listCombatModulesForClass(
  modules: readonly CombatModuleDef[],
  classId: string,
): CombatModuleDef[] {
  return modules
    .filter((module) => module.classId === classId)
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function listCombatModuleAuthoringClassIds(
  modules: readonly CombatModuleDef[],
): string[] {
  const ids = new Set<string>(R5_COMBAT_MODULE_CLASS_IDS);
  for (const module of modules) {
    ids.add(module.classId);
  }
  return [...ids].sort();
}

export function findCombatModuleDraft(
  modules: readonly CombatModuleDef[],
  moduleId: string,
): CombatModuleDef | undefined {
  return modules.find((module) => module.id === moduleId);
}

export function upsertCombatModuleDraft(
  modules: readonly CombatModuleDef[],
  nextModule: CombatModuleDef,
): CombatModuleDef[] {
  const index = modules.findIndex((module) => module.id === nextModule.id);
  if (index < 0) {
    return [...modules, structuredClone(nextModule)];
  }
  const next = modules.map((module) => structuredClone(module));
  next[index] = structuredClone(nextModule);
  return next;
}

export function patchCombatModuleAction(
  module: CombatModuleDef,
  mutate: (action: CombatModuleActionDef) => void,
): CombatModuleDef {
  const next = structuredClone(module);
  mutate(next.action);
  return next;
}

export function groupCombatModulesByClassId(
  modules: readonly CombatModuleDef[],
): Map<ClassId, CombatModuleDef[]> {
  const groups = new Map<ClassId, CombatModuleDef[]>();
  for (const module of modules) {
    const list = groups.get(module.classId) ?? [];
    list.push(structuredClone(module));
    groups.set(module.classId, list);
  }
  for (const [classId, list] of groups) {
    list.sort((a, b) => a.id.localeCompare(b.id));
    groups.set(classId, list);
  }
  return groups;
}

export function summarizeCombatModuleEffectRange(
  module: CombatModuleDef,
): string {
  const effectRange = module.action.effectRange;
  if (effectRange !== undefined) {
    const bits = [summarizeEffectRangeSpec(effectRange)];
    const range = module.action.range;
    if (
      typeof range === 'number' &&
      effectRange.distancePx === undefined &&
      effectRange.form !== 'forward'
    ) {
      bits.push(`射程=${range}`);
    } else if (
      typeof range === 'number' &&
      effectRange.form === 'forward' &&
      effectRange.distancePx === undefined
    ) {
      bits.push(`前方射程=${range}`);
    }
    return bits.join(' · ');
  }

  const shape = (module.action.targetShape ?? 'single') as TargetShape;
  const formLabel = EFFECT_RANGE_FORM_LABELS[shape];
  const bits = [formLabel];
  const aoeRadiusPx = module.action.aoeRadiusPx;
  if (shape === 'aoe' && typeof aoeRadiusPx === 'number') {
    bits.push(`N=${aoeRadiusPx}`);
  }
  const range = module.action.range;
  if (shape === 'pierce' && typeof range === 'number') {
    bits.push(`前方射程=${range}`);
  }
  const hitCount = module.action.hitCount;
  if (
    (shape === 'single' || shape === 'aoe' || shape === 'multiLock') &&
    typeof hitCount === 'number' &&
    hitCount > 1
  ) {
    bits.push(`Hit=${hitCount}`);
  }
  const scatterHitCount = module.action.scatterHitCount;
  if (shape === 'scatter' && typeof scatterHitCount === 'number') {
    bits.push(`乱打Hit=${scatterHitCount}`);
  }
  if (typeof range === 'number' && shape !== 'pierce') {
    bits.push(`射程=${range}`);
  }
  return bits.join(' · ');
}

/** §5.7 新ラベル（テスト・将来エディタ UI 用） */
export {
  EFFECT_RANGE_FORM_LABELS_NEW,
  EFFECT_APPLY_MODE_LABELS,
};
