export interface BattleTargetIndicatorPair {
  actorId: string;
  targetId: string;
}

interface TrackedTarget {
  targetId: string;
  expiresAtMs: number;
}

/** UI-only tracker driven by battle events (no battle logic changes). */
export class BattleTargetIndicatorTracker {
  private byActor = new Map<string, TrackedTarget>();
  private lastSignature = "";

  note(actorId: string, targetId: string, nowMs: number, ttlMs = 3200): boolean {
    this.byActor.set(actorId, {
      targetId,
      expiresAtMs: nowMs + ttlMs,
    });
    return this.refreshSignature();
  }

  prune(nowMs: number): boolean {
    let changed = false;
    for (const [actorId, entry] of this.byActor) {
      if (entry.expiresAtMs <= nowMs) {
        this.byActor.delete(actorId);
        changed = true;
      }
    }
    return changed || this.refreshSignature();
  }

  getPairs(): BattleTargetIndicatorPair[] {
    return [...this.byActor.entries()].map(([actorId, entry]) => ({
      actorId,
      targetId: entry.targetId,
    }));
  }

  getTargetedUnitIds(): string[] {
    const ids = new Set<string>();
    for (const entry of this.byActor.values()) {
      ids.add(entry.targetId);
    }
    return [...ids];
  }

  getSignature(): string {
    return this.lastSignature;
  }

  private refreshSignature(): boolean {
    const next = this.getPairs()
      .map((pair) => `${pair.actorId}:${pair.targetId}`)
      .sort()
      .join("|");
    if (next === this.lastSignature) return false;
    this.lastSignature = next;
    return true;
  }
}
