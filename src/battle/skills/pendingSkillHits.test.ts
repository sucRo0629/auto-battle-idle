import { describe, expect, it, vi } from 'vitest';
import type { ActiveSkillDef, SkillEffectDef } from '../types.ts';
import {
  buildPendingHitsFromResolution,
  tickPendingHits,
} from './pendingSkillHits.ts';

const skill: ActiveSkillDef = {
  id: 'test_pierce',
  name: 'test',
  trigger: { kind: 'time', value: 5 },
  effect: [],
};

describe('buildPendingHitsFromResolution vfxSourceId', () => {
  it('assigns segment source ids for pierce waves', () => {
    const effectDef = {
      type: 'damage',
      targetShape: 'pierce',
      pierceDurationSec: 0.2,
      target: { kind: 'distance', side: 'enemy', order: 'nearest' },
      damageType: 'physical',
      amount: { kind: 'atkBased', atkScale: 1 },
    } as SkillEffectDef;

    const hits = buildPendingHitsFromResolution(
      {
        spreadDurationSec: 0.2,
        waves: [
          { hitIndex: 0, targets: [{ unit: { id: 'e1' } as never }] },
          { hitIndex: 1, targets: [{ unit: { id: 'e2' } as never }] },
        ],
      },
      0,
      'actor1',
      skill,
      effectDef,
      { skillId: skill.id, remaining: 0, slotKind: 'active' },
    );

    expect(hits.map((hit) => hit.vfxSourceId)).toEqual(['actor1', 'e1']);
  });

  it('assigns segment source ids for chain waves', () => {
    const effectDef = {
      type: 'damage',
      targetShape: 'chain',
      chainCount: 3,
      chainMaxDistancePx: 80,
      chainDurationSec: 0.45,
      target: { kind: 'distance', side: 'enemy', order: 'nearest' },
      damageType: 'magic',
      amount: { kind: 'atkBased', atkScale: 1 },
    } as SkillEffectDef;

    const hits = buildPendingHitsFromResolution(
      {
        spreadDurationSec: 0.45,
        waves: [
          { hitIndex: 0, targets: [{ unit: { id: 'e1' } as never }] },
          { hitIndex: 1, targets: [{ unit: { id: 'e2' } as never }] },
          { hitIndex: 2, targets: [{ unit: { id: 'e3' } as never }] },
        ],
      },
      0,
      'actor1',
      skill,
      effectDef,
      { skillId: skill.id, remaining: 0, slotKind: 'active' },
    );

    expect(hits.map((hit) => hit.vfxSourceId)).toEqual(['actor1', 'e1', 'e2']);
  });
});

describe('buildPendingHitsFromResolution staged chain', () => {
  const effectDef = {
    type: 'damage',
    targetShape: 'chain',
    chainCount: 3,
    chainMaxDistancePx: 80,
    chainDurationSec: 0.9,
    vfx: { preset: 'chainLightning' },
    target: { kind: 'distance', side: 'enemy', order: 'nearest' },
    damageType: 'magic',
    amount: { kind: 'atkBased', atkScale: 1 },
  } as SkillEffectDef;

  const waves = [
    { hitIndex: 0, targets: [{ unit: { id: 'e1' } as never }] },
    { hitIndex: 1, targets: [{ unit: { id: 'e2' } as never }] },
    { hitIndex: 2, targets: [{ unit: { id: 'e3' } as never }] },
  ];

  it('schedules vfx start before apply for each hop', () => {
    const hits = buildPendingHitsFromResolution(
      { spreadDurationSec: 0.9, waves },
      1,
      'actor1',
      skill,
      effectDef,
      { skillId: skill.id, remaining: 0, slotKind: 'active' },
      { stagedChainVfx: true, effectIndex: 0 },
    );

    expect(hits.map((hit) => hit.vfxStartAtBattleSec)).toEqual([1, 1.3, 1.6]);
    expect(hits.map((hit) => hit.applyAtBattleSec)).toEqual([1.3, 1.6, 1.9]);
    expect(hits.map((hit) => hit.travelDurationSec)).toEqual([0.3, 0.3, 0.3]);
    expect(hits.map((hit) => hit.segmentCount)).toEqual([3, 3, 3]);
  });

  it('fires vfx start before apply on tick', () => {
    const hits = buildPendingHitsFromResolution(
      { spreadDurationSec: 0.9, waves },
      0,
      'actor1',
      skill,
      effectDef,
      { skillId: skill.id, remaining: 0, slotKind: 'active' },
      { stagedChainVfx: true, effectIndex: 0 },
    );
    const onVfxStart = vi.fn();
    const onApply = vi.fn();

    let queue = tickPendingHits(hits, 0, { onVfxStart, onApply });
    expect(onVfxStart).toHaveBeenCalledTimes(1);
    expect(onVfxStart.mock.calls[0]?.[0]?.hitIndex).toBe(0);
    expect(onApply).not.toHaveBeenCalled();

    queue = tickPendingHits(queue, 0.3, { onVfxStart, onApply });
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0]?.[0]?.hitIndex).toBe(0);
    expect(onVfxStart).toHaveBeenCalledTimes(2);
    expect(onVfxStart.mock.calls[1]?.[0]?.hitIndex).toBe(1);
    expect(queue).toHaveLength(2);
  });

  it('applies every hop and spawns vfx for the full chain', () => {
    const hits = buildPendingHitsFromResolution(
      { spreadDurationSec: 0.9, waves },
      0,
      'actor1',
      skill,
      effectDef,
      { skillId: skill.id, remaining: 0, slotKind: 'active' },
      { stagedChainVfx: true, effectIndex: 0 },
    );
    const onVfxStart = vi.fn();
    const onApply = vi.fn();
    let queue = hits;

    for (const t of [0, 0.3, 0.6, 0.9]) {
      queue = tickPendingHits(queue, t, { onVfxStart, onApply });
    }

    expect(onApply).toHaveBeenCalledTimes(3);
    expect(onVfxStart).toHaveBeenCalledTimes(3);
    expect(queue).toHaveLength(0);
  });

  it('applies all due hops in a single tick', () => {
    const hits = buildPendingHitsFromResolution(
      { spreadDurationSec: 0.9, waves },
      0,
      'actor1',
      skill,
      effectDef,
      { skillId: skill.id, remaining: 0, slotKind: 'active' },
      { stagedChainVfx: true, effectIndex: 0 },
    );
    const onApply = vi.fn();

    const queue = tickPendingHits(hits, 0.9, { onApply });

    expect(onApply).toHaveBeenCalledTimes(3);
    expect(onApply.mock.calls.map((call) => call[0]?.hitIndex)).toEqual([0, 1, 2]);
    expect(queue).toHaveLength(0);
  });
});
