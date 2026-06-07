import type {
  ActiveSkillDef,
  AttackSpeedTier,
  EnemyTemplate,
  GrowthTierSet,
  PassiveSkillDef,
  Role,
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

export type SkillSlotKind = 'passive' | 'active';

export type DraftChangeOptions = { rerender?: boolean; updatePreview?: boolean };

export interface SkillSlotRef {
  skillId: string;
  kind: SkillSlotKind;
}

export interface ClassDraft {
  class: ClassPresetBeforeEnrich;
}

export interface EnemyDraft {
  enemy: EnemyTemplate;
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
  return fetchJson('/__editor/enemies');
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

  const passiveIds = new Set(skills.passives.map((p) => p.id));
  const refs: SkillSlotRef[] = [
    { skillId: defaultBasicAttackId(classId), kind: 'active' },
  ];
  const seen = new Set(refs.map((ref) => ref.skillId));

  for (const [skillId] of levelBySkillId) {
    if (skillId === defaultBasicAttackId(classId) || seen.has(skillId)) continue;
    seen.add(skillId);
    refs.push({
      skillId,
      kind: passiveIds.has(skillId) ? 'passive' : 'active',
    });
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
      traits: { attackRange: 'melee' },
      maxHp: 100,
      atk: 10,
      def: 10,
      reg: 0,
      basicAttackSkillId: '',
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
  cls.skills = buildClassSkillsFromEntries(cls.id, entries);
  cls.jobTier = 1;
  delete cls.promotion;
  delete cls.promotesFrom;
  ensureClassGrowthFields(cls);
  if (cls.traits.attackRange === 'melee') {
    delete cls.traits.rangePx;
  }
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
      spriteKey: 'enemy_default',
    },
    passiveIds: [''],
    activeIds: [''],
  };
}

export function enemyDraftFromTemplate(template: EnemyTemplate): EnemyDraft {
  return {
    enemy: structuredClone(template),
    passiveIds:
      template.passiveSkillIds && template.passiveSkillIds.length > 0
        ? [...template.passiveSkillIds]
        : [''],
    activeIds:
      template.activeSkillIds && template.activeSkillIds.length > 0
        ? [...template.activeSkillIds]
        : [''],
  };
}

export function buildEnemyFromDraft(
  draft: EnemyDraft,
  entries?: SkillDraftEntry[],
): EnemyTemplate {
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
          .filter(Boolean)
      : draft.activeIds.map((id) => id.trim()).filter(Boolean);
  const enemy = structuredClone(draft.enemy);
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
  return enemy;
}

export function defaultPassiveSkill(id: string): PassiveSkillDef {
  return {
    id,
    name: id,
    effect: 'damageMultiplier',
    damageMultiplier: 1.1,
  };
}

export function defaultActiveSkill(id: string): ActiveSkillDef {
  return {
    id,
    name: id,
    interval: 2,
    effect: [
      {
        targetRule: 'frontEnemy',
        type: 'damage',
        damageType: 'physical',
        powerMultiplier: 1,
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
    if (entry.passive) passives.push(entry.passive);
    if (entry.active) actives.push(entry.active);
  }
  return { passives, actives };
}

export function collectEnemySkillRefs(draft: EnemyDraft): SkillSlotRef[] {
  const refs: SkillSlotRef[] = [];
  const seen = new Set<string>();
  for (const id of draft.passiveIds) {
    const skillId = id.trim();
    if (!skillId || seen.has(skillId)) continue;
    seen.add(skillId);
    refs.push({ skillId, kind: 'passive' });
  }
  for (const id of draft.activeIds) {
    const skillId = id.trim();
    if (!skillId || seen.has(skillId)) continue;
    seen.add(skillId);
    refs.push({ skillId, kind: 'active' });
  }
  return refs;
}
