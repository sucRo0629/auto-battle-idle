import type {
  ActiveSkillDef,
  PassiveSkillDef,
  ResourceAmountSpec,
  SkillEffectDef,
} from "../battle/types.ts";
import type { GameTermId, GameTermLocale } from "./gameTermGlossary.ts";
import { resolveGameTermTitle } from "./gameTermGlossary.ts";
import {
  isSkillCardStatusChipTermId,
  type SkillCardStatusChipTermId,
} from "./skillCardDisplayRules.ts";
import type { SkillCardStatusChip } from "./skillCardDisplayRules.ts";

function formatPct(scale: number): string {
  const pct = scale * 100;
  const roundedInt = Math.round(pct);
  if (Math.abs(pct - roundedInt) < 1e-9) {
    return `${roundedInt}%`;
  }
  const roundedOne = Math.round(pct * 10) / 10;
  return `${roundedOne}%`;
}

function formatAmountSummary(
  amount: ResourceAmountSpec | undefined,
  locale: GameTermLocale,
): string | undefined {
  if (!amount) return undefined;
  if (amount.kind === "atkBased") {
    const pct = formatPct(amount.atkScale ?? 1);
    return locale === "en" ? `${pct} ATK` : `攻撃力${pct}`;
  }
  if (amount.kind === "percentMaxHp") {
    const prefix =
      amount.maxHpRef === "self"
        ? locale === "en"
          ? "self max HP"
          : "自身maxHp"
        : locale === "en"
          ? "max HP"
          : "maxHp";
    return `${prefix}×${formatPct(amount.percentOfMaxHp ?? 0)}`;
  }
  if (amount.kind === "flat") {
    return locale === "en" ? String(amount.value) : String(amount.value);
  }
  return undefined;
}

function formatDurationSummary(
  sec: number | undefined,
  locale: GameTermLocale,
): string | undefined {
  if (sec === undefined || sec <= 0) return undefined;
  return locale === "en" ? `${sec}s` : `${sec}秒`;
}

function dotFlavorTermId(
  flavor: string | undefined,
): SkillCardStatusChipTermId {
  if (flavor === "bleed") return "bleed";
  if (flavor === "poison") return "poison";
  return "dot";
}

function pushChip(
  chips: SkillCardStatusChip[],
  seen: Set<GameTermId>,
  chip: SkillCardStatusChip,
): void {
  if (seen.has(chip.termId)) return;
  seen.add(chip.termId);
  chips.push(chip);
}

function chipFromEffect(
  effect: SkillEffectDef,
  locale: GameTermLocale,
): SkillCardStatusChip | null {
  switch (effect.type) {
    case "buff":
      if (effect.buffSubKind === "barrier") {
        const parts = [
          formatAmountSummary(effect.amount, locale),
          effect.barrierStack
            ? locale === "en"
              ? "stacking"
              : "加算"
            : undefined,
          formatDurationSummary(effect.buffDurationSec, locale),
        ].filter(Boolean);
        return {
          termId: "barrier",
          title: resolveGameTermTitle("barrier", locale),
          summary: parts.join(" / "),
        };
      }
      if (effect.buffSubKind === "wardBarrier") {
        const stacks = effect.stacks ?? 1;
        return {
          termId: "wardBarrier",
          title: resolveGameTermTitle("wardBarrier", locale),
          summary:
            locale === "en" ? `×${stacks}` : `${stacks}スタック`,
        };
      }
      return null;
    case "heal":
      if (effect.healSubKind === "hot") {
        const parts = [
          formatAmountSummary(effect.amount, locale),
          formatDurationSummary(effect.durationSec, locale),
        ].filter(Boolean);
        return {
          termId: "hot",
          title: resolveGameTermTitle("hot", locale),
          summary: parts.join(" / "),
        };
      }
      return null;
    case "debuff":
      if (effect.debuffSubKind === "dot") {
        const termId = dotFlavorTermId(effect.dotFlavor);
        const parts = [
          formatDurationSummary(
            effect.durationSec ?? effect.debuffDurationSec,
            locale,
          ),
          effect.amount?.kind === "atkBased"
            ? formatAmountSummary(effect.amount, locale)
            : undefined,
        ].filter(Boolean);
        return {
          termId,
          title: resolveGameTermTitle(termId, locale),
          summary: parts.join(" / "),
        };
      }
      return null;
    case "dot": {
      const termId = dotFlavorTermId(effect.dotFlavor);
      const parts = [
        formatDurationSummary(effect.durationSec, locale),
        effect.amount?.kind === "atkBased"
          ? formatAmountSummary(effect.amount, locale)
          : undefined,
      ].filter(Boolean);
      return {
        termId,
        title: resolveGameTermTitle(termId, locale),
        summary: parts.join(" / "),
      };
    }
    case "barrier": {
      const parts = [
        formatAmountSummary(effect.amount, locale),
        formatDurationSummary(effect.durationSec, locale),
      ].filter(Boolean);
      return {
        termId: "barrier",
        title: resolveGameTermTitle("barrier", locale),
        summary: parts.join(" / "),
      };
    }
    case "conditionalEffect":
      return null;
    default:
      return null;
  }
}

function walkEffects(
  effects: SkillEffectDef[],
  visit: (effect: SkillEffectDef) => void,
): void {
  for (const effect of effects) {
    visit(effect);
    if (effect.type === "conditionalEffect") {
      walkEffects(effect.thenEffects, visit);
      walkEffects(effect.elseEffects, visit);
    }
    if (effect.type === "placedField") {
      if (effect.enterEffects) walkEffects(effect.enterEffects, visit);
      if (effect.stayEffects) walkEffects(effect.stayEffects, visit);
    }
  }
}

function chipFromPassive(def: PassiveSkillDef, locale: GameTermLocale): SkillCardStatusChip[] {
  const chips: SkillCardStatusChip[] = [];
  const seen = new Set<GameTermId>();

  if (def.effect === "blockResonance") {
    const max = def.blockResonanceMaxStacks;
    pushChip(chips, seen, {
      termId: "blockResonance",
      title: resolveGameTermTitle("blockResonance", locale),
      summary:
        max !== undefined
          ? locale === "en"
            ? `Max ${max}`
            : `最大${max}`
          : "",
    });
    return chips;
  }

  if (def.effect === "buff" && def.buffSubKind === "barrier" && def.barrierAmount) {
    pushChip(chips, seen, {
      termId: "barrier",
      title: resolveGameTermTitle("barrier", locale),
      summary:
        formatAmountSummary(def.barrierAmount, locale) ??
        (locale === "en" ? "Barrier" : "バリア"),
    });
  }

  if (def.effect === "buff" && def.buffSubKind === "wardBarrier") {
    pushChip(chips, seen, {
      termId: "wardBarrier",
      title: resolveGameTermTitle("wardBarrier", locale),
      summary: locale === "en" ? "Ward" : "障壁",
    });
  }

  if (def.effect === "hot" || (def.effect === "buff" && def.buffSubKind === "hot")) {
    pushChip(chips, seen, {
      termId: "hot",
      title: resolveGameTermTitle("hot", locale),
      summary: formatDurationSummary(def.hotDurationSec, locale) ?? "HoT",
    });
  }

  if (def.effect === "herbalPotency") {
    const parts = [
      def.herbalPotencyMaxStacks !== undefined
        ? locale === "en"
          ? `Max ${def.herbalPotencyMaxStacks}`
          : `最大${def.herbalPotencyMaxStacks}`
        : undefined,
      def.hotAmount ? formatAmountSummary(def.hotAmount, locale) : undefined,
      def.herbalPotencyHotPerStackPercent !== undefined
        ? locale === "en"
          ? `+${formatPct(def.herbalPotencyHotPerStackPercent)}/stack`
          : `+${formatPct(def.herbalPotencyHotPerStackPercent)}/スタック`
        : undefined,
    ].filter(Boolean);
    pushChip(chips, seen, {
      termId: "herbalPotency",
      title: resolveGameTermTitle("herbalPotency", locale),
      summary: parts.join(" / "),
    });
  }

  if (def.effect === "allyBasicAttackDotProc") {
    const parts = [
      def.chance !== undefined ? formatPct(def.chance) : undefined,
      formatDurationSummary(def.debuffDotDurationSec, locale),
      def.debuffDotAmount
        ? formatAmountSummary(def.debuffDotAmount, locale)
        : undefined,
    ].filter(Boolean);
    pushChip(chips, seen, {
      termId: "poisonWeapon",
      title: resolveGameTermTitle("poisonWeapon", locale),
      summary: parts.join(" / "),
    });
  }

  return chips;
}

export function extractStatusChipsFromSkillDef(
  def: ActiveSkillDef | PassiveSkillDef,
  locale: GameTermLocale,
): SkillCardStatusChip[] {
  const chips: SkillCardStatusChip[] = [];
  const seen = new Set<GameTermId>();

  if ("effect" in def && Array.isArray(def.effect)) {
    walkEffects(def.effect, (effect) => {
      const chip = chipFromEffect(effect, locale);
      if (chip && isSkillCardStatusChipTermId(chip.termId)) {
        pushChip(chips, seen, chip);
      }
    });
    return chips;
  }

  return chipFromPassive(def, locale);
}

function stripWardBarrierGrantText(line: string, locale: GameTermLocale): string {
  const title = resolveGameTermTitle("wardBarrier", locale);
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return line
    .replace(new RegExp(`^${escaped}\\s*`, "i"), "")
    .replace(new RegExp(`${escaped}\\s*(?=×|x|\\d|（|\\()`, "i"), "")
    .trim();
}

function stripHotGrantText(line: string, locale: GameTermLocale): string {
  const title = resolveGameTermTitle("hot", locale);
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return line.replace(new RegExp(`${escaped}\\s*`, "gi"), "").trim();
}

function stripPoisonWeaponGrantText(line: string, locale: GameTermLocale): string {
  if (locale === "en") {
    return line.replace(/\bpoison\b/gi, "").trim();
  }
  return line.replace(/\bpoison\b/gi, "").trim();
}

function stripHerbalPotencyGrantText(
  line: string,
  locale: GameTermLocale,
): string {
  let out = stripHotGrantText(line, locale);
  const title = resolveGameTermTitle("herbalPotency", locale);
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return out.replace(new RegExp(`${escaped}(?!蓄積)`, "g"), "").trim();
}

function stripBarrierGrantText(line: string, locale: GameTermLocale): string {
  if (locale === "en") {
    return line
      .replace(/\s*\(stacking\)/gi, " (stacking)")
      .replace(/,?\s*Barrier equal to\s+[^,]+(?:\s*\(stacking\))?/gi, "")
      .replace(/Barrier equal to\s+/gi, "")
      .replace(/\s+of ATK\b/gi, " ATK")
      .replace(/\s+barrier\b/gi, "")
      .replace(/,\s*,/g, ",")
      .replace(/,\s*$/g, "")
      .trim();
  }
  return line
    .replace(/、[^、]*のバリア（加算）/g, "")
    .replace(/、[^、]*のバリア/g, "")
    .replace(/のバリア（加算）/g, "（加算）")
    .replace(/のバリア/g, "")
    .replace(/、+/g, "、")
    .replace(/^、|、$/g, "")
    .trim();
}

function stripDotGrantText(
  line: string,
  termId: SkillCardStatusChipTermId,
  locale: GameTermLocale,
): string {
  const title = resolveGameTermTitle(termId, locale);
  if (locale === "en") {
    return line
      .replace(
        new RegExp(
          `, dealing [^,]+ as(?: physical| magic)? damage every second for \\d+(?:\\.\\d+)?s`,
          "i",
        ),
        "",
      )
      .replace(new RegExp(`Then applies ${title} to the attacked target`, "i"), "Then applies to the attacked target")
      .trim();
  }
  const flavorPattern = title === "出血" || title === "毒" ? title : "DoT";
  return line
    .replace(
      new RegExp(`を与える${flavorPattern}を付与する$`),
      "を付与",
    )
    .replace(new RegExp(`${flavorPattern}を付与する$`), "付与")
    .trim();
}

export function sanitizeHeadlineLineForStatusChips(
  line: string,
  chips: SkillCardStatusChip[],
  locale: GameTermLocale,
): string {
  let out = line;
  for (const chip of chips) {
    switch (chip.termId) {
      case "barrier":
        out = stripBarrierGrantText(out, locale);
        break;
      case "wardBarrier":
        out = stripWardBarrierGrantText(out, locale);
        break;
      case "hot":
        out = stripHotGrantText(out, locale);
        break;
      case "herbalPotency":
        out = stripHerbalPotencyGrantText(out, locale);
        break;
      case "poisonWeapon":
        out = stripPoisonWeaponGrantText(out, locale);
        break;
      case "bleed":
      case "poison":
      case "dot":
        out = stripDotGrantText(out, chip.termId, locale);
        break;
      default:
        break;
    }
  }
  return out
    .replace(/\s+/g, " ")
    .replace(/ \/ \//g, " / ")
    .replace(/全体×/g, "全体 ×")
    .trim();
}

export function mergeStatusChips(
  ...groups: SkillCardStatusChip[][]
): SkillCardStatusChip[] {
  const seen = new Set<GameTermId>();
  const out: SkillCardStatusChip[] = [];
  for (const group of groups) {
    for (const chip of group) {
      if (seen.has(chip.termId)) continue;
      seen.add(chip.termId);
      out.push(chip);
    }
  }
  return out;
}
