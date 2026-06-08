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

function defaultAnimForEffect(effect: SkillEffectDef): SkillEffectAnimId {
  switch (effect.type) {
    case "move":
      return "dash";
    case "damage":
    case "dot":
      return "attack";
    case "heal":
    case "hot":
      return "heal";
    default:
      return "none";
  }
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
  const animId = effectDef.anim ?? defaultAnimForEffect(effectDef);
  const anim = animId === "none" ? null : (animId as AnimState);

  let vfx: SkillVfxDef | null = null;
  if (supportsVfx(effectDef)) {
    vfx = effectDef.vfx ?? resolveSkillVfx(skillId, ctx, skillDef?.vfx);
  }

  return { anim, vfx };
}

export function shouldPlayActorAnim(
  anim: AnimState,
  attackRange: "melee" | "ranged",
  slotKind: "basic" | "active" | undefined,
): boolean {
  if (anim === "attack" && attackRange === "ranged" && slotKind === "basic") {
    return false;
  }
  return true;
}
