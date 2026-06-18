import type {
  ActiveSkillDef,
  SkillEffectAnimId,
  SkillEffectDef,
  SkillVfxDef,
} from "../../battle/types.ts";
import type { AnimState } from "../SpriteRegistry.ts";
import { resolveVfxAnimKey } from "../vfxAnimRegistry.ts";
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

export function isVfxDefActive(
  vfx: SkillVfxDef | null | undefined,
): vfx is SkillVfxDef {
  return vfx != null && vfx.enabled !== false;
}

function resolveExplicitVfx(
  effectDef: SkillEffectDef,
  skillDef: ActiveSkillDef | undefined,
  ctx: SkillVfxContext,
): SkillVfxDef | null {
  if (!supportsVfx(effectDef)) return null;
  if (ctx.slotKind === "basic") {
    return isVfxDefActive(ctx.basicAttackVfx) ? ctx.basicAttackVfx! : null;
  }
  if (isVfxDefActive(effectDef.vfx)) return effectDef.vfx!;
  if (ctx.effectVfxOnly !== false) return null;
  if (isVfxDefActive(skillDef?.vfx)) return skillDef!.vfx!;
  return null;
}

function resolveHitVfx(
  effectDef: SkillEffectDef,
  ctx: SkillVfxContext,
): SkillVfxDef | null {
  if (ctx.effectKind !== "damage" && ctx.effectKind !== "dot") {
    return null;
  }
  if (isVfxDefActive(effectDef.hitVfx)) return effectDef.hitVfx!;
  const { skillId, effectIndex } = ctx;
  if (skillId === undefined || effectIndex === undefined) return null;
  if (resolveVfxAnimKey(skillId, effectIndex, "hit")) {
    return {};
  }
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
  const hitVfx = resolveHitVfx(effectDef, ctx);

  return { anim, vfx, hitVfx };
}
