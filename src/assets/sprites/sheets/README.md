# スプライトシート

`{entityId}` フォルダに、アニメーション種別ごとの横並び PNG を置く（クラスは `classId`、敵は `enemyId` と一致）。

## 配置

```
sheets/
  df_guardian/
    idle.png
    move.png
    attack.png
    attack_2.png
    death.png
  skills/
    sp_cleric_active_1.png
    at_assassin_active_1_0.png
    at_assassin_active_1_1.png
  stage1_1/
    idle.png
    death.png
```

- **entityId** … クラス / 敵テンプレートの `id` と一致（例: `df_guardian`, `stage1_1`）
- **entity ファイル名** … `idle` / `move` / `attack` / `attack_2` … / `death`（拡張子 `.png`）
- 旧 `dash.png` は `move.png` にリネーム（`dash.png` も読み込み時 `move` として互換）

## PNG 仕様

| 項目 | 値 |
|------|-----|
| 1コマサイズ | **48 × 48 px**（idle / move / death。`spriteLayout.ts` で変更可） |
| attack 1コマ | **64 × 48 px**（横幅のみ広い。振りなど左右にはみ出し用） |
| 並べ方 | 左から右へ横一列 |
| 総幅 | idle 等: `48 × コマ数` / attack: `64 × コマ数` |
| **足元アンカー** | 各コマの **下辺中央** を地面位置に揃える |
| **fps** | **8**（idle / move / attack / death / スキルアニメ共通） |

隊形・当たりの占有幅は **32px** のまま。描画だけ 48px コマを使い、上・左右にはみ出してよい。

### アンカーのイメージ

```
     ┌──────── 64px ────────┐
     │   （攻撃の振り等）     │
     │        ┌──┐          │
     │        │体│          │
     │        └──┘          │
     └──────────●───────────┘  ← 下辺中央 = 地面（全コマ同じ位置）
            layout 32px
         （中央で重なる）
```

コマ数は `src/render/SpriteRegistry.ts` の `ANIM_DEFS` に合わせる（スキルアニメは PNG 幅から自動算出）。

| anim | コマ数 | fps | ループ | 用途 |
|------|--------|-----|--------|------|
| idle | 4 | 8 | あり | 待機 |
| move | 4 | 8 | あり | 接敵・wave march 等の通常移動 |
| attack | 4 | 8 | なし | 通常攻撃 body（**256 × 48 px** = 64×4） |
| death | 3 | 8 | なし（最終コマで停止） | 死亡 |

### attack バリアント

- `attack.png` のみ … 常にその 1 枚
- `attack_2.png` 以上もある … 再生時に均等ランダム
- 命名: `attack.png`, `attack_2.png`, `attack_3.png` …

### 例: slime の death（3コマ）

- 画像サイズ: **144 × 48 px**
- 左コマ … 倒れ始め、中央 … 途中、右 … 倒れた状態

### キャラごとにコマサイズを変える

`src/render/spriteLayout.ts` の `SHEET_CELL_OVERRIDES` に spriteKey を追加:

```typescript
const SHEET_CELL_OVERRIDES = {
  boss_dragon: 64,
};
```

## 動作（entity）

- シート PNG を置くと、その anim だけ自動登録（コード変更不要）
- 未配置の anim は静止画（`sprites/{entityId}.png`）またはプレースホルダー演出
- death シートがある場合、回転プレースホルダーは使われない
- `heal` / `hurt` entity シートは不要（回復・被弾はスキルアニメ / popup 等）

## スキルアニメーション

**配置:**

```
sheets/skills/{skillId}.png
sheets/skills/{skillId}_{effectIndex}.png
```

- `{skillId}` … `data/skills.json` の active スキル ID
- `{effectIndex}` … 0 始まり。複数 effect スキル（move → damage 等）でステップごとに別 PNG
- 解決順: `{skillId}_{index}.png` → `{skillId}.png`
- PNG 仕様・fps は entity シートと同じ。コマ数 = 幅 ÷ 48

**例（背刺）:**

```
sheets/skills/at_assassin_active_1_0.png   # move ステップ（突進演出）
sheets/skills/at_assassin_active_1_1.png   # damage ステップ（背刺）
```

**追加手順:**

1. 上記パスに PNG を配置
2. 必要なら `skills.json` の `effect.anim` で entity anim を上書き（`attack` / `none` 等）
3. dev サーバー再起動で glob 自動登録

突進・回復・特殊攻撃は entity `move` / `heal` ではなくスキルアニメ PNG で表現する。

## スキル VFX

### 現状（仮・Canvas プリセット）

JSON で指定。PNG 不要。

| 設定場所 | フィールド |
|----------|-----------|
| `skills.json` effect | `vfx.preset`, `arc`, `durationMs` |
| `skills.json` skill | `vfx` |
| `classes.json` / `enemies.json` traits | `basicAttackVfx` |

プリセット ID: `slash` / `orb` / `arrow` / `healRise`

解決優先度: `basicAttackVfx` → `effect.vfx` → `skill.vfx` → ロール/射程既定

### 本番（Phase 6 予定・PNG Canvas アニメ）

`sheets/vfx/{vfxId}.png` を配置し、JSON でモード指定する想定:

- **projectile** … 矢 PNG を放物線で飛ばす
- **groundOverlay** … スキル指定位置に毒沼等を地面オーバーレイ

量産・軌道確認のため **VFX プレビュー用エディタ step** を Phase 6 で検討。現フェーズでは上記仮プリセットを維持。

## 静止画（シートなし）

`sprites/{entityId}.png` は **32 × 32 px**。足元中央を layout 箱の下辺中央に合わせて描画。
