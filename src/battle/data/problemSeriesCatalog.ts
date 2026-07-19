/**
 * メイン攻略の問題系列 catalog（固定 StageDef とは別責務）。
 * JSON 正本と runtime 型を同一形状に保ち、将来 Editor が二重化しない構造にする。
 */

import type {
  ClassId,
  ClassPreset,
  CombatModuleDef,
  ProblemSeriesCatalogDef,
  ProblemSeriesDef,
  ProblemSeriesEnemyGroup,
  ProblemSeriesWaveConnection,
  ProblemSeriesWaveDef,
  ProblemSeriesWaveLink,
  ProblemSeriesWaveRelationKind,
} from '../types.ts';
import { R5_PROTOTYPE_CLASS_IDS } from '../types.ts';

const WAVE_RELATION_KINDS = new Set<ProblemSeriesWaveRelationKind>([
  'continuation',
  'pivot',
  'composite',
  'opposition',
]);

const R5_CLASS_ID_SET = new Set<string>(R5_PROTOTYPE_CLASS_IDS);

function requireRecord(value: unknown, context: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${context} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requireNonEmptyString(
  obj: Record<string, unknown>,
  key: string,
  context: string,
): string {
  const value = obj[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${context}.${key} must be a non-empty string`);
  }
  return value.trim();
}

function requireInteger(
  obj: Record<string, unknown>,
  key: string,
  context: string,
  options: { min?: number } = {},
): number {
  const value = obj[key];
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
    throw new Error(`${context}.${key} must be an integer`);
  }
  if (options.min !== undefined && value < options.min) {
    throw new Error(`${context}.${key} must be >= ${options.min}`);
  }
  return value;
}

function parseOptionalPositiveScale(
  obj: Record<string, unknown>,
  key: string,
  context: string,
): number | undefined {
  const value = obj[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${context}.${key} must be a positive number`);
  }
  return value;
}

function parseNullableWaveIndex(
  value: unknown,
  context: string,
  field: string,
): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
    throw new Error(`${context}.${field} must be an integer or null`);
  }
  if (value < 0) {
    throw new Error(`${context}.${field} must be >= 0 or null`);
  }
  return value;
}

function parseRelationKind(
  value: unknown,
  context: string,
  allowNull: boolean,
): ProblemSeriesWaveRelationKind | null {
  if (value === null) {
    if (!allowNull) {
      throw new Error(`${context} must not be null`);
    }
    return null;
  }
  if (typeof value !== 'string' || !WAVE_RELATION_KINDS.has(value as ProblemSeriesWaveRelationKind)) {
    throw new Error(
      `${context} must be one of: continuation, pivot, composite, opposition`,
    );
  }
  return value as ProblemSeriesWaveRelationKind;
}

function parseStringArray(
  raw: unknown,
  context: string,
  options: { allowEmpty: boolean },
): string[] {
  if (!Array.isArray(raw)) {
    throw new Error(`${context} must be an array`);
  }
  if (!options.allowEmpty && raw.length === 0) {
    throw new Error(`${context} must be a non-empty array`);
  }
  const out: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < raw.length; i++) {
    const entry = raw[i];
    if (typeof entry !== 'string' || entry.trim().length === 0) {
      throw new Error(`${context}[${i}] must be a non-empty string`);
    }
    const trimmed = entry.trim();
    if (seen.has(trimmed)) {
      throw new Error(`${context} contains duplicate "${trimmed}"`);
    }
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function parseEnemyGroup(
  raw: unknown,
  context: string,
): ProblemSeriesEnemyGroup {
  const obj = requireRecord(raw, context);
  const classId = requireNonEmptyString(obj, 'classId', context) as ClassId;
  const count = requireInteger(obj, 'count', context, { min: 1 });
  const selectedCombatModuleId = requireNonEmptyString(
    obj,
    'selectedCombatModuleId',
    context,
  );
  const hpScale = parseOptionalPositiveScale(obj, 'hpScale', context);
  const atkScale = parseOptionalPositiveScale(obj, 'atkScale', context);
  const defScale = parseOptionalPositiveScale(obj, 'defScale', context);
  const resScale = parseOptionalPositiveScale(obj, 'resScale', context);
  return {
    classId,
    count,
    selectedCombatModuleId,
    ...(hpScale !== undefined && hpScale !== 1 ? { hpScale } : {}),
    ...(atkScale !== undefined && atkScale !== 1 ? { atkScale } : {}),
    ...(defScale !== undefined && defScale !== 1 ? { defScale } : {}),
    ...(resScale !== undefined && resScale !== 1 ? { resScale } : {}),
  };
}

function parseWaveConnection(
  raw: unknown,
  context: string,
): ProblemSeriesWaveConnection {
  const obj = requireRecord(raw, context);
  return {
    previousWaveIndex: parseNullableWaveIndex(
      obj.previousWaveIndex,
      context,
      'previousWaveIndex',
    ),
    nextWaveIndex: parseNullableWaveIndex(
      obj.nextWaveIndex,
      context,
      'nextWaveIndex',
    ),
    relationFromPrevious: parseRelationKind(
      obj.relationFromPrevious,
      `${context}.relationFromPrevious`,
      true,
    ),
  };
}

function parseWaveLink(raw: unknown, context: string): ProblemSeriesWaveLink {
  const obj = requireRecord(raw, context);
  const fromWaveIndex = requireInteger(obj, 'fromWaveIndex', context, { min: 0 });
  const toWaveIndex = requireInteger(obj, 'toWaveIndex', context, { min: 0 });
  const relationKind = parseRelationKind(
    obj.relationKind,
    `${context}.relationKind`,
    false,
  );
  if (relationKind === null) {
    throw new Error(`${context}.relationKind must not be null`);
  }
  return { fromWaveIndex, toWaveIndex, relationKind };
}

function parseWave(raw: unknown, context: string): ProblemSeriesWaveDef {
  const obj = requireRecord(raw, context);
  const internalProblemClass = requireNonEmptyString(
    obj,
    'internalProblemClass',
    context,
  );
  const expectedFailureModes = parseStringArray(obj.expectedFailureModes, `${context}.expectedFailureModes`, {
    allowEmpty: false,
  });
  const connection = parseWaveConnection(obj.connection, `${context}.connection`);
  const prepResourceGrant = requireInteger(obj, 'prepResourceGrant', context, {
    min: 0,
  });
  const enemyGroupsRaw = obj.enemyGroups;
  if (!Array.isArray(enemyGroupsRaw) || enemyGroupsRaw.length === 0) {
    throw new Error(`${context}.enemyGroups must be a non-empty array`);
  }
  const enemyGroups = enemyGroupsRaw.map((group, index) =>
    parseEnemyGroup(group, `${context}.enemyGroups[${index}]`),
  );
  return {
    internalProblemClass,
    expectedFailureModes,
    connection,
    prepResourceGrant,
    enemyGroups,
  };
}

function parseSeries(raw: unknown, context: string): ProblemSeriesDef {
  const obj = requireRecord(raw, context);
  const seriesId = requireNonEmptyString(obj, 'seriesId', context);
  const generatorVersion = requireNonEmptyString(obj, 'generatorVersion', context);
  const waveRelationSummary = requireNonEmptyString(
    obj,
    'waveRelationSummary',
    context,
  );
  const waveLinksRaw = obj.waveLinks;
  if (!Array.isArray(waveLinksRaw) || waveLinksRaw.length === 0) {
    throw new Error(`${context}.waveLinks must be a non-empty array`);
  }
  const waveLinks = waveLinksRaw.map((link, index) =>
    parseWaveLink(link, `${context}.waveLinks[${index}]`),
  );
  const finalWaveCompositeOfRaw = obj.finalWaveCompositeOf;
  if (!Array.isArray(finalWaveCompositeOfRaw) || finalWaveCompositeOfRaw.length === 0) {
    throw new Error(`${context}.finalWaveCompositeOf must be a non-empty array`);
  }
  const finalWaveCompositeOf: number[] = [];
  const seenComposite = new Set<number>();
  for (let i = 0; i < finalWaveCompositeOfRaw.length; i++) {
    const value = finalWaveCompositeOfRaw[i];
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
      throw new Error(
        `${context}.finalWaveCompositeOf[${i}] must be a non-negative integer`,
      );
    }
    if (seenComposite.has(value)) {
      throw new Error(
        `${context}.finalWaveCompositeOf contains duplicate index ${value}`,
      );
    }
    seenComposite.add(value);
    finalWaveCompositeOf.push(value);
  }
  const operationConditions = parseStringArray(
    obj.operationConditions,
    `${context}.operationConditions`,
    { allowEmpty: true },
  );
  const allowedClassIds = parseStringArray(
    obj.allowedClassIds,
    `${context}.allowedClassIds`,
    { allowEmpty: false },
  ) as ClassId[];
  const wavesRaw = obj.waves;
  if (!Array.isArray(wavesRaw)) {
    throw new Error(`${context}.waves must be an array`);
  }
  if (wavesRaw.length !== 3) {
    throw new Error(
      `${context}.waves must contain exactly 3 waves (got ${wavesRaw.length})`,
    );
  }
  const waves = wavesRaw.map((wave, index) =>
    parseWave(wave, `${context}.waves[${index}]`),
  );

  validateSeriesStructure(seriesId, waves, waveLinks, finalWaveCompositeOf, context);

  return {
    seriesId,
    generatorVersion,
    waveRelationSummary,
    waveLinks,
    finalWaveCompositeOf,
    operationConditions,
    allowedClassIds,
    waves,
  };
}

function validateSeriesStructure(
  seriesId: string,
  waves: ProblemSeriesWaveDef[],
  waveLinks: ProblemSeriesWaveLink[],
  finalWaveCompositeOf: number[],
  context: string,
): void {
  if (waves.length !== 3) {
    throw new Error(`${context}: series "${seriesId}" must have exactly 3 waves`);
  }

  for (let i = 0; i < waves.length; i++) {
    const wave = waves[i]!;
    const expectedPrevious = i === 0 ? null : i - 1;
    const expectedNext = i === waves.length - 1 ? null : i + 1;
    if (wave.connection.previousWaveIndex !== expectedPrevious) {
      throw new Error(
        `${context}.waves[${i}].connection.previousWaveIndex must be ${String(expectedPrevious)}`,
      );
    }
    if (wave.connection.nextWaveIndex !== expectedNext) {
      throw new Error(
        `${context}.waves[${i}].connection.nextWaveIndex must be ${String(expectedNext)}`,
      );
    }
    if (i === 0) {
      if (wave.connection.relationFromPrevious !== null) {
        throw new Error(
          `${context}.waves[0].connection.relationFromPrevious must be null`,
        );
      }
    } else if (wave.connection.relationFromPrevious === null) {
      throw new Error(
        `${context}.waves[${i}].connection.relationFromPrevious must not be null`,
      );
    }
    if (wave.enemyGroups.length === 0) {
      throw new Error(`${context}.waves[${i}].enemyGroups must be non-empty`);
    }
  }

  for (const index of finalWaveCompositeOf) {
    if (index < 0 || index >= waves.length - 1) {
      throw new Error(
        `${context}.finalWaveCompositeOf index ${index} is out of range for pre-final waves`,
      );
    }
  }
  const requiredComposite = [0, 1];
  for (const index of requiredComposite) {
    if (!finalWaveCompositeOf.includes(index)) {
      throw new Error(
        `${context}.finalWaveCompositeOf must include wave ${index} (final wave composites previous two)`,
      );
    }
  }

  for (let linkIndex = 0; linkIndex < waveLinks.length; linkIndex++) {
    const link = waveLinks[linkIndex]!;
    if (link.fromWaveIndex >= waves.length || link.toWaveIndex >= waves.length) {
      throw new Error(
        `${context}.waveLinks[${linkIndex}] wave index out of range`,
      );
    }
    if (link.fromWaveIndex === link.toWaveIndex) {
      throw new Error(
        `${context}.waveLinks[${linkIndex}] fromWaveIndex and toWaveIndex must differ`,
      );
    }
    if (link.fromWaveIndex > link.toWaveIndex) {
      throw new Error(
        `${context}.waveLinks[${linkIndex}] fromWaveIndex must be < toWaveIndex`,
      );
    }
  }

  const compositeToFinal = waveLinks.filter(
    (link) => link.toWaveIndex === 2 && link.relationKind === 'composite',
  );
  if (compositeToFinal.length === 0) {
    throw new Error(
      `${context}: final wave must have at least one composite waveLink`,
    );
  }
  for (const index of requiredComposite) {
    const hasLink = compositeToFinal.some((link) => link.fromWaveIndex === index);
    if (!hasLink) {
      throw new Error(
        `${context}: final wave must have composite relation from wave ${index}`,
      );
    }
  }
}

/**
 * production load では欠落・null を空 catalog へ fallback しない。
 */
export function parseProblemSeriesCatalog(raw: unknown): ProblemSeriesCatalogDef {
  if (raw === undefined || raw === null) {
    throw new Error(
      'problem-series-catalog.json is required (empty catalog fallback is not allowed)',
    );
  }
  const root = requireRecord(raw, 'problem-series-catalog.json');
  const generatorVersion = requireNonEmptyString(
    root,
    'generatorVersion',
    'problem-series-catalog.json',
  );
  const seriesRaw = root.series;
  if (!Array.isArray(seriesRaw)) {
    throw new Error('problem-series-catalog.json.series must be an array');
  }
  if (seriesRaw.length === 0) {
    throw new Error('problem-series-catalog.json.series must be non-empty');
  }

  const series: ProblemSeriesDef[] = [];
  const seenIds = new Set<string>();
  for (let i = 0; i < seriesRaw.length; i++) {
    const parsed = parseSeries(seriesRaw[i], `problem-series-catalog.json.series[${i}]`);
    if (seenIds.has(parsed.seriesId)) {
      throw new Error(
        `problem-series-catalog.json: duplicate seriesId "${parsed.seriesId}"`,
      );
    }
    seenIds.add(parsed.seriesId);
    if (parsed.generatorVersion !== generatorVersion) {
      throw new Error(
        `problem-series-catalog.json.series[${i}].generatorVersion "${parsed.generatorVersion}" must match catalog generatorVersion "${generatorVersion}"`,
      );
    }
    series.push(parsed);
  }

  return { generatorVersion, series };
}

export function validateProblemSeriesCatalogRefs(
  catalog: ProblemSeriesCatalogDef,
  classById: Map<string, ClassPreset>,
  moduleById: Map<string, CombatModuleDef>,
): void {
  if (catalog.series.length === 0) {
    throw new Error('problem series catalog must be non-empty');
  }

  for (const series of catalog.series) {
    const context = `problemSeries[${series.seriesId}]`;
    if (series.allowedClassIds.length === 0) {
      throw new Error(`${context}.allowedClassIds must be non-empty`);
    }
    for (const classId of series.allowedClassIds) {
      if (!R5_CLASS_ID_SET.has(classId)) {
        throw new Error(
          `${context}.allowedClassIds contains non-R5 class "${classId}"`,
        );
      }
      if (!classById.has(classId)) {
        throw new Error(`${context}: unknown allowed classId "${classId}"`);
      }
    }

    if (series.waves.length === 0) {
      throw new Error(`${context}.waves must be non-empty`);
    }
    for (let waveIndex = 0; waveIndex < series.waves.length; waveIndex++) {
      const wave = series.waves[waveIndex]!;
      if (wave.enemyGroups.length === 0) {
        throw new Error(`${context}.waves[${waveIndex}].enemyGroups must be non-empty`);
      }
      for (let groupIndex = 0; groupIndex < wave.enemyGroups.length; groupIndex++) {
        const group = wave.enemyGroups[groupIndex]!;
        const groupContext = `${context}.waves[${waveIndex}].enemyGroups[${groupIndex}]`;
        if (!R5_CLASS_ID_SET.has(group.classId)) {
          throw new Error(
            `${groupContext}: enemy classId "${group.classId}" is outside R5 prototype classes`,
          );
        }
        if (!series.allowedClassIds.includes(group.classId)) {
          throw new Error(
            `${groupContext}: classId "${group.classId}" is not in allowedClassIds`,
          );
        }
        const cls = classById.get(group.classId);
        if (!cls) {
          throw new Error(`${groupContext}: unknown classId "${group.classId}"`);
        }
        const selectedId = group.selectedCombatModuleId;
        const module = moduleById.get(selectedId);
        if (!module) {
          throw new Error(
            `${groupContext}: unknown selectedCombatModuleId "${selectedId}"`,
          );
        }
        if (module.classId !== group.classId) {
          throw new Error(
            `${groupContext}: selectedCombatModuleId "${selectedId}" belongs to class "${module.classId}", not "${group.classId}"`,
          );
        }
        const moduleIds = cls.combatModuleIds;
        if (!moduleIds?.includes(selectedId)) {
          throw new Error(
            `${groupContext}: selectedCombatModuleId "${selectedId}" is not listed in combatModuleIds for class "${group.classId}"`,
          );
        }
      }
    }
  }
}

function normalizeEnemyGroup(
  group: ProblemSeriesEnemyGroup,
): ProblemSeriesEnemyGroup {
  return {
    classId: group.classId,
    count: group.count,
    selectedCombatModuleId: group.selectedCombatModuleId,
    ...(group.hpScale !== undefined && group.hpScale !== 1
      ? { hpScale: group.hpScale }
      : {}),
    ...(group.atkScale !== undefined && group.atkScale !== 1
      ? { atkScale: group.atkScale }
      : {}),
    ...(group.defScale !== undefined && group.defScale !== 1
      ? { defScale: group.defScale }
      : {}),
    ...(group.resScale !== undefined && group.resScale !== 1
      ? { resScale: group.resScale }
      : {}),
  };
}

function normalizeWave(wave: ProblemSeriesWaveDef): ProblemSeriesWaveDef {
  return {
    internalProblemClass: wave.internalProblemClass,
    expectedFailureModes: [...wave.expectedFailureModes],
    connection: {
      previousWaveIndex: wave.connection.previousWaveIndex,
      nextWaveIndex: wave.connection.nextWaveIndex,
      relationFromPrevious: wave.connection.relationFromPrevious,
    },
    prepResourceGrant: wave.prepResourceGrant,
    // enemy group 順は作者定義の正本。並べ替えて Module 対応を壊さない
    enemyGroups: wave.enemyGroups.map(normalizeEnemyGroup),
  };
}

function normalizeSeries(series: ProblemSeriesDef): ProblemSeriesDef {
  return {
    seriesId: series.seriesId,
    generatorVersion: series.generatorVersion,
    waveRelationSummary: series.waveRelationSummary,
    waveLinks: series.waveLinks.map((link) => ({ ...link })),
    finalWaveCompositeOf: [...series.finalWaveCompositeOf].sort((a, b) => a - b),
    operationConditions: [...series.operationConditions],
    allowedClassIds: [...series.allowedClassIds].sort((a, b) =>
      a < b ? -1 : a > b ? 1 : 0,
    ),
    waves: series.waves.map(normalizeWave),
  };
}

/**
 * canonical 並び: seriesId 昇順。Wave / enemy group 順は無損失保持。
 * chain Module 等の target shape は解釈・変換しない。
 */
export function normalizeProblemSeriesCatalogForSave(
  catalog: ProblemSeriesCatalogDef,
): ProblemSeriesCatalogDef {
  const series = [...catalog.series]
    .map(normalizeSeries)
    .sort((a, b) =>
      a.seriesId < b.seriesId ? -1 : a.seriesId > b.seriesId ? 1 : 0,
    );
  return {
    generatorVersion: catalog.generatorVersion,
    series,
  };
}

export function serializeProblemSeriesCatalog(
  catalog: ProblemSeriesCatalogDef,
): string {
  return `${JSON.stringify(normalizeProblemSeriesCatalogForSave(catalog), null, 2)}\n`;
}
