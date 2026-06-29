import type { DamageType } from "../battle/types.ts";
import type { TargetStat } from "../battle/data/gameDataSchema.ts";
import {
  resolveGameTermTitle,
  resolveStatusEffectStatDisplayName,
  type GameTermId,
} from "./gameTermGlossary.ts";
import { getSkillTextLocale } from "./skillTextLocale.ts";
import type { StatusEffectStat } from "../battle/types.ts";

function L() {
  return getSkillTextLocale();
}

export function skillStat(stat: StatusEffectStat): string {
  return resolveStatusEffectStatDisplayName(stat, L());
}

export function skillTerm(id: GameTermId): string {
  return resolveGameTermTitle(id, L());
}

const TARGET_STAT_EN: Record<TargetStat, string> = {
  hp: "HP",
  maxHp: "max HP",
  atk: "ATK",
  def: "DEF",
  reg: "REG",
};

export function skillTargetStat(stat: TargetStat): string {
  if (L() === "en") {
    return TARGET_STAT_EN[stat] ?? stat;
  }
  const ja: Record<TargetStat, string> = {
    hp: "HP",
    maxHp: "最大HP",
    atk: "ATK",
    def: "DEF",
    reg: "REG",
  };
  return ja[stat] ?? stat;
}

function damageTypeWord(damageType?: DamageType): string {
  if (!damageType) return "";
  return damageType === "physical" ? skillTextDamagePhysical() : skillTextDamageMagic();
}

function skillTextDamagePhysical(): string {
  return L() === "en" ? "physical" : "物理";
}

function skillTextDamageMagic(): string {
  return L() === "en" ? "magic" : "魔法";
}

export function phraseAtkBasedDamage(
  pct: string,
  damageType?: DamageType,
): string {
  if (L() === "en") {
    const typePart = damageType ? ` ${damageTypeWord(damageType)}` : "";
    return `Deals ${pct} ${skillStat("atk")} as${typePart} damage`;
  }
  const dmgLabel = damageType
    ? `${damageTypeWord(damageType)}ダメージ`
    : "ダメージ";
  return `攻撃力の${pct}の${dmgLabel}を与える`;
}

export function phraseMultiHitDamage(hitCount: number, sentence: string): string {
  if (L() === "en") {
    return `${hitCount} hits: ${sentence}`;
  }
  return `${hitCount}回連続で${sentence}`;
}

export function phraseAtkBasedHeal(
  pct: string,
  scope: "ally" | "allAllies",
): string {
  if (L() === "en") {
    if (scope === "allAllies") {
      return `Heals all allies for ${pct} of ${skillStat("atk")}`;
    }
    return `Heals an ally for ${pct} of ${skillStat("atk")}`;
  }
  if (scope === "allAllies") {
    return `味方全体のHPを攻撃力の${pct}で回復`;
  }
  return `味方のHPを攻撃力の${pct}で回復`;
}

export function phraseAtkBasedBarrier(
  pct: string,
  stack?: boolean,
): string {
  const stackSuffix = stack
    ? L() === "en"
      ? " (stacking)"
      : "（加算）"
    : "";
  if (L() === "en") {
    return `Barrier equal to ${pct} of ${skillStat("atk")}${stackSuffix}`;
  }
  return `攻撃力の${pct}のバリア${stackSuffix}`;
}

export function phraseMultiLockPrefix(
  hitCount: number,
  side: "ally" | "enemy",
): string {
  if (L() === "en") {
    const noun = side === "ally" ? "allies" : "enemies";
    return `Multi-Locks ${hitCount} ${noun} and `;
  }
  if (side === "ally") {
    return `味方${hitCount}体をマルチロックして`;
  }
  return `敵${hitCount}体をマルチロックして`;
}

export function phraseChargesAvailable(count: number): string {
  if (L() === "en") {
    return `${count} charge${count === 1 ? "" : "s"} available`;
  }
  return `${count}回チャージ可能`;
}

export function phraseAoeAuraIntro(): string {
  return L() === "en"
    ? "Grants the following effects to nearby allies:"
    : "周囲に以下の効果を付与する";
}

export function phraseScopeAllAllies(): string {
  return L() === "en" ? "All allies" : "味方全体";
}

export function phraseScopeSelfOrigin(radius?: number): string {
  if (L() === "en") {
    return radius !== undefined
      ? `Self-origin ±${radius}px: `
      : "Self-origin: ";
  }
  return radius !== undefined ? `自身起点±${radius}px：` : "自身起点：";
}

export function phraseSurroundingPrefix(): string {
  return L() === "en" ? "Nearby allies: " : "周囲の";
}

export function phraseSelfPossessivePrefix(): string {
  return L() === "en" ? "Self: " : "自身の";
}

export function phraseBlockRate(): string {
  return L() === "en" ? "Block rate" : "ブロック率";
}

export function phraseTargetLowestHpRatioEnemy(): string {
  return L() === "en"
    ? "Prioritizes the enemy with the lowest HP ratio"
    : "最もHP割合が低い敵を優先して攻撃する";
}

export function phraseTargetHighestStatEnemy(statLabel: string): string {
  return L() === "en"
    ? `Prioritizes the enemy with the highest ${statLabel}`
    : `最も${statLabel}が高い敵を優先して攻撃する`;
}

export function phraseTargetRangedEnemy(): string {
  return L() === "en"
    ? "Prioritizes ranged attackers"
    : "遠隔攻撃の敵を優先して攻撃する";
}

export function phraseDefenseIgnorePercent(pct: string): string {
  return L() === "en"
    ? `On attack, ignores ${pct} of target ${skillStat("def")}`
    : `攻撃時、対象の防御力を${pct}無視する`;
}

export function phraseDefenseIgnoreRegPercent(pct: string): string {
  return L() === "en"
    ? `On attack, ignores ${pct} of target ${skillStat("reg")}`
    : `攻撃時、対象の${skillStat("reg")}を${pct}無視する`;
}

export function phraseEvasionBuff(pct: string): string {
  return L() === "en" ? `Evasion +${pct}` : `回避 +${pct}`;
}

export function phraseBlockChance(pct: string): string {
  return L() === "en" ? `Block ${pct}` : `ブロック ${pct}`;
}

export function phraseSurroundingBlockRateBuff(pct: string): string {
  return `${phraseSurroundingPrefix()}${phraseBlockRate()}+${pct}`;
}

export function phraseMagicBlockEnable(): string {
  return L() === "en"
    ? "Enables magic block"
    : "魔法ブロックを可能にする";
}

export function phraseFireConditionTargetHp(
  pct: number,
  compare: "gte" | "lte",
): string {
  if (L() === "en") {
    const op = compare === "gte" ? "≥" : "≤";
    return `Target HP ${op}${pct}%`;
  }
  return compare === "gte"
    ? `対象のHPが${pct}%以上`
    : `対象のHPが${pct}%以下`;
}

export function phraseFireConditionSelfHp(
  pct: number,
  compare: "gte" | "lte",
): string {
  if (L() === "en") {
    const op = compare === "gte" ? "≥" : "≤";
    return `Self HP ${op}${pct}%`;
  }
  return compare === "gte"
    ? `自身のHPが${pct}%以上`
    : `自身のHPが${pct}%以下`;
}

export function phraseDamageReductionRate(pct: string): string {
  if (L() === "en") {
    return `${pct} ${skillTerm("damageReduction")}`;
  }
  return `${skillTerm("damageReduction")}${pct}`;
}

export function phraseSurroundingDamageReduction(pct: string): string {
  return `${phraseSurroundingPrefix()}${phraseDamageReductionRate(pct)}`;
}

export function phraseSelfDamageReduction(pct: string): string {
  return `${phraseSelfPossessivePrefix()}${phraseDamageReductionRate(pct)}`;
}

export function phraseHealSuffix(): string {
  return L() === "en" ? " heal" : "回復";
}

export function phraseFlatHeal(amount: string): string {
  return L() === "en" ? `Heals ${amount}` : `${amount}回復`;
}
