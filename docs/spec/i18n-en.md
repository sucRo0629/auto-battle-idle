# 英語 i18n（`en`）— 文案方針

実装：`src/ui/skillTextPhrases.ts`, `src/ui/formatSkillText.ts`, `src/ui/gameTermGlossaryEn.ts`, `src/i18n/uiMessages.ts`, `src/ui/classDisplayName.ts`

Phase 4e（[phase-4-roadmap.md §4e](../plans/phase-4-roadmap.md#4e--英語-i18n-en-のみ)）の **英語文案の正本**。対象言語は **`en` のみ**（3 言語目以降はスコープ外）。

## 適用範囲

| レイヤ | モジュール | 本書の適用 |
| ------ | ---------- | ---------- |
| スキル効果文 | `formatSkillText.ts`, `skillTextPhrases.ts` | **全文**（下記エージェント方針） |
| 用語タイトル・スキル文中の用語 | `gameTermGlossaryEn.ts`（`title` / `aliases`） | **用語表**の綴りを厳守 |
| 用語パネル説明 | `gameTermGlossaryEn.ts`（`description`） | 用語表の綴りに合わせる。1〜3 文の要約可（味付け・創作はしない） |
| DOM UI ラベル | `uiMessages.ts` 等 | 短いラベル。ゲーム用語は用語表に合わせる |
| クラス表示名 | `classes.json` の `epithetEn` | 肩書き。スキル効果文のルールは直接は当てはめない |

**翻訳正本:** 日本語（4b で確定した `formatSkillText` 日本語出力・`gameTermGlossary.ts` の `ja`）。

## エージェント・編集者向け方針（コピペ可）

You are editing English i18n text for Hensei Only.

Japanese text is the source of truth.
Do not freely rewrite effects.
Do not add flavor text.
Do not infer mechanics that are not present in the Japanese source.

Use controlled, concise game-effect English.

**Rules:**

- Use imperative effect text.
- Omit the subject when possible.
- Prefer short sentences.
- Preserve numbers, durations, stack counts, and target counts exactly.
- Preserve game terms from the glossary exactly.
- Do not translate ATK, DEF, REG, HP.
- Do not vary terminology for style.
- Do not use literary or flavorful wording.
- If the Japanese source is ambiguous, mark it as `NEEDS_REVIEW` instead of guessing.

**Preferred verbs:**

| 日本語 | English |
| ------ | ------- |
| 与える | Deal |
| 付与する | Apply |
| 獲得する | Gain |
| 回復する | Recover |
| 増加する | Increase |
| 減少する | Reduce |
| 無効化する | Negate |
| 起爆する | Detonate |
| 再命中する | Repeat hit |
| 対象にする | Target |

**Glossary（スキル効果文・用語タイトル）:**

| 日本語 | English |
| ------ | ------- |
| 攻撃力 | ATK |
| 防御力 | DEF |
| 最大HP | Max HP |
| 魔法ダメージ | magic damage |
| 物理ダメージ | physical damage |
| 被ダメージ | damage taken |
| 継続ダメージ | DoT |
| 持続時間 | duration |
| 再使用時間 | Recast |
| スタック | stack |
| 最大スタック | max stacks |
| 対象 | target |
| 敵 | enemy |
| 味方 | ally |
| 同一対象 | same target |
| 対象不足 | insufficient targets |
| バリア | barrier |
| ブロック | block |
| マルチロック | Multi-Lock |

固有名詞（種火・乾印・坤印など）は [classes-and-skills.md §UI 用語辞書](classes-and-skills.md#ui-用語辞書) の `GameTermId` / `gameTermGlossaryEn.ts` の `title` を正とする。上表にない一般語は日本語源に忠実に訳し、同義語を増やさない。

**Examples:**

Japanese (body):

```
敵2体に攻撃力90%の魔法ダメージを与える。
```

English (body):

```
Deal 90% ATK magic damage to 2 enemies.
```

Multi-Lock tag tooltip (not body):

```
対象数まで効果を適用する。
対象が不足している場合、不足分は同じ対象へ再度適用する。
```

```
Applies effects up to the target count.
If targets are insufficient, remaining applications hit the same target again.
```

Japanese:

```
攻撃スキルのHitごとに、敵へ種火を付与する。
```

English:

```
Apply Seed Flame to the enemy for each attack skill hit.
```

## 表記統一（ゲーム用語）

[classes-and-skills.md §ゲーム用語表（表示分類）](classes-and-skills.md#ゲーム用語表表示分類) の表記統一に従う。英語文案で特に固定する項目:

| 項目 | English |
| ---- | ------- |
| 再使用 | **Recast**（Cooldown / CD は UI に使わない） |
| 継続ダメージ | **DoT** |
| 複数対象 | **Multi-Lock**（MultiLock / Multi-Locks / 動詞化しない） |
| 被ダメージ | **damage taken** |
| 障壁 / バリア / 防壁 | Ward / Barrier / Bulwark |
| ステ略称 | ATK / DEF / REG / HP |

## スキルカード英語文案

スキルカード表示の分類は [party-formation-ui.md §6.4](party-formation-ui.md#64-用語注釈スキルカード)（[§スキルカード情報設計](party-formation-ui.md#スキルカード情報設計) が正本）を正とする。

- 日本語を正本とする。意訳しすぎない
- 主語を省いた命令形を基本にする
- 数値・対象数・持続時間・スタック数を変えない
- 用語表の表記を固定する
- 曖昧な場合は `NEEDS_REVIEW` とする

**Multi-Lock の書き方:** 本文に対象数と効果を書き、タグラベルは名詞 `Multi-Lock N`（日本語 `マルチロックN`）のみ。**動詞化しない**。不足対象時の再配分は **タグ tooltip** に書き、本文へ重複させない。

良い例（本文）:

```
Deal 90% ATK magic damage to 2 enemies.
```

悪い例（本文）:

```
Multi-Locks 2 enemies and deals 90% ATK magic damage.
If targets are insufficient, repeat hits on the same target.
```

理由: `Multi-Lock` を動詞化しており、メカニクス説明を本文へ重複している。

## `NEEDS_REVIEW`

日本語源が複数解釈できる・effect 定義と突き合わせが必要な場合、推測訳を入れず `NEEDS_REVIEW` を文案またはコメントに残す。テスト固定前に人間または combat spec で解消する。

## 日本語テンプレとの関係

日本語の 1 行テンプレ・表記ルールは [classes-and-skills.md §スキル説明自動生成（Phase 4b）](classes-and-skills.md#スキル説明自動生成phase-4b) を正とする。英語は **意味の対応** を取り、日本語と同じ行数・区切り（`formatSkillCardLines` の効果単位改行）を維持する。英語だけの情報追加はしない。

## 関連

- 4e 進捗・Exit 条件: [phase-4-roadmap.md §4e](../plans/phase-4-roadmap.md#4e--英語-i18n-en-のみ)
- ゲーム用語表（表示分類）: [classes-and-skills.md §ゲーム用語表](classes-and-skills.md#ゲーム用語表表示分類)
- スキルカード表示分類: [party-formation-ui.md §6.4](party-formation-ui.md#64-用語注釈スキルカード)
- 用語辞書データ形状: [classes-and-skills.md §UI 用語辞書](classes-and-skills.md#ui-用語辞書)
- Cursor ルール: `.cursor/rules/i18n-en.mdc`
