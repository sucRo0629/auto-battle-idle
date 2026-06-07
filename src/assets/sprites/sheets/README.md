# スプライトシート

`{spriteKey}` フォルダに、アニメーション種別ごとの横並び PNG を置く。

## 配置

```
sheets/
  slime/
    idle.png
    attack.png
    death.png
  enemy_default/
    idle.png
    death.png
```

- **spriteKey** … `enemies.json` / `classes.json` の `spriteKey` と一致させる（例: `slime`, `enemy_default`）
- **ファイル名** … `idle` / `attack` / `heal` / `hurt` / `death` のいずれか（拡張子 `.png`）

## PNG 仕様

| 項目 | 値 |
|------|-----|
| 1コマサイズ | **48 × 48 px**（デフォルト。`spriteLayout.ts` で変更可） |
| 並べ方 | 左から右へ横一列 |
| 総幅 | `48 × コマ数` |
| **足元アンカー** | 各コマの **下辺中央** を地面位置に揃える |

隊形・当たりの占有幅は **32px** のまま。描画だけ 48px コマを使い、上・左右にはみ出してよい。

### アンカーのイメージ

```
     ┌──────── 48px ────────┐
     │   （攻撃の振り等）     │
     │        ┌──┐          │
     │        │体│          │
     │        └──┘          │
     └──────────●───────────┘  ← 下辺中央 = 地面（全コマ同じ位置）
            layout 32px
         （中央で重なる）
```

コマ数・fps は `src/render/SpriteRegistry.ts` の `ANIM_DEFS` に合わせる。

| anim | コマ数 | fps | ループ |
|------|--------|-----|--------|
| idle | 4 | 6 | あり |
| attack | 4 | 12 | なし |
| heal | 3 | 10 | なし |
| hurt | 2 | 10 | なし |
| death | 3 | 8 | なし（最終コマで停止） |

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

## 動作

- シート PNG を置くと、その anim だけ自動登録される（コード変更不要）
- 未配置の anim は従来どおり静止画（`sprites/{spriteKey}.png`）またはプレースホルダー演出
- death シートがある場合、回転プレースホルダーは使われない

## 静止画（シートなし）

`sprites/{spriteKey}.png` は **32 × 32 px**。足元中央を layout 箱の下辺中央に合わせて描画。
