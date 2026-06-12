import { describe, expect, it } from 'vitest';
import { loadGameData } from './data/loadGameData.ts';
import { runGuardianSupporterSim } from './test/guardianSupporterSim.harness.ts';

const ALCHEMIST_MAX_CLERIC_RATIO = 0.75;
/** cleric 広域治療 HoT（未習得だが parity 参照） */
const CLERIC_AREA_HOT_ATK_SCALE = 0.5;

function findGuardian(snap: ReturnType<typeof runGuardianSupporterSim>) {
  return snap.allies.find((a) => a.partySlotIndex === 0);
}

function atkScaleFromHealEffect(
  effect: { type?: string; amount?: { kind?: string; atkScale?: number } } | undefined,
): number | undefined {
  if (effect?.type !== 'heal' || effect.amount?.kind !== 'atkBased') return undefined;
  return effect.amount.atkScale;
}

describe('alchemist balance (iron guard + herbalist, stage 1 wave 1)', () => {
  it('Lv10: iron guard survives 90s with herbalist', () => {
    const snap = runGuardianSupporterSim('sp_alchemist', 10);
    expect(findGuardian(snap)?.hp).toBeGreaterThan(0);
  });

  it('Lv0 heal scales stay at or below 75% of cleric burst references', () => {
    const { actives } = loadGameData().skillRegistry;
    const clericBasic = actives['sp_cleric_basic_attack']?.effect[0];
    const herbalistBasic = actives['sp_alchemist_basic_attack']?.effect[0];
    const herbalistActive = actives['sp_alchemist_active_1']?.effect ?? [];

    const clericBasicScale = atkScaleFromHealEffect(clericBasic);
    const herbalistBasicScale = atkScaleFromHealEffect(herbalistBasic);
    const herbalistActiveHot = herbalistActive.find((e) => e.type === 'heal');

    expect(clericBasicScale).toBeDefined();
    expect(herbalistBasicScale).toBeDefined();
    expect(herbalistActiveHot).toBeDefined();

    expect(herbalistBasicScale!).toBeLessThanOrEqual(
      clericBasicScale! * ALCHEMIST_MAX_CLERIC_RATIO,
    );
    expect(atkScaleFromHealEffect(herbalistActiveHot)).toBeLessThanOrEqual(
      CLERIC_AREA_HOT_ATK_SCALE * ALCHEMIST_MAX_CLERIC_RATIO,
    );
  });
});
