import type {
  ClassId,
  ClassPreset,
  CombatantState,
  PartySlotState,
  Role,
} from './types.ts';
import { PARTY_SLOT_COUNT } from './types.ts';

export type DamageSourceKind =
  | 'basic'
  | 'active_direct'
  | 'dot'
  | 'other'
  | 'unknown';

/** Meta passed from BattleEngine / SkillExecutor into damage recording. */
export interface DamageAppliedMeta {
  attackKind?: 'damage' | 'dot';
  slotKind?: 'basic' | 'active';
  skillId?: string;
  statusId?: string;
  isCounterDamage?: boolean;
}

export function resolveDamageSourceKind(
  meta?: DamageAppliedMeta,
): DamageSourceKind {
  if (!meta?.attackKind) return 'unknown';
  if (meta.isCounterDamage) return 'other';
  if (meta.attackKind === 'dot') return 'dot';
  if (meta.slotKind === 'basic') return 'basic';
  if (meta.slotKind === 'active') return 'active_direct';
  if (meta.attackKind === 'damage') return 'other';
  return 'unknown';
}

export interface SlotDamageStats {
  classId: ClassId;
  damageDealt: number;
  damageTaken: number;
  healingDealt: number;
  /** Basic attack executions (not per-hit). */
  attackCount: number;
  /** Damage instances dealt to enemies. */
  hitCount: number;
  /** Active skill executions. */
  skillUseCount: number;
  /** Skill damage events that carried a multi-hit / MultiLock hitIndex. */
  indexedDamageHits: number;
  /** Enemy classId → total damage dealt to that class. */
  damageByTarget: Partial<Record<ClassId, number>>;
  /** Same counter as attackCount — basic attack action executions. */
  basicActionCount: number;
  /** Damage hit instances from basic attacks only. */
  basicDamageHitCount: number;
  activeSkillUseCountBySkillId: Record<string, number>;
  activeDamageHitCountBySkillId: Record<string, number>;
  damageBySkillId: Record<string, number>;
  damageBySourceKind: Partial<Record<DamageSourceKind, number>>;
  hitCountBySourceKind: Partial<Record<DamageSourceKind, number>>;
  dotDamageHitCount: number;
  dotDamageByStatusId: Record<string, number>;
  dotHitCountByStatusId: Record<string, number>;
  unknownDamageHitCount: number;
  /** battleTimeSec of first basic attack execution; omitted if none. */
  firstBasicActionSec?: number;
  /** battleTimeSec of last basic attack execution; omitted if none. */
  lastBasicActionSec?: number;
  /** battleTimeSec for each basic attack execution. */
  basicActionTimelineSec: number[];
  /** battleTimeSec for each active skill use, keyed by skillId. */
  activeUseTimelineBySkillId: Record<string, number[]>;
  firstActiveUseSecBySkillId: Record<string, number>;
  lastActiveUseSecBySkillId: Record<string, number>;
  /** battleTimeSec at death; omitted when ally survives. */
  deathSec?: number;
  /** battleTimeSec of last enemy-target damage dealt; omitted if none. */
  lastDamageDealtSec?: number;
  /** battleTimeSec for each damage hit to enemies, keyed by source kind. */
  damageTimelineBySourceKind: Partial<Record<DamageSourceKind, number[]>>;
}

export function averageDamagePerHit(
  damageDealt: number,
  hitCount: number,
): number {
  if (hitCount <= 0) return 0;
  return damageDealt / hitCount;
}

export interface StageDamageDisplayRow {
  slotIndex: number;
  classId: ClassId;
  displayName: string;
  epithetEn?: string;
  role: Role;
  isHealer: boolean;
  damageDealt: number;
  damageTaken: number;
  healingDealt: number;
  attackCount: number;
  hitCount: number;
  skillUseCount: number;
  averageDamagePerHit: number;
  indexedDamageHits: number;
  damageByTarget: Partial<Record<ClassId, number>>;
  basicActionCount: number;
  basicDamageHitCount: number;
  activeSkillUseCountBySkillId: Record<string, number>;
  activeDamageHitCountBySkillId: Record<string, number>;
  damageBySkillId: Record<string, number>;
  damageBySourceKind: Partial<Record<DamageSourceKind, number>>;
  hitCountBySourceKind: Partial<Record<DamageSourceKind, number>>;
  dotDamageHitCount: number;
  dotDamageByStatusId: Record<string, number>;
  dotHitCountByStatusId: Record<string, number>;
  unknownDamageHitCount: number;
  firstBasicActionSec?: number;
  lastBasicActionSec?: number;
  basicActionTimelineSec: number[];
  activeUseTimelineBySkillId: Record<string, number[]>;
  firstActiveUseSecBySkillId: Record<string, number>;
  lastActiveUseSecBySkillId: Record<string, number>;
  deathSec?: number;
  lastDamageDealtSec?: number;
  damageTimelineBySourceKind: Partial<Record<DamageSourceKind, number[]>>;
  dealtRatio: number;
  takenRatio: number;
}

export function toRatios(values: number[]): number[] {
  const max = Math.max(0, ...values);
  if (max <= 0) return values.map(() => 0);
  return values.map((value) => value / max);
}

export class StageDamageStatsTracker {
  private stageId = '';
  private readonly bySlot = new Map<number, SlotDamageStats>();

  resetForStage(stageId: string): void {
    this.stageId = stageId;
    this.bySlot.clear();
  }

  getStageId(): string {
    return this.stageId;
  }

  recordDamage(
    actor: CombatantState | undefined,
    target: CombatantState,
    amount: number,
    meta?: DamageAppliedMeta,
    battleSec?: number,
  ): void {
    if (amount <= 0) return;

    if (
      actor &&
      !actor.isEnemy &&
      actor.partySlotIndex !== undefined
    ) {
      const slotStats = this.addToSlot(
        actor.partySlotIndex,
        actor.classId,
        'damageDealt',
        amount,
      );
      if (target.isEnemy) {
        slotStats.hitCount += 1;
        this.recordDealtDamageBreakdown(slotStats, amount, meta, battleSec);
        if (target.classId) {
          const prior = slotStats.damageByTarget[target.classId] ?? 0;
          slotStats.damageByTarget[target.classId] = prior + amount;
        }
        if (battleSec !== undefined) {
          slotStats.lastDamageDealtSec = battleSec;
        }
      }
    }

    if (!target.isEnemy && target.partySlotIndex !== undefined) {
      this.addToSlot(
        target.partySlotIndex,
        target.classId,
        'damageTaken',
        amount,
      );
    }
  }

  recordBasicAttack(
    actor: CombatantState | undefined,
    battleSec?: number,
  ): void {
    if (!actor || actor.isEnemy || actor.partySlotIndex === undefined) return;
    const slotStats = this.ensureSlot(actor.partySlotIndex, actor.classId);
    slotStats.attackCount += 1;
    slotStats.basicActionCount += 1;
    if (battleSec !== undefined) {
      if (slotStats.firstBasicActionSec === undefined) {
        slotStats.firstBasicActionSec = battleSec;
      }
      slotStats.lastBasicActionSec = battleSec;
      slotStats.basicActionTimelineSec.push(battleSec);
    }
  }

  recordActiveSkillUse(
    actor: CombatantState | undefined,
    skillId?: string,
    battleSec?: number,
  ): void {
    if (!actor || actor.isEnemy || actor.partySlotIndex === undefined) return;
    const slotStats = this.ensureSlot(actor.partySlotIndex, actor.classId);
    slotStats.skillUseCount += 1;
    if (skillId) {
      slotStats.activeSkillUseCountBySkillId[skillId] =
        (slotStats.activeSkillUseCountBySkillId[skillId] ?? 0) + 1;
      if (battleSec !== undefined) {
        const timeline = slotStats.activeUseTimelineBySkillId[skillId] ?? [];
        timeline.push(battleSec);
        slotStats.activeUseTimelineBySkillId[skillId] = timeline;
        if (slotStats.firstActiveUseSecBySkillId[skillId] === undefined) {
          slotStats.firstActiveUseSecBySkillId[skillId] = battleSec;
        }
        slotStats.lastActiveUseSecBySkillId[skillId] = battleSec;
      }
    }
  }

  recordAllyDeath(
    partySlotIndex: number,
    classId: ClassId,
    battleSec: number,
  ): void {
    const slotStats = this.ensureSlot(partySlotIndex, classId);
    slotStats.deathSec = battleSec;
  }

  recordIndexedDamageHit(actor: CombatantState | undefined): void {
    if (!actor || actor.isEnemy || actor.partySlotIndex === undefined) return;
    const slotStats = this.ensureSlot(actor.partySlotIndex, actor.classId);
    slotStats.indexedDamageHits += 1;
  }

  recordIndexedDamageHitForSlot(
    partySlotIndex: number,
    classId: ClassId,
  ): void {
    const slotStats = this.ensureSlot(partySlotIndex, classId);
    slotStats.indexedDamageHits += 1;
  }

  recordHeal(actor: CombatantState | undefined, amount: number): void {
    if (amount <= 0) return;

    if (
      actor &&
      !actor.isEnemy &&
      actor.partySlotIndex !== undefined
    ) {
      this.addToSlot(
        actor.partySlotIndex,
        actor.classId,
        'healingDealt',
        amount,
      );
    }
  }

  getDisplayRows(
    party: PartySlotState[],
    classRegistry: Record<ClassId, ClassPreset>,
  ): StageDamageDisplayRow[] {
    const rows: StageDamageDisplayRow[] = [];

    for (let slotIndex = 0; slotIndex < PARTY_SLOT_COUNT; slotIndex++) {
      const member = party[slotIndex];
      if (!member) continue;

      const preset = classRegistry[member.classId];
      const role = preset?.role ?? 'attacker';
      const stats = this.bySlot.get(slotIndex);
      const damageDealt = stats?.damageDealt ?? 0;
      const hitCount = stats?.hitCount ?? 0;
      rows.push({
        slotIndex,
        classId: member.classId,
        displayName: preset?.displayName ?? member.classId,
        epithetEn: preset?.epithetEn,
        role,
        isHealer: role === 'supporter',
        damageDealt,
        damageTaken: stats?.damageTaken ?? 0,
        healingDealt: stats?.healingDealt ?? 0,
        attackCount: stats?.attackCount ?? 0,
        hitCount,
        skillUseCount: stats?.skillUseCount ?? 0,
        averageDamagePerHit: averageDamagePerHit(damageDealt, hitCount),
        indexedDamageHits: stats?.indexedDamageHits ?? 0,
        damageByTarget: { ...(stats?.damageByTarget ?? {}) },
        basicActionCount: stats?.basicActionCount ?? 0,
        basicDamageHitCount: stats?.basicDamageHitCount ?? 0,
        activeSkillUseCountBySkillId: {
          ...(stats?.activeSkillUseCountBySkillId ?? {}),
        },
        activeDamageHitCountBySkillId: {
          ...(stats?.activeDamageHitCountBySkillId ?? {}),
        },
        damageBySkillId: { ...(stats?.damageBySkillId ?? {}) },
        damageBySourceKind: { ...(stats?.damageBySourceKind ?? {}) },
        hitCountBySourceKind: { ...(stats?.hitCountBySourceKind ?? {}) },
        dotDamageHitCount: stats?.dotDamageHitCount ?? 0,
        dotDamageByStatusId: { ...(stats?.dotDamageByStatusId ?? {}) },
        dotHitCountByStatusId: { ...(stats?.dotHitCountByStatusId ?? {}) },
        unknownDamageHitCount: stats?.unknownDamageHitCount ?? 0,
        firstBasicActionSec: stats?.firstBasicActionSec,
        lastBasicActionSec: stats?.lastBasicActionSec,
        basicActionTimelineSec: [...(stats?.basicActionTimelineSec ?? [])],
        activeUseTimelineBySkillId: {
          ...(stats?.activeUseTimelineBySkillId ?? {}),
        },
        firstActiveUseSecBySkillId: {
          ...(stats?.firstActiveUseSecBySkillId ?? {}),
        },
        lastActiveUseSecBySkillId: {
          ...(stats?.lastActiveUseSecBySkillId ?? {}),
        },
        deathSec: stats?.deathSec,
        lastDamageDealtSec: stats?.lastDamageDealtSec,
        damageTimelineBySourceKind: {
          ...(stats?.damageTimelineBySourceKind ?? {}),
        },
        dealtRatio: 0,
        takenRatio: 0,
      });
    }

    const dealtRatios = toRatios(rows.map((row) => row.damageDealt));
    const takenRatios = toRatios(rows.map((row) => row.damageTaken));
    rows.forEach((row, index) => {
      row.dealtRatio = dealtRatios[index] ?? 0;
      row.takenRatio = takenRatios[index] ?? 0;
    });

    return rows;
  }

  private ensureSlot(slotIndex: number, classId: ClassId): SlotDamageStats {
    const existing = this.bySlot.get(slotIndex);
    if (existing) {
      existing.classId = classId;
      return existing;
    }

    const created = this.createEmptySlotStats(classId);
    this.bySlot.set(slotIndex, created);
    return created;
  }

  private addToSlot(
    slotIndex: number,
    classId: ClassId,
    field: 'damageDealt' | 'damageTaken' | 'healingDealt',
    amount: number,
  ): SlotDamageStats {
    const slotStats = this.ensureSlot(slotIndex, classId);
    slotStats[field] += amount;
    return slotStats;
  }

  private recordDealtDamageBreakdown(
    slotStats: SlotDamageStats,
    amount: number,
    meta?: DamageAppliedMeta,
    battleSec?: number,
  ): void {
    const sourceKind = resolveDamageSourceKind(meta);
    slotStats.damageBySourceKind[sourceKind] =
      (slotStats.damageBySourceKind[sourceKind] ?? 0) + amount;
    slotStats.hitCountBySourceKind[sourceKind] =
      (slotStats.hitCountBySourceKind[sourceKind] ?? 0) + 1;
    if (battleSec !== undefined) {
      const timeline = slotStats.damageTimelineBySourceKind[sourceKind] ?? [];
      timeline.push(battleSec);
      slotStats.damageTimelineBySourceKind[sourceKind] = timeline;
    }

    if (sourceKind === 'unknown') {
      slotStats.unknownDamageHitCount += 1;
    }

    if (sourceKind === 'basic') {
      slotStats.basicDamageHitCount += 1;
    }

    if (sourceKind === 'dot') {
      slotStats.dotDamageHitCount += 1;
      if (meta?.statusId) {
        slotStats.dotHitCountByStatusId[meta.statusId] =
          (slotStats.dotHitCountByStatusId[meta.statusId] ?? 0) + 1;
        slotStats.dotDamageByStatusId[meta.statusId] =
          (slotStats.dotDamageByStatusId[meta.statusId] ?? 0) + amount;
      }
    }

    if (meta?.skillId) {
      slotStats.damageBySkillId[meta.skillId] =
        (slotStats.damageBySkillId[meta.skillId] ?? 0) + amount;
      if (sourceKind === 'active_direct') {
        slotStats.activeDamageHitCountBySkillId[meta.skillId] =
          (slotStats.activeDamageHitCountBySkillId[meta.skillId] ?? 0) + 1;
      }
    }
  }

  private createEmptySlotStats(classId: ClassId): SlotDamageStats {
    return {
      classId,
      damageDealt: 0,
      damageTaken: 0,
      healingDealt: 0,
      attackCount: 0,
      hitCount: 0,
      skillUseCount: 0,
      indexedDamageHits: 0,
      damageByTarget: {},
      basicActionCount: 0,
      basicDamageHitCount: 0,
      activeSkillUseCountBySkillId: {},
      activeDamageHitCountBySkillId: {},
      damageBySkillId: {},
      damageBySourceKind: {},
      hitCountBySourceKind: {},
      dotDamageHitCount: 0,
      dotDamageByStatusId: {},
      dotHitCountByStatusId: {},
      unknownDamageHitCount: 0,
      basicActionTimelineSec: [],
      activeUseTimelineBySkillId: {},
      firstActiveUseSecBySkillId: {},
      lastActiveUseSecBySkillId: {},
      damageTimelineBySourceKind: {},
    };
  }
}
