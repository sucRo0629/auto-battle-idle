# UI フォント方針

実装：`src/styles/fonts.css`, `src/styles/app-base.css`, `src/render/battleHudTheme.ts`（`--hud-font-family` / `--popup-font-family` の読取）. 編成 UI は [party-formation-ui.md](party-formation-ui.md)、戦闘 HUD は [battle-field.md](battle-field.md#8-戦闘画面-ui1280720-hud) と併読。

**目的:** Web アプリ感を抑え、1280×720 基準のゲーム HUD らしい見た目に寄せる。スキル説明・用語説明・ツールチップなど **長文の可読性は維持** する。ピクセル系フォントは **アクセント** に留め、主役にしない。

**調整順:** 本書のフォント割当を先に固定し、カード幅・高さ・`line-height` の最終調整はフォント適用後の目視で行う。

---

## 0. 基本方針（正本）

1. **UI 全体の基本フォントは M PLUS 1p** とする（フォールバック: Noto Sans JP）。ピクセルフォント（PixelMplus10）は **ゲーム HUD 感を補強するアクセント** として扱い、主役にしない。
2. **ピクセルフォントは 16px 以上** で表示できる **短文・数値・見出し** に限定する（`--font-pixel-min-size: 16px`）。
3. **日本語本文（`--font-body`）は 12px 未満にしない**（`--font-body-min-size: 12px`）。スペース確保のため 10〜11px に下げない。
4. 次のように **可読性と情報密度が重要な箇所にはピクセルフォントを使わない**（常に `--font-body`）:
   - スキル説明本文
   - スキルサマリ
   - メタ行（CD / Range / Target 等）
   - 状態タグ・タグチップ
   - 用語リンク（`.game-term-link`）
   - ツールチップ本文・用語パネル本文
   - 上記に類する、2 行以上になり得る説明文

**ピクセルフォントの許容例（16px 以上かつ短文）:** Canvas ダメージ数値、将来 16px に上げた HUD 見出し・純数値表示など。

---

## 1. CSS 変数

`:root`（`fonts.css`）で定義する。

| 変数 | スタック | 用途 |
| ---- | -------- | ---- |
| `--font-body` | `"M PLUS 1p", "Noto Sans JP", system-ui, sans-serif` | **UI 全体の基本フォント**。説明文・名前・可読性重視 UI・16px 未満の全文 |
| `--font-ui` | `"PixelMplus10", "M PLUS 1p", …` | **16px 以上**の短文・見出しアクセント（§0 除外箇所には使わない） |
| `--font-number` | `"PixelMplus10", "M PLUS 1p", …` | **16px 以上**の数値アクセント（§0 除外箇所には使わない） |
| `--font-pixel-min-size` | `16px` | ピクセルフォントの最小文字サイズ |
| `--font-body-min-size` | `12px` | 日本語本文（`--font-body`）の最小文字サイズ。編成・戦闘 HUD DOM はこれ未満にしない |

`--app-font-family` は `--font-body` を参照する（`app-base.css`）。

戦闘 Canvas HUD テーマ（`battle-view.css` の `.battle-canvas-host`）:

| 変数 | 参照 | 備考 |
| ---- | ---- | ---- |
| `--hud-font-family` | `var(--font-ui)` | Canvas 描画予約（現行 DOM では継承に使わない） |
| `--popup-font-family` | `var(--font-number)` | ダメージ / 回復ポップアップ（`--popup-font-size: 18`） |
| `--overlay-font-family` | `var(--font-body)` | Wave / Victory / Defeat オーバーレイ（48px・判読優先） |

---

## 2. 本文（`--font-body`）— 基本フォント

**採用:** M PLUS 1p（第一候補）、Noto Sans JP フォールバック。§0 の除外一覧は **常に本フォント**。

現行の編成 UI・戦闘 HUD DOM は **おおむね 12〜14px**（最小 `--font-body-min-size`）のため、実質 **すべて本文フォント** が既定。

| 用途 | 代表セレクタ |
| ---- | ------------- |
| スキル説明本文 | `.skill-menu-skill-summary-card-effect-line` |
| スキルサマリ | 上記および `.skill-menu-class-summary-text` |
| メタ行 | `.skill-menu-skill-summary-card-meta` |
| 状態タグ・タグチップ | `.skill-menu-status-chip`, `.skill-menu-tag-chip` |
| 用語リンク | `.game-term-link`（親の `font-size` / `line-height` を継承） |
| ツールチップ・用語パネル | `.game-term-tooltip-body`, `.game-term-panel-body`, `.game-term-tooltip-title` |
| クラス名・敵名 | `.party-hud-label`, `.enemy-hud-label`, `.party-stats-member-name` |
| ステージ名 / Wave（DOM） | `.battle-canvas-hud-stage`, `.battle-canvas-hud-wave` |
| ボタン・ゾーン見出し（現行サイズ） | `.game-ui-button`, `.skill-menu-zone-header` 等 |

**スキル名・クラス名** はピクセル系にしない。M PLUS 1p **太字**。

---

## 3. UI アクセント（`--font-ui`）— ピクセル短文・見出し

§0 に該当しない **16px 以上の短文・見出し** のみ。スキル説明・メタ行・状態タグ・用語リンク等には **割り当てない**。

現行 DOM（12〜14px）では `fonts.css` にピクセル UI セレクタを置かない。16px に上げた要素を追加するときだけ検討する。

**PixelMplus10:** `public/fonts/PixelMplus10-*.ttf`（M+ FONT LICENSE）。入手元: [itouhiro/PixelMplus](https://github.com/itouhiro/PixelMplus)。

---

## 4. 数値（`--font-number`）— ピクセル数値

§0 に該当しない **16px 以上の純数値・短い単位表示** のみ。メタ行やラベル混在テキストには使わない。

| 用途 | 実装 | サイズ |
| ---- | ---- | ------ |
| Canvas ダメージ / 回復ポップアップ | `--popup-font-family` → `popupFontFamily` | 18px |
| DOM の与ダメ・ステ値・Lv | 現行は `--font-body`（12px 以上） | — |

16px 以上に上げた数値表示から `--font-number` を割り当てる。

---

## 5. 禁止・注意

§0 を補足するチェックリスト。

| ルール | 理由 |
| ------ | ---- |
| 基本フォントは **M PLUS 1p**。ピクセルはアクセントのみ | 編成読解・情報密度を最優先 |
| ピクセル系を **16px 未満** で使わない | 判読不能・誤読（`W`→`N` 等） |
| **日本語本文を 12px 未満** にしない | ジャギ・誤読。`--font-body-min-size` を正本とする |
| **スキル説明・サマリ・メタ行・状態タグ・用語リンク・ツールチップ本文** にピクセル系を使わない | 可読性・情報密度（§0） |
| 2 行以上になり得る文章にピクセル系を使わない | 同上 |
| クラス名・敵名・用語名にピクセル系を使わない | 日本語／英字の誤読 |
| ラベル＋数値混在（`プレイヤー Lv 5`）をピクセル数値フォントにしない | 日本語部分の崩れ |
| Wave / Victory / Defeat オーバーレイにピクセル系を使わない | 英字判読 |

**コンテナ既定:** パネル類は `--font-body` を継承。`--hud-font-family` の一括指定は DOM に使わない。

**サイズと役割:**

| サイズ | フォント |
| ------ | -------- |
| &lt; 12px | **禁止**（`--font-body-min-size` 未満は使わない） |
| 12px 〜 15px | `--font-body`（編成・HUD の現行帯） |
| ≥ 16px（§0 除外の短文・見出し） | `--font-ui` を検討 |
| ≥ 16px（§0 除外の純数値） | `--font-number` を検討 |
| §0 一覧の要素（サイズ問わず） | 常に `--font-body` |

**スコープ外:** データ編集ツール（`editor.css`）、デバッグ UI。

### 文字のジャギ（ガタつき）とにじみ

| 現象 | 典型原因 | 対処 |
| ---- | -------- | ---- |
| **ガタつき**（階段状・硬い輪郭） | 12px 未満の Web フォントヒンティング、戦闘 HUD の `transform: scale(--battle-scale)` による非整数倍拡縮 | `.game-shell` で `-webkit-font-smoothing: antialiased` 等を適用。`.battle-root` から `image-rendering` を外し `canvas`/`img` のみに限定。**本文は `--font-body-min-size`（12px）以上** |
| **にじみ**（ぼやけ） | 過度な AA・ブラー・低解像度での拡大 | 本プロジェクトの本文方針では主因になりにくい |

戦闘画面は 1280×720 をビューポートに合わせて **一括スケール** するため、ウィンドウサイズが基準の整数倍でないと DOM 文字がジャギやすい（構造上の制約）。編成画面はスケールなし。

---

## 6. 実装メモ

- `.game-shell` に本文用スムージング（`antialiased` / `optimizeLegibility`）を適用。
- `.battle-root` には `image-rendering: pixelated` を付けない（`canvas` / `img` のみ）。
- DOM でピクセルを足すときは **§0 を満たすこと**（16px 以上・短文/数値/見出し・除外箇所でないこと）を確認してから `--font-ui` / `--font-number` を付ける。
- 新規 DOM スタイルで `font-size` を足すときは **`var(--font-body-min-size)` 未満にしない**。
- Canvas ポップアップの `--popup-font-size` を 16 未満に下げない（現行 18）。

---

## 7. 関連ドキュメント

- [party-formation-ui.md](party-formation-ui.md) — 編成画面レイアウト・スキルカード
- [battle-field.md](battle-field.md) — 戦闘 HUD・ポップアップ
- [i18n-en.md](i18n-en.md) — 英語文案
