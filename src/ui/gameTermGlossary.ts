import type { StatusEffectStat } from "../battle/types.ts";
import {
  sortBadgesForCompactView,
  type StatusDisplayCategory,
  type StatusEffectBadgeDisplay,
} from "../battle/statusEffectDisplay.ts";
import { getStatusIconUrl } from "../render/StatusIconRegistry.ts";
import { GAME_TERM_EN_SUPPLEMENT } from "./gameTermGlossaryEn.ts";

/** Display locale for game terms (`ja` + `en` in Phase 4e). */
export type GameTermLocale = "ja" | "en";

export type GameTermId =
  | "barrier"
  | "wardBarrier"
  | "windMark"
  | "earthMark"
  | "arenaMark"
  | "block"
  | "magicBlock"
  | "basicAttack"
  | "charge"
  | "stun"
  | "dot"
  | "damageReduction"
  | "damageIncrease"
  | "counter"
  | "evasion"
  | "invulnerable"
  | "moveLock"
  | "skillLock"
  | "multiLock"
  | "aoe"
  | "surrounding"
  | "fieldLocation"
  | "pierce"
  | "dotCompress"
  | "hot"
  | "poison"
  | "bleed"
  | "healReservation"
  | "blockResonance"
  | "blockResonanceStance"
  | "herbalPotency"
  | "herbalPotencyConstitution"
  | "hp"
  | "atk"
  | "def"
  | "reg"
  | "attackSpeed"
  | "damageDelay"
  | "basicAttackTransform"
  | "lastStandGuts"
  | "arenaDominance"
  | "duelistPride"
  | "seedFlame"
  | "blazingFlame"
  | "ballistaMark"
  | "allyAttackFollowUp"
  | "poisonWeapon"
  | "nextOutgoingDamage"
  | "knockback"
  | "defenseIgnoreDef"
  | "damageReductionIgnore"
  | "barrierPierce";

export interface GameTermEntry {
  id: GameTermId;
  title: Record<GameTermLocale, string>;
  /**
   * 用語パネル・HUD バッジクリック時の本文（正本）。
   * Inline Term Label のホバーは `resolveGameTermTooltip` がここから先頭 2 行を流用する。
   */
  description?: Record<GameTermLocale, string>;
  /**
   * Inline Term Label ホバー専用の短文化（2〜3 行）。
   * パネル本文より短く書くときだけ指定する。同文なら省略（`description` に一本化）。
   */
  tooltip?: Record<GameTermLocale, string>;
  /** 状態辞典（状態チップホバー）。状態定義のみ。固有状態の正本。 */
  statusDefinition?: Record<GameTermLocale, string>;
  /** 本文中でリンク化する表記。省略時はスキル説明ではリンク化しない（HUD バッジクリック等で補足）。 */
  aliases?: Record<GameTermLocale, readonly string[]>;
  statusCategory?: StatusDisplayCategory;
  /** 用語パネル見出しアイコン用。HUD カテゴリと別 ID の用語が同じ PNG を使うときに指定。 */
  statusIconCategory?: StatusDisplayCategory;
}

type GameTermEntrySource = Omit<
  GameTermEntry,
  "title" | "description" | "tooltip" | "statusDefinition" | "aliases"
> & {
  title: { ja: string };
  description?: { ja: string };
  tooltip?: { ja: string };
  statusDefinition?: { ja: string };
  aliases?: { ja: readonly string[] };
};

const GAME_TERM_ENTRIES_BASE: readonly GameTermEntrySource[] = [
  {
    id: "barrier",
    title: { ja: "バリア" },
    description: {
      ja: "HPより先にダメージを受け止める値。\nすでにバリアがある場合は、現在値と付与量のうち大きい方を残す。\nHUDではHPバーに重なる明るいバーとして表示される。",
    },
    aliases: { ja: ["バリア"] },
  },
  {
    id: "wardBarrier",
    title: { ja: "障壁" },
    description: {
      ja: "次に受ける攻撃の被ダメージを90%軽減する結界師固有の状態。\nバリアより先に効果を発揮し、攻撃1回につき1つ消費される。",
    },
    aliases: { ja: ["障壁"] },
    statusCategory: "wardBarrier",
  },
  {
    id: "windMark",
    title: { ja: "乾印" },
    description: {
      ja: "次に同じ属性の攻撃を受けると起爆する、印術師固有の風属性の印。\n多数戦向けで、起爆すると範囲攻撃を発生させる。\n効果時間中に起爆しなかった場合、ダメージを与えず周囲の対象へ移動する。",
    },
    aliases: { ja: ["乾印"] },
    statusCategory: "windMark",
  },
  {
    id: "earthMark",
    title: { ja: "坤印" },
    description: {
      ja: "次に同じ属性の攻撃を受けると起爆する、印術師固有の地属性の印。\n少数戦向けて、起爆すると単体攻撃を発生させる。\n効果時間中に起爆しなかった場合、ダメージを与えず同じ対象の坤印スタックを増加させる。",
    },
    aliases: { ja: ["坤印"] },
    statusCategory: "earthMark",
  },
  {
    id: "arenaMark",
    title: { ja: "闘士の指名" },
    description: {
      ja: "闘技士が付与するデバフ。\n指名対象への被ダメージ増加や、非指名対象への被ダメージ減少の効果を持つ。",
    },
    aliases: { ja: ["闘士の指名"] },
    statusCategory: "arenaMark",
  },
  {
    id: "block",
    title: { ja: "ブロック" },
    description: {
      ja: "物理攻撃を受けた時、一定確率で発動する軽減効果。\n発動時、25%＋攻撃力1につき0.1%軽減する。上限は100%。\nブロック率は加算で積み上がる。",
    },
    aliases: { ja: ["ブロック"] },
    statusCategory: "block",
  },
  {
    id: "magicBlock",
    title: { ja: "魔法ブロック" },
    description: {
      ja: "魔法攻撃を受けた時、一定確率で発動する護法士固有の軽減効果。\n発動時、ダメージを15%軽減する。\n魔法ブロック率は加算で積み上がる。通常のブロックとは別判定。",
    },
    aliases: { ja: ["魔法ブロック"] },
    statusIconCategory: "block",
  },
  {
    id: "basicAttack",
    title: { ja: "通常攻撃" },
    description: {
      ja: "スキルを使用していない際に行う基本的な攻撃。攻撃頻度はキャラクターの攻撃速度を元に決定される。",
    },
    aliases: { ja: ["通常攻撃"] },
  },
  {
    id: "charge",
    title: { ja: "チャージ可能 N" },
    description: {
      ja: "スキルを保持できる機能（N = 最大保持数）。\n再使用準備が整っても発動条件を満たさない場合、使用可能回数を蓄えて次の再使用ゲージを進められる。\n発動時は、蓄えた使用可能回数から優先して消費する。",
    },
    aliases: { ja: ["チャージ可能"] },
  },
  {
    id: "stun",
    title: { ja: "スタン N" },
    description: {
      ja: "一定時間、行動できなくなる状態（N = 効果時間）。\nスキル発動・通常攻撃・移動を行わない。通常攻撃の再使用時間はリセットされ、スキルの再使用時間は進行する。",
    },
    aliases: { ja: ["スタン"] },
    statusCategory: "stun",
  },
  {
    id: "dot",
    title: { ja: "DoT" },
    description: {
      ja: "効果時間中毎秒ダメージを与え続ける状態効果の総称。",
    },
    aliases: { ja: ["DoT"] },
    statusCategory: "dot",
  },
  {
    id: "dotCompress",
    title: { ja: "DoT圧縮" },
    description: {
      ja: "対象のDoTの残り効果時間を圧縮し、短時間にダメージを集中させる効果。",
    },
    aliases: { ja: ["DoT圧縮"] },
  },
  {
    id: "multiLock",
    title: { ja: "マルチロック N" },
    description: {
      ja: "複数の対象に効果を適用する（N = 対象数）。\n対象が不足している場合、不足分は同じ対象へ再度適用する。",
    },
    aliases: { ja: ["マルチロック"] },
  },
  {
    id: "aoe",
    title: { ja: "AoE N" },
    description: {
      ja: "対象を中心に効果を適用する（N = 半径）。",
    },
    aliases: { ja: ["AoE"] },
  },
  {
    id: "surrounding",
    title: { ja: "周囲 N" },
    description: {
      ja: "使用者を中心に効果を適用する（N = 半径）。",
    },
    aliases: { ja: ["周囲"] },
  },
  {
    id: "fieldLocation",
    title: { ja: "地点 M" },
    description: {
      ja: "戦場上の指定座標を中心に効果を適用する（N = 半径）。",
    },
    aliases: { ja: ["地点"] },
  },
  {
    id: "pierce",
    title: { ja: "貫通 N" },
    description: {
      ja: "使用者起点として効果を適用する（N = 射程）。",
    },
    aliases: { ja: ["貫通"] },
  },
  {
    id: "skillLock",
    title: { ja: "硬直" },
    tooltip: {
      ja: "硬直中は行動できず、スキルの再使用時間も停止する。\n移動停止ありの効果では、移動も行わない。",
    },
    aliases: { ja: ["硬直"] },
  },
  {
    id: "damageReduction",
    title: { ja: "ダメージ軽減" },
    statusCategory: "damageReduction",
  },
  {
    id: "damageIncrease",
    title: { ja: "被ダメージ増加" },
    statusCategory: "damageIncrease",
  },
  {
    id: "counter",
    title: { ja: "反撃" },
    tooltip: {
      ja: "攻撃を受けた際、攻撃者へスキルで設定した効果を返す。",
    },
    aliases: { ja: ["反撃"] },
    statusCategory: "counter",
  },
  {
    id: "evasion",
    title: { ja: "回避" },
    description: {
      ja: "攻撃を受けた時、一定確率で発動する攻撃無効効果。\n発動時、その攻撃は当たらなかったことになる。",
    },
    aliases: { ja: ["回避"] },
    statusCategory: "evasion",
  },
  {
    id: "invulnerable",
    title: { ja: "無敵" },
    description: {
      ja: "あらゆるダメージとデバフ付与を無効化する状態。",
    },
    aliases: { ja: ["無敵"] },
    statusCategory: "invulnerable",
  },
  {
    id: "moveLock",
    title: { ja: "移動停止" },
    description: {
      ja: "スキル効果以外の移動を停止する効果。",
    },
    aliases: { ja: ["移動停止"] },
    statusCategory: "moveLock",
  },
  {
    id: "hot",
    title: { ja: "HoT" },
    description: {
      ja: "継続回復（Heal over Time）。毎秒一定量のHPを回復し続ける状態効果。",
    },
    aliases: { ja: ["HoT"] },
    statusCategory: "hot",
  },
  {
    id: "poison",
    title: { ja: "毒" },
    description: {
      ja: "DoTの一種。内容はスキルごとに異なる。",
    },
    aliases: { ja: ["毒"] },
    statusCategory: "poison",
  },
  {
    id: "bleed",
    title: { ja: "出血" },
    description: {
      ja: "DoTの一種。内容はスキルごとに異なる。",
    },
    aliases: { ja: ["出血"] },
    statusCategory: "bleed",
  },
  {
    id: "knockback",
    title: { ja: "ノックバック N" },
    description: {
      ja: "対象を距離Nだけ後方に移動させ、その後移動を1.5秒止める効果。",
    },
    aliases: { ja: ["ノックバック"] },
  },
  {
    id: "defenseIgnoreDef",
    title: { ja: "防御力無視" },
    description: {
      ja: "攻撃時、対象の防御力を一定割合無視する。",
    },
    aliases: { ja: ["防御力無視"] },
  },
  {
    id: "damageReductionIgnore",
    title: { ja: "軽減無視" },
    description: {
      ja: "対象のダメージ軽減効果を無視してダメージを与える。",
    },
    aliases: { ja: ["軽減無視"] },
  },
  {
    id: "barrierPierce",
    title: { ja: "バリア無視" },
    description: {
      ja: "対象のバリアを無視してHPへダメージを与える。",
    },
    aliases: { ja: ["バリア無視"] },
  },
  {
    id: "healReservation",
    title: { ja: "治癒の残響" },
    description: {
      ja: "ダメージを受けた後に HP が一定以下なら、このバフを1つ消費し即時回復を行う。",
    },
    aliases: { ja: ["治癒の残響"] },
    statusCategory: "healReservation",
  },
  {
    id: "blockResonance",
    title: { ja: "防壁" },
    description: {
      ja: "鉄衛士の迎撃態勢でブロック成功時に蓄積するバフ。\n1スタックごとにダメージ軽減効果を持つ。",
    },
    aliases: { ja: ["防壁"] },
    statusCategory: "blockResonance",
  },
  {
    id: "blockResonanceStance",
    title: { ja: "城塞の構え" },
    description: {
      ja: "「防壁」を全消費して付与されるバフ。この効果中のブロック成功で周囲の敵へダメージとノックバックを与える。",
    },
    aliases: { ja: ["城塞の構え"] },
    statusCategory: "blockResonanceStance",
  },
  {
    id: "herbalPotency",
    title: { ja: "薬効" },
    description: {
      ja: "薬草師の薬効浸潤で蓄積するバフ。薬草師由来の HoT 維持中に一定時間ごとに増加し、スタックごとにその味方への HoT 回復量を加算する。",
    },
    aliases: { ja: ["薬効"] },
    statusCategory: "herbalPotency",
  },
  {
    id: "herbalPotencyConstitution",
    title: { ja: "頑健" },
    description: {
      ja: "薬効 stack が閾値に達すると付与される maxHp 乗算バフ。到達した体質段階は薬効顕現（stack 消費）後も維持される。",
    },
    aliases: { ja: ["頑健"] },
  },
  {
    id: "hp",
    title: { ja: "HP" },
    statusCategory: "hp",
  },
  {
    id: "atk",
    title: { ja: "攻撃力" },
    statusCategory: "atk",
  },
  {
    id: "def",
    title: { ja: "防御力" },
    statusCategory: "def",
  },
  {
    id: "reg",
    title: { ja: "魔法耐性" },
    statusCategory: "reg",
  },
  {
    id: "attackSpeed",
    title: { ja: "攻撃速度" },
    statusCategory: "attackSpeed",
  },
  {
    id: "damageDelay",
    title: { ja: "ダメージ遅延" },
    description: {
      ja: "被ダメの一部を後払いプールへ送る効果。総ダメージ量は変わらず、持続中に毎秒分けて適用される。軽減ではない。",
    },
    aliases: { ja: ["ダメージ遅延"] },
    statusCategory: "damageDelay",
  },
  {
    id: "basicAttackTransform",
    title: { ja: "通常攻撃変形" },
    description: {
      ja: "バフ持続中、通常攻撃の内容を変更する。複数付与時は最新 1 件のみ有効。",
    },
    aliases: { ja: ["通常攻撃変形"] },
    statusCategory: "basicAttackTransform",
  },
  {
    id: "lastStandGuts",
    title: { ja: "不屈" },
    description: {
      ja: "致死直前に発動し、HP が 1 未満にならない状態を数秒維持する。終了時に生存敵全体へ短スタンとノックバック。（Wave 1 回まで）",
    },
    aliases: { ja: ["不屈"] },
    statusCategory: "lastStandGuts",
  },
  {
    id: "arenaDominance",
    title: { ja: "闘技場の掟" },
    description: {
      ja: "最終 Wave 開始時に発動。敵単体攻撃のターゲットを闘技士へ固定し、最高 ATK 敵へ闘士の指名を付与。効果中は闘技士が味方支援を受けない。",
    },
    aliases: { ja: ["闘技場の掟"] },
    statusCategory: "arenaDominance",
  },
  {
    id: "duelistPride",
    title: { ja: "闘士の矜持" },
    description: {
      ja: "自身 HP が一定割合以上のとき、受ける即時回復・HoT tick を増幅する闘技士パッシブ。闘技場の掟より弱い自己回復補正。",
    },
    aliases: { ja: ["闘士の矜持"] },
    statusCategory: "duelistPride",
  },
  {
    id: "seedFlame",
    title: { ja: "種火" },
    statusDefinition: {
      ja: "魔法DoT。\n\n・毎秒攻撃力5%の魔法ダメージ\n・10秒持続\n・最大5スタック\n\n最大スタック時、新たに付与される代わりに「熾火」へ変化する。",
    },
    statusCategory: "seedFlame",
  },
  {
    id: "blazingFlame",
    title: { ja: "熾火" },
    statusDefinition: {
      ja: "種火から昇格する魔法DoT。\n\n・毎秒攻撃力35%の魔法ダメージ（無期限）\n・1スタックごとに魔法攻撃の被ダメージを10%増加\n・最大1スタック",
    },
    statusCategory: "blazingFlame",
  },
  {
    id: "ballistaMark",
    title: { ja: "砲撃標的" },
    statusCategory: "ballistaMark",
  },
  {
    id: "allyAttackFollowUp",
    title: { ja: "追撃状態" },
    description: {
      ja: "近傍味方の通常攻撃成功を監視し、槍術士が同ターゲットへ basic を 1 回追撃するバフ。追撃由来 basic は再帰しない。",
    },
    aliases: { ja: ["追撃状態", "追撃"] },
    statusCategory: "allyAttackFollowUp",
  },
  {
    id: "poisonWeapon",
    title: { ja: "毒の武器" },
    statusCategory: "poisonWeapon",
  },
  {
    id: "nextOutgoingDamage",
    title: { ja: "次のダメージ増加" },
    statusCategory: "nextOutgoingDamage",
  },
];

function mergeGameTermEn(entry: GameTermEntrySource): GameTermEntry {
  const en = GAME_TERM_EN_SUPPLEMENT[entry.id];
  return {
    ...entry,
    title: { ...entry.title, en: en.title },
    description:
      entry.description !== undefined
        ? {
            ...entry.description,
            ...(en.description !== undefined ? { en: en.description } : {}),
          }
        : undefined,
    tooltip:
      entry.tooltip !== undefined || en.tooltip !== undefined
        ? {
            ...(entry.tooltip ?? {}),
            ...(en.tooltip !== undefined ? { en: en.tooltip } : {}),
          }
        : undefined,
    statusDefinition:
      entry.statusDefinition !== undefined || en.statusDefinition !== undefined
        ? {
            ...(entry.statusDefinition ?? {}),
            ...(en.statusDefinition !== undefined
              ? { en: en.statusDefinition }
              : {}),
          }
        : undefined,
    aliases:
      entry.aliases !== undefined
        ? {
            ...entry.aliases,
            ...(en.aliases !== undefined ? { en: en.aliases } : {}),
          }
        : undefined,
  } as GameTermEntry;
}

export const GAME_TERM_ENTRIES: readonly GameTermEntry[] =
  GAME_TERM_ENTRIES_BASE.map(mergeGameTermEn);

const ENTRY_BY_ID = new Map<GameTermId, GameTermEntry>(
  GAME_TERM_ENTRIES.map((entry) => [entry.id, entry])
);

export function resolveGameTermTitle(
  id: GameTermId,
  locale: GameTermLocale = "ja"
): string {
  const entry = ENTRY_BY_ID.get(id);
  if (!entry) {
    throw new Error(`Missing glossary entry: ${id}`);
  }
  return entry.title[locale] ?? entry.title.ja;
}

function firstDescriptionLines(description: string, maxLines = 2): string {
  return description
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, maxLines)
    .join("\n");
}

export function resolveGameTermDescription(
  id: GameTermId,
  locale: GameTermLocale = "ja"
): string | undefined {
  const description = getGameTermEntry(id)?.description?.[locale];
  if (!description || description.trim().length === 0) return undefined;
  return description.trim();
}

export function resolveStatusDefinition(
  id: GameTermId,
  locale: GameTermLocale = "ja"
): string | undefined {
  const entry = getGameTermEntry(id);
  const statusDefinition =
    entry?.statusDefinition?.[locale] ?? entry?.statusDefinition?.ja;
  if (statusDefinition && statusDefinition.trim().length > 0) {
    return statusDefinition.trim();
  }
  return resolveGameTermDescription(id, locale);
}

export function resolveGameTermTooltip(
  id: GameTermId,
  locale: GameTermLocale = "ja"
): string {
  const entry = getGameTermEntry(id);
  if (!entry) return "";
  const tooltip = entry.tooltip?.[locale] ?? entry.tooltip?.ja;
  if (tooltip && tooltip.trim().length > 0) return tooltip.trim();
  const description = entry.description?.[locale] ?? entry.description?.ja;
  if (description && description.trim().length > 0) {
    return firstDescriptionLines(description.trim());
  }
  return entry.title[locale] ?? entry.title.ja;
}

export function getGameTermEntry(id: GameTermId): GameTermEntry | undefined {
  return ENTRY_BY_ID.get(id);
}

const STATUS_EFFECT_STAT_TERM_ID: Record<StatusEffectStat, GameTermId> = {
  hp: "hp",
  atk: "atk",
  def: "def",
  reg: "reg",
  attackSpeed: "attackSpeed",
};

/** スキル説明などでの StatusEffectStat 表示名 */
export const STATUS_EFFECT_STAT_DISPLAY_NAMES = Object.fromEntries(
  Object.entries(STATUS_EFFECT_STAT_TERM_ID).map(([stat, id]) => [
    stat,
    resolveGameTermTitle(id as GameTermId),
  ])
) as Record<StatusEffectStat, string>;

export function resolveStatusEffectStatDisplayName(
  stat: StatusEffectStat,
  locale: GameTermLocale = "ja"
): string {
  return resolveGameTermTitle(STATUS_EFFECT_STAT_TERM_ID[stat], locale);
}

const ENTRY_BY_STATUS_CATEGORY = new Map<StatusDisplayCategory, GameTermEntry>(
  GAME_TERM_ENTRIES.flatMap((entry) =>
    entry.statusCategory ? [[entry.statusCategory, entry] as const] : []
  )
);

/** HUD 状態アイコン category の表示名（エディタプレビュー・ツールチップ等） */
export const STATUS_DISPLAY_CATEGORY_LABELS = Object.fromEntries(
  [...ENTRY_BY_STATUS_CATEGORY.entries()].map(([category, entry]) => [
    category,
    entry.title.ja,
  ])
) as Record<StatusDisplayCategory, string>;

export function resolveStatusDisplayCategoryLabel(
  category: StatusDisplayCategory,
  locale: GameTermLocale = "ja"
): string {
  const entry = ENTRY_BY_STATUS_CATEGORY.get(category);
  if (!entry) {
    throw new Error(`Missing glossary entry for status category: ${category}`);
  }
  return entry.title[locale] ?? entry.title.ja;
}

export function resolveGameTermIdForStatusCategory(
  category: StatusDisplayCategory
): GameTermId | undefined {
  return ENTRY_BY_STATUS_CATEGORY.get(category)?.id;
}

export function hasGameTermDescription(
  termId: GameTermId,
  locale: GameTermLocale = "ja"
): boolean {
  const description = getGameTermEntry(termId)?.description?.[locale];
  return description !== undefined && description.length > 0;
}

export function resolveStatusBadgeGameTermId(
  badge: StatusEffectBadgeDisplay
): GameTermId | undefined {
  return resolveGameTermIdForStatusCategory(badge.category);
}

/** HUD バッジクリックで用語パネルを開けるか（辞書に `description` があるか） */
export function statusBadgeHasClickableGameTerm(
  badge: StatusEffectBadgeDisplay,
  locale: GameTermLocale = "ja"
): boolean {
  const termId = resolveStatusBadgeGameTermId(badge);
  return termId !== undefined && hasGameTermDescription(termId, locale);
}

export function resolveStatusBadgeTooltipLabel(
  badge: StatusEffectBadgeDisplay,
  locale: GameTermLocale = "ja"
): string {
  const label = resolveStatusDisplayCategoryLabel(badge.category, locale);
  if (badge.stackCount !== undefined && badge.stackCount > 1) {
    return `${label} ×${badge.stackCount}`;
  }
  return label;
}

export function resolveCompactStatusOverflowTooltipLabel(
  badges: StatusEffectBadgeDisplay[],
  visibleCount: number,
  locale: GameTermLocale = "ja"
): string {
  return sortBadgesForCompactView(badges)
    .slice(visibleCount)
    .map((badge) => resolveStatusBadgeTooltipLabel(badge, locale))
    .join(locale === "en" ? ", " : "、");
}

/** 用語パネル見出し用。HUD PNG が登録されているときのみ URL を返す。 */
export function resolveGameTermStatusIconUrl(
  entry: GameTermEntry
): string | undefined {
  const category = entry.statusCategory ?? entry.statusIconCategory;
  if (!category) return undefined;
  return getStatusIconUrl(category);
}

export function getGameTermIds(): GameTermId[] {
  return GAME_TERM_ENTRIES.map((entry) => entry.id);
}
