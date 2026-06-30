import type { GameTermId } from "./gameTermGlossary.ts";

/**
 * Skill card display classification (party-formation-ui.md §6.4,
 * classes-and-skills.md §ゲーム用語表).
 *
 * - Inline Term Label: game-specific rules in body text (tooltip trigger)
 * - State Chip: persistent battle states (separate row)
 * - Plain Text: basic terms without tooltip in skill card body
 *
 * Lists below are implementation allowlists synced with spec examples;
 * they are not exhaustive fixed rosters. Glossary `tooltip` / `statusDefinition`
 * is the source for whether a term can be annotated.
 */

/** Inline term labels — tooltip triggers embedded in effect body lines. */
export const SKILL_CARD_INLINE_TERM_LABEL_IDS = [
  "multiLock",
  "aoe",
  "pierce",
  "stun",
  "knockback",
  "counter",
  "evasion",
  "defenseIgnoreDef",
  "damageReductionIgnore",
  "barrierPierce",
  "moveLock",
  "skillLock",
  "dotCompress",
] as const satisfies readonly GameTermId[];

export type SkillCardInlineTermLabelId =
  (typeof SKILL_CARD_INLINE_TERM_LABEL_IDS)[number];

/**
 * State chips — battle states shown outside effect lines.
 * Includes generic states (barrier, DoT, …) and proprietary named states.
 */
export const SKILL_CARD_STATUS_CHIP_TERM_IDS = [
  "barrier",
  "wardBarrier",
  "blockResonance",
  "blockResonanceStance",
  "dot",
  "hot",
  "poison",
  "bleed",
  "seedFlame",
  "blazingFlame",
  "windMark",
  "earthMark",
  "arenaMark",
  "ballistaMark",
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

const INLINE_TERM_LABEL_ID_SET = new Set<GameTermId>(
  SKILL_CARD_INLINE_TERM_LABEL_IDS,
);
const STATUS_CHIP_TERM_ID_SET = new Set<GameTermId>(
  SKILL_CARD_STATUS_CHIP_TERM_IDS,
);

/** State chip names must not appear as inline term labels in skill card body. */
export const SKILL_CARD_BODY_TERM_EXCLUDE_IDS: ReadonlySet<GameTermId> =
  STATUS_CHIP_TERM_ID_SET;

export const SKILL_CARD_BODY_TERM_INCLUDE_IDS: ReadonlySet<GameTermId> =
  INLINE_TERM_LABEL_ID_SET;

export function isSkillCardInlineTermLabelId(
  termId: GameTermId,
): termId is SkillCardInlineTermLabelId {
  return INLINE_TERM_LABEL_ID_SET.has(termId);
}

export function isSkillCardStatusChipTermId(
  termId: GameTermId,
): termId is SkillCardStatusChipTermId {
  return STATUS_CHIP_TERM_ID_SET.has(termId);
}

/** @deprecated Use isSkillCardInlineTermLabelId */
export function isSkillCardTagTermId(
  termId: GameTermId,
): termId is SkillCardInlineTermLabelId {
  return isSkillCardInlineTermLabelId(termId);
}

/** @deprecated Use SKILL_CARD_INLINE_TERM_LABEL_IDS */
export const SKILL_CARD_TAG_TERM_IDS = SKILL_CARD_INLINE_TERM_LABEL_IDS;

export type SkillCardTagTermId = SkillCardInlineTermLabelId;
