import { isUnitMovementBlocked } from '../ccEffects.ts';
import { syncFieldX } from '../combatPosition.ts';
import type {
  ActiveSkillDef,
  CombatantState,
  PassiveSkillDef,
  SkillCooldown,
  SkillEffectDef,
  SkillSlotKind,
} from '../types.ts';
import type { GameData } from '../types.ts';
import { resolveSkillTrigger } from '../skillTrigger.ts';
import { getEffectTarget, getTargetPool } from './targetSpec.ts';
import {
  pickTargetFromPool,
  resolveEffectTargetSpec,
} from './targeting.ts';
import {
  resolveSkillBodyAnimFields,
  resolveSkillBodyPlaybackSec,
} from '../../render/skillAnimPlayback.ts';

export interface ActiveSkillMove {
  actorId: string;
  fromX: number;
  toX: number;
  remainingSec: number;
  totalSec: number;
}

export interface SkillMoveTrace {
  unit: CombatantState;
  beforeX: number;
}

export interface PendingSkillStep {
  applyAtBattleSec: number;
  actorId: string;
  skillId: string;
  effectIndex: number;
  effectDef: SkillEffectDef;
  targetId: string;
  cd: SkillCooldown;
  slotKind: SkillSlotKind;
}

export interface ActiveSkillSequence {
  actorId: string;
  skillId: string;
  skillInterval: number;
  cd: SkillCooldown;
  steps: PendingSkillStep[];
  nextStepIndex: number;
  /** 最終 step 適用後の waitAfterSec 待機（完了まで isActorInSkillMotion を維持） */
  tailWaitUntilBattleSec?: number;
  /** 同一スキル内 effect 命中プール（poolFromEffectIndex 用） */
  effectHitPools: Map<number, CombatantState[]>;
}

export function buildSkillSequence(
  skill: ActiveSkillDef,
  actor: CombatantState,
  allies: CombatantState[],
  enemies: CombatantState[],
  _gameData: GameData,
  passives: PassiveSkillDef[],
  battleTimeSec: number,
  cd: SkillCooldown,
): ActiveSkillSequence | null {
  const steps: PendingSkillStep[] = [];
  let applyAt = battleTimeSec;

  for (let i = 0; i < skill.effect.length; i++) {
    const effectDef = skill.effect[i]!;
    const spec = resolveEffectTargetSpec(
      effectDef,
      actor,
      allies,
      enemies,
      passives,
    );
    let anchor: CombatantState | null;

    // If it's a move effect targeting nearest ally and the actor is the only ally, skip the step
    if (
      effectDef.type === 'move' &&
      getEffectTarget(effectDef).side === 'ally' &&
      getEffectTarget(effectDef).order === 'nearest' &&
      allies.length === 1 &&
      allies[0]!.id === actor.id
    ) {
      anchor = null; // Skip this step
    } else {
      anchor = resolveSequenceStepAnchor(
        effectDef,
        spec,
        actor,
        allies,
        enemies,
        _gameData,
      );
    }

    if (!anchor) continue;

    steps.push({
      applyAtBattleSec: applyAt,
      actorId: actor.id,
      skillId: skill.id,
      effectIndex: i,
      effectDef,
      targetId: anchor.id,
      cd,
      slotKind: cd.slotKind,
    });

    if (effectDef.type === 'move') {
      applyAt += effectDef.moveDurationSec;
    }
    const waitAfterSec = effectDef.waitAfterSec;
    if (waitAfterSec !== undefined && waitAfterSec > 0) {
      applyAt += waitAfterSec;
    }
  }

  if (steps.length === 0) return null;

  return {
    actorId: actor.id,
    skillId: skill.id,
    skillInterval: resolveSkillTrigger(skill).value,
    cd,
    steps,
    nextStepIndex: 0,
    effectHitPools: new Map(),
  };
}

export function skillHasMoveEffect(skill: ActiveSkillDef): boolean {
  return skill.effect.some((effect) => effect.type === 'move');
}

export function resolveUseDurationSec(skill: ActiveSkillDef): number {
  return skill.useDurationSec ?? 0;
}

/** move シーケンスの実時間（最終 step 発火 + tail wait / 最終 move） */
export function resolveSequenceWallClockSec(skill: ActiveSkillDef): number {
  if (!skillHasMoveEffect(skill)) return 0;
  let applyAt = 0;
  let lastStepFireAt = 0;
  let lastTailSec = 0;
  for (const effect of skill.effect) {
    lastStepFireAt = applyAt;
    if (effect.type === 'move') {
      applyAt += effect.moveDurationSec;
    }
    const waitAfterSec = effect.waitAfterSec;
    if (waitAfterSec !== undefined && waitAfterSec > 0) {
      lastTailSec = waitAfterSec;
      applyAt += waitAfterSec;
    } else if (effect.type === 'move') {
      lastTailSec = effect.moveDurationSec;
    } else {
      lastTailSec = 0;
    }
  }
  return lastStepFireAt + lastTailSec;
}

function resolveEffectDurationSec(effect: SkillEffectDef): number {
  const candidates: number[] = [];
  switch (effect.type) {
    case 'move':
      candidates.push(effect.moveDurationSec);
      break;
    case 'buff':
      if (effect.buffDurationSec !== undefined) {
        candidates.push(effect.buffDurationSec);
      }
      break;
    case 'basicAttackTransform':
      if (effect.buffDurationSec !== undefined) {
        candidates.push(effect.buffDurationSec);
      }
      break;
    case 'debuff':
      if (effect.debuffDurationSec !== undefined) {
        candidates.push(effect.debuffDurationSec);
      }
      if (effect.durationSec !== undefined) {
        candidates.push(effect.durationSec);
      }
      break;
    case 'heal':
      if (effect.durationSec !== undefined) {
        candidates.push(effect.durationSec);
      }
      break;
    case 'dot':
    case 'stun':
    case 'block':
    case 'counter':
      candidates.push(effect.durationSec);
      break;
    case 'damage':
      if (effect.pierceDurationSec !== undefined) {
        candidates.push(effect.pierceDurationSec);
      }
      if (effect.scatterDurationSec !== undefined) {
        candidates.push(effect.scatterDurationSec);
      }
      if (effect.hitDurationSec !== undefined) {
        candidates.push(effect.hitDurationSec);
      }
      break;
    default:
      break;
  }
  return candidates.length === 0 ? 0 : Math.max(...candidates);
}

const SELF_EFFECT_GAUGE_EXCLUDED_TYPES = new Set<SkillEffectDef['type']>([
  'debuff',
  'dot',
  'stun',
  'damage',
]);

function effectQualifiesForSelfEffectGauge(effect: SkillEffectDef): boolean {
  if (getEffectTarget(effect).kind !== 'self') return false;
  if (SELF_EFFECT_GAUGE_EXCLUDED_TYPES.has(effect.type)) return false;
  return resolveEffectDurationSec(effect) > 0;
}

/** 自身向けバフ系 effect の秒数最大 */
export function resolveMaxSelfBuffEffectDurationSec(
  skill: ActiveSkillDef,
): number {
  const durations = skill.effect
    .filter(effectQualifiesForSelfEffectGauge)
    .map(resolveEffectDurationSec);
  return durations.length === 0 ? 0 : Math.max(...durations);
}

/** 停止時間設定スキルの HUD 効果ゲージ秒数（表示専用。CD は停止しない） */
export function resolveActiveEffectGaugeDurationSec(
  skill: ActiveSkillDef,
): number {
  const stopSec = resolveUseDurationSec(skill);
  if (stopSec <= 0) return 0;
  const selfBuffSec = resolveMaxSelfBuffEffectDurationSec(skill);
  return selfBuffSec > 0 ? selfBuffSec : stopSec;
}

interface ActiveEffectGauge {
  remainingSec: number;
  totalSec: number;
}

/** move 含むシーケンスでは非 move も射程外 anchor を許可（適用時に再解決） */
export function resolveSequenceStepAnchor(
  effect: SkillEffectDef,
  spec: import('../types.ts').TargetSpec,
  actor: CombatantState,
  allies: CombatantState[],
  enemies: CombatantState[],
  _gameData: GameData,
): CombatantState | null {
  if (effect.type === 'move') {
    const pool = getTargetPool(spec, actor, allies, enemies);
    return pickTargetFromPool(spec, actor, pool, { moveAnchor: true });
  }
  const pool = getTargetPool(spec, actor, allies, enemies);
  return pickTargetFromPool(spec, actor, pool);
}

export class SkillSequenceRunner {
  private sequences: ActiveSkillSequence[] = [];
  private activeMoves: ActiveSkillMove[] = [];
  private useLockRemainingSec = new Map<string, number>();
  private presentationLockRemainingSec = new Map<string, number>();
  private animLockRemainingSec = new Map<string, number>();
  private activeEffectGauges = new Map<string, ActiveEffectGauge>();

  private activeEffectKey(actorId: string, slotIndex: number): string {
    return `${actorId}:${slotIndex}`;
  }

  getActiveMoves(): readonly ActiveSkillMove[] {
    return this.activeMoves;
  }

  /** move シーケンス実行中のみ（useDuration 硬直は含めない） */
  isActorInSkillMotion(actorId: string): boolean {
    return (
      this.sequences.some((seq) => seq.actorId === actorId) ||
      this.activeMoves.some((move) => move.actorId === actorId)
    );
  }

  isActorUseLocked(actorId: string): boolean {
    return (this.useLockRemainingSec.get(actorId) ?? 0) > 0;
  }

  isBasicAttackBlocked(actorId: string): boolean {
    return (
      this.isActorUseLocked(actorId) ||
      this.isActorInSkillMotion(actorId) ||
      (this.presentationLockRemainingSec.get(actorId) ?? 0) > 0 ||
      this.isActorAnimLocked(actorId)
    );
  }

  isActorBusy(actorId: string): boolean {
    return (
      this.isActorUseLocked(actorId) ||
      this.isActorInSkillMotion(actorId) ||
      this.isActorAnimLocked(actorId)
    );
  }

  isActorAnimLocked(actorId: string): boolean {
    return (this.animLockRemainingSec.get(actorId) ?? 0) > 0;
  }

  getActiveEffectRemaining(actorId: string, slotIndex: number): number {
    return (
      this.activeEffectGauges.get(this.activeEffectKey(actorId, slotIndex))
        ?.remainingSec ?? 0
    );
  }

  getActiveEffectGauge(
    actorId: string,
    slotIndex: number,
  ): ActiveEffectGauge | undefined {
    const gauge = this.activeEffectGauges.get(
      this.activeEffectKey(actorId, slotIndex),
    );
    if (!gauge || gauge.remainingSec <= 0) return undefined;
    return gauge;
  }

  beginActiveEffectGauge(
    actorId: string,
    slotIndex: number,
    totalSec: number,
  ): void {
    if (totalSec <= 0) return;
    const key = this.activeEffectKey(actorId, slotIndex);
    const current = this.activeEffectGauges.get(key);
    if (!current) {
      this.activeEffectGauges.set(key, {
        remainingSec: totalSec,
        totalSec,
      });
      return;
    }
    const remainingSec = Math.max(current.remainingSec, totalSec);
    const nextTotal = Math.max(current.totalSec, totalSec);
    this.activeEffectGauges.set(key, {
      remainingSec,
      totalSec: nextTotal,
    });
  }

  beginUse(actorId: string, durationSec: number): void {
    if (durationSec <= 0) return;
    const current = this.useLockRemainingSec.get(actorId) ?? 0;
    this.useLockRemainingSec.set(actorId, Math.max(current, durationSec));
  }

  beginPresentationLock(actorId: string, durationSec: number): void {
    if (durationSec <= 0) return;
    const current = this.presentationLockRemainingSec.get(actorId) ?? 0;
    this.presentationLockRemainingSec.set(
      actorId,
      Math.max(current, durationSec),
    );
  }

  beginAnimLock(actorId: string, durationSec: number): void {
    if (durationSec <= 0) return;
    const current = this.animLockRemainingSec.get(actorId) ?? 0;
    this.animLockRemainingSec.set(actorId, Math.max(current, durationSec));
  }

  schedule(sequence: ActiveSkillSequence): void {
    this.sequences.push(sequence);
  }

  startMove(move: ActiveSkillMove): void {
    this.activeMoves.push(move);
  }

  clearAll(): void {
    this.sequences = [];
    this.activeMoves = [];
    this.useLockRemainingSec.clear();
    this.presentationLockRemainingSec.clear();
    this.animLockRemainingSec.clear();
    this.activeEffectGauges.clear();
  }

  clearForActor(actorId: string): void {
    this.sequences = this.sequences.filter((seq) => seq.actorId !== actorId);
    this.activeMoves = this.activeMoves.filter(
      (move) => move.actorId !== actorId,
    );
    this.useLockRemainingSec.delete(actorId);
    this.presentationLockRemainingSec.delete(actorId);
    this.animLockRemainingSec.delete(actorId);
    const prefix = `${actorId}:`;
    for (const key of [...this.activeEffectGauges.keys()]) {
      if (key.startsWith(prefix)) {
        this.activeEffectGauges.delete(key);
      }
    }
  }

  tickActiveEffectGauges(deltaTime: number): void {
    for (const [key, gauge] of this.activeEffectGauges) {
      const next = gauge.remainingSec - deltaTime;
      if (next <= 0) {
        this.activeEffectGauges.delete(key);
      } else {
        this.activeEffectGauges.set(key, { ...gauge, remainingSec: next });
      }
    }
  }

  tickUseLocks(deltaTime: number): void {
    for (const [actorId, remaining] of this.useLockRemainingSec) {
      const next = remaining - deltaTime;
      if (next <= 0) {
        this.useLockRemainingSec.delete(actorId);
      } else {
        this.useLockRemainingSec.set(actorId, next);
      }
    }
    for (const [actorId, remaining] of this.presentationLockRemainingSec) {
      const next = remaining - deltaTime;
      if (next <= 0) {
        this.presentationLockRemainingSec.delete(actorId);
      } else {
        this.presentationLockRemainingSec.set(actorId, next);
      }
    }
  }

  tickAnimLocks(deltaTime: number): void {
    for (const [actorId, remaining] of this.animLockRemainingSec) {
      const next = remaining - deltaTime;
      if (next <= 0) {
        this.animLockRemainingSec.delete(actorId);
      } else {
        this.animLockRemainingSec.set(actorId, next);
      }
    }
  }

  tickMoves(
    deltaTime: number,
    units: CombatantState[],
    onBattleXChanged?: (trace: SkillMoveTrace) => void,
  ): void {
    const kept: ActiveSkillMove[] = [];
    for (const move of this.activeMoves) {
      const unit = units.find((u) => u.id === move.actorId);
      if (!unit?.isAlive) continue;
      if (isUnitMovementBlocked(unit)) {
        kept.push(move);
        continue;
      }

      const beforeX = unit.battleX;
      move.remainingSec = Math.max(0, move.remainingSec - deltaTime);
      const progress =
        move.totalSec <= 0
          ? 1
          : 1 - move.remainingSec / move.totalSec;
      unit.battleX = move.fromX + (move.toX - move.fromX) * progress;
      syncFieldX(unit);

      if (move.remainingSec > 0) {
        kept.push(move);
      } else {
        unit.battleX = move.toX;
        syncFieldX(unit);
      }
      onBattleXChanged?.({ unit, beforeX });
    }
    this.activeMoves = kept;
  }

  tickSequences(
    battleTimeSec: number,
    applyStep: (step: PendingSkillStep, sequence: ActiveSkillSequence) => void,
    onSequenceComplete?: (actorId: string) => void,
  ): void {
    const kept: ActiveSkillSequence[] = [];

    for (const sequence of this.sequences) {
      if (sequence.tailWaitUntilBattleSec !== undefined) {
        if (battleTimeSec < sequence.tailWaitUntilBattleSec) {
          kept.push(sequence);
          continue;
        }
        sequence.cd.remaining = sequence.skillInterval;
        onSequenceComplete?.(sequence.actorId);
        continue;
      }

      while (sequence.nextStepIndex < sequence.steps.length) {
        const step = sequence.steps[sequence.nextStepIndex]!;
        if (step.applyAtBattleSec > battleTimeSec) break;

        applyStep(step, sequence);
        sequence.nextStepIndex += 1;

        if (sequence.nextStepIndex >= sequence.steps.length) {
          const waitAfterSec = step.effectDef.waitAfterSec;
          if (waitAfterSec !== undefined && waitAfterSec > 0) {
            sequence.tailWaitUntilBattleSec = battleTimeSec + waitAfterSec;
          } else {
            sequence.cd.remaining = sequence.skillInterval;
            onSequenceComplete?.(sequence.actorId);
          }
          break;
        }
      }

      if (
        sequence.nextStepIndex < sequence.steps.length ||
        sequence.tailWaitUntilBattleSec !== undefined
      ) {
        kept.push(sequence);
      }
    }

    this.sequences = kept;
  }

  beginSkillAnimLockIfNeeded(
    actorId: string,
    skill: ActiveSkillDef,
    effectIndex: number,
  ): void {
    const bodyPlaybackSec = resolveSkillBodyPlaybackSec(
      skill.id,
      effectIndex,
      resolveSkillBodyAnimFields(skill, effectIndex),
    );
    this.beginAnimLock(actorId, bodyPlaybackSec);
  }
}
