import type { StatusEffectStat } from "../battle/types.ts";
import {
  sortBadgesForCompactView,
  type StatusDisplayCategory,
  type StatusEffectBadgeDisplay,
} from "../battle/statusEffectDisplay.ts";
import { getStatusIconUrl } from "../render/StatusIconRegistry.ts";

/** v1 display locale. Shape supports future `en` etc. */
export type GameTermLocale = "ja";

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
  | "damageTaken"
  | "counter"
  | "evasion"
  | "invulnerable"
  | "moveLock"
  | "skillLock"
  | "multiLock"
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
  | "nextOutgoingDamage";

export interface GameTermEntry {
  id: GameTermId;
  title: Record<GameTermLocale, string>;
  description: Record<GameTermLocale, string>;
  aliases: Record<GameTermLocale, readonly string[]>;
  statusCategory?: StatusDisplayCategory;
  /** 用語パネル見出しアイコン用。HUD カテゴリと別 ID の用語が同じ PNG を使うときに指定。 */
  statusIconCategory?: StatusDisplayCategory;
}

/** HUD 等で表示名を持つが、スキル説明文内では用語リンクしない ID。 */
export const GAME_TERM_NO_TEXT_LINK_IDS = new Set<GameTermId>([
  "atk",
  "def",
  "reg",
  "hp",
  "attackSpeed",
  "damageReduction",
  "damageIncrease",
  "damageTaken",
]);

/** @deprecated 後方互換。`GAME_TERM_NO_TEXT_LINK_IDS` を正とする。 */
export const GAME_TERM_HUD_ONLY_STAT_IDS = GAME_TERM_NO_TEXT_LINK_IDS;

export const GAME_TERM_ENTRIES: readonly GameTermEntry[] = [
  {
    id: "barrier",
    title: { ja: "バリア" },
    description: {
      ja: "HPとは別の被ダメージを受け止める値。HPより先に消費される。HUDではHPバーに重なる明るいバーとして表示される。バリアが付与されている対象に更にバリアが付与される場合、原則付与する量が多い方のバリアで置き換えられる。",
    },
    aliases: { ja: ["バリア"] },
  },
  {
    id: "wardBarrier",
    title: { ja: "障壁" },
    description: {
      ja: "被ダメージを軽減するスタック型の防御層。バリアより先に消費される。結界師 ward 系と連動。",
    },
    aliases: { ja: ["障壁"] },
    statusCategory: "wardBarrier",
  },
  {
    id: "windMark",
    title: { ja: "乾印" },
    description: {
      ja: "印術師が付与する印（拡散側・風）。多数戦向け。overlay ID は windMark。手動起爆は範囲攻撃。自動起爆は周囲へ拡散（ダメージなし）。弩砲士・闘技士のマーク系とは別体系。",
    },
    aliases: { ja: ["乾印"] },
    statusCategory: "windMark",
  },
  {
    id: "earthMark",
    title: { ja: "坤印" },
    description: {
      ja: "印術師が付与する印（収束側・地）。少数戦向け。overlay ID は earthMark。手動起爆は単体攻撃。自動起爆は同対象へ収束し stack 増（ダメージなし）。弩砲士・闘技士のマーク系とは別体系。",
    },
    aliases: { ja: ["坤印"] },
    statusCategory: "earthMark",
  },
  {
    id: "arenaMark",
    title: { ja: "闘士の指名" },
    description: {
      ja: "闘技士が付与する指名マーク。指名対象への被ダメージ増加や、非指名対象への被ダメ減少と連動する。印（Mark）とは別体系。",
    },
    aliases: { ja: ["闘士の指名", "闘技場の指名"] },
    statusCategory: "arenaMark",
  },
  {
    id: "block",
    title: { ja: "ブロック" },
    description: {
      ja: "物理攻撃を受けた際に一定確率で発動し、被ダメージを（25%＋攻撃力1につき1%、上限100%）軽減する。ブロック率は加算で積み上がる。",
    },
    aliases: { ja: ["ブロック"] },
    statusCategory: "block",
  },
  {
    id: "magicBlock",
    title: { ja: "魔法ブロック" },
    description: {
      ja: "魔法攻撃を受けた際に一定確率で発動し、被ダメージを15%軽減する。魔法ブロック率は加算で積み上がる。物理ブロックとは別判定。",
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
    title: { ja: "チャージ" },
    description: {
      ja: "スキルを追加で使用できる回数や、再使用までの充填。スキルごとに条件が異なる。（文案仮）",
    },
    aliases: { ja: ["チャージ"] },
  },
  {
    id: "stun",
    title: { ja: "スタン" },
    description: {
      ja: "行動不能状態。スキル発動・通常攻撃・移動が停止する。",
    },
    aliases: { ja: ["スタン"] },
    statusCategory: "stun",
  },
  {
    id: "dot",
    title: { ja: "DoT" },
    description: {
      ja: "継続ダメージ（Damage over Time）の意。効果時間中毎秒ダメージを与え続ける状態効果の総称。",
    },
    aliases: { ja: ["DoT延長", "DoT収穫", "DoT"] },
    statusCategory: "dot",
  },
  {
    id: "dotCompress",
    title: { ja: "DoT圧縮" },
    description: {
      ja: "対象のDoTの残り効果時間を圧縮し、短時間にダメージを集中させる効果。圧縮対象外のDoT（熾火など）は除く。",
    },
    aliases: { ja: ["DoT圧縮"] },
  },
  {
    id: "multiLock",
    title: { ja: "マルチロック" },
    description: {
      ja: "N体に対して効果を適用する。対象が不足している場合、再度同じ対象に対して順番に効果を適用する。",
    },
    aliases: { ja: ["マルチロック"] },
  },
  {
    id: "skillLock",
    title: { ja: "硬直" },
    description: {
      ja: "スキル使用後、一定時間スキルと通常攻撃の発動を止める効果。",
    },
    aliases: { ja: ["硬直"] },
  },
  {
    id: "damageReduction",
    title: { ja: "ダメージ軽減" },
    description: {
      ja: "受けるダメージ量を減らす buff。被ダメ倍率が 1 未満の stat 効果や、パッシブ damageReduction として HUD に表示される。",
    },
    aliases: { ja: [] },
    statusCategory: "damageReduction",
  },
  {
    id: "damageIncrease",
    title: { ja: "被ダメージ増加" },
    description: {
      ja: "受けるダメージ量を増やす debuff。被ダメ倍率が 1 を超える stat 効果として HUD に表示される。",
    },
    aliases: { ja: [] },
    statusCategory: "damageIncrease",
  },
  {
    id: "damageTaken",
    title: { ja: "被ダメ" },
    description: {
      ja: "被ダメージ倍率（damageTaken）stat。倍率 < 1 はダメージ軽減、> 1 は被ダメージ増加としてスキル説明に展開する。",
    },
    aliases: { ja: [] },
  },
  {
    id: "counter",
    title: { ja: "反撃" },
    description: {
      ja: "攻撃を受けた際、設定量のダメージを攻撃者へ返す効果。",
    },
    aliases: { ja: ["反撃"] },
    statusCategory: "counter",
  },
  {
    id: "evasion",
    title: { ja: "回避" },
    description: {
      ja: "攻撃を完全に避け、被ダメージを受けない確率。",
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
      ja: "自動接近・位置移動を停止する効果。",
    },
    aliases: { ja: ["移動停止"] },
    statusCategory: "moveLock",
  },
  {
    id: "hot",
    title: { ja: "HoT" },
    description: {
      ja: "継続回復（Heal over Time）。一定間隔で HP を回復する状態効果。",
    },
    aliases: { ja: ["HoT"] },
    statusCategory: "hot",
  },
  {
    id: "poison",
    title: { ja: "毒" },
    description: {
      ja: "DoTの一種。",
    },
    aliases: { ja: ["毒蔓延", "毒"] },
    statusCategory: "poison",
  },
  {
    id: "bleed",
    title: { ja: "出血" },
    description: {
      ja: "DoTの一種。",
    },
    aliases: { ja: ["出血"] },
    statusCategory: "bleed",
  },
  {
    id: "healReservation",
    title: { ja: "ヒール予約" },
    description: {
      ja: "回復時に条件を満たすと追加バフを付与し、被ダメ後に HP が一定以下なら予約回復が発動する仕組み。",
    },
    aliases: { ja: ["ヒール予約"] },
    statusCategory: "healReservation",
  },
  {
    id: "blockResonance",
    title: { ja: "防壁" },
    description: {
      ja: "ブロック成功時にスタックが蓄積し、消費スキルで追加効果を発動するディフェンダー系の資源。",
    },
    aliases: { ja: ["ブロック共鳴", "共鳴", "防壁"] },
    statusCategory: "blockResonance",
  },
  {
    id: "blockResonanceStance",
    title: { ja: "迎撃態勢" },
    description: {
      ja: "ブロック共鳴 stack を消費して発動する迎撃バフ。態勢中の block 成功で周囲の敵へ追加ダメージとノックバックを与える。",
    },
    aliases: { ja: ["迎撃態勢", "迎撃消費"] },
    statusCategory: "blockResonanceStance",
  },
  {
    id: "herbalPotency",
    title: { ja: "薬効" },
    description: {
      ja: "薬草師の薬効浸潤で蓄積するスタック。薬草師由来 HoT 維持中に実時間で増加し、stack ごとにその味方への HoT 回復量を加算する。",
    },
    aliases: { ja: ["薬効"] },
    statusCategory: "herbalPotency",
  },
  {
    id: "herbalPotencyConstitution",
    title: { ja: "薬効体質" },
    description: {
      ja: "薬効 stack が閾値に達すると付与される maxHp 乗算バフ。到達した体質段階は薬効顕現（stack 消費）後も維持される。",
    },
    aliases: { ja: ["薬効体質"] },
  },
  {
    id: "hp",
    title: { ja: "HP" },
    description: {
      ja: "最大 HP の flat 加算または乗算バフ・debuff。HUD では HP アイコンで表示される。",
    },
    aliases: { ja: [] },
    statusCategory: "hp",
  },
  {
    id: "atk",
    title: { ja: "攻撃力" },
    description: {
      ja: "攻撃力（ATK）の flat 加算または乗算バフ・debuff。与ダメージ計算の基礎 stat。",
    },
    aliases: { ja: [] },
    statusCategory: "atk",
  },
  {
    id: "def",
    title: { ja: "防御力" },
    description: {
      ja: "物理防御（DEF）の flat 加算または乗算バフ・debuff。物理被ダメージの軽減に寄与する。",
    },
    aliases: { ja: [] },
    statusCategory: "def",
  },
  {
    id: "reg",
    title: { ja: "魔法耐性" },
    description: {
      ja: "魔法耐性（REG）の flat 加算または乗算バフ・debuff。魔法被ダメージの軽減に寄与する。",
    },
    aliases: { ja: [] },
    statusCategory: "reg",
  },
  {
    id: "attackSpeed",
    title: { ja: "攻撃速度" },
    description: {
      ja: "通常攻撃・スキルの再使用間隔に影響する攻撃速度（SPD）バフ・debuff。",
    },
    aliases: { ja: [] },
    statusCategory: "attackSpeed",
  },
  {
    id: "damageDelay",
    title: { ja: "ダメージ遅延" },
    description: {
      ja: "被ダメの一部を後払いプールへ送る効果。総ダメージ量は変わらず、持続中に分割 tick される。軽減ではない。",
    },
    aliases: { ja: ["ダメージ遅延"] },
    statusCategory: "damageDelay",
  },
  {
    id: "basicAttackTransform",
    title: { ja: "通常攻撃変形" },
    description: {
      ja: "バフ持続中のみ通常攻撃（basic）の effect を実行時に差し替え・拡張する。複数付与時は最新 1 件のみ有効。",
    },
    aliases: { ja: ["通常攻撃変形", "通常攻撃置換"] },
    statusCategory: "basicAttackTransform",
  },
  {
    id: "lastStandGuts",
    title: { ja: "不屈" },
    description: {
      ja: "致死直前に Wave 1 回発動し、HP が 1 未満にならない状態を数秒維持する（完全無敵ではない）。終了時に生存敵全体へ短スタンとノックバック。",
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
    description: {
      ja: "魔術師固有のDoT。1スタックごとに10秒間毎秒攻撃力の5%の魔法ダメージを与える。最大スタック数：5。スタック上限に達すると「熾火」に変換される。",
    },
    aliases: { ja: ["種火"] },
    statusCategory: "seedFlame",
  },
  {
    id: "blazingFlame",
    title: { ja: "熾火" },
    description: {
      ja: "魔術師固有のDoT。1スタックごとに無期限で毎秒攻撃力の35%の魔法ダメージを与える。さらに1スタックごとに魔法攻撃の被ダメージを10%増加させる。最大スタック数：1。",
    },
    aliases: { ja: ["熾火上限解除", "熾火起爆", "熾火"] },
    statusCategory: "blazingFlame",
  },
  {
    id: "ballistaMark",
    title: { ja: "砲撃標的" },
    description: {
      ja: "弩砲士が高 Max HP 敵へ付与するマーク。本人攻撃がマーク命中時、着弾半径内の他敵へ飛散ダメージを与える。",
    },
    aliases: { ja: ["砲撃標的"] },
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
    description: {
      ja: "狩猟士 P2 パッシブ。味方の物理 basic 命中成功時、確率で poison dot を付与するパーティオーラ。",
    },
    aliases: { ja: ["毒の武器"] },
    statusCategory: "poisonWeapon",
  },
  {
    id: "nextOutgoingDamage",
    title: { ja: "次のダメージ増加" },
    description: {
      ja: "次の outgoing damage 1 回に倍率を乗算して消費する武装状態。弩砲士の grantNextOutgoingDamage 等で付与される。",
    },
    aliases: { ja: ["次のダメージ増加"] },
    statusCategory: "nextOutgoingDamage",
  },
];

const ENTRY_BY_ID = new Map<GameTermId, GameTermEntry>(
  GAME_TERM_ENTRIES.map((entry) => [entry.id, entry])
);

export function resolveGameTermTitle(
  id: GameTermId,
  locale: GameTermLocale = "ja",
): string {
  const entry = ENTRY_BY_ID.get(id);
  if (!entry) {
    throw new Error(`Missing glossary entry: ${id}`);
  }
  return entry.title[locale];
}

const STATUS_EFFECT_STAT_TERM_ID: Record<StatusEffectStat, GameTermId> = {
  hp: "hp",
  atk: "atk",
  def: "def",
  reg: "reg",
  damageTaken: "damageTaken",
  attackSpeed: "attackSpeed",
};

/** スキル説明などでの StatusEffectStat 表示名 */
export const STATUS_EFFECT_STAT_DISPLAY_NAMES = Object.fromEntries(
  Object.entries(STATUS_EFFECT_STAT_TERM_ID).map(([stat, id]) => [
    stat,
    resolveGameTermTitle(id as GameTermId),
  ]),
) as Record<StatusEffectStat, string>;

export function resolveStatusEffectStatDisplayName(
  stat: StatusEffectStat,
  locale: GameTermLocale = "ja",
): string {
  return resolveGameTermTitle(STATUS_EFFECT_STAT_TERM_ID[stat], locale);
}

const ENTRY_BY_STATUS_CATEGORY = new Map<
  StatusDisplayCategory,
  GameTermEntry
>(
  GAME_TERM_ENTRIES.flatMap((entry) =>
    entry.statusCategory ? [[entry.statusCategory, entry] as const] : [],
  ),
);

/** HUD 状態アイコン category の表示名（エディタプレビュー・ツールチップ等） */
export const STATUS_DISPLAY_CATEGORY_LABELS = Object.fromEntries(
  [...ENTRY_BY_STATUS_CATEGORY.entries()].map(([category, entry]) => [
    category,
    entry.title.ja,
  ]),
) as Record<StatusDisplayCategory, string>;

export function resolveStatusDisplayCategoryLabel(
  category: StatusDisplayCategory,
  locale: GameTermLocale = "ja",
): string {
  const entry = ENTRY_BY_STATUS_CATEGORY.get(category);
  if (!entry) {
    throw new Error(`Missing glossary entry for status category: ${category}`);
  }
  return entry.title[locale];
}

export function resolveStatusBadgeTooltipLabel(
  badge: StatusEffectBadgeDisplay,
): string {
  const label = resolveStatusDisplayCategoryLabel(badge.category);
  if (badge.stackCount !== undefined && badge.stackCount > 1) {
    return `${label} ×${badge.stackCount}`;
  }
  return label;
}

export function resolveCompactStatusOverflowTooltipLabel(
  badges: StatusEffectBadgeDisplay[],
  visibleCount: number,
): string {
  return sortBadgesForCompactView(badges)
    .slice(visibleCount)
    .map(resolveStatusBadgeTooltipLabel)
    .join("、");
}

export function getGameTermEntry(id: GameTermId): GameTermEntry | undefined {
  return ENTRY_BY_ID.get(id);
}

/** 用語パネル見出し用。HUD PNG が登録されているときのみ URL を返す。 */
export function resolveGameTermStatusIconUrl(
  entry: GameTermEntry,
): string | undefined {
  const category = entry.statusCategory ?? entry.statusIconCategory;
  if (!category) return undefined;
  return getStatusIconUrl(category);
}

export function getGameTermIds(): GameTermId[] {
  return GAME_TERM_ENTRIES.map((entry) => entry.id);
}
