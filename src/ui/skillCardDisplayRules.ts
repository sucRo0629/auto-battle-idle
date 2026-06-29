import type { GameTermId } from "./gameTermGlossary.ts";

/**
 * Skill card display classification (party-formation-ui.md §6.4).
 *
 * - Body: what happens (damage, stats, generic effects)
 * - Tags: processing / target / activation shape only
 * - Status chips: named buffs, debuffs, and states only
 */

/** Tags — special mechanics (shape / trigger), not damage type or effect category. */
export const SKILL_CARD_TAG_TERM_IDS = [
  "multiLock",
  "aoe",
  "pierce",
] as const satisfies readonly GameTermId[];

export type SkillCardTagTermId = (typeof SKILL_CARD_TAG_TERM_IDS)[number];

/** Status chips — proprietary named states only (not generic DoT / stun / block). */
export const SKILL_CARD_STATUS_CHIP_TERM_IDS = [
  "seedFlame",
  "blazingFlame",
  "windMark",
  "earthMark",
  "arenaMark",
  "ballistaMark",
  "blockResonance",
  "blockResonanceStance",
  "healReservation",
  "herbalPotency",
  "herbalPotencyConstitution",
  "allyAttackFollowUp",
  "poisonWeapon",
  "nextOutgoingDamage",
  "lastStandGuts",
  "arenaDominance",
  "duelistPride",
  "damageDelay",
  "basicAttackTransform",
] as const satisfies readonly GameTermId[];

export type SkillCardStatusChipTermId =
  (typeof SKILL_CARD_STATUS_CHIP_TERM_IDS)[number];

const TAG_TERM_ID_SET = new Set<GameTermId>(SKILL_CARD_TAG_TERM_IDS);
const STATUS_CHIP_TERM_ID_SET = new Set<GameTermId>(
  SKILL_CARD_STATUS_CHIP_TERM_IDS
);

export const SKILL_CARD_BODY_TERM_EXCLUDE_IDS: ReadonlySet<GameTermId> =
  STATUS_CHIP_TERM_ID_SET;

export function isSkillCardTagTermId(
  termId: GameTermId
): termId is SkillCardTagTermId {
  return TAG_TERM_ID_SET.has(termId);
}

export function isSkillCardStatusChipTermId(
  termId: GameTermId
): termId is SkillCardStatusChipTermId {
  return STATUS_CHIP_TERM_ID_SET.has(termId);
}
