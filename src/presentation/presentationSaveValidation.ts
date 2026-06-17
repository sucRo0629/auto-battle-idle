import type { ActiveSkillDef, SkillEffectDef } from '../battle/types.ts';
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

function validateEffectPresentation(
  effect: SkillEffectDef,
  label: string,
): string | null {
  if (effect.vfx !== undefined && !effect.vfx.preset) {
    return `${label}: vfx.preset を選択してから保存してください`;
  }
  return validateAnimPhaseFields(effect, label);
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
