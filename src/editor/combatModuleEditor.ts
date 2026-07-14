import type {
  ClassId,
  CombatModuleActionDef,
  CombatModuleDef,
  TargetShape,
} from '../battle/types.ts';
import { R5_COMBAT_MODULE_CLASS_IDS } from '../battle/types.ts';

/** エディタ用 §5.7 効果範囲の形式ラベル（legacy targetShape を保持したまま表示だけ寄せる） */
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
