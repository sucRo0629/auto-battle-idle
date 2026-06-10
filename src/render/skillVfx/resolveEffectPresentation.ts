import { isRangedAttack } from "../../battle/data/entityTraits.ts";
import type {
  ActiveSkillDef,
  SkillEffectAnimId,
  SkillEffectDef,
  SkillVfxDef,
} from "../../battle/types.ts";
import type { AnimState } from "../SpriteRegistry.ts";
import { resolveSkillVfx } from "./resolveSkillVfx.ts";
import type { SkillVfxContext } from "./types.ts";

export interface EffectPresentation {
  anim: AnimState | null;
  vfx: SkillVfxDef | null;
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
    effect.type === "heal" ||
    effect.type === "hot"
  );
}

export function resolveEffectPresentation(
  skillId: string,
  effectDef: SkillEffectDef,
  skillDef: ActiveSkillDef | undefined,
  ctx: SkillVfxContext,
): EffectPresentation {
  const animId = normalizeEffectAnim(effectDef.anim, effectDef);
  const anim =
    animId === "none" ? null : (animId as AnimState);

  let vfx: SkillVfxDef | null = null;
  if (supportsVfx(effectDef)) {
    if (ctx.slotKind === "basic" && ctx.basicAttackVfx) {
      vfx = ctx.basicAttackVfx;
    } else {
      vfx = effectDef.vfx ?? resolveSkillVfx(skillId, ctx, skillDef?.vfx);
    }
  }

  return { anim, vfx };
}

export function shouldPlayActorAnim(
  anim: AnimState,
  rangePx: number,
  slotKind: "basic" | "active" | undefined,
): boolean {
  if (anim === "attack" && isRangedAttack(rangePx) && slotKind === "basic") {
    return false;
  }
  return true;
}
