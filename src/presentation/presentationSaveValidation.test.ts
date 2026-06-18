import { describe, expect, it } from 'vitest';
import type { ActiveSkillDef } from '../battle/types.ts';
import { validatePresentationSkillSave } from './presentationSaveValidation.ts';

function buffSkill(effect: ActiveSkillDef['effect']): ActiveSkillDef {
  return {
    id: 'test_active',
    name: 'test',
    trigger: { kind: 'time', value: 5 },
    effect,
  };
}

describe('validatePresentationSkillSave', () => {
  it('accepts valid phased anim fields', () => {
    const skill = buffSkill([
      {
        target: { kind: 'self' },
        type: 'buff',
        buffSubKind: 'stat',
        buffStat: 'def',
        buffMultiplier: 1.2,
        buffDurationSec: 5,
        animStartFrame: 1,
        animLoopFrame: 2,
        animIntroEndFrame: 2,
        animOutroStartFrame: 3,
      },
    ]);
    expect(validatePresentationSkillSave(skill)).toBeNull();
  });

  it('accepts intro and loop on separate frame ranges', () => {
    const skill = buffSkill([
      {
        target: { kind: 'self' },
        type: 'buff',
        buffSubKind: 'stat',
        buffStat: 'def',
        buffMultiplier: 1.2,
        buffDurationSec: 5,
        animStartFrame: 1,
        animIntroEndFrame: 2,
        animLoopFrame: 3,
        animLoopEndFrame: 5,
        animOutroStartFrame: 6,
      },
    ]);
    expect(validatePresentationSkillSave(skill)).toBeNull();
  });

  it('accepts vfx with enabled flag', () => {
    const skill = buffSkill([
      {
        target: { kind: 'self' },
        type: 'buff',
        buffSubKind: 'stat',
        buffStat: 'def',
        buffMultiplier: 1.2,
        buffDurationSec: 5,
        vfx: { enabled: true },
      },
    ]);
    expect(validatePresentationSkillSave(skill)).toBeNull();
  });

  it('rejects animOutroStartFrame on or before loop end on body', () => {
    const skill = buffSkill([
      {
        target: { kind: 'self' },
        type: 'buff',
        buffSubKind: 'stat',
        buffStat: 'def',
        buffMultiplier: 1.2,
        buffDurationSec: 5,
        animLoopFrame: 2,
        animIntroEndFrame: 2,
        animLoopEndFrame: 3,
        animOutroStartFrame: 3,
      },
    ]);
    expect(validatePresentationSkillSave(skill)).toMatch(/animOutroStartFrame/);
  });

  it('rejects invalid vfx animLoopFrame on effect', () => {
    const skill = buffSkill([
      {
        target: { kind: 'self' },
        type: 'buff',
        buffSubKind: 'stat',
        buffStat: 'def',
        buffMultiplier: 1.2,
        buffDurationSec: 5,
        vfx: {
          animLoopFrame: 2,
          animIntroEndFrame: 2,
          animLoopEndFrame: 3,
          animOutroStartFrame: 3,
        },
      },
    ]);
    expect(validatePresentationSkillSave(skill)).toMatch(/effect\[0\]\.vfx.*animOutroStartFrame/);
  });
});
