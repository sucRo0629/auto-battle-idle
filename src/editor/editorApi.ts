import { normalizeEntityTraits } from '../battle/data/entityTraits.ts';
import { DEFAULT_BASIC_ATTACK_INTERVAL_SEC } from '../battle/data/synthesizeBasicAttack.ts';
import {
  normalizeActiveSkillEffectForEditor,
  sanitizeBasicAttackSkillForJson,
  sanitizePassiveSkillForJson,
} from '../battle/data/validateGameData.ts';
import { assertConfigurableRangePx } from '../battle/rangeLimits.ts';
import type {
  ActiveSkillDef,
  AttackSpeedTier,
  EnemyTemplate,
  EntityTraits,
  GrowthTierSet,
  PassiveSkillDef,
  Role,
  SkillRegistry,
  SkillVfxDef,
} from '../battle/types.ts';
import type { ClassPresetBeforeEnrich } from '../progression/skillUnlocks.ts';

export function defaultGrowthTierForRole(role: Role): GrowthTierSet {
  switch (role) {
    case 'defender':
      return { maxHp: 3, atk: 1, def: 3 };
    case 'supporter':
      return { maxHp: 1, atk: 2, def: 1 };
    default:
      return { maxHp: 2, atk: 3, def: 3 };
  }
}

export function defaultAttackSpeedTierForRole(role: Role): AttackSpeedTier {
  switch (role) {
    case 'defender':
      return 'somewhatSlow';
    case 'supporter':
      return 'slow';
    default:
      return 'normal';
  }
}

export function ensureClassGrowthFields(cls: ClassPresetBeforeEnrich): void {
  if (!cls.growthTier) {
    cls.growthTier = defaultGrowthTierForRole(cls.role);
  }
  if (!cls.attackSpeedTier) {
    cls.attackSpeedTier = defaultAttackSpeedTierForRole(cls.role);
  }
  if (cls.role !== 'attacker') {
    delete cls.growthPresetKey;
  } else if (cls.growthPresetKey !== 'caster') {
    delete cls.growthPresetKey;
  }
}

export interface SkillsJson {
  passives: PassiveSkillDef[];
  actives: ActiveSkillDef[];
}

export function buildSkillRegistryFromSkillsJson(
  skills: SkillsJson,
): SkillRegistry {
  const passives: SkillRegistry['passives'] = {};
  for (const passive of skills.passives) {
    passives[passive.id] = passive;
  }
  const actives: SkillRegistry['actives'] = {};
  for (const active of skills.actives) {
    actives[active.id] = active;
  }
  return { passives, actives };
}

export type SkillSlotKind = 'passive' | 'active';

export type DraftChangeOptions = { rerender?: boolean; updatePreview?: boolean };

export interface SkillSlotRef {
  skillId: string;
  kind: SkillSlotKind;
}

export interface ClassDraft {
  class: ClassPresetBeforeEnrich;
}

export type EnemyTemplateDraft = Omit<EnemyTemplate, 'traits'> & {
  traits?: EntityTraits;
};

export interface EnemyDraft {
  enemy: EnemyTemplateDraft;
  passiveIds: string[];
  activeIds: string[];
}

export interface SkillDraftEntry {
  ref: SkillSlotRef;
  passive?: PassiveSkillDef;
  active?: ActiveSkillDef;
  /** 0 = 初期習得。通常攻撃には設定しない */
  unlockLevel?: number;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = (await res.json()) as T & { error?: string };
  if (!res.ok) {
    const message =
      typeof (body as { error?: string }).error === 'string'
        ? (body as { error: string }).error
        : res.statusText;
    throw new Error(message);
  }
  return body;
}

export async function fetchClasses(): Promise<ClassPresetBeforeEnrich[]> {
  return fetchJson('/__editor/classes');
}

export async function fetchSkills(): Promise<SkillsJson> {
  return fetchJson('/__editor/skills');
}

export async function fetchEnemies(): Promise<EnemyTemplate[]> {
  const raw = await fetchJson<EnemyTemplateDraft[] | EnemyTemplate[]>('/__editor/enemies');
  return raw.map((entry) => normalizeEnemyTemplateForEditor(entry));
}

export const ENEMY_ATTACK_SPEED_CUSTOM = 'custom' as const;

export type EnemyAttackSpeedSelect =
  | AttackSpeedTier
  | typeof ENEMY_ATTACK_SPEED_CUSTOM;

export function normalizeEnemyTemplateForEditor(
  raw: EnemyTemplate | EnemyTemplateDraft,
): EnemyTemplate {
  const id = (raw.id ?? '').trim();
  const basicAttackSkillId =
    (raw.basicAttackSkillId ?? '').trim() || (id ? defaultBasicAttackId(id) : '');
  return {
    id: raw.id,
    displayName: raw.displayName,
    maxHp: raw.maxHp,
    atk: raw.atk,
    def: raw.def,
    reg: raw.reg,
    exp: raw.exp,
    basicAttackSkillId,
    traits: normalizeEntityTraits(raw.traits),
    attackSpeedTier: raw.attackSpeedTier ?? 'normal',
    ...(raw.passiveSkillIds !== undefined
      ? { passiveSkillIds: raw.passiveSkillIds }
      : {}),
    ...(raw.activeSkillIds !== undefined ? { activeSkillIds: raw.activeSkillIds } : {}),
  };
}

export function getEnemyBasicAttackEntry(
  entries: SkillDraftEntry[],
  enemyId: string,
): SkillDraftEntry | undefined {
  return entries.find((entry) => isEnemyBasicAttackEntry(entry, enemyId));
}

export function resolveEnemyBasicAttackInterval(
  entries: SkillDraftEntry[],
  enemyId: string,
): number {
  const entry = getEnemyBasicAttackEntry(entries, enemyId);
  const trigger = entry?.active?.trigger;
  if (trigger?.kind === 'time') return trigger.value;
  return DEFAULT_BASIC_ATTACK_INTERVAL_SEC;
}

export function isEnemyCustomBasicAttackInterval(
  entries: SkillDraftEntry[],
  enemyId: string,
): boolean {
  return (
    resolveEnemyBasicAttackInterval(entries, enemyId) !==
    DEFAULT_BASIC_ATTACK_INTERVAL_SEC
  );
}

export function resolveEnemyAttackSpeedSelect(
  entries: SkillDraftEntry[],
  enemyId: string,
  tier: AttackSpeedTier,
): EnemyAttackSpeedSelect {
  if (isEnemyCustomBasicAttackInterval(entries, enemyId)) {
    return ENEMY_ATTACK_SPEED_CUSTOM;
  }
  return tier;
}

export function applyEnemyAttackSpeedTier(
  entries: SkillDraftEntry[],
  enemyId: string,
): SkillDraftEntry[] {
  const next = structuredClone(entries);
  const entry = getEnemyBasicAttackEntry(next, enemyId);
  if (!entry?.active) return next;
  entry.active.trigger = {
    kind: 'time',
    value: DEFAULT_BASIC_ATTACK_INTERVAL_SEC,
  };
  delete entry.active.interval;
  return next;
}

export function applyEnemyCustomBasicAttackInterval(
  entries: SkillDraftEntry[],
  enemyId: string,
  intervalSec: number,
): SkillDraftEntry[] {
  const next = structuredClone(entries);
  const entry = getEnemyBasicAttackEntry(next, enemyId);
  if (!entry?.active) return next;
  entry.active.trigger = { kind: 'time', value: intervalSec };
  delete entry.active.interval;
  return next;
}

export async function saveClassBundle(payload: {
  class: ClassPresetBeforeEnrich;
  passives: PassiveSkillDef[];
  actives: ActiveSkillDef[];
}): Promise<void> {
  await fetchJson('/__editor/class-bundle', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export interface ClassStatsPatch {
  id: string;
  maxHp: number;
  atk: number;
  def: number;
  reg: number;
  rangePx: number;
  growthTier: GrowthTierSet;
  attackSpeedTier: AttackSpeedTier;
  growthPresetKey?: 'caster';
}

export interface BalanceClassRow {
  id: string;
  baseline: ClassPresetBeforeEnrich;
  current: ClassPresetBeforeEnrich;
}

function growthTierEqual(a: GrowthTierSet, b: GrowthTierSet): boolean {
  return a.maxHp === b.maxHp && a.atk === b.atk && a.def === b.def;
}

export function classStatsEqual(
  a: ClassPresetBeforeEnrich,
  b: ClassPresetBeforeEnrich,
): boolean {
  const left = structuredClone(a);
  const right = structuredClone(b);
  ensureClassGrowthFields(left);
  ensureClassGrowthFields(right);
  if (
    left.maxHp !== right.maxHp ||
    left.atk !== right.atk ||
    left.def !== right.def ||
    left.reg !== right.reg ||
    (left.traits.rangePx ?? 0) !== (right.traits.rangePx ?? 0)
  ) {
    return false;
  }
  if (left.attackSpeedTier !== right.attackSpeedTier) return false;
  if (!growthTierEqual(left.growthTier!, right.growthTier!)) return false;
  return left.growthPresetKey === right.growthPresetKey;
}

export function isBalanceRowDirty(row: BalanceClassRow): boolean {
  return !classStatsEqual(row.baseline, row.current);
}

export function toClassStatsPatch(cls: ClassPresetBeforeEnrich): ClassStatsPatch {
  const copy = structuredClone(cls);
  ensureClassGrowthFields(copy);
  return {
    id: copy.id,
    maxHp: copy.maxHp,
    atk: copy.atk,
    def: copy.def,
    reg: copy.reg,
    rangePx: copy.traits.rangePx ?? 0,
    growthTier: structuredClone(copy.growthTier!),
    attackSpeedTier: copy.attackSpeedTier ?? 'normal',
    ...(copy.growthPresetKey === 'caster' ? { growthPresetKey: 'caster' as const } : {}),
  };
}

function assertFiniteNumber(label: string, value: number): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} は数値を入力してください`);
  }
}

function assertMinNumber(label: string, value: number, min: number): void {
  assertFiniteNumber(label, value);
  if (value < min) {
    throw new Error(`${label} は ${min} 以上である必要があります`);
  }
}

export function validateClassDraftForSave(draft: ClassDraft): void {
  assertMinNumber('maxHp', draft.class.maxHp, 1);
  assertMinNumber('atk', draft.class.atk, 0);
  assertMinNumber('def', draft.class.def, 0);
  assertConfigurableRangePx('射程 (px)', draft.class.traits.rangePx ?? 0);
}

export function validateEnemyDraftForSave(draft: EnemyDraft): void {
  assertMinNumber('maxHp', draft.enemy.maxHp, 1);
  assertMinNumber('atk', draft.enemy.atk, 0);
  assertMinNumber('def', draft.enemy.def, 0);
  assertMinNumber('exp', draft.enemy.exp, 0);
  assertConfigurableRangePx('射程 (px)', draft.enemy.traits?.rangePx ?? 0);
}

export function validateClassStatsForSave(cls: ClassPresetBeforeEnrich): void {
  assertMinNumber(`${cls.displayName || cls.id} の maxHp`, cls.maxHp, 1);
  assertMinNumber(`${cls.displayName || cls.id} の atk`, cls.atk, 0);
  assertMinNumber(`${cls.displayName || cls.id} の def`, cls.def, 0);
  assertConfigurableRangePx(
    `${cls.displayName || cls.id} の射程 (px)`,
    cls.traits.rangePx ?? 0,
  );
}

export { compareByClassListOrder } from '../battle/data/classListOrder.ts';

export function createBalanceRowsFromClasses(
  classes: ClassPresetBeforeEnrich[],
): BalanceClassRow[] {
  return classes.map((cls) => {
    const snapshot = structuredClone(cls);
    ensureClassGrowthFields(snapshot);
    return {
      id: cls.id,
      baseline: structuredClone(snapshot),
      current: structuredClone(snapshot),
    };
  });
}

export async function saveClassStatsBulk(patches: ClassStatsPatch[]): Promise<void> {
  await fetchJson('/__editor/class-stats-bulk', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ patches }),
  });
}

export async function saveEnemyBundle(payload: {
  enemy: EnemyTemplate;
  passives: PassiveSkillDef[];
  actives: ActiveSkillDef[];
}): Promise<void> {
  await fetchJson('/__editor/enemy-bundle', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export type PresentationSkillTraitsPatch = {
  entityKind: 'class' | 'enemy';
  entityId: string;
  basicAttackVfx: SkillVfxDef;
};

export async function savePresentationSkill(
  active: ActiveSkillDef,
  traitsPatch?: PresentationSkillTraitsPatch,
): Promise<void> {
  await fetchJson('/__editor/presentation-skill', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      active,
      ...(traitsPatch ? { traitsPatch } : {}),
    }),
  });
}

export function defaultBasicAttackId(classId: string): string {
  return `${classId}_basic_attack`;
}

export function isBasicAttackSkillId(skillId: string, classId: string): boolean {
  const id = classId.trim();
  if (!id) return false;
  return skillId.trim() === defaultBasicAttackId(id);
}

/** 命名規則 `{classId}_basic_attack` に一致する通常攻撃スキル */
export function isBasicAttackSkillIdPattern(skillId: string): boolean {
  return skillId.trim().endsWith('_basic_attack');
}

export function buildSkillIdSelectOptions(
  ids: string[],
  currentValue: string,
  labelsById?: Map<string, string>,
  emptyLabel = '— 未設定 —',
): { value: string; label: string }[] {
  const set = new Set(ids.map((id) => id.trim()).filter(Boolean));
  const current = currentValue.trim();
  if (current) set.add(current);
  const sorted = [...set].sort();
  return [
    { value: '', label: emptyLabel },
    ...sorted.map((id) => ({
      value: id,
      label: labelsById?.get(id) ? `${labelsById.get(id)!} (${id})` : id,
    })),
  ];
}

export function passiveSkillSelectOptions(
  skills: SkillsJson,
  currentValue: string,
): { value: string; label: string }[] {
  const labels = new Map(skills.passives.map((p) => [p.id, p.name]));
  return buildSkillIdSelectOptions(
    skills.passives.map((p) => p.id),
    currentValue,
    labels,
  );
}

export function classPassiveSkillSelectOptions(
  entries: SkillDraftEntry[],
  currentValue: string,
): { value: string; label: string }[] {
  const labels = new Map<string, string>();
  const ids: string[] = [];
  for (const entry of entries) {
    if (entry.ref.kind !== 'passive') continue;
    ids.push(entry.ref.skillId);
    if (entry.passive) labels.set(entry.passive.id, entry.passive.name);
  }
  return buildSkillIdSelectOptions(ids, currentValue, labels);
}

export function classActiveSkillSelectOptions(
  entries: SkillDraftEntry[],
  currentValue: string,
): { value: string; label: string }[] {
  const labels = new Map<string, string>();
  const ids: string[] = [];
  for (const entry of entries) {
    if (entry.ref.kind !== 'active') continue;
    if (isBasicAttackSkillIdPattern(entry.ref.skillId)) continue;
    ids.push(entry.ref.skillId);
    if (entry.active) labels.set(entry.active.id, entry.active.name);
  }
  return buildSkillIdSelectOptions(ids, currentValue, labels);
}

export function mergeSkillPoolEntries(
  pool: SkillDraftEntry[],
  requiredRefs: SkillSlotRef[],
  skills: SkillsJson,
): SkillDraftEntry[] {
  const poolByKey = new Map(
    pool.map((entry) => [`${entry.ref.kind}:${entry.ref.skillId}`, entry]),
  );
  const next = [...pool];
  for (const ref of requiredRefs) {
    const key = `${ref.kind}:${ref.skillId}`;
    if (poolByKey.has(key)) continue;
    const built = buildSkillDrafts([ref], skills);
    next.push(...built);
    for (const entry of built) {
      poolByKey.set(`${entry.ref.kind}:${entry.ref.skillId}`, entry);
    }
  }
  return next;
}

export function nextClassSkillId(
  classId: string,
  kind: SkillSlotKind,
  entries: SkillDraftEntry[],
): string {
  const base = classId.trim();
  const kindLabel = kind === 'passive' ? 'passive' : 'active';
  const prefix = `${base}_${kindLabel}_`;
  const used = new Set(entries.map((entry) => entry.ref.skillId));
  for (let index = 1; index < 1000; index += 1) {
    const id = `${prefix}${index}`;
    if (!used.has(id)) return id;
  }
  return `${prefix}${Date.now()}`;
}

/** 敵 ID 未確定時の通常攻撃枠プレースホルダー */
export const PLACEHOLDER_ENEMY_BASIC_ATTACK_ID = '__pending_basic_attack__';

export function isEnemyBasicAttackEntry(
  entry: SkillDraftEntry,
  enemyId: string,
): boolean {
  if (entry.ref.kind !== 'active') return false;
  const id = entry.ref.skillId.trim();
  if (id === PLACEHOLDER_ENEMY_BASIC_ATTACK_ID) return true;
  const trimmed = enemyId.trim();
  if (trimmed && isBasicAttackSkillId(id, trimmed)) return true;
  return isBasicAttackSkillIdPattern(id);
}

export function createEnemyBasicAttackSlot(
  enemyId: string,
  skills: SkillsJson,
): SkillDraftEntry {
  const id = enemyId.trim()
    ? defaultBasicAttackId(enemyId.trim())
    : PLACEHOLDER_ENEMY_BASIC_ATTACK_ID;
  return buildSkillDrafts([{ skillId: id, kind: 'active' }], skills)[0]!;
}

export function createInitialEnemySkillEntries(skills: SkillsJson): SkillDraftEntry[] {
  return [createEnemyBasicAttackSlot('', skills)];
}

export function resyncEnemyBasicAttackEntry(
  entries: SkillDraftEntry[],
  enemyId: string,
  skills: SkillsJson,
): SkillDraftEntry[] {
  const next = structuredClone(entries);
  const idx = next.findIndex((entry) => isEnemyBasicAttackEntry(entry, enemyId));
  const newId = enemyId.trim()
    ? defaultBasicAttackId(enemyId.trim())
    : PLACEHOLDER_ENEMY_BASIC_ATTACK_ID;

  if (idx < 0) {
    return [createEnemyBasicAttackSlot(enemyId, skills), ...next];
  }

  const entry = next[idx]!;
  const previousId = entry.ref.skillId;
  entry.ref.skillId = newId;

  if (!entry.active) {
    const existing = skills.actives.find((active) => active.id === newId);
    entry.active = existing
      ? structuredClone(existing)
      : { ...defaultActiveSkill(newId), id: newId };
    return next;
  }

  if (entry.active.id !== newId) {
    entry.active = { ...entry.active, id: newId };
    if (entry.active.name === previousId) {
      entry.active.name = newId;
    }
  }

  return next;
}

export function ensureClassBasicAttackPool(
  classId: string,
  entries: SkillDraftEntry[],
  skills: SkillsJson,
): SkillDraftEntry[] {
  const id = classId.trim();
  if (!id) return entries;
  return mergeSkillPoolEntries(
    entries,
    [{ skillId: defaultBasicAttackId(id), kind: 'active' }],
    skills,
  );
}

export function ensureEnemyBasicAttackPool(
  enemyId: string,
  entries: SkillDraftEntry[],
  skills: SkillsJson,
): SkillDraftEntry[] {
  return resyncEnemyBasicAttackEntry(entries, enemyId, skills);
}

export function initEnemySkillEntriesFromPreset(
  template: Pick<
    EnemyTemplate,
    'id' | 'basicAttackSkillId' | 'passiveSkillIds' | 'activeSkillIds'
  >,
  skills: SkillsJson,
): SkillDraftEntry[] {
  const enemyId = template.id.trim();
  if (!enemyId) return [];

  const basicAttackSkillId =
    (template.basicAttackSkillId ?? '').trim() || defaultBasicAttackId(enemyId);
  const refs: SkillSlotRef[] = [
    { skillId: basicAttackSkillId, kind: 'active' },
  ];
  const seen = new Set(refs.map((ref) => ref.skillId));

  for (const skillId of template.passiveSkillIds ?? []) {
    const id = skillId.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    refs.push({ skillId: id, kind: 'passive' });
  }

  for (const skillId of template.activeSkillIds ?? []) {
    const id = skillId.trim();
    if (!id || seen.has(id) || isBasicAttackSkillId(id, enemyId)) continue;
    seen.add(id);
    refs.push({ skillId: id, kind: 'active' });
  }

  return buildSkillDrafts(refs, skills);
}

export function buildClassSkillsFromEntries(
  classId: string,
  entries: SkillDraftEntry[],
): { level: number; skillIds: string[] }[] {
  const byLevel = new Map<number, string[]>();
  for (const entry of entries) {
    if (isBasicAttackSkillId(entry.ref.skillId, classId)) continue;
    const skillId = entry.ref.skillId.trim();
    if (!skillId) continue;
    const level = entry.unlockLevel ?? 0;
    const list = byLevel.get(level) ?? [];
    list.push(skillId);
    byLevel.set(level, list);
  }
  const blocks = [...byLevel.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([level, skillIds]) => ({ level, skillIds }))
    .filter((block) => block.skillIds.length > 0 || block.level === 0);
  if (blocks.length === 0) {
    return [{ level: 0, skillIds: [] }];
  }
  return blocks;
}

export function initClassSkillEntriesFromPreset(
  preset: ClassPresetBeforeEnrich,
  skills: SkillsJson,
): SkillDraftEntry[] {
  const classId = preset.id.trim();
  if (!classId) return [];

  const levelBySkillId = new Map<string, number>();
  for (const block of preset.skills) {
    for (const skillId of block.skillIds) {
      levelBySkillId.set(skillId.trim(), block.level);
    }
  }

  const registryPassiveIds = new Set(skills.passives.map((p) => p.id));
  const refs: SkillSlotRef[] = [
    { skillId: defaultBasicAttackId(classId), kind: 'active' },
  ];
  const seen = new Set(refs.map((ref) => ref.skillId));

  const passiveIdList: string[] = [];
  const passiveIdSet = new Set<string>();
  for (const passiveId of preset.passiveIds ?? []) {
    const id = passiveId.trim();
    if (!id || passiveIdSet.has(id)) continue;
    passiveIdSet.add(id);
    passiveIdList.push(id);
  }
  for (const skillId of levelBySkillId.keys()) {
    if (!registryPassiveIds.has(skillId) || passiveIdSet.has(skillId)) continue;
    passiveIdSet.add(skillId);
    passiveIdList.push(skillId);
  }
  passiveIdList.sort(
    (a, b) =>
      (levelBySkillId.get(a) ?? 0) - (levelBySkillId.get(b) ?? 0) ||
      a.localeCompare(b),
  );
  for (const id of passiveIdList) {
    if (seen.has(id)) continue;
    seen.add(id);
    refs.push({ skillId: id, kind: 'passive' });
  }

  const activeIdList: string[] = [];
  for (const skillId of levelBySkillId.keys()) {
    if (skillId === defaultBasicAttackId(classId) || seen.has(skillId)) continue;
    if (registryPassiveIds.has(skillId)) continue;
    activeIdList.push(skillId);
  }
  activeIdList.sort(
    (a, b) =>
      (levelBySkillId.get(a) ?? 0) - (levelBySkillId.get(b) ?? 0) ||
      a.localeCompare(b),
  );
  for (const skillId of activeIdList) {
    seen.add(skillId);
    refs.push({ skillId, kind: 'active' });
  }

  return buildSkillDrafts(refs, skills).map((entry) => {
    if (isBasicAttackSkillId(entry.ref.skillId, classId)) return entry;
    return {
      ...entry,
      unlockLevel: levelBySkillId.get(entry.ref.skillId) ?? 0,
    };
  });
}

export function createEmptyClassDraft(): ClassDraft {
  return {
    class: {
      id: '',
      role: 'defender',
      displayName: '',
      formationRow: 'front',
      traits: {},
      maxHp: 100,
      atk: 10,
      def: 10,
      reg: 0,
      basicAttackSkillId: '',
      passiveIds: [],
      skills: [{ level: 0, skillIds: [] }],
      jobTier: 1,
      growthTier: defaultGrowthTierForRole('defender'),
      attackSpeedTier: defaultAttackSpeedTierForRole('defender'),
    },
  };
}

export function classDraftFromPreset(preset: ClassPresetBeforeEnrich): ClassDraft {
  const cls = structuredClone(preset);
  ensureClassGrowthFields(cls);
  if (cls.id.trim()) {
    cls.basicAttackSkillId = defaultBasicAttackId(cls.id.trim());
  }
  return { class: cls };
}

export function buildClassPresetFromDraft(
  draft: ClassDraft,
  entries: SkillDraftEntry[],
): ClassPresetBeforeEnrich {
  const cls = structuredClone(draft.class);
  cls.passiveIds = entries
    .filter((entry) => entry.ref.kind === 'passive')
    .sort(
      (a, b) =>
        (a.unlockLevel ?? 0) - (b.unlockLevel ?? 0) ||
        a.ref.skillId.localeCompare(b.ref.skillId),
    )
    .map((entry) => entry.ref.skillId.trim())
    .filter(Boolean);
  cls.skills = buildClassSkillsFromEntries(cls.id, entries);
  cls.jobTier = 1;
  delete cls.promotion;
  delete cls.promotesFrom;
  ensureClassGrowthFields(cls);
  if (cls.id.trim()) {
    cls.basicAttackSkillId = defaultBasicAttackId(cls.id.trim());
  }
  return cls;
}

export function collectClassSkillRefsFromEntries(
  entries: SkillDraftEntry[],
): SkillSlotRef[] {
  return entries.map((entry) => entry.ref);
}

export function createEmptyEnemyDraft(): EnemyDraft {
  return {
    enemy: {
      id: '',
      displayName: '',
      maxHp: 100,
      atk: 10,
      def: 5,
      reg: 0,
      exp: 1,
      basicAttackSkillId: '',
      traits: {},
      attackSpeedTier: 'normal',
    },
    passiveIds: [],
    activeIds: [],
  };
}

export function enemyDraftFromTemplate(template: EnemyTemplate): EnemyDraft {
  const normalized = normalizeEnemyTemplateForEditor(template);
  const enemy = structuredClone(normalized);
  return {
    enemy,
    passiveIds: [...(normalized.passiveSkillIds ?? [])],
    activeIds: [...(normalized.activeSkillIds ?? [])],
  };
}

export function buildEnemyFromDraft(
  draft: EnemyDraft,
  entries?: SkillDraftEntry[],
): EnemyTemplate {
  const enemyId = draft.enemy.id.trim();
  const passiveSkillIds =
    entries !== undefined
      ? entries
          .filter((entry) => entry.ref.kind === 'passive')
          .map((entry) => entry.ref.skillId.trim())
          .filter(Boolean)
      : draft.passiveIds.map((id) => id.trim()).filter(Boolean);
  const activeSkillIds =
    entries !== undefined
      ? entries
          .filter((entry) => entry.ref.kind === 'active')
          .map((entry) => entry.ref.skillId.trim())
          .filter(
            (id) =>
              Boolean(id) &&
              id !== PLACEHOLDER_ENEMY_BASIC_ATTACK_ID &&
              !isBasicAttackSkillId(id, enemyId),
          )
      : draft.activeIds
          .map((id) => id.trim())
          .filter(
            (id) =>
              Boolean(id) &&
              id !== PLACEHOLDER_ENEMY_BASIC_ATTACK_ID &&
              !isBasicAttackSkillId(id, enemyId),
          );
  const enemy = structuredClone(draft.enemy);
  if (enemyId) {
    enemy.basicAttackSkillId = defaultBasicAttackId(enemyId);
  }
  if (!enemy.attackSpeedTier) {
    enemy.attackSpeedTier = 'normal';
  }
  if (passiveSkillIds.length > 0) {
    enemy.passiveSkillIds = passiveSkillIds;
  } else {
    delete enemy.passiveSkillIds;
  }
  if (activeSkillIds.length > 0) {
    enemy.activeSkillIds = activeSkillIds;
  } else {
    delete enemy.activeSkillIds;
  }
  return {
    ...enemy,
    traits: normalizeEntityTraits(enemy.traits),
  };
}

export function defaultPassiveSkill(id: string): PassiveSkillDef {
  return {
    id,
    name: id,
    effect: 'targetRuleOverride',
    targetRuleOverride: { kind: 'distance', side: 'enemy', order: 'nearest' },
  };
}

export function defaultBasicAttackActiveSkill(id: string): ActiveSkillDef {
  return {
    id,
    name: id,
    trigger: { kind: 'time', value: 2 },
    effect: [
      {
        target: { kind: 'distance', side: 'enemy', order: 'nearest' },
        type: 'damage',
        amount: { kind: 'atkBased', atkScale: 1 },
      },
    ],
  };
}

export function defaultActiveSkill(id: string): ActiveSkillDef {
  return {
    id,
    name: id,
    trigger: { kind: 'time', value: 5 },
    effect: [
      {
        target: { kind: 'distance', side: 'enemy', order: 'nearest' },
        type: 'damage',
        damageType: 'physical',
        amount: { kind: 'atkBased', atkScale: 1 },
      },
    ],
  };
}

export function syncSkillDraftEntries(
  refs: SkillSlotRef[],
  existing: SkillDraftEntry[],
  skills: SkillsJson,
): SkillDraftEntry[] {
  const existingByKey = new Map(
    existing.map((entry) => [`${entry.ref.kind}:${entry.ref.skillId}`, entry]),
  );
  const next: SkillDraftEntry[] = [];
  for (const ref of refs) {
    const key = `${ref.kind}:${ref.skillId}`;
    const prev = existingByKey.get(key);
    if (prev) {
      next.push(prev);
      continue;
    }
    next.push(...buildSkillDrafts([ref], skills));
  }
  return next;
}

export function buildSkillDrafts(
  refs: SkillSlotRef[],
  skills: SkillsJson,
): SkillDraftEntry[] {
  const passiveMap = new Map(skills.passives.map((p) => [p.id, p]));
  const activeMap = new Map(skills.actives.map((a) => [a.id, a]));
  return refs.map((ref) => {
    if (ref.kind === 'passive') {
      const existing = passiveMap.get(ref.skillId);
      return {
        ref,
        passive: existing
          ? structuredClone(existing)
          : defaultPassiveSkill(ref.skillId),
      };
    }
    const existing = activeMap.get(ref.skillId);
    return {
      ref,
      active: existing
        ? structuredClone(existing)
        : isBasicAttackSkillIdPattern(ref.skillId)
          ? defaultBasicAttackActiveSkill(ref.skillId)
          : defaultActiveSkill(ref.skillId),
    };
  });
}

export function collectSkillsFromDrafts(entries: SkillDraftEntry[]): {
  passives: PassiveSkillDef[];
  actives: ActiveSkillDef[];
} {
  const passives: PassiveSkillDef[] = [];
  const actives: ActiveSkillDef[] = [];
  for (const entry of entries) {
    if (entry.passive) passives.push(sanitizePassiveSkillForJson(entry.passive));
    if (entry.active) {
      const active = {
        ...entry.active,
        effect: entry.active.effect.map(normalizeActiveSkillEffectForEditor),
      };
      actives.push(
        isBasicAttackSkillIdPattern(active.id)
          ? sanitizeBasicAttackSkillForJson(active)
          : active,
      );
    }
  }
  return { passives, actives };
}

export function collectEnemySkillRefs(draft: EnemyDraft): SkillSlotRef[] {
  const enemyId = draft.enemy.id.trim();
  const refs: SkillSlotRef[] = [];
  const seen = new Set<string>();

  if (enemyId) {
    const basicId =
      (draft.enemy.basicAttackSkillId ?? '').trim() ||
      defaultBasicAttackId(enemyId);
    refs.push({ skillId: basicId, kind: 'active' });
    seen.add(basicId);
  } else {
    refs.push({ skillId: PLACEHOLDER_ENEMY_BASIC_ATTACK_ID, kind: 'active' });
    seen.add(PLACEHOLDER_ENEMY_BASIC_ATTACK_ID);
  }

  for (const id of draft.passiveIds) {
    const skillId = id.trim();
    if (!skillId || seen.has(skillId)) continue;
    seen.add(skillId);
    refs.push({ skillId, kind: 'passive' });
  }
  for (const id of draft.activeIds) {
    const skillId = id.trim();
    if (!skillId || seen.has(skillId) || isBasicAttackSkillId(skillId, enemyId)) {
      continue;
    }
    seen.add(skillId);
    refs.push({ skillId, kind: 'active' });
  }
  return refs;
}
