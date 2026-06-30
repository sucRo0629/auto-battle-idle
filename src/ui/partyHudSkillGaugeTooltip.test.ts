import { describe, expect, it } from 'vitest';
import { formatPartyHudSkillSlotTooltip } from './partyHudSkillGaugeTooltip.ts';

describe('formatPartyHudSkillSlotTooltip', () => {
  it('describes inactive slots by unlock level', () => {
    expect(formatPartyHudSkillSlotTooltip(2, undefined, undefined, true)).toContain(
      '10',
    );
    expect(formatPartyHudSkillSlotTooltip(3, undefined, undefined, true)).toContain(
      '20',
    );
  });

  it('includes skill name and remaining progress for active slots', () => {
    const text = formatPartyHudSkillSlotTooltip(
      0,
      {
        skillId: 'test_skill',
        remaining: 3,
        triggerKind: 'time',
        triggerValue: 10,
        slotIndex: 0,
      },
      { displayName: 'Test Skill' } as never,
      false,
    );
    expect(text).toContain('Test Skill');
    expect(text).toMatch(/3|秒|s/);
  });
});
