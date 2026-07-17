import { normalizeEntityTraits } from '../battle/data/entityTraits.ts';
import { DEFAULT_BASIC_ATTACK_INTERVAL_SEC } from '../battle/data/synthesizeBasicAttack.ts';
import {
  normalizeActiveSkillEffectForEditor,
  normalizeOperationPassiveCatalogForSave,
  sanitizeActiveSkillForJson,
  sanitizeBasicAttackSkillForJson,
  sanitizePassiveSkillForJson,
  stripDeprecatedThreatFieldsFromEffect,
} from '../battle/data/validateGameData.ts';
import { assertConfigurableRangePx } from '../battle/rangeLimits.ts';
import type {
  ActiveSkillDef,
  AttackSpeedTier,
  CombatModuleDef,
  EnemyTemplate,
  EntityTraits,
  GrowthTierSet,
  OperationPassiveCatalogDef,
  PassiveSkillDef,
  Role,
  SkillRegistry,
  SkillVfxDef,
  StageDef,
  StageEnemyGroup,
  StageWave,
} from '../battle/types.ts';
import type { ClassPresetBeforeEnrich } from '../progression/skillUnlocks.ts';
import { R5_COMBAT_MODULE_CLASS_IDS } from '../battle/types.ts';
import {
  collectOperationPassiveCatalogAuthoringIssues,
  collectStageEnemyAuthoringIssues,
  firstAuthoringErrorMessage,
  type AuthoringCombatModuleContext,
  type AuthoringPassiveCatalogContext,
} from './authoringValidationPreview.ts';
import { validateClassCombatModulePoolDraft } from './classCombatModulePoolEditor.ts';
import {
  groupCombatModulesByClassId,
  listCombatModuleAuthoringClassIds,
} from './combatModuleEditor.ts';

export type StageDraftValidateContext = Partial<AuthoringCombatModuleContext> & {
  /** 既存 stageId 一覧（新規保存時の重複検査用）。 */
  existingStageIds?: readonly string[];
  /** true = 新規作成。既存 id との重複を拒否する。 */
  isNewStage?: boolean;
};

export type OperationPassiveCatalogValidateContext = Pick<
  AuthoringPassiveCatalogContext,
  'classRegistry' | 'passiveIds'
>;

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

/** Editor draft before save. enemyGroups ステージは waves 省略可（保存時に placeholder を補う）。 */
export type StageDraft = {
  id: string;
  displayName: string;
  waves?: StageWave[];
  recommendedLevel?: number;
  enemyGroups?: StageEnemyGroup[];
};

/** ステージ敵編成の editor 編集モード（保存 JSON には書かない）。 */
export type StageDraftCompositionMode =
  | 'legacy'
  | 'stageEnemyGroups'
  | 'waveEnemyGroups';

export function resolveStageDraftCompositionMode(
  draft: StageDraft,
): StageDraftCompositionMode {
  if (draft.enemyGroups !== undefined) return 'stageEnemyGroups';
  if ((draft.waves ?? []).some((wave) => wave.enemyGroups !== undefined)) {
    return 'waveEnemyGroups';
  }
  return 'legacy';
}

export function ensureStageDraftWaves(draft: StageDraft): StageWave[] {
  if (!Array.isArray(draft.waves) || draft.waves.length === 0) {
    draft.waves = [{ enemies: [] }];
  }
  return draft.waves;
}

const ENEMY_GROUPS_WAVE_PLACEHOLDER: StageWave[] = [{ enemies: [] }];

/**
 * enemyGroups ありで waves 未指定または空配列のとき、移行期 validate 用 placeholder を補う。
 * legacy waves ステージは既存構造を維持する。recommendedLevel は自動補完しない。
 */
export function normalizeStageDraftForSave(draft: StageDraft): StageDef {
  const copy = structuredClone(draft);
  const hasStageEnemyGroups =
    Array.isArray(copy.enemyGroups) && copy.enemyGroups.length > 0;

  if (hasStageEnemyGroups) {
    if (!Array.isArray(copy.waves) || copy.waves.length === 0) {
      copy.waves = structuredClone(ENEMY_GROUPS_WAVE_PLACEHOLDER);
    }
  }

  if (!Array.isArray(copy.waves) || copy.waves.length === 0) {
    throw new Error('waves is required for legacy stage drafts');
  }

  copy.waves = copy.waves.map((wave) => ({
    ...wave,
    enemies: Array.isArray(wave.enemies) ? wave.enemies : [],
  }));

  return copy as StageDef;
}

export async function fetchStages(): Promise<StageDef[]> {
  return fetchJson<StageDef[]>('/__editor/stages');
}

export async function fetchOperationPassiveCatalog(): Promise<OperationPassiveCatalogDef> {
  return fetchJson<OperationPassiveCatalogDef>('/__editor/operation-passive-catalog');
}

export function operationPassiveCatalogDraftFromCatalog(
  catalog: OperationPassiveCatalogDef,
): OperationPassiveCatalogDef {
  return structuredClone(catalog);
}

export function validateOperationPassiveCatalogDraftForSave(
  catalog: OperationPassiveCatalogDef,
  context?: OperationPassiveCatalogValidateContext,
): string | null {
  if (
    !Number.isInteger(catalog.passiveAcquireCost) ||
    catalog.passiveAcquireCost < 1
  ) {
    return '取得コスト（passiveAcquireCost）は 1 以上の整数にしてください';
  }
  if (
    !Number.isInteger(catalog.waveClearResourceGrant) ||
    catalog.waveClearResourceGrant < 0
  ) {
    return 'Wave クリア付与（waveClearResourceGrant）は 0 以上の整数にしてください';
  }
  if (
    !Number.isInteger(catalog.sameClassStackStep) ||
    catalog.sameClassStackStep < 0
  ) {
    return '同一クラス積み上げ（sameClassStackStep）は 0 以上の整数にしてください';
  }
  if (
    !catalog.unlockLevelCostTable ||
    typeof catalog.unlockLevelCostTable !== 'object'
  ) {
    return 'unlockLevelCostTable が必要です';
  }
  for (const [key, value] of Object.entries(catalog.unlockLevelCostTable)) {
    if (!Number.isInteger(value) || value < 1) {
      return `unlockLevelCostTable["${key}"] は 1 以上の整数にしてください`;
    }
  }
  for (const passiveId of Object.values(catalog.candidatesByClass).flat()) {
    const level = catalog.costUnlockLevelByPassiveId[passiveId];
    if (typeof level !== 'number' || !Number.isInteger(level) || level < 0) {
      return `costUnlockLevelByPassiveId に候補 "${passiveId}" のコスト帯（unlockLevel）を設定してください`;
    }
    const bandCost = catalog.unlockLevelCostTable[String(level)];
    if (typeof bandCost !== 'number') {
      return `unlockLevelCostTable に unlockLevel ${level}（${passiveId}）のコストがありません`;
    }
  }
  if (context) {
    return firstAuthoringErrorMessage(
      collectOperationPassiveCatalogAuthoringIssues(catalog, {
        classRegistry: context.classRegistry,
        combatModuleRegistry: {},
        passiveIds: context.passiveIds,
      }),
    );
  }
  return null;
}

export function normalizeOperationPassiveCatalogDraftForSave(
  catalog: OperationPassiveCatalogDef,
): OperationPassiveCatalogDef {
  return normalizeOperationPassiveCatalogForSave(catalog);
}

export async function saveOperationPassiveCatalog(
  catalog: OperationPassiveCatalogDef,
): Promise<void> {
  const normalized = normalizeOperationPassiveCatalogDraftForSave(catalog);
  await fetchJson('/__editor/operation-passive-catalog', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ catalog: normalized }),
  });
}

export async function fetchCombatModules(): Promise<CombatModuleDef[]> {
  return fetchJson<CombatModuleDef[]>('/__editor/combat-modules');
}

export function combatModulesDraftFromModules(
  modules: CombatModuleDef[],
): CombatModuleDef[] {
  return structuredClone(modules);
}

export function normalizeCombatModulesDraftForSave(
  modules: readonly CombatModuleDef[],
): CombatModuleDef[] {
  const cloned = modules.map((module) => structuredClone(module));
  cloned.sort((a, b) => {
    const classCmp = a.classId.localeCompare(b.classId);
    if (classCmp !== 0) return classCmp;
    return a.id.localeCompare(b.id);
  });
  return cloned;
}

export function validateCombatModulesDraftForSave(
  modules: readonly CombatModuleDef[],
): string | null {
  if (modules.length === 0) {
    return '戦闘方式が 1 件以上必要です';
  }

  const seenIds = new Set<string>();
  for (const module of modules) {
    const id = module.id.trim();
    if (!id) {
      return 'module.id は必須です';
    }
    if (seenIds.has(id)) {
      return `module.id が重複しています: ${id}`;
    }
    seenIds.add(id);

    if (!module.classId.trim()) {
      return `${id}: classId は必須です`;
    }
    if (!module.displayName.trim()) {
      return `${id}: displayName は必須です`;
    }
    if (!(module.attackIntervalSec > 0)) {
      return `${id}: attackIntervalSec は正の数にしてください`;
    }
    if (!Array.isArray(module.action?.effect) || module.action.effect.length === 0) {
      return `${id}: action.effect は 1 件以上必要です`;
    }
  }

  for (const classId of listCombatModuleAuthoringClassIds(modules)) {
    const count = modules.filter((module) => module.classId === classId).length;
    if (count !== 2) {
      return `兵科 ${classId} は戦闘方式がちょうど 2 件必要です（現在 ${count} 件）`;
    }
  }

  return null;
}

export async function saveCombatModules(
  modules: readonly CombatModuleDef[],
): Promise<void> {
  const normalized = normalizeCombatModulesDraftForSave(modules);
  await fetchJson('/__editor/combat-modules', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ modules: normalized }),
  });
}

/** server write 用: classId ごとの配列（ファイル単位） */
export function combatModuleFilesFromDraft(
  modules: readonly CombatModuleDef[],
): Array<{ classId: string; modules: CombatModuleDef[] }> {
  const groups = groupCombatModulesByClassId(normalizeCombatModulesDraftForSave(modules));
  return [...groups.entries()].map(([classId, classModules]) => ({
    classId,
    modules: classModules,
  }));
}

export function listOperationPassiveAuthoringClassIds(
  catalog: OperationPassiveCatalogDef,
): string[] {
  const ids = new Set<string>(R5_COMBAT_MODULE_CLASS_IDS);
  for (const classId of Object.keys(catalog.candidatesByClass)) {
    ids.add(classId);
  }
  return [...ids].sort();
}

export function listPassiveIdsForClassStem(
  passives: PassiveSkillDef[],
  classId: string,
): string[] {
  const legacyPrefix = `${classId}_passive_`;
  const operationPrefix = `${classId}_op_`;
  return passives
    .filter(
      (passive) =>
        passive.id.startsWith(legacyPrefix) ||
        passive.id.startsWith(operationPrefix),
    )
    .map((passive) => passive.id)
    .sort();
}

export function getOperationPassiveCandidatesForClassDraft(
  catalog: OperationPassiveCatalogDef,
  classId: string,
): string[] {
  return [...(catalog.candidatesByClass[classId] ?? [])];
}

export function setOperationPassiveCandidatesForClassDraft(
  catalog: OperationPassiveCatalogDef,
  classId: string,
  passiveIds: readonly string[],
): OperationPassiveCatalogDef {
  const next = structuredClone(catalog);
  const normalized = [...new Set(passiveIds.map((id) => id.trim()).filter(Boolean))];
  if (normalized.length === 0) {
    delete next.candidatesByClass[classId];
  } else {
    next.candidatesByClass[classId] = normalized;
    const bandKeys = Object.keys(next.unlockLevelCostTable)
      .map((key) => Number(key))
      .filter((n) => Number.isInteger(n) && n >= 0)
      .sort((a, b) => a - b);
    const defaultBands = bandKeys.length > 0 ? bandKeys : [0, 10, 20];
    for (let i = 0; i < normalized.length; i++) {
      const passiveId = normalized[i]!;
      if (next.costUnlockLevelByPassiveId[passiveId] === undefined) {
        next.costUnlockLevelByPassiveId[passiveId] =
          defaultBands[Math.min(i, defaultBands.length - 1)]!;
      }
    }
  }
  return next;
}

export function setOperationPassiveCostUnlockLevelDraft(
  catalog: OperationPassiveCatalogDef,
  passiveId: string,
  unlockLevel: number,
): OperationPassiveCatalogDef {
  const next = structuredClone(catalog);
  next.costUnlockLevelByPassiveId[passiveId] = unlockLevel;
  return next;
}

/**
 * R9d: class bundle 保存は stem ファイルを draft のスキルで丸ごと置換するため、
 * class の skills pool 外だが作戦内パッシブ catalog が参照する passive
 * （例: 作戦内パッシブ専用の passive 定義）が消えないよう、既存定義を保持対象として返す。
 */
export function collectCatalogPassivesToPreserveOnEntityReplace(
  existingStemPassives: readonly PassiveSkillDef[],
  draftPassives: readonly PassiveSkillDef[],
  catalog: OperationPassiveCatalogDef,
): PassiveSkillDef[] {
  const referencedIds = new Set(
    Object.values(catalog.candidatesByClass).flat(),
  );
  const draftIds = new Set(draftPassives.map((passive) => passive.id));
  return existingStemPassives.filter(
    (passive) => referencedIds.has(passive.id) && !draftIds.has(passive.id),
  );
}

export function createEmptyStageDraft(): StageDraft {
  return {
    id: '',
    displayName: '',
  };
}

/**
 * R9f — 新仕様 authoring 用の既定 Stage draft。
 * Wave ごと `enemyGroups`（legacy `waves.enemies` ではない）で開始する。
 */
export function createDefaultStageDraft(options?: {
  defaultClassId?: string;
  /** legacy 用。新仕様既定では設定しない。 */
  recommendedLevel?: number;
  waveCount?: number;
}): StageDraft {
  const defaultClassId = options?.defaultClassId ?? 'df_paladin';
  const waveCount = Math.max(1, options?.waveCount ?? 1);
  const waves: StageWave[] = [];
  for (let index = 0; index < waveCount; index += 1) {
    waves.push(
      createDefaultStageWave({
        withEnemyGroups: true,
        defaultClassId,
      }),
    );
  }
  return {
    id: '',
    displayName: '',
    ...(options?.recommendedLevel !== undefined
      ? { recommendedLevel: options.recommendedLevel }
      : {}),
    waves,
  };
}

/** draft の id が既存 stages に無い（または空）なら新規作成扱い。 */
export function isNewStageDraft(
  draft: StageDraft,
  existingStages: readonly Pick<StageDef, 'id'>[],
): boolean {
  const id = draft.id.trim();
  if (!id) return true;
  return !existingStages.some((stage) => stage.id === id);
}

export function stageDraftFromStage(stage: StageDef): StageDraft {
  return structuredClone(stage);
}

export function loadStageDraftById(stages: StageDef[], stageId: string): StageDraft {
  const stage = stages.find((entry) => entry.id === stageId);
  return stage ? stageDraftFromStage(stage) : createEmptyStageDraft();
}

export async function saveStageBundle(payload: { stage: StageDraft }): Promise<void> {
  const stage = normalizeStageDraftForSave(payload.stage);
  await fetchJson('/__editor/stages', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stage }),
  });
}

const STAGE_ENEMY_SCALE_MIN = 0.01;

function isPositiveStageEnemyScale(value: number | undefined): boolean {
  return value === undefined || (typeof value === 'number' && value >= STAGE_ENEMY_SCALE_MIN);
}

function validateStageEnemyGroupsForSave(
  groups: StageEnemyGroup[],
  prefix: string,
): string | null {
  if (groups.length === 0) {
    return `${prefix} に 1 件以上のグループを追加してください`;
  }

  for (let index = 0; index < groups.length; index += 1) {
    const group = groups[index]!;
    const groupPrefix = `${prefix}[${index}]`;
    if (!group.classId.trim()) {
      return `${groupPrefix}: classId を選択してください`;
    }
    if (!Number.isInteger(group.count) || group.count < 1) {
      return `${groupPrefix}: count は 1 以上の整数です`;
    }
    if (!isPositiveStageEnemyScale(group.hpScale)) {
      return `${groupPrefix}: hpScale は ${STAGE_ENEMY_SCALE_MIN} 以上です`;
    }
    if (!isPositiveStageEnemyScale(group.atkScale)) {
      return `${groupPrefix}: atkScale は ${STAGE_ENEMY_SCALE_MIN} 以上です`;
    }
    if (!isPositiveStageEnemyScale(group.defScale)) {
      return `${groupPrefix}: defScale は ${STAGE_ENEMY_SCALE_MIN} 以上です`;
    }
    if (!isPositiveStageEnemyScale(group.resScale)) {
      return `${groupPrefix}: resScale は ${STAGE_ENEMY_SCALE_MIN} 以上です`;
    }
  }

  return null;
}

function validateRecommendedLevelForSave(
  recommendedLevel: number | undefined,
): string | null {
  // 新仕様では不要。値がある場合のみ形式検査（legacy / Stage Records 用）。
  if (recommendedLevel === undefined) {
    return null;
  }
  if (!Number.isInteger(recommendedLevel) || recommendedLevel < 1) {
    return 'recommendedLevel は 1 以上の整数です（省略可）';
  }
  return null;
}

const STAGE_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;

function validateStageIdentityForSave(
  draft: StageDraft,
  context?: Pick<StageDraftValidateContext, 'existingStageIds' | 'isNewStage'>,
): string | null {
  const id = draft.id.trim();
  const displayName = draft.displayName.trim();
  if (!id) {
    return 'stageId を入力してください';
  }
  if (!STAGE_ID_PATTERN.test(id)) {
    return 'stageId は英数字・_・-（先頭は英数字）で入力してください';
  }
  if (!displayName) {
    return '表示名を入力してください';
  }
  if (context?.isNewStage && context.existingStageIds?.includes(id)) {
    return `stageId "${id}" は既に存在します`;
  }
  return null;
}

/** 保存前の軽いクライアント検証。null = OK。context あり時は module / class 参照も検査。 */
export function validateStageDraftForSave(
  draft: StageDraft,
  context?: StageDraftValidateContext,
): string | null {
  const compositionMode = resolveStageDraftCompositionMode(draft);
  const requiresIdentity =
    context?.isNewStage === true || compositionMode !== 'legacy';
  if (requiresIdentity) {
    const identityError = validateStageIdentityForSave(draft, context);
    if (identityError) return identityError;
  }

  for (let waveIndex = 0; waveIndex < (draft.waves ?? []).length; waveIndex += 1) {
    const prepResourceGrant = draft.waves![waveIndex]!.prepResourceGrant;
    if (
      prepResourceGrant !== undefined &&
      (!Number.isFinite(prepResourceGrant) ||
        !Number.isInteger(prepResourceGrant) ||
        prepResourceGrant < 0)
    ) {
      return `waves[${waveIndex}].prepResourceGrant は 0 以上の整数です（省略可）`;
    }
  }

  if (draft.enemyGroups !== undefined) {
    const levelError = validateRecommendedLevelForSave(draft.recommendedLevel);
    if (levelError) return levelError;
    const groupError = validateStageEnemyGroupsForSave(
      draft.enemyGroups,
      'enemyGroups',
    );
    if (groupError) return groupError;
    if (context?.classRegistry && context.combatModuleRegistry) {
      return firstAuthoringErrorMessage(
        collectStageEnemyAuthoringIssues(draft, {
          classRegistry: context.classRegistry,
          combatModuleRegistry: context.combatModuleRegistry,
        }),
      );
    }
    return null;
  }

  const wavesWithGroups = (draft.waves ?? [])
    .map((wave, waveIndex) => ({ wave, waveIndex }))
    .filter(({ wave }) => wave.enemyGroups !== undefined);
  if (wavesWithGroups.length === 0) {
    return null;
  }

  const levelError = validateRecommendedLevelForSave(draft.recommendedLevel);
  if (levelError) return levelError;

  for (const { wave, waveIndex } of wavesWithGroups) {
    const groupError = validateStageEnemyGroupsForSave(
      wave.enemyGroups ?? [],
      `waves[${waveIndex}].enemyGroups`,
    );
    if (groupError) return groupError;
  }

  if (context?.classRegistry && context.combatModuleRegistry) {
    return firstAuthoringErrorMessage(
      collectStageEnemyAuthoringIssues(draft, {
        classRegistry: context.classRegistry,
        combatModuleRegistry: context.combatModuleRegistry,
      }),
    );
  }

  return null;
}

export function buildPassiveIdSet(passives: PassiveSkillDef[]): Set<string> {
  return new Set(passives.map((passive) => passive.id));
}

export function createDefaultStageEnemyGroup(classId: string): StageEnemyGroup {
  return { classId, count: 1 };
}

/** legacy: stage 直下 enemyGroups 編集を開始する。 */
export function beginStageEnemyGroupsAuthoring(draft: StageDraft): void {
  draft.enemyGroups = [];
  for (const wave of draft.waves ?? []) {
    delete wave.enemyGroups;
  }
}

/** legacy: Wave ごと enemyGroups 編集を開始する。 */
export function beginWaveEnemyGroupsAuthoring(
  draft: StageDraft,
  options?: { defaultClassId?: string },
): void {
  ensureStageDraftWaves(draft);
  delete draft.enemyGroups;
  const wave = draft.waves![0]!;
  if (wave.enemyGroups === undefined) {
    wave.enemyGroups = [
      createDefaultStageEnemyGroup(options?.defaultClassId ?? 'df_paladin'),
    ];
  }
}

/** stage 直下 enemyGroups を wave 0 へ移し、Wave ごと編集モードへ移行する。 */
export function promoteStageDraftToWaveEnemyGroups(
  draft: StageDraft,
  options?: { defaultClassId?: string },
): void {
  if (draft.enemyGroups === undefined) return;

  ensureStageDraftWaves(draft);
  const stageGroups = draft.enemyGroups;
  delete draft.enemyGroups;
  const wave = draft.waves![0]!;
  wave.enemyGroups = structuredClone(stageGroups);
  if (wave.enemyGroups.length === 0) {
    wave.enemyGroups = [
      createDefaultStageEnemyGroup(options?.defaultClassId ?? 'df_paladin'),
    ];
  }
}

export function createDefaultStageWave(options?: {
  withEnemyGroups?: boolean;
  defaultClassId?: string;
}): StageWave {
  const wave: StageWave = { enemies: [] };
  if (options?.withEnemyGroups) {
    wave.enemyGroups = [
      createDefaultStageEnemyGroup(options.defaultClassId ?? 'df_paladin'),
    ];
  }
  return wave;
}

export function canRemoveStageDraftWave(draft: StageDraft): boolean {
  return (draft.waves ?? []).length > 1;
}

/** null = OK。エラー文字列 = 削除不可。 */
export function removeStageDraftWave(
  draft: StageDraft,
  waveIndex: number,
): string | null {
  const waves = draft.waves ?? [];
  if (waves.length <= 1) {
    return 'Wave は最低 1 件必要です';
  }
  if (waveIndex < 0 || waveIndex >= waves.length) {
    return 'Wave が見つかりません';
  }
  waves.splice(waveIndex, 1);
  return null;
}

export function addStageDraftWave(
  draft: StageDraft,
  options?: { defaultClassId?: string },
): void {
  if (draft.enemyGroups !== undefined) {
    promoteStageDraftToWaveEnemyGroups(draft, options);
  }

  const waves = ensureStageDraftWaves(draft);
  const inWaveAuthoring = waves.some((wave) => wave.enemyGroups !== undefined);
  waves.push(
    createDefaultStageWave({
      withEnemyGroups: inWaveAuthoring,
      defaultClassId: options?.defaultClassId,
    }),
  );
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
    res: raw.res,
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
  res: number;
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
    left.res !== right.res ||
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
    res: copy.res,
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

export function validateClassDraftForSave(
  draft: ClassDraft,
  options?: { combatModuleRegistry?: Record<string, CombatModuleDef> },
): void {
  assertMinNumber('maxHp', draft.class.maxHp, 1);
  assertMinNumber('atk', draft.class.atk, 0);
  assertMinNumber('def', draft.class.def, 0);
  assertConfigurableRangePx('射程 (px)', draft.class.traits.rangePx ?? 0);

  const classId = draft.class.id.trim();
  if (options?.combatModuleRegistry && classId) {
    const modulePoolError = validateClassCombatModulePoolDraft(
      classId,
      draft.class.combatModuleIds,
      options.combatModuleRegistry,
    );
    if (modulePoolError) {
      throw new Error(modulePoolError);
    }
  }
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
      traits: {},
      maxHp: 100,
      atk: 10,
      def: 10,
      res: 0,
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
  delete cls.formationRow;
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
      res: 0,
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
  };
}

export function defaultBasicAttackActiveSkill(id: string): ActiveSkillDef {
  return {
    id,
    name: id,
    attackMethod: 'melee',
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
      const normalized = {
        ...entry.active,
        effect: entry.active.effect.map((effect) =>
          stripDeprecatedThreatFieldsFromEffect(
            normalizeActiveSkillEffectForEditor(effect),
          ),
        ),
      };
      actives.push(
        isBasicAttackSkillIdPattern(normalized.id)
          ? sanitizeBasicAttackSkillForJson(normalized)
          : sanitizeActiveSkillForJson(normalized),
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
