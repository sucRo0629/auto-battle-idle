/**
 * R8c: 作戦内パッシブ取得候補（暫定定数。R9 で data 化）。
 * 対象は既存 self stat buff passive を 1 件ずつ。
 */
export const OPERATION_PASSIVE_ACQUIRE_COST = 1;

/** 中間 Wave クリア後、Wave 間準備初回突入時に付与する作戦内リソース。 */
export const WAVE_CLEAR_OPERATION_RESOURCE_GRANT = 1;

/** classId → 取得候補 passive ID（各兵科 1 件まで）。 */
export const OPERATION_PASSIVE_CANDIDATES_BY_CLASS: Readonly<
  Record<string, readonly string[]>
> = {
  df_guardian: ['df_guardian_passive_2', 'df_guardian_passive_5'],
};

export function getOperationPassiveCandidatesForClass(
  classId: string,
): readonly string[] {
  return OPERATION_PASSIVE_CANDIDATES_BY_CLASS[classId] ?? [];
}

export function isOperationPassiveCandidateForClass(
  classId: string,
  passiveId: string,
): boolean {
  return getOperationPassiveCandidatesForClass(classId).includes(passiveId);
}
