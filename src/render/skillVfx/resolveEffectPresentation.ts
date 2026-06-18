import type {
  ActiveSkillDef,
  SkillEffectAnimId,
  SkillEffectDef,
  SkillVfxDef,
} from "../../battle/types.ts";
import type { AnimState } from "../SpriteRegistry.ts";
import { resolveDefaultHitVfx } from "./defaultPresets.ts";
import type { SkillVfxContext } from "./types.ts";

export interface EffectPresentation {
  anim: AnimState | null;
  vfx: SkillVfxDef | null;
  hitVfx?: SkillVfxDef | null;
}

const LEGACY_ANIM_MAP: Partial<Record<SkillEffectAnimId, SkillEffectAnimId>> = {
  dash: "none",
  heal: "none",
  hurt: "none",
};

function defaultAnimForEffect(effect: SkillEffectDef): SkillEffectAnimId {
  switch (effect.type) {
    case "move":
      return "none";
    case "damage":
    case "dot":
      return "attack";
    case "heal":
    case "hot":
      return "none";
    default:
      return "none";
  }
}

function normalizeEffectAnim(
  anim: SkillEffectAnimId | undefined,
  effect: SkillEffectDef,
): SkillEffectAnimId {
  const raw = anim ?? defaultAnimForEffect(effect);
  return LEGACY_ANIM_MAP[raw] ?? raw;
}

function supportsVfx(effect: SkillEffectDef): boolean {
  return (
    effect.type === "damage" ||
    effect.type === "dot" ||
    (effect.type === "heal" &&
      (effect.healSubKind ?? "instant") !== "dispel")
  );
}

function resolveHitVfx(
  vfx: SkillVfxDef | null,
  ctx: SkillVfxContext,
): SkillVfxDef | null {
  if (!vfx) return null;
  return resolveDefaultHitVfx(ctx, vfx);
}

function resolveExplicitVfx(
  effectDef: SkillEffectDef,
  skillDef: ActiveSkillDef | undefined,
  ctx: SkillVfxContext,
): SkillVfxDef | null {
  if (!supportsVfx(effectDef)) return null;
  if (ctx.slotKind === "basic") {
    return ctx.basicAttackVfx?.preset ? ctx.basicAttackVfx : null;
  }
  if (effectDef.vfx?.preset) return effectDef.vfx;
  if (ctx.effectVfxOnly) return null;
  if (skillDef?.vfx?.preset) return skillDef.vfx;
  return null;
}

export function resolveEffectPresentation(
  effectDef: SkillEffectDef,
  skillDef: ActiveSkillDef | undefined,
  ctx: SkillVfxContext,
): EffectPresentation {
  const animId = normalizeEffectAnim(effectDef.anim, effectDef);
  const anim =
    animId === "none" ? null : (animId as AnimState);

  const vfx = resolveExplicitVfx(effectDef, skillDef, ctx);

  const hitVfx = resolveHitVfx(vfx, ctx);

  return { anim, vfx, hitVfx };
}

/** chainLightning / impale はセグメント起点を vfxSourceId から取る */
export function usesSegmentVfxSource(preset: SkillVfxDef["preset"]): boolean {
  return preset === "chainLightning" || preset === "impale";
}
