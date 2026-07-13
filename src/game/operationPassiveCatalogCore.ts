import type { OperationPassiveCatalogDef } from '../battle/types.ts';

export function getOperationPassiveCandidatesForClass(
  catalog: OperationPassiveCatalogDef,
  classId: string,
): readonly string[] {
  return catalog.candidatesByClass[classId] ?? [];
}

export function isOperationPassiveCandidateForClass(
  catalog: OperationPassiveCatalogDef,
  classId: string,
  passiveId: string,
): boolean {
  return getOperationPassiveCandidatesForClass(catalog, classId).includes(
    passiveId,
  );
}
