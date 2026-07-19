import {
  isValidSelectedCombatModuleId,
  resolveSelectedCombatModuleId,
} from '../battle/data/resolveCombatModuleBasic.ts';
import type {
  ClassId,
  ClassPreset,
  CombatModuleDef,
  OperationPassiveCatalogDef,
  StageEnemyGroup,
} from '../battle/types.ts';
import { R5_COMBAT_MODULE_CLASS_IDS } from '../battle/types.ts';

/** soft warning vs save-blocking error */
export type AuthoringIssueKind = 'error' | 'warning';

export type AuthoringIssueCode =
  | 'unknown_class'
  | 'unknown_module'
  | 'invalid_module_for_class'
  | 'legacy_module_forbidden'
  | 'module_unset'
  | 'unknown_catalog_class'
  | 'unknown_passive'
  | 'duplicate_passive'
  | 'empty_passive_candidates'
  | 'duplicate_class_in_groups';

export interface AuthoringIssue {
  kind: AuthoringIssueKind;
  code: AuthoringIssueCode;
  message: string;
  path: string;
}

export interface AuthoringCombatModuleContext {
  classRegistry: Record<ClassId, ClassPreset>;
  combatModuleRegistry: Record<string, CombatModuleDef>;
}

export interface AuthoringPassiveCatalogContext extends AuthoringCombatModuleContext {
  passiveIds: Set<string>;
}

/** runtime `resolveSelectedCombatModuleId` と同じ解決結果を editor preview に載せる */
export interface StageEnemyGroupModulePreview {
  classId: string;
  count: number;
  selectedCombatModuleId?: string;
  /** runtime が使う module id（未指定時は combatModuleIds[0]） */
  resolvedModuleId: string | null;
  resolvedDisplayName: string | null;
  /** 明示 selected がなく、既定 module を使う */
  usesDefaultModule: boolean;
  hasModulePool: boolean;
}

export function resolveStageEnemyGroupModulePreview(
  group: StageEnemyGroup,
  context: AuthoringCombatModuleContext,
): StageEnemyGroupModulePreview {
  const preset = context.classRegistry[group.classId];
  const hasModulePool = Boolean(preset?.combatModuleIds?.length);
  const explicit = group.selectedCombatModuleId?.trim() || undefined;

  if (!preset || !hasModulePool) {
    return {
      classId: group.classId,
      count: group.count,
      selectedCombatModuleId: explicit,
      resolvedModuleId: null,
      resolvedDisplayName: null,
      usesDefaultModule: false,
      hasModulePool: false,
    };
  }

  const resolvedModuleId =
    resolveSelectedCombatModuleId(
      preset,
      context.combatModuleRegistry,
      explicit,
    ) ?? null;
  const module = resolvedModuleId
    ? context.combatModuleRegistry[resolvedModuleId]
    : undefined;

  return {
    classId: group.classId,
    count: group.count,
    selectedCombatModuleId: explicit,
    resolvedModuleId,
    resolvedDisplayName: module?.displayName ?? resolvedModuleId,
    usesDefaultModule: !explicit,
    hasModulePool: true,
  };
}

export function formatStageEnemyGroupModulePreviewLabel(
  preview: StageEnemyGroupModulePreview,
): string {
  if (!preview.hasModulePool) return '';
  if (!preview.resolvedDisplayName) return ' [CombatModule: —]';
  const suffix = preview.usesDefaultModule ? '・既定' : '';
  return ` [${preview.resolvedDisplayName}${suffix}]`;
}

function collectEnemyGroupRefIssues(
  group: StageEnemyGroup,
  path: string,
  context: AuthoringCombatModuleContext,
  classIdsSeen: Set<string>,
): AuthoringIssue[] {
  const issues: AuthoringIssue[] = [];
  const classId = group.classId.trim();
  if (!classId) {
    return issues;
  }

  const preset = context.classRegistry[classId];
  if (!preset) {
    issues.push({
      kind: 'error',
      code: 'unknown_class',
      path,
      message: `${path}: 未知の classId "${classId}"`,
    });
    return issues;
  }

  if (classIdsSeen.has(classId)) {
    issues.push({
      kind: 'warning',
      code: 'duplicate_class_in_groups',
      path,
      message: `${path}: classId "${classId}" が同一編成内で重複しています（敵は許容。意図確認）`,
    });
  } else {
    classIdsSeen.add(classId);
  }

  const selected = group.selectedCombatModuleId?.trim();
  const moduleIds = preset.combatModuleIds;

  if (selected) {
    if (!moduleIds) {
      issues.push({
        kind: 'error',
        code: 'legacy_module_forbidden',
        path,
        message: `${path}: legacy 兵科 "${classId}" に selectedCombatModuleId は指定できません`,
      });
    } else if (!context.combatModuleRegistry[selected]) {
      issues.push({
        kind: 'error',
        code: 'unknown_module',
        path,
        message: `${path}: 未知の selectedCombatModuleId "${selected}"`,
      });
    } else if (
      !isValidSelectedCombatModuleId(
        preset,
        context.combatModuleRegistry,
        selected,
      )
    ) {
      issues.push({
        kind: 'error',
        code: 'invalid_module_for_class',
        path,
        message: `${path}: selectedCombatModuleId "${selected}" は class "${classId}" の方式 pool にありません`,
      });
    }
  } else if (moduleIds) {
    issues.push({
      kind: 'warning',
      code: 'module_unset',
      path,
      message: `${path}: CombatModule 未設定 — runtime は "${moduleIds[0]}" を使用`,
    });
  }

  return issues;
}

function collectGroupsRefIssues(
  groups: StageEnemyGroup[],
  prefix: string,
  context: AuthoringCombatModuleContext,
): AuthoringIssue[] {
  const issues: AuthoringIssue[] = [];
  const classIdsSeen = new Set<string>();
  for (let index = 0; index < groups.length; index += 1) {
    const group = groups[index]!;
    issues.push(
      ...collectEnemyGroupRefIssues(
        group,
        `${prefix}[${index}]`,
        context,
        classIdsSeen,
      ),
    );
  }
  return issues;
}

/**
 * Stage draft の参照整合（不正 ID・重複・未設定）を error / warning として列挙。
 * runtime module 解決と同一ヘルパーを使う。
 */
export function collectStageEnemyAuthoringIssues(
  draft: {
    id?: string;
    displayName?: string;
    recommendedLevel?: number;
    enemyGroups?: StageEnemyGroup[];
    waves?: Array<{ enemyGroups?: StageEnemyGroup[]; enemies?: unknown[] }>;
  },
  context: AuthoringCombatModuleContext,
): AuthoringIssue[] {
  if (draft.enemyGroups !== undefined) {
    return collectGroupsRefIssues(draft.enemyGroups, 'enemyGroups', context);
  }

  const issues: AuthoringIssue[] = [];
  for (let waveIndex = 0; waveIndex < (draft.waves ?? []).length; waveIndex += 1) {
    const wave = draft.waves![waveIndex]!;
    if (wave.enemyGroups === undefined) continue;
    issues.push(
      ...collectGroupsRefIssues(
        wave.enemyGroups,
        `waves[${waveIndex}].enemyGroups`,
        context,
      ),
    );
  }
  return issues;
}

/**
 * 作戦内パッシブ catalog の参照整合・重複・未設定警告。
 */
export function collectOperationPassiveCatalogAuthoringIssues(
  catalog: OperationPassiveCatalogDef,
  context: AuthoringPassiveCatalogContext,
): AuthoringIssue[] {
  const issues: AuthoringIssue[] = [];

  for (const [classId, passiveIdList] of Object.entries(
    catalog.candidatesByClass,
  ) as Array<[string, string[]]>) {
    const path = `candidatesByClass["${classId}"]`;
    if (!context.classRegistry[classId]) {
      issues.push({
        kind: 'error',
        code: 'unknown_catalog_class',
        path,
        message: `${path}: 未知の classId "${classId}"`,
      });
      continue;
    }

    const seen = new Set<string>();
    for (const passiveId of passiveIdList) {
      if (seen.has(passiveId)) {
        issues.push({
          kind: 'error',
          code: 'duplicate_passive',
          path,
          message: `${path}: passiveId "${passiveId}" が重複しています`,
        });
        continue;
      }
      seen.add(passiveId);
      if (!context.passiveIds.has(passiveId)) {
        issues.push({
          kind: 'error',
          code: 'unknown_passive',
          path,
          message: `${path}: 未知の passiveId "${passiveId}"`,
        });
      }
      const fixedCost = catalog.fixedCostByPassiveId?.[passiveId];
      if (fixedCost !== undefined) {
        if (!Number.isInteger(fixedCost) || fixedCost < 1) {
          issues.push({
            kind: 'error',
            code: 'invalid_fixed_cost',
            path: `fixedCostByPassiveId["${passiveId}"]`,
            message: `fixedCostByPassiveId["${passiveId}"]: 1 以上の整数を設定してください`,
          });
        }
        continue;
      }
      const unlockLevel = catalog.costUnlockLevelByPassiveId?.[passiveId];
      if (
        typeof unlockLevel !== 'number' ||
        !Number.isInteger(unlockLevel) ||
        unlockLevel < 0
      ) {
        issues.push({
          kind: 'error',
          code: 'missing_passive_cost',
          path: `fixedCostByPassiveId["${passiveId}"]`,
          message: `fixedCostByPassiveId["${passiveId}"] または costUnlockLevelByPassiveId["${passiveId}"] にコストを設定してください`,
        });
      } else if (
        catalog.unlockLevelCostTable &&
        catalog.unlockLevelCostTable[String(unlockLevel)] === undefined
      ) {
        issues.push({
          kind: 'error',
          code: 'unknown_cost_band',
          path: `unlockLevelCostTable["${unlockLevel}"]`,
          message: `unlockLevelCostTable["${unlockLevel}"]: ${passiveId} のコスト帯が表にありません`,
        });
      }
    }
  }

  for (const classId of R5_COMBAT_MODULE_CLASS_IDS) {
    const list = catalog.candidatesByClass[classId] ?? [];
    if (list.length === 0) {
      issues.push({
        kind: 'warning',
        code: 'empty_passive_candidates',
        path: `candidatesByClass["${classId}"]`,
        message: `candidatesByClass["${classId}"]: 取得候補が未設定です（Wave 間準備に候補が出ません）`,
      });
    }
  }

  return issues;
}

export function firstAuthoringErrorMessage(
  issues: AuthoringIssue[],
): string | null {
  return issues.find((issue) => issue.kind === 'error')?.message ?? null;
}

export function formatAuthoringIssuesForDisplay(
  issues: AuthoringIssue[],
): string[] {
  return issues.map((issue) => {
    const prefix = issue.kind === 'error' ? 'エラー' : '注意';
    return `${prefix}: ${issue.message}`;
  });
}
