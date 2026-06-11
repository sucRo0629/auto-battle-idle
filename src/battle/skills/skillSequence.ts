import { isUnitStunned } from '../ccEffects.ts';
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
import { getTargetPool } from './targetSpec.ts';
import {
  pickTargetFromPool,
  resolveEffectTargetSpec,
} from './targeting.ts';

export interface ActiveSkillMove {
  actorId: string;
  fromX: number;
  toX: number;
  /** move 完了時の visualX（standoff 基準） */
  toVisualX: number;
  remainingSec: number;
  totalSec: number;
  /** move 開始時の formation 基準 visualX（演出オーバーレイ用） */
  baseVisualX: number;
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
    const anchor = resolveSequenceStepAnchor(
      effectDef,
      spec,
      actor,
      allies,
      enemies,
      _gameData,
    );
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
  };
}

export function skillHasMoveEffect(skill: ActiveSkillDef): boolean {
  return skill.effect.some((effect) => effect.type === 'move');
}

export function resolveUseDurationSec(skill: ActiveSkillDef): number {
  return skill.useDurationSec ?? 0;
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
    return pickTargetFromPool(spec, actor, pool);
  }
  const pool = getTargetPool(spec, actor, allies, enemies);
  return pickTargetFromPool(spec, actor, pool);
}

export class SkillSequenceRunner {
  private sequences: ActiveSkillSequence[] = [];
  private activeMoves: ActiveSkillMove[] = [];
  private useLockRemainingSec = new Map<string, number>();

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

  isActorBusy(actorId: string): boolean {
    return (
      (this.useLockRemainingSec.get(actorId) ?? 0) > 0 ||
      this.isActorInSkillMotion(actorId)
    );
  }

  beginUse(actorId: string, durationSec: number): void {
    if (durationSec <= 0) return;
    const current = this.useLockRemainingSec.get(actorId) ?? 0;
    this.useLockRemainingSec.set(actorId, Math.max(current, durationSec));
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
  }

  clearForActor(actorId: string): void {
    this.sequences = this.sequences.filter((seq) => seq.actorId !== actorId);
    this.activeMoves = this.activeMoves.filter(
      (move) => move.actorId !== actorId,
    );
    this.useLockRemainingSec.delete(actorId);
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
  }

  tickMoves(
    deltaTime: number,
    units: CombatantState[],
  ): void {
    const kept: ActiveSkillMove[] = [];
    for (const move of this.activeMoves) {
      const unit = units.find((u) => u.id === move.actorId);
      if (!unit?.isAlive) continue;
      if (isUnitStunned(unit)) {
        kept.push(move);
        continue;
      }

      move.remainingSec = Math.max(0, move.remainingSec - deltaTime);
      const progress =
        move.totalSec <= 0
          ? 1
          : 1 - move.remainingSec / move.totalSec;
      unit.battleX = move.fromX + (move.toX - move.fromX) * progress;

      if (move.remainingSec > 0) {
        kept.push(move);
      } else {
        unit.battleX = move.toX;
      }
    }
    this.activeMoves = kept;
  }

  tickSequences(
    battleTimeSec: number,
    applyStep: (step: PendingSkillStep) => void,
  ): void {
    const kept: ActiveSkillSequence[] = [];

    for (const sequence of this.sequences) {
      while (sequence.nextStepIndex < sequence.steps.length) {
        const step = sequence.steps[sequence.nextStepIndex]!;
        if (step.applyAtBattleSec > battleTimeSec) break;

        applyStep(step);
        sequence.nextStepIndex += 1;
      }

      if (sequence.nextStepIndex >= sequence.steps.length) {
        sequence.cd.remaining = sequence.skillInterval;
      } else {
        kept.push(sequence);
      }
    }

    this.sequences = kept;
  }
}
