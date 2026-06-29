import type { ActiveSkillDef, PassiveSkillDef } from "../battle/types.ts";
import {
  isSkillCardEffectList,
  type SkillCardEffectLine,
  type SkillCardLines,
  type SkillCardListItem,
} from "./formatSkillText.ts";
import type { GameTermId, GameTermLocale } from "./gameTermGlossary.ts";
import {
  resolveGameTermDescription,
  resolveGameTermTitle,
  resolveGameTermTooltip,
} from "./gameTermGlossary.ts";
import { segmentTextByGameTerms } from "./annotateGameTerms.ts";

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
  for (const segment of segmentTextByGameTerms(text, locale)) {
    if (segment.kind === "term") return segment.termId;
  }
  const prefix = text.split(/[：:]/)[0]?.trim();
  if (!prefix) return undefined;
  for (const segment of segmentTextByGameTerms(prefix, locale)) {
    if (segment.kind === "term") return segment.termId;
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
    }
  }

  return parts.join(" / ");
}

function listItemToStatusChip(
  item: SkillCardListItem,
  locale: GameTermLocale
): SkillCardStatusChip | null {
  const termId = resolveTermIdFromListItemText(item.text, locale);
  if (!termId) return null;
  const summary = buildChipSummary(item, locale);
  return {
    termId,
    title: resolveGameTermTitle(termId, locale),
    summary,
  };
}

function parseHeadlineWithTags(
  line: string,
  locale: GameTermLocale
): { headline: string; tags: SkillCardTag[] } {
  const tags: SkillCardTag[] = [];

  if (locale === "en") {
    const multiLock = line.match(/^Multi-Locks (\d+) (allies|enemies) and (.+)$/i);
    if (multiLock) {
      tags.push({ termId: "multiLock", label: `Multi-Lock ${multiLock[1]}` });
      const headline = multiLock[3]!.trim();
      if (/magic/i.test(headline)) {
        tags.push({ label: "Magic damage" });
      }
      return { headline, tags };
    }
  } else {
    const multiLock =
      line.match(/^味方(\d+)体をマルチロックして(.+)$/) ??
      line.match(/^敵(\d+)体をマルチロックして(.+)$/);
    if (multiLock) {
      tags.push({ termId: "multiLock", label: `マルチロック ${multiLock[1]}` });
      const headline = multiLock[2]!.trim();
      if (headline.includes("魔法")) {
        tags.push({ label: "魔法ダメージ" });
      }
      return { headline, tags };
    }
  }

  if (
    line.includes("魔法ダメージ") ||
    line.toLowerCase().includes("magic damage")
  ) {
    tags.push({
      label: locale === "ja" ? "魔法ダメージ" : "Magic damage",
    });
  }

  return { headline: line, tags };
}

function extractEffectTags(
  def: ActiveSkillDef,
  locale: GameTermLocale
): SkillCardTag[] {
  const tags: SkillCardTag[] = [];
  for (const effect of def.effect) {
    const hitCount = effect.hitCount ?? 1;
    if (effect.targetShape === "multiLock" && hitCount > 1) {
      tags.push({
        termId: "multiLock",
        label:
          locale === "ja"
            ? `マルチロック ${hitCount}`
            : `Multi-Lock ${hitCount}`,
      });
    }
    if (effect.type === "damage" && effect.damageType === "magic") {
      tags.push({
        label: locale === "ja" ? "魔法ダメージ" : "Magic damage",
      });
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
        if (chip) statusChips.push(chip);
      }
      continue;
    }

    if (headlineLines.length >= MAX_HEADLINE_LINES) continue;
    const parsed = parseHeadlineWithTags(line, locale);
    if (parsed.headline.length > 0) {
      headlineLines.push(parsed.headline);
    }
    tags.push(...parsed.tags);
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
  const description = resolveGameTermDescription(chip.termId, locale);
  return {
    title: chip.title,
    body: description ?? resolveGameTermTooltip(chip.termId, locale),
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
