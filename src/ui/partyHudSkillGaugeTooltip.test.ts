import { describe, expect, it } from 'vitest';
import { formatPartyHudSkillSlotTooltip } from './partyHudSkillGaugeTooltip.ts';

describe('formatPartyHudSkillSlotTooltip', () => {
  it('returns null for inactive slots', () => {
    expect(formatPartyHudSkillSlotTooltip(2, undefined, undefined, true)).toBeNull();
    expect(formatPartyHudSkillSlotTooltip(3, undefined, undefined, true)).toBeNull();
  });

  it('returns only the skill name for active slots', () => {
    const text = formatPartyHudSkillSlotTooltip(
      0,
      {
        skillId: 'test_skill',
        remaining: 3,
        triggerKind: 'time',
        triggerValue: 10,
        slotIndex: 0,
      },
      { name: 'Test Skill' } as never,
      false,
    );
    expect(text).toBe('Test Skill');
  });

  it('falls back to skillId when name is missing', () => {
    const text = formatPartyHudSkillSlotTooltip(
      0,
      {
        skillId: 'test_skill',
        remaining: 0,
        triggerKind: 'time',
        triggerValue: 10,
        slotIndex: 0,
      },
      undefined,
      false,
    );
    expect(text).toBe('test_skill');
  });
});
