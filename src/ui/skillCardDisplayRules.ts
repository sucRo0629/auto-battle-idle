import type { GameTermId } from "./gameTermGlossary.ts";

/**
 * Skill card display classification (party-formation-ui.md §6.4).
 *
 * - In-text term link: glossary `aliases` in body text (click tooltip)
 * - Plain Text: basic terms without glossary alias in skill card body
 */

/** Meta line — skillLock (硬直) gets an in-text term link (party-formation-ui.md §6.4). */
export const SKILL_CARD_META_LINE_TERM_IDS = [
  "skillLock",
] as const satisfies readonly GameTermId[];

export type SkillCardMetaLineTermId =
  (typeof SKILL_CARD_META_LINE_TERM_IDS)[number];

const META_LINE_TERM_ID_SET = new Set<GameTermId>(
  SKILL_CARD_META_LINE_TERM_IDS
);

export function isSkillCardMetaLineTermId(
  termId: GameTermId
): termId is SkillCardMetaLineTermId {
  return META_LINE_TERM_ID_SET.has(termId);
}

/**
 * `formatSkillCardLines` list rows whose text is a status definition (種火 / 熾火 等).
 * Omitted from skill card body; full text lives in term tooltip (`description`).
 */
export const SKILL_CARD_STATUS_LIST_TERM_IDS = [
  "barrier",
  "wardBarrier",
  "dot",
  "hot",
  "poison",
  "bleed",
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

export type SkillCardStatusListTermId =
  (typeof SKILL_CARD_STATUS_LIST_TERM_IDS)[number];

const STATUS_LIST_TERM_ID_SET = new Set<GameTermId>(
  SKILL_CARD_STATUS_LIST_TERM_IDS
);

export function isSkillCardStatusListTermId(
  termId: GameTermId
): termId is SkillCardStatusListTermId {
  return STATUS_LIST_TERM_ID_SET.has(termId);
}
