import type { DamageType } from "../battle/types.ts";
import type { TargetStat } from "../battle/data/gameDataSchema.ts";
import {
  resolveGameTermTitle,
  resolveStatusEffectStatDisplayName,
  type GameTermId,
} from "./gameTermGlossary.ts";
import { formatUiDistanceValue } from "./formatUiDistance.ts";
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
    atk: "攻撃力",
    def: "防御力",
    reg: "魔法耐性",
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

export function phraseMultiLockTargetPhrase(
  hitCount: number,
  side: "ally" | "enemy",
): string {
  if (L() === "en") {
    const noun = side === "ally" ? "allies" : "enemies";
    return ` to ${hitCount} ${noun}`;
  }
  const label = side === "ally" ? "味方" : "敵";
  return `${label}${hitCount}体に`;
}

export function phraseMultiLockEffectSentence(
  coreSentence: string,
  hitCount: number,
  side: "ally" | "enemy",
): string {
  const targetPhrase = phraseMultiLockTargetPhrase(hitCount, side);
  if (L() === "en") {
    return `${coreSentence}${targetPhrase}`;
  }
  return `${targetPhrase}${coreSentence}`;
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
      ? `Self-origin ±${formatUiDistanceValue(radius)}: `
      : "Self-origin: ";
  }
  return radius !== undefined
    ? `自身起点±${formatUiDistanceValue(radius)}：`
    : "自身起点：";
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
  return L() === "en" ? `Evasion +${pct}` : `回避+${pct}`;
}

export function phraseBlockRateBuff(pct: string): string {
  return `${phraseBlockRate()}+${pct}`;
}

export function phraseTimedEvasionBuff(durationSec: number, pct: string): string {
  if (L() === "en") {
    return `${durationSec}s ${phraseEvasionBuff(pct)}`;
  }
  return `${durationSec}秒間${phraseEvasionBuff(pct)}`;
}

export function phraseDamageIncreaseIfCondition(
  condition: string,
  bonusPct: string,
): string {
  if (L() === "en") {
    return `${condition}, this damage is increased by +${bonusPct}`;
  }
  return `${condition}、このダメージは+${bonusPct}される`;
}

export function phraseIfTargetHasDebuff(debuffName: string): string {
  return L() === "en"
    ? `If the target has ${debuffName}`
    : `対象に${debuffName}が付与されているなら`;
}

export function phraseIfTargetHp(
  pct: number,
  compare: "gte" | "lte",
): string {
  if (L() === "en") {
    const op = compare === "gte" ? "≥" : "≤";
    return `If target HP ${op}${pct}%`;
  }
  return compare === "gte"
    ? `対象のHPが${pct}%以上なら`
    : `対象のHPが${pct}%以下なら`;
}

export function phraseApplyDotAfterAttack(
  durationSec: number,
  pct: string,
  damageType: DamageType | undefined,
  dotName: string,
): string {
  if (L() === "en") {
    const typePart = damageType ? ` ${damageTypeWord(damageType)}` : "";
    return `Then applies ${dotName} to the attacked target, dealing ${pct} ${skillStat("atk")} as${typePart} damage every second for ${durationSec}s`;
  }
  const dmgLabel = damageType
    ? `${damageTypeWord(damageType)}ダメージ`
    : "ダメージ";
  return `その後攻撃した対象に${durationSec}秒間毎秒攻撃力の${pct}の${dmgLabel}を与える${dotName}を付与する`;
}

export function phraseMoveBehindTargetThen(sentence: string): string {
  return L() === "en"
    ? `After moving behind the target, ${sentence}`
    : `対象の背後に移動した後、${sentence}`;
}

export function phraseBasicAttackMultiHit(count: number): string {
  return L() === "en"
    ? `Basic attacks hit ${count} times in a row`
    : `通常攻撃が${count}回連続攻撃になる`;
}

export function phraseHealPotencyBonusOnLowHpAlly(
  hpPct: number,
  compare: "gte" | "lte",
  bonusPct: string,
): string {
  if (L() === "en") {
    const op = compare === "gte" ? "≥" : "≤";
    return `When healing an ally at ${op}${hpPct}% HP, heal potency +${bonusPct}`;
  }
  const suffix = compare === "gte" ? "以上" : "以下";
  return `HPが${hpPct}%${suffix}の味方を回復時、HP回復効果+${bonusPct}`;
}

export function phraseBarrierAmountBonusOnLowHpAlly(
  hpPct: number,
  compare: "gte" | "lte",
  bonusPct: string,
): string {
  if (L() === "en") {
    const op = compare === "gte" ? "≥" : "≤";
    return `When granting a barrier to an ally at ${op}${hpPct}% HP, barrier amount +${bonusPct}`;
  }
  const suffix = compare === "gte" ? "以上" : "以下";
  return `HPが${hpPct}%${suffix}の味方にバリア付与時、バリア量+${bonusPct}`;
}

export function phraseOverhealToBarrier(scalePct: string): string {
  return L() === "en"
    ? `When healing an ally, converts ${scalePct} of overheal into barrier on the target`
    : `味方を回復時、最大HPを超えた回復量の${scalePct}をバリアとして対象に付与する`;
}

export function phraseBarrierDepletionHeal(healSentence: string): string {
  return L() === "en"
    ? `When a barrier you granted fully depletes, heals the target for ${healSentence} (once per ally per wave)`
    : `味方に付与したバリアが完全に消失した時、対象を${healSentence}（味方ごとにWave1回まで）`;
}

export function phraseBarrierDepletionWardExclusion(): string {
  return L() === "en"
    ? `Does not trigger on ${skillTerm("wardBarrier")} depletion`
    : `この効果は「${skillTerm("wardBarrier")}」の消失では誘発しない`;
}

export function phraseSeedFlameStackOnHit(): string {
  return L() === "en"
    ? `Stacks ${skillTerm("seedFlame")} on the enemy for each hit from an attack skill`
    : `敵に攻撃スキルが1回命中するごとに「${skillTerm("seedFlame")}」を1スタックする`;
}

export function phraseSeedFlameDotPerStack(
  durationSec: number,
  pct: string,
): string {
  if (L() === "en") {
    return `${skillTerm("seedFlame")}: For each stack, deals ${pct} ${skillStat("atk")} as magic damage every second for ${durationSec}s`;
  }
  return `${skillTerm("seedFlame")}：1スタックごとに${durationSec}秒間毎秒攻撃力の${pct}の魔法ダメージを与える`;
}

export function phraseBlazingFlameDotPerStack(pct: string): string {
  if (L() === "en") {
    return `${skillTerm("blazingFlame")}: For each stack, deals ${pct} ${skillStat("atk")} as magic damage every second indefinitely`;
  }
  return `${skillTerm("blazingFlame")}：1スタックごとに無期限で毎秒攻撃力の${pct}の魔法ダメージを与える`;
}

export function phraseBlazingFlameMagicTakenPerStack(pct: string): string {
  return L() === "en"
    ? `Additionally, +${pct} magic damage taken per stack`
    : `さらに1スタックごとに魔法攻撃の被ダメージを${pct}増加させる`;
}

export function phraseMaxStacks(count: number): string {
  return L() === "en" ? `Max stacks: ${count}` : `最大スタック数：${count}`;
}

export function phraseSeedFlameUpgradeToBlazing(
  blazingMaxStacks: number,
): string {
  if (L() === "en") {
    return `At max stacks, applies 1 ${skillTerm("blazingFlame")}. If ${skillTerm("blazingFlame")} is capped at ${blazingMaxStacks}, Seed Flame stays at max.`;
  }
  return `最大スタック数到達時に「${skillTerm("blazingFlame")}」を1スタック付与する。熾火が上限（${blazingMaxStacks}）のときは種火は最大のまま据え置き。`;
}

export function phraseAtkBasedHealAmount(pct: string): string {
  if (L() === "en") {
    return `${pct} of ${skillStat("atk")}`;
  }
  return `攻撃力の${pct}で回復`;
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
