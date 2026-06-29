import type { ActiveSkillDef, PassiveSkillDef, TargetShape } from "../battle/types.ts";
import {
  isSkillCardEffectList,
  type SkillCardEffectLine,
  type SkillCardLines,
  type SkillCardListItem,
} from "./formatSkillText.ts";
import type { GameTermId, GameTermLocale } from "./gameTermGlossary.ts";
import {
  resolveGameTermTitle,
  resolveGameTermTooltip,
  resolveStatusDefinition,
} from "./gameTermGlossary.ts";
import { segmentTextByGameTerms } from "./annotateGameTerms.ts";
import {
  isSkillCardStatusChipTermId,
  isSkillCardTagTermId,
  SKILL_CARD_STATUS_CHIP_TERM_IDS,
} from "./skillCardDisplayRules.ts";

const MAX_HEADLINE_LINES = 3;

export type SkillCardStatusChip = {
  termId: GameTermId;
  title: string;
  summary: string;
};

export type SkillCardTag = {
  termId?: GameTermId;
  label: string;
};

export type SkillCardDisplay = {
  metaLine: string;
  headlineLines: string[];
  statusChips: SkillCardStatusChip[];
  tags: SkillCardTag[];
};

function isActiveSkillDef(
  def: ActiveSkillDef | PassiveSkillDef
): def is ActiveSkillDef {
  return "effect" in def && Array.isArray(def.effect);
}

function dedupeTags(tags: SkillCardTag[]): SkillCardTag[] {
  const seen = new Set<string>();
  const out: SkillCardTag[] = [];
  for (const tag of tags) {
    const key = tag.label;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}

function resolveTermIdFromListItemText(
  text: string,
  locale: GameTermLocale
): GameTermId | undefined {
  const prefix = text.split(/[：:]/)[0]?.trim();
  if (prefix) {
    for (const termId of SKILL_CARD_STATUS_CHIP_TERM_IDS) {
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

function buildChipSummary(
  item: SkillCardListItem,
  locale: GameTermLocale
): string {
  const parts: string[] = [];
  const text = item.text;

  if (locale === "en") {
    if (/per second|each second/i.test(text)) parts.push("DoT");
    if (/strong/i.test(text) || /35%/.test(text)) parts.push("Strong DoT");
  } else {
    if (text.includes("毎秒")) parts.push("DoT");
    if (text.includes("35%")) parts.push("強DoT");
  }

  const duration = text.match(/(\d+(?:\.\d+)?)\s*(?:秒|s)\b/i);
  if (duration) {
    parts.push(`${duration[1]}s`);
  } else if (text.includes("無期限") || /indefinite/i.test(text)) {
    parts.push("∞");
  }

  for (const detail of item.details ?? []) {
    const maxStacks = detail.match(
      /(?:最大スタック数|Max stacks?)[：:]?\s*(\d+)/i
    );
    if (maxStacks) {
      parts.push(`Max ${maxStacks[1]}`);
      continue;
    }
    if (
      detail.includes("被ダメージ") ||
      detail.toLowerCase().includes("damage taken")
    ) {
      parts.push(locale === "ja" ? "魔法被ダメ増加" : "Magic taken+");
      continue;
    }
    if (
      detail.includes("熾火") ||
      detail.toLowerCase().includes("blazing flame")
    ) {
      parts.push(locale === "ja" ? "→熾火" : "→Blazing");
    }
  }

  return parts.join(" / ");
}

function listItemToStatusChip(
  item: SkillCardListItem,
  locale: GameTermLocale
): SkillCardStatusChip | null {
  const termId = resolveTermIdFromListItemText(item.text, locale);
  if (!termId || !isSkillCardStatusChipTermId(termId)) return null;
  const summary = buildChipSummary(item, locale);
  return {
    termId,
    title: resolveGameTermTitle(termId, locale),
    summary,
  };
}

function multiLockTagLabel(hitCount: string, locale: GameTermLocale): string {
  return locale === "ja"
    ? `マルチロック${hitCount}`
    : `Multi-Lock ${hitCount}`;
}

function resolveEffectTargetShape(
  effect: ActiveSkillDef["effect"][number],
  def: ActiveSkillDef
): TargetShape {
  return effect.targetShape ?? def.targetShape ?? "single";
}

function extractEffectTags(
  def: ActiveSkillDef,
  locale: GameTermLocale
): SkillCardTag[] {
  const tags: SkillCardTag[] = [];
  const seen = new Set<GameTermId>();
  const defShape = def.targetShape ?? "single";

  const pushTag = (termId: GameTermId, label: string) => {
    if (!isSkillCardTagTermId(termId) || seen.has(termId)) return;
    seen.add(termId);
    tags.push({ termId, label });
  };

  if (defShape === "aoe") {
    pushTag("aoe", resolveGameTermTitle("aoe", locale));
  }

  for (const effect of def.effect) {
    const shape = resolveEffectTargetShape(effect, def);
    const hitCount = effect.hitCount ?? def.hitCount ?? 1;

    if (shape === "multiLock" && hitCount > 1) {
      pushTag("multiLock", multiLockTagLabel(String(hitCount), locale));
    }
    if (shape === "aoe") {
      pushTag("aoe", resolveGameTermTitle("aoe", locale));
    }
    if (shape === "pierce") {
      pushTag("pierce", resolveGameTermTitle("pierce", locale));
    }
  }

  return tags;
}

export function resolveSkillCardDisplay(
  lines: SkillCardLines,
  def: ActiveSkillDef | PassiveSkillDef | undefined,
  locale: GameTermLocale
): SkillCardDisplay {
  const headlineLines: string[] = [];
  const statusChips: SkillCardStatusChip[] = [];
  const tags: SkillCardTag[] = [];

  for (const line of lines.effectLines) {
    if (isSkillCardEffectList(line)) {
      for (const item of line.items) {
        const chip = listItemToStatusChip(item, locale);
        if (chip) {
          statusChips.push(chip);
          continue;
        }
        if (headlineLines.length < MAX_HEADLINE_LINES) {
          headlineLines.push(item.text);
        }
      }
      continue;
    }

    if (headlineLines.length >= MAX_HEADLINE_LINES) continue;
    headlineLines.push(line);
  }

  if (def && isActiveSkillDef(def)) {
    tags.push(...extractEffectTags(def, locale));
  }

  return {
    metaLine: lines.metaLine,
    headlineLines,
    statusChips,
    tags: dedupeTags(tags),
  };
}

export function resolveStatusChipTooltip(
  chip: SkillCardStatusChip,
  locale: GameTermLocale
): { title: string; body: string } {
  const body = resolveStatusDefinition(chip.termId, locale);
  return {
    title: chip.title,
    body: body ?? "",
  };
}

export function resolveTagTooltip(
  tag: SkillCardTag,
  locale: GameTermLocale
): { title: string; body: string } | null {
  if (!tag.termId) return null;
  const body = resolveGameTermTooltip(tag.termId, locale);
  if (!body) return null;
  return {
    title: resolveGameTermTitle(tag.termId, locale),
    body,
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
