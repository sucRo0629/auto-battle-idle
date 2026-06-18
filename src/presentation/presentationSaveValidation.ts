import type {
  ActiveSkillDef,
  SkillEffectDef,
  SkillVfxDef,
  VfxParticleDef,
} from '../battle/types.ts';
import {
  DEPRECATED_SKILL_VFX_DEF_FIELD_KEYS,
  PARTICLE_PRESET_IDS,
} from '../battle/data/gameDataSchema.ts';
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

const PARTICLE_PRESET_IDS_SET = new Set<string>(PARTICLE_PRESET_IDS);

function validateVfxParticleDef(
  particles: VfxParticleDef,
  label: string,
): string | null {
  if (particles.enabled === false) return null;
  if (!PARTICLE_PRESET_IDS_SET.has(particles.preset)) {
    return `${label}.preset は ${[...PARTICLE_PRESET_IDS_SET].join(', ')} のいずれかにしてください`;
  }
  if (particles.count !== undefined && particles.count < 1) {
    return `${label}.count は 1 以上にしてください`;
  }
  if (particles.durationSec !== undefined && particles.durationSec <= 0) {
    return `${label}.durationSec は正数にしてください`;
  }
  if (particles.delaySec !== undefined && particles.delaySec < 0) {
    return `${label}.delaySec は 0 以上にしてください`;
  }
  if (
    particles.tint !== undefined &&
    !/^#[0-9a-fA-F]{6}$/.test(particles.tint)
  ) {
    return `${label}.tint は #rrggbb 形式にしてください`;
  }
  return null;
}

function validateSkillVfxDef(
  vfx: SkillVfxDef,
  label: string,
): string | null {
  for (const key of DEPRECATED_SKILL_VFX_DEF_FIELD_KEYS) {
    if (key in vfx && (vfx as Record<string, unknown>)[key] !== undefined) {
      return `${label}.${key} は廃止されました（Canvas preset VFX）`;
    }
  }
  const bodyError = validateAnimPhaseFields(vfx, label);
  if (bodyError) return bodyError;
  if (vfx.particles) {
    const particleError = validateVfxParticleDef(
      vfx.particles,
      `${label}.particles`,
    );
    if (particleError) return particleError;
  }
  return null;
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
