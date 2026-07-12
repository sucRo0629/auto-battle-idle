export type OperationOutcome = 'victory' | 'defeat';

/** R6h: 作戦完了時に確定する最小結果（メモリのみ・Save 非統合）。 */
export interface OperationResult {
  readonly stageId: string;
  readonly outcome: OperationOutcome;
  /** 作戦終了時点で到達していた Wave index（0 始まり）。 */
  readonly reachedWaveIndex: number;
}

export interface FinalizeOperationResultParams {
  stageId: string;
  outcome: OperationOutcome;
  reachedWaveIndex: number;
}

export function cloneOperationResult(result: OperationResult): OperationResult {
  return {
    stageId: result.stageId,
    outcome: result.outcome,
    reachedWaveIndex: result.reachedWaveIndex,
  };
}
