import type {
  ActiveSkillDef,
  SkillEffectDef,
  SkillVfxDef,
} from '../battle/types.ts';
import type { SkillAnimPhaseFields } from '../render/skillAnimPlayback.ts';

function validateAnimPhaseFields(
  fields: SkillAnimPhaseFields,
  label: string,
): string | null {
  const {
    animStartFrame,
    animIntroEndFrame,
    animLoopFrame,
    animLoopEndFrame,
    animOutroStartFrame,
    applyFrame,
  } = fields;

  if (animIntroEndFrame !== undefined && animLoopFrame === undefined) {
    return `${label}: animIntroEndFrame は animLoopFrame が必要です`;
  }
  if (animLoopEndFrame !== undefined && animLoopFrame === undefined) {
    return `${label}: animLoopEndFrame は animLoopFrame が必要です`;
  }
  if (animOutroStartFrame !== undefined && animLoopFrame === undefined) {
    return `${label}: animOutroStartFrame は animLoopFrame が必要です`;
  }

  const startFrame = animStartFrame ?? 0;
  const introEnd = animIntroEndFrame ?? animLoopFrame;
  const loopFrame = animLoopFrame;
  const loopEnd = animLoopEndFrame ?? loopFrame;
  const outroStart =
    animOutroStartFrame ??
    (loopFrame !== undefined ? (loopEnd ?? loopFrame) + 1 : undefined);

  if (loopFrame !== undefined) {
    if (introEnd !== undefined && introEnd < startFrame) {
      return `${label}: animIntroEndFrame は animStartFrame 以上にしてください`;
    }
    if (loopFrame < (introEnd ?? loopFrame)) {
      return `${label}: animLoopFrame は animIntroEndFrame 以上にしてください`;
    }
    if (loopEnd !== undefined && loopEnd < loopFrame) {
      return `${label}: animLoopEndFrame は animLoopFrame 以上にしてください`;
    }
    if (
      outroStart !== undefined &&
      outroStart <= (loopEnd ?? introEnd ?? loopFrame)
    ) {
      return `${label}: animOutroStartFrame はループ終了より後のコマにしてください`;
    }
  }

  if (applyFrame !== undefined && applyFrame < startFrame) {
    return `${label}: applyFrame は animStartFrame 以上にしてください`;
  }

  return null;
}

function validateSkillVfxDef(
  vfx: SkillVfxDef,
  label: string,
): string | null {
  return validateAnimPhaseFields(vfx, label);
}

function validateEffectPresentation(
  effect: SkillEffectDef,
  label: string,
): string | null {
  const bodyError = validateAnimPhaseFields(effect, label);
  if (bodyError) return bodyError;
  if (effect.vfx) {
    const vfxError = validateSkillVfxDef(effect.vfx, `${label}.vfx`);
    if (vfxError) return vfxError;
  }
  if (effect.hitVfx) {
    const hitVfxError = validateSkillVfxDef(effect.hitVfx, `${label}.hitVfx`);
    if (hitVfxError) return hitVfxError;
  }
  return null;
}

/** traits.basicAttackVfx 保存前検証 */
export function validateBasicAttackVfxSave(
  vfx: SkillVfxDef,
): string | null {
  return validateSkillVfxDef(vfx, 'traits.basicAttackVfx');
}

/** 演出ラボ保存前のクライアント検証（サーバー validateGameData と同じ制約） */
export function validatePresentationSkillSave(
  skill: ActiveSkillDef,
): string | null {
  for (let index = 0; index < skill.effect.length; index += 1) {
    const error = validateEffectPresentation(
      skill.effect[index]!,
      `effect[${index}]`,
    );
    if (error) return error;
  }
  return null;
}
