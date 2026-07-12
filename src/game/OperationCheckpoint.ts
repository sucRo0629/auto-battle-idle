import { resolveSelectedCombatModuleId } from '../battle/data/resolveCombatModuleBasic.ts';
import { PartyCombatModuleSelection } from '../battle/partyCombatModuleSelection.ts';
import type { GameData, PartySlotState } from '../battle/types.ts';
import { PARTY_SLOT_COUNT } from '../battle/types.ts';
import {
  normalizePartySlots,
  validatePartyClassIds,
} from '../progression/partyCompose.ts';
import type { OperationState } from './OperationState.ts';

/** slot ごとの combat module 選択（deep snapshot 用） */
export interface OperationCheckpointModuleEntry {
  readonly slotIndex: number;
  readonly moduleId: string;
}

/**
 * R6f: Wave 戦闘開始直前の作戦設定 snapshot（Combatant / runtime 非含有）。
 * operationExtras は将来の作戦内パッシブ・未使用リソース拡張用。
 */
export interface OperationCheckpointSnapshot {
  readonly stageId: string;
  readonly currentWaveIndex: number;
  readonly clearedWaveCount: number;
  readonly party: readonly (PartySlotState | null)[];
  readonly combatModuleSelection: readonly OperationCheckpointModuleEntry[];
  readonly operationExtras: Readonly<Record<string, unknown>>;
}

export interface OperationCheckpointValidationOptions {
  expectedStageId?: string;
  waveCount: number;
}

function clonePartySlots(
  party: readonly (PartySlotState | null)[],
): PartySlotState[] {
  return normalizePartySlots(
    party.map((slot) => (slot ? structuredClone(slot) : null)),
  );
}

function cloneModuleEntries(
  entries: readonly OperationCheckpointModuleEntry[],
): OperationCheckpointModuleEntry[] {
  return entries.map((entry) => ({
    slotIndex: entry.slotIndex,
    moduleId: entry.moduleId,
  }));
}

function captureModuleEntries(
  selection: PartyCombatModuleSelection,
): OperationCheckpointModuleEntry[] {
  const entries: OperationCheckpointModuleEntry[] = [];
  for (let slotIndex = 0; slotIndex < PARTY_SLOT_COUNT; slotIndex += 1) {
    const moduleId = selection.getSelectedCombatModuleId(slotIndex);
    if (moduleId !== undefined) {
      entries.push({ slotIndex, moduleId });
    }
  }
  return entries;
}

function applyModuleEntriesToSelection(
  selection: PartyCombatModuleSelection,
  entries: readonly OperationCheckpointModuleEntry[],
): void {
  for (let slotIndex = 0; slotIndex < PARTY_SLOT_COUNT; slotIndex += 1) {
    selection.clearSelectedCombatModuleId(slotIndex);
  }
  for (const entry of entries) {
    if (entry.slotIndex < 0 || entry.slotIndex >= PARTY_SLOT_COUNT) continue;
    selection.setSelectedCombatModuleId(entry.slotIndex, entry.moduleId);
  }
}

/** OperationState から checkpoint 候補を生成（参照共有なし）。 */
export function createCheckpointFromOperationState(
  state: OperationState,
): OperationCheckpointSnapshot {
  return {
    stageId: state.stageId,
    currentWaveIndex: state.currentWaveIndex,
    clearedWaveCount: state.clearedWaveCount,
    party: clonePartySlots(state.getPartySnapshot()),
    combatModuleSelection: cloneModuleEntries(
      captureModuleEntries(state.getCombatModuleSelection()),
    ),
    operationExtras: {},
  };
}

/** 外部返却用 deep clone。 */
export function cloneCheckpointSnapshot(
  snapshot: OperationCheckpointSnapshot,
): OperationCheckpointSnapshot {
  return {
    stageId: snapshot.stageId,
    currentWaveIndex: snapshot.currentWaveIndex,
    clearedWaveCount: snapshot.clearedWaveCount,
    party: clonePartySlots(snapshot.party),
    combatModuleSelection: cloneModuleEntries(snapshot.combatModuleSelection),
    operationExtras: structuredClone(snapshot.operationExtras),
  };
}

function validateModuleEntries(
  party: readonly (PartySlotState | null)[],
  entries: readonly OperationCheckpointModuleEntry[],
  gameData: GameData,
): boolean {
  for (const entry of entries) {
    if (entry.slotIndex < 0 || entry.slotIndex >= PARTY_SLOT_COUNT) {
      return false;
    }
    const member = party[entry.slotIndex];
    if (!member) return false;
    const preset = gameData.classRegistry[member.classId];
    if (!preset) return false;
    const resolved = resolveSelectedCombatModuleId(
      preset,
      gameData.combatModuleRegistry,
      entry.moduleId,
    );
    if (resolved !== entry.moduleId) return false;
  }
  return true;
}

function isWaveProgressConsistent(
  currentWaveIndex: number,
  clearedWaveCount: number,
  waveCount: number,
): boolean {
  if (waveCount <= 0) return false;
  if (currentWaveIndex < 0 || currentWaveIndex >= waveCount) return false;
  if (clearedWaveCount < 0 || clearedWaveCount > waveCount) return false;
  if (clearedWaveCount > currentWaveIndex + 1) return false;
  return true;
}

/** checkpoint 候補の整合性検証。 */
export function validateCheckpointSnapshot(
  snapshot: OperationCheckpointSnapshot,
  gameData: GameData,
  options: OperationCheckpointValidationOptions,
): boolean {
  if (
    options.expectedStageId !== undefined &&
    snapshot.stageId !== options.expectedStageId
  ) {
    return false;
  }

  if (
    !isWaveProgressConsistent(
      snapshot.currentWaveIndex,
      snapshot.clearedWaveCount,
      options.waveCount,
    )
  ) {
    return false;
  }

  const party = normalizePartySlots([...snapshot.party]);
  if (party.length !== PARTY_SLOT_COUNT) return false;

  const partyValidation = validatePartyClassIds(party);
  if (!partyValidation.ok) return false;

  for (const member of party) {
    if (!member) continue;
    if (!gameData.classRegistry[member.classId]) return false;
  }

  if (!validateModuleEntries(party, snapshot.combatModuleSelection, gameData)) {
    return false;
  }

  return true;
}

export interface OperationCheckpointRestoreResult {
  ok: boolean;
}

/**
 * checkpoint から OperationState へ party / module / Wave 進行を復元し、
 * active / completed / defeated を再戦可能状態へ正規化する。
 * 不正 snapshot の場合は無変更で失敗。
 */
export function restoreOperationStateFromCheckpoint(
  state: OperationState,
  snapshot: OperationCheckpointSnapshot,
  gameData: GameData,
  waveCount: number,
): OperationCheckpointRestoreResult {
  if (snapshot.stageId !== state.stageId) {
    return { ok: false };
  }

  if (!validateCheckpointSnapshot(snapshot, gameData, { waveCount })) {
    return { ok: false };
  }

  const applied = state.tryRestoreFromCheckpoint(snapshot);
  if (!applied) {
    return { ok: false };
  }

  return { ok: true };
}

/** @internal OperationState 復元時に module map を反映する */
export function applyCheckpointModulesToSelection(
  selection: PartyCombatModuleSelection,
  entries: readonly OperationCheckpointModuleEntry[],
): void {
  applyModuleEntriesToSelection(selection, entries);
}
