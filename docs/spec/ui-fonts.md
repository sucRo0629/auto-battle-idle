# UI フォント方針

実装：`src/styles/fonts.css`, `src/styles/app-base.css`, `src/render/battleHudTheme.ts`（`--popup-font-family` / `--overlay-font-family` の読取）. 編成 UI は [party-formation-ui.md](party-formation-ui.md)、戦闘 HUD は [battle-field.md](battle-field.md#8-戦闘画面-ui1280720-hud) と併読。

**目的:** Web アプリ感を抑えつつ、編成・説明文・HUD 全体で **可読性と情報密度** を最優先する。

**調整順:** 本書のフォント割当を先に固定し、カード幅・高さ・`line-height` の最終調整はフォント適用後の目視で行う。

---

## 0. 基本方針（正本）

1. **UI 全体のフォントは M PLUS 1p** とする（フォールバック: Noto Sans JP）。
2. **日本語本文は 12px 未満にしない**（`--font-body-min-size: 12px`）。スペース確保のため 10〜11px に下げない。
3. **スキル名・クラス名・敵名** は M PLUS 1p **太字**（ピクセル系フォントは採用しない）。

---

## 1. CSS 変数

`:root`（`fonts.css`）で定義する。

| 変数 | スタック | 用途 |
| ---- | -------- | ---- |
| `--font-body` | `"M PLUS 1p", "Noto Sans JP", system-ui, sans-serif` | **UI 全体**（DOM・Canvas テキスト） |
| `--font-body-min-size` | `12px` | 日本語本文の最小文字サイズ |

`--app-font-family` は `--font-body` を参照する（`app-base.css`）。

戦闘 Canvas HUD テーマ（`battle-view.css` の `.battle-canvas-host`）:

| 変数 | 参照 | 用途 |
| ---- | ---- | ---- |
| `--popup-font-family` | `var(--font-body)` | ダメージ / 回復 / 戦闘反応ポップアップ（`--popup-font-size: 18`） |
| `--overlay-font-family` | `var(--font-body)` | Wave / Victory / Defeat オーバーレイ（48px・`bold`） |

---

## 2. 適用範囲

| 領域 | フォント | 代表サイズ |
| ---- | -------- | ---------- |
| 編成 UI・ツールチップ・用語パネル | `--font-body` | 12〜14px |
| 戦闘 HUD DOM（名前・ステージ名・Wave 常時表示） | `--font-body` | 12px 以上 |
| Canvas ダメージ / 回復 / 反応ポップアップ | `--popup-font-family` | 18px |
| Wave / Victory / Defeat オーバーレイ | `--overlay-font-family` | 48px |

**M PLUS 1p:** Google Fonts 経由で読み込み（`fonts.css` の `@import`）。

---

## 3. 注意

| ルール | 理由 |
| ------ | ---- |
| **日本語本文を 12px 未満** にしない | ジャギ・誤読。`--font-body-min-size` を正本とする |
| 2 行以上になり得る説明文は本文サイズ帯（12〜14px）を維持 | 可読性・情報密度 |
| ラベル＋数値混在を極端に小さくしない | 日本語部分の崩れ |

**スコープ外:** データ編集ツール（`editor.css`）、デバッグ UI。

### 文字のジャギ（ガタつき）とにじみ

| 現象 | 典型原因 | 対処 |
| ---- | -------- | ---- |
| **ガタつき**（階段状・硬い輪郭） | 12px 未満の Web フォントヒンティング、戦闘 HUD の非整数倍拡縮 | `.game-shell` で `-webkit-font-smoothing: antialiased` 等を適用。`.battle-root` から `image-rendering` を外し `canvas`/`img` のみに限定。**本文は `--font-body-min-size`（12px）以上**。拡縮は `zoom: var(--battle-scale)` + `battleRootScale.ts` の 1/4 刻みスナップ（`transform: scale()` は使わない） |
| **にじみ**（ぼやけ） | 過度な AA・ブラー・低解像度での拡大 | 本プロジェクトの本文方針では主因になりにくい |

戦闘画面は 1280×720 をビューポートに合わせて **一括スケール** するため、ウィンドウサイズが基準の整数倍でないと DOM 文字がジャギやすい（構造上の制約）。編成画面はスケールなし。

---

## 4. 実装メモ

- `.game-shell` に本文用スムージング（`antialiased` / `optimizeLegibility`）を適用。
- `.battle-root` には `image-rendering: pixelated` を付けない（`canvas` / `img` のみ）。
- 新規 DOM スタイルで `font-size` を足すときは **`var(--font-body-min-size)` 未満にしない**。
- Canvas ポップアップの `--popup-font-size` を 16 未満に下げない（現行 18）。

---

## 5. 関連ドキュメント

- [party-formation-ui.md](party-formation-ui.md) — 編成画面レイアウト・スキルカード
- [ui-visual-rules.md](ui-visual-rules.md) — 全 UI 共通ビジュアル（Web アプリ風禁止）
- [battle-field.md](battle-field.md) — 戦闘 HUD・ポップアップ
- [i18n-en.md](i18n-en.md) — 英語文案
