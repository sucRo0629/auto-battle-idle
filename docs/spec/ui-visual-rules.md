# UI ビジュアルルール（全画面共通）

実装：`src/styles/game-ui-chrome.css`（パネル・スロット・ボタン基盤）、各画面 CSS（`skill-menu-panel.css`, `meta-menu-overlay.css`, `battle-view.css`, `party-hud-overlay.css` 等）、Canvas HUD（`battleHudTheme.ts`）。フォントは [ui-fonts.md](ui-fonts.md) を併読。

**目的:** HTML/CSS で実装していても、見た目は **ゲーム内 UI** として設計する。Web アプリ・管理画面・ダッシュボード風にしない。

画面固有のレイアウト・情報責務は各 UI spec（[party-formation-ui.md](party-formation-ui.md)、[battle-field.md](battle-field.md)、[stage-selection-ui.md](stage-selection-ui.md)）を正本とする。本書は **全 UI に共通する禁止・推奨** のみを扱う。

---

## 0. 基本方針（正本）

1. **「クリーンな UI」≠ モダン Web UI** と解釈しない。
2. **実際のボタン以外** の情報を、Web のボタン風に見せない。
3. 重要なゲーム情報は **ゲームインターフェースの一部** に見えること。HTML コントロールの羅列にしない。

---

## 1. Avoid（禁止・避ける）

| カテゴリ | 避けるもの |
| -------- | ---------- |
| ラベル | ボタン風の情報ラベル、badge / chip / pill 型ラベル（Web 管理画面のタグ UI） |
| コンテナ | 角丸 Web カード、Bootstrap / Tailwind 風パネル |
| レイアウト | ダッシュボード型サイドバー・リスト・表（スプレッドシート / Excel 風の共有罫線グリッド） |
| ツールチップ | プレーンテキストの HTML 風 tooltip（`title` 属性のみ、無枠の浮遊テキスト） |
| 装飾のみのブロック | `padding` + `gap` + `border-radius` + `box-shadow` だけで成立する UI ブロック |

**補足:** 戦闘 HUD の **状態プレート**（`PartyHudPanel` の状態表示）はゲーム用語として「バッジ」と呼ぶことがあるが、本節が禁じるのは **Web の pill / chip スタイル** である。ゲーム HUD プレート・スロット・枠付きアイコンは §2 に従う。

---

## 2. Prefer（推奨）

| カテゴリ | 推奨する表現 |
| -------- | ------------ |
| パネル | ゲーム HUD プレート、枠付きパネル（`game-panel-surface` 等） |
| 数値・進行 | ゲージ、メーター |
| 配置 | スロット |
| ナビ | ゲーム UI プレートとしてのタブ（Web の pill タブではない） |
| 枠線 | ピクセルフレーム、角のクリップ / 段差、inset ハイライト |
| 形状 | 角張り、`border-radius: 0` を基本。段差・面の重ねで区切る |

**区切りの原則:** 主要外枠のみ太枠。内側は background / padding / 薄い inset で区切る。独立カード同士を罫線で接続しない。

**インタラクション:** ホバー・選択は背景と枠線の変化。**選択中のみ** 枠を強調する。

---

## 3. ツールチップ・補足情報

| 禁止 | 推奨 |
| ---- | ---- |
| プレーンテキストの Web tooltip スタイル | HUD 情報プレート、固定詳細エリア、枠付きポップオーバー |

**実装例（正本）:**

- 用語説明: `GameTermPanel`（[party-formation-ui.md §6.4](party-formation-ui.md#64-インライン用語パネル)）
- 状態・用語の枠付き表示: `game-term-panel.css`, `party-hud-floating-tooltip.css`
- 文中用語の短文化: `GameTermTooltip`（クリック / 枠付き。ホバーだけの HTML tooltip にしない）

---

## 4. 関連ドキュメント

| ドキュメント | 関係 |
| ------------ | ---- |
| [ui-fonts.md](ui-fonts.md) | タイポグラフィ・可読性 |
| [party-formation-ui.md §11](party-formation-ui.md#11-デザイン方針dom-ui-共通) | 編成画面固有のレイアウト・スクロール |
| [battle-field.md §7–§8](battle-field.md#7-戦闘中統計-ui) | 戦闘統計 DOM・Canvas HUD |
| [stage-selection-ui.md](stage-selection-ui.md) | マップ選択画面 |
