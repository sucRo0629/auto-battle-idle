import type { ActiveSkillDef, PassiveSkillDef } from "../battle/types.ts";
import {
  isSkillCardEffectList,
  type SkillCardEffectLine,
  type SkillCardLines,
  type SkillCardListItem,
} from "./formatSkillText.ts";
import type { GameTermId, GameTermLocale } from "./gameTermGlossary.ts";
import { resolveGameTermTitle } from "./gameTermGlossary.ts";
import { segmentTextByGameTerms } from "./annotateGameTerms.ts";
import {
  isSkillCardStatusListTermId,
  SKILL_CARD_STATUS_LIST_TERM_IDS,
} from "./skillCardDisplayRules.ts";

const MAX_HEADLINE_LINES = 3;

export type SkillCardDisplay = {
  metaLine: string;
  headlineLines: string[];
};

function resolveTermIdFromListItemText(
  text: string,
  locale: GameTermLocale
): GameTermId | undefined {
  const prefix = text.split(/[：:]/)[0]?.trim();
  if (prefix) {
    for (const termId of SKILL_CARD_STATUS_LIST_TERM_IDS) {
      if (resolveGameTermTitle(termId, locale) === prefix) {
        return termId;
      }
    }
  }

  for (const segment of segmentTextByGameTerms(text, locale)) {
    if (segment.kind === "term") return segment.termId;
  }
  if (prefix) {
    for (const segment of segmentTextByGameTerms(prefix, locale)) {
      if (segment.kind === "term") return segment.termId;
    }
  }
  return undefined;
}

function isStatusDefinitionListItem(
  item: SkillCardListItem,
  locale: GameTermLocale
): boolean {
  const termId = resolveTermIdFromListItemText(item.text, locale);
  return termId !== undefined && isSkillCardStatusListTermId(termId);
}

export function resolveSkillCardDisplay(
  lines: SkillCardLines,
  _def: ActiveSkillDef | PassiveSkillDef | undefined,
  locale: GameTermLocale
): SkillCardDisplay {
  const headlineLines: string[] = [];

  for (const line of lines.effectLines) {
    if (isSkillCardEffectList(line)) {
      for (const item of line.items) {
        if (isStatusDefinitionListItem(item, locale)) continue;
        if (headlineLines.length >= MAX_HEADLINE_LINES) continue;
        headlineLines.push(item.text);
      }
      continue;
    }

    if (headlineLines.length >= MAX_HEADLINE_LINES) continue;
    headlineLines.push(line);
  }

  return {
    metaLine: lines.metaLine,
    headlineLines,
  };
}

export function flattenHeadlineLines(lines: SkillCardEffectLine[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    if (typeof line === "string") {
      out.push(line);
      continue;
    }
    for (const item of line.items) {
      out.push(item.text);
    }
  }
  return out;
}
