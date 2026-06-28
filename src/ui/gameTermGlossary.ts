import type { StatusDisplayCategory } from "../battle/statusEffectDisplay.ts";

/** v1 display locale. Shape supports future `en` etc. */
export type GameTermLocale = "ja";

export type GameTermId =
  | "barrier"
  | "wardBarrier"
  | "mark"
  | "arenaMark"
  | "block"
  | "stun"
  | "dot"
  | "damageTaken"
  | "counter"
  | "evasion"
  | "invulnerable"
  | "moveLock"
  | "hot"
  | "poison"
  | "bleed"
  | "healReservation"
  | "blockResonance"
  | "herbalPotency"
  | "herbalPotencyConstitution";

export interface GameTermEntry {
  id: GameTermId;
  title: Record<GameTermLocale, string>;
  description: Record<GameTermLocale, string>;
  aliases: Record<GameTermLocale, readonly string[]>;
  statusCategory?: StatusDisplayCategory;
}

export const GAME_TERM_ENTRIES: readonly GameTermEntry[] = [
  {
    id: "barrier",
    title: { ja: "バリア" },
    description: {
      ja: "HPより先に消費されるダメージ吸収量。回復ではなく、被ダメージを直接減らすシールド層。",
    },
    aliases: { ja: ["バリア"] },
  },
  {
    id: "wardBarrier",
    title: { ja: "障壁" },
    description: {
      ja: "被ダメージを軽減するスタック型の防御層。バリアより先に消費され、ブロック共鳴などで付与される「防壁」と同系統。",
    },
    aliases: { ja: ["障壁", "防壁"] },
    statusCategory: "wardBarrier",
  },
  {
    id: "mark",
    title: { ja: "印" },
    description: {
      ja: "印術師が付与するマーク。特定スキルや効果の対象指定・追加効果に使われる専用状態。",
    },
    aliases: { ja: ["印"] },
    statusCategory: "mark",
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
      ja: "攻撃を受けた際に一定確率で発動し、被ダメージを大幅に軽減する。ブロック率は加算で積み上がる。",
    },
    aliases: {
      ja: ["前列ブロック率", "ブロック率", "魔法ブロック", "ブロック"],
    },
    statusCategory: "block",
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
      ja: "継続ダメージ（Damage over Time）。一定間隔で HP を減らす状態効果の総称。",
    },
    aliases: { ja: ["DoT圧縮", "DoT延長", "DoT収穫", "DoT"] },
    statusCategory: "dot",
  },
  {
    id: "damageTaken",
    title: { ja: "被ダメ" },
    description: {
      ja: "受けるダメージ量の倍率。1未満で軽減、1超で増加。バフ・デバフ・スキル効果で変動する。",
    },
    aliases: { ja: ["ダメージ軽減", "被ダメ"] },
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
      ja: "自動接近・位置移動を停止する効果。スキル硬直と併用されることが多い。",
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
      ja: "時間経過でダメージを与える DoT の一種。蔓延・収穫など毒専用効果と連動することがある。",
    },
    aliases: { ja: ["毒蔓延", "毒"] },
    statusCategory: "poison",
  },
  {
    id: "bleed",
    title: { ja: "出血" },
    description: {
      ja: "時間経過でダメージを与える DoT の一種。",
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
    title: { ja: "ブロック共鳴" },
    description: {
      ja: "ブロック成功時にスタックが蓄積し、消費スキルで追加効果を発動するディフェンダー系の資源。",
    },
    aliases: { ja: ["ブロック共鳴", "共鳴"] },
    statusCategory: "blockResonance",
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
];

const ENTRY_BY_ID = new Map<GameTermId, GameTermEntry>(
  GAME_TERM_ENTRIES.map((entry) => [entry.id, entry])
);

export function getGameTermEntry(id: GameTermId): GameTermEntry | undefined {
  return ENTRY_BY_ID.get(id);
}

export function getGameTermIds(): GameTermId[] {
  return GAME_TERM_ENTRIES.map((entry) => entry.id);
}
