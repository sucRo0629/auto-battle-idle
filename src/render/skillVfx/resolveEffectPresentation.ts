import type {
  ActiveSkillDef,
  SkillEffectAnimId,
  SkillEffectDef,
  SkillVfxDef,
} from "../../battle/types.ts";
import type { AnimState } from "../SpriteRegistry.ts";
import { resolveDefaultHitVfx } from "./defaultPresets.ts";
import { resolveSkillVfx } from "./resolveSkillVfx.ts";
import type { SkillVfxContext } from "./types.ts";

export interface EffectPresentation {
  anim: AnimState | null;
  vfx: SkillVfxDef | null;
  hitVfx?: SkillVfxDef | null;
}

export interface ResolveEffectPresentationOptions {
  /** 演出ラボ: effect.vfx.preset のみを VFX 源とする（スキル / 通常攻撃既定へフォールバックしない） */
  effectVfxOnly?: boolean;
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

function resolveEffectVfx(
  skillId: string,
  effectDef: SkillEffectDef,
  skillDef: ActiveSkillDef | undefined,
  ctx: SkillVfxContext,
  options?: ResolveEffectPresentationOptions,
): SkillVfxDef | null {
  if (!supportsVfx(effectDef)) return null;

  if (options?.effectVfxOnly) {
    return effectDef.vfx?.preset ? effectDef.vfx : null;
  }

  if (ctx.slotKind === "basic" && ctx.basicAttackVfx) {
    return ctx.basicAttackVfx;
  }

  return effectDef.vfx ?? resolveSkillVfx(skillId, ctx, skillDef?.vfx);
}

export function resolveEffectPresentation(
  skillId: string,
  effectDef: SkillEffectDef,
  skillDef: ActiveSkillDef | undefined,
  ctx: SkillVfxContext,
  options?: ResolveEffectPresentationOptions,
): EffectPresentation {
  const animId = normalizeEffectAnim(effectDef.anim, effectDef);
  const anim =
    animId === "none" ? null : (animId as AnimState);

  const vfx = resolveEffectVfx(skillId, effectDef, skillDef, ctx, options);

  const hitVfx = resolveHitVfx(vfx, ctx);

  return { anim, vfx, hitVfx };
}

/** chainLightning / impale はセグメント起点を vfxSourceId から取る */
export function usesSegmentVfxSource(preset: SkillVfxDef["preset"]): boolean {
  return preset === "chainLightning" || preset === "impale";
}
