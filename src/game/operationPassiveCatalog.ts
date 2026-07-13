import operationPassiveCatalogJson from '../../data/operation-passive-catalog.json';
import type { OperationPassiveCatalogDef } from '../battle/types.ts';
import {
  getOperationPassiveCandidatesForClass,
  isOperationPassiveCandidateForClass,
} from './operationPassiveCatalogCore.ts';

export type { OperationPassiveCatalogDef } from '../battle/types.ts';
export {
  getOperationPassiveCandidatesForClass,
  isOperationPassiveCandidateForClass,
} from './operationPassiveCatalogCore.ts';

/** @deprecated GameData.operationPassiveCatalog を正本にする。テスト互換の既定値。 */
export const OPERATION_PASSIVE_ACQUIRE_COST =
  (operationPassiveCatalogJson as OperationPassiveCatalogDef).passiveAcquireCost;

/** @deprecated GameData.operationPassiveCatalog を正本にする。テスト互換の既定値。 */
export const WAVE_CLEAR_OPERATION_RESOURCE_GRANT =
  (operationPassiveCatalogJson as OperationPassiveCatalogDef).waveClearResourceGrant;

/** @deprecated GameData.operationPassiveCatalog を正本にする。テスト互換の既定値。 */
export const OPERATION_PASSIVE_CANDIDATES_BY_CLASS: Readonly<
  Record<string, readonly string[]>
> = (operationPassiveCatalogJson as OperationPassiveCatalogDef).candidatesByClass;

const defaultCatalog =
  operationPassiveCatalogJson as OperationPassiveCatalogDef;

/** テスト互換: 既定 catalog で候補を解決する。 */
export function getDefaultOperationPassiveCandidatesForClass(
  classId: string,
): readonly string[] {
  return getOperationPassiveCandidatesForClass(defaultCatalog, classId);
}

/** テスト互換: 既定 catalog で候補一致を検証する。 */
export function isDefaultOperationPassiveCandidateForClass(
  classId: string,
  passiveId: string,
): boolean {
  return isOperationPassiveCandidateForClass(
    defaultCatalog,
    classId,
    passiveId,
  );
}
