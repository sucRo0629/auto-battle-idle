export type OperationSource =
  | {
      readonly kind: 'fixedStage';
      readonly stageId: string;
    }
  | {
      readonly kind: 'problemSeries';
    };

const FIXED_STAGE_SOURCE_KEYS = new Set(['kind', 'stageId']);
const PROBLEM_SERIES_SOURCE_KEYS = new Set(['kind']);

function hasOnlyKeys(value: Record<string, unknown>, allowed: Set<string>): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

/** source の deep copy（参照共有なし）。 */
export function cloneOperationSource(source: OperationSource): OperationSource {
  if (source.kind === 'fixedStage') {
    return { kind: 'fixedStage', stageId: source.stageId };
  }
  return { kind: 'problemSeries' };
}

/** runtime validation / type guard。 */
export function isOperationSource(value: unknown): value is OperationSource {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  if (obj.kind === 'fixedStage') {
    return (
      typeof obj.stageId === 'string' &&
      hasOnlyKeys(obj, FIXED_STAGE_SOURCE_KEYS)
    );
  }
  if (obj.kind === 'problemSeries') {
    return hasOnlyKeys(obj, PROBLEM_SERIES_SOURCE_KEYS);
  }
  return false;
}

/** source 同士の一致判定。kind 不一致は不一致。 */
export function operationSourcesEqual(
  a: OperationSource,
  b: OperationSource,
): boolean {
  if (a.kind !== b.kind) {
    return false;
  }
  if (a.kind === 'fixedStage') {
    return b.kind === 'fixedStage' && a.stageId === b.stageId;
  }
  return true;
}

/** fixedStage 時のみ stageId を返す。problemSeries は null。 */
export function tryGetFixedStageIdFromSource(
  source: OperationSource,
): string | null {
  return source.kind === 'fixedStage' ? source.stageId : null;
}
