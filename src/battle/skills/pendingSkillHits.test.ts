import { describe, expect, it } from 'vitest';
import type { ActiveSkillDef, SkillEffectDef } from '../types.ts';
import { buildPendingHitsFromResolution } from './pendingSkillHits.ts';

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
});
