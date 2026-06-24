import { describe, expect, it } from 'vitest';
import { runGuardianSupporterSim } from './test/guardianSupporterSim.harness.ts';
import { loadGameData } from './data/loadGameData.ts';

function findGuardian(snap: ReturnType<typeof runGuardianSupporterSim>) {
  return snap.allies.find((a) => a.partySlotIndex === 0);
}

describe('alchemist balance (iron guard + herbalist, stage 1 wave 1)', () => {
  it('Lv10: iron guard survives 90s with herbalist', () => {
    const snap = runGuardianSupporterSim('sp_alchemist', 10);
    expect(findGuardian(snap)?.hp).toBeGreaterThan(0);
  });

  it('uses HoT-only actives (no instant heal)', () => {
    const { actives } = loadGameData().skillRegistry;
    for (const id of [
      'sp_alchemist_basic_attack',
      'sp_alchemist_active_1',
      'sp_alchemist_active_2',
      'sp_alchemist_active_3',
      'sp_alchemist_active_4',
    ]) {
      const skill = actives[id]!;
      for (const effect of skill.effect) {
        if (effect.type === 'heal') {
          expect(effect.healSubKind ?? 'instant').toBe('hot');
        }
        if (effect.type === 'conditionalEffect') {
          for (const branch of [...effect.thenEffects, ...effect.elseEffects]) {
            if (branch.type === 'heal') {
              expect(branch.healSubKind ?? 'instant').toBe('hot');
            }
          }
        }
      }
    }
  });
});
