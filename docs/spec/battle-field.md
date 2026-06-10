# 戦闘フィールド（位置・移動・描画）

実装予定：`src/battle/battleLayout.ts`, `battleCamera.ts`, `combatPosition.ts`, `BattleEngine.ts`  
現行実装（作り直し前）：`src/battle/BattleEngine.ts`, `combatPosition.ts`, `src/render/formationLayout.ts`

本ドキュメントは **横 1 軸のバトルライン** における座標・隊形・Wave・接敵・描画の設計正本。ダメージ/CD/脅威等は [combat.md](combat.md) を参照。

**現行コードとの関係：** 軸向き・用語・パイプラインは本書が正本。実装が追いつくまで [combat.md](combat.md) の座標節（旧記述）と不一致があり得る。

---

## 1. 用語

| 概念 | コード / JSON | 日本語 | 使う場面 |
|------|---------------|--------|----------|
| 後方 | 小さい `battleX` / 画面左 | 後方 | パーティ起点・退却方向 |
| 前方 | 大きい `battleX` / 画面右 | 前方 | 進行方向・敵出現側 |
| プレイヤー側ユニット | `players[]`（移行後）, `TargetSide: "player"` | プレイヤー | 戦闘ランタイム・ターゲット・脅威 |
| 敵 | `enemies[]`, `isEnemy` | 敵 | 同上 |
| パーティ | `party`, `PartySlotState`, `partySlotIndex` | パーティ | セーブ・編成 UI・HUD のみ |
| ユニット | `CombatantState` | ユニット | player / enemy 共通 |
| スロット | `(formationRow, slotIndex)` | スロット | visual 隊形の席。§3 参照 |

**移行（実装フェーズ）：**

- ランタイム配列・変数：`allies` → `players`（`ally` コメント廃止）
- JSON `"side": "ally"` はローダーで `"player"` に正規化。保存時は `"player"`
- レガシー `TargetRule`（`closestAlly` 等）は `closestPlayer` 等へ

**`partySlotIndex` とスロットの違い：**

- `partySlotIndex`（0〜3）— 編成スロット。HUD・統計用。**visual 位置の正本ではない**
- `slotIndex` — 同一 `formationRow` 内の横並び順（§3）。同クラス複数時の左右は安定ソートにより `players` 配列順（実質 `partySlotIndex` 昇順）が暗黙的に適用。**現状維持・仕様変更なし**

---

## 2. 座標体系

### 2.1 前後と画面

| 画面 | 意味 |
|------|------|
| **左** | **後方** — パーティ起点 |
| **右** | **前方** — 進行方向・敵 Wave の出現側 |

`battleX` / `visualX` / `screenX` は **値が大きいほど前方（右）**。

距離単位は **px** のまま（1 battle 単位 ≒ 1 画面 px）。擬似 m は採用しない。

### 2.2 座標層

| 層 | コード名 | 更新責務 | 用途 |
|----|----------|----------|------|
| ロジック | `battleX` | `combatPosition.ts` / `BattleEngine` | 射程・自動接近・knockback・接敵 cap |
| レイアウト | `visualX` | `battleLayout.ts`（新設） | カメラ前のスプライト基準点 |
| 画面 | `screenX` | 計算値 | `visualX + combatCameraX` |
| カメラ | `combatCameraX` | `battleCamera.ts`（新設） | 接敵中パーティ重心をキャンバス中央へ |
| 背景 | `worldOffsetX` | `BattleEngine` | 地面タイルのパララックスのみ |

**分離原則：**

- 同一 `battleX` のユニットはロジック上重なってよい（近接 range 0 等）
- `visualX` は隊形・接敵演出用。`battleX` の内部接近をそのまま pixel 等倍で描画しない
- `src/render` は `BattleSnapshot` の `screenX`（または `visualX` + `combatCameraX`）のみ参照し、戦闘ルールを持たない

### 2.3 毎 tick パイプライン（作り直し後）

```
BattlePhase 判定
  → tickBattleX（自動接近・knockback 等）
  → resolveLayoutTargets（visual 目標）
  → interpolate visualX（Engaged 中は双方向 moveTowardX）
  → skill move overlay（busy actor のみ。layout はスキップ）
  → tickCamera
  → BattleSnapshot
```

### 2.4 一方通行（フェーズ別）

| フェーズ | プレイヤー `battleX` 自動接近 | 敵 `battleX` 自動接近 | プレイヤー `visualX` |
|----------|------------------------------|----------------------|----------------------|
| 進軍（`WaveApproach` 等） | 増加のみ（右） | 減少のみ（左） | 進軍ルールに従う |
| 接敵（`Engaged`） | 前方寄り（詳細 §4） | 減少のみ（左） | **双方向**補間（L3） |
| スキル `move` 中 | シーケンスが正本 | 同左 | overlay のみ（layout スキップ） |

**スコープ外：** 敵がプレイヤー背後へ回る AI / 敵 `move`（後列狙い）。プレイヤー側の `behindTarget` 等スキル `move` は §4.4 で維持。

### 2.5 攻撃位置・move（新軸）

```
effectiveRangePx = effect.range ?? actor.traits.rangePx
命中: battleDistance(actor, target) <= effectiveRangePx
```

**攻撃可能 `battleX`（プレイヤー → 敵）：** `target.battleX - effectiveRangePx`（前方から射程内）  
**攻撃可能 `battleX`（敵 → プレイヤー）：** `target.battleX + effectiveRangePx`

**`move` の `moveMode`（プレイヤー actor・新軸）：**

| mode | 目標 `battleX` |
|------|----------------|
| `engage` | `anchor.battleX - range`（敵の手前＝後方側） |
| `behindTarget` | `anchor.battleX + behindOffsetPx`（敵の背後＝より前方） |
| `toAnchor` | `anchor.battleX` |

**ノックバック：** 各陣営の **後方** へ押す。プレイヤーは `-X`（左）、敵は `+X`（右）。敵は `battleX` が進軍表示下限未満にならない。

### 2.6 定数（単一正本：`battleConstants.ts` または `types.ts`）

| 定数 | 用途 |
|------|------|
| `CANVAS_W`（480） | 画面幅。カメラ中央 ≈ 240 |
| `ROW_X.front` / `middle` / `back` | 隊形列基準。**back < middle < front**（新軸） |
| `PLAYER_ROW_SPACING`（42） | 同一列内スロット間隔 |
| `PLAYER_VISUAL_MIN_GAP` | プレイヤー overlap 解消（≈ `SPRITE_WIDTH + bodyClearance`） |
| `BATTLE_ENEMY_SPAWN_MIN_X` | 敵 `spawnX` の前方下限（例: `CANVAS_W + margin`） |
| `BATTLE_ENEMY_MARCH_VISIBLE_MAX_X` | 進軍中スプライト表示の前方上限 |
| `SCROLL_SPEED` / `APPROACH_SPEED` | 進軍・接敵接近（px/s） |

現行の `ROW_X`（front 240 等）は旧軸用。実装時に新軸へ再チューニングする。

---

## 3. Wave・フィールド構造

### 3.1 マップ

**2D マップは存在しない。** 横 1 軸のバトルラインのみ。Y は `formationRow` 由来の描画オフセット。

### 3.2 データ

```json
{
  "waves": [
    {
      "enemies": [
        { "templateId": "stage1_1", "spawnX": 520 }
      ]
    }
  ]
}
```

- `spawnX` — **前方（右）基準の正値**。キャンバス右外から出現
- 旧データ（負の `spawnX`）は実装時に移行（例: `CANVAS_W + abs(oldSpawnX)`）

### 3.3 プレイヤー隊形スロット

1. **列 `formationRow`** — クラスマスタ（`classes.json`）で固定
2. **列内順** — `rowRoleOrder(role)` でソート後、0 始まりの `slotIndex` を付与。同一列に複数ユニットがいる場合は **射程（`traits.rangePx`）で整列**（短い＝前方／右、長い＝後方／左）し、同射程は role 順

| 列 | role 優先順（小さいほど slot 0） |
|----|----------------------------------|
| `front` / `middle` | defender → attacker → supporter |
| `back` | supporter → attacker → defender |

3. **理想 visualX：** `ROW_X[row] + slotIndex × PLAYER_ROW_SPACING`
4. **列内順（射程）** — 同一列では **射程が短いほど前方（右）**、長いほど後方（左）。例: 後列で range 40 の療養師は range 50 の弓術士より右（前線側）
5. **overlap 解消** — §4.2（プレイヤーのみ必須）

**近接判定（統一）：** `isMeleeUnit(u) := resolveMaxEffectiveRangePx(u) <= 0`

### 3.4 Wave ライフサイクル

1. プレイヤー隊列を後方（左）に配置
2. 敵 Wave を前方（`spawnX`）にスポーン → 左へ進軍
3. standoff cap 到達 → `Engaged`（§4.3）
4. 敵全滅 → 死亡演出 → `FormationReset`（§4.1）
5. 次 Wave へ（敵エンティティ差し替え）

**生死と表示：**

- プレイヤー：同一 Wave 中は死体表示。次 Wave 進軍開始でスプライトのみ非表示（HP0・HUD は維持）
- 敵：Wave 終了で差し替え。死体は Wave 内のみ

---

## 4. フェーズと移動

### 4.1 BattlePhase FSM

| Phase | 概要 |
|-------|------|
| `WaveApproach` | Wave 1（および必要なら各 Wave）の右進軍。`worldOffsetX` パララックス。**Wave 1 のみ** 進軍時間 `WAVE_APPROACH_MARCH_SEC`（0.75s） |
| `PreEngage` | 敵左進軍。プレイヤーは隊列維持 or 右進軍 |
| `Engaged` | 接敵戦闘。自動接近・スキル・カメラ |
| `FormationReset` | 敵全滅後。**Wave 1 / 2+ 共通**の単一処理。screen 絶対目標へ隊列復帰しつつ右進軍。完了まで次 Wave に進まない |
| `VictoryExit` | ステージクリア演出 |
| `Defeat` / `Respawn` | 既存 combat フローに準拠 |

`FormationReset` 中はスキルシーケンス・periodic HoT/dispel を停止（現行同等）。

### 4.2 `resolveLayoutTargets`（L1 + L10）

```
1. スロット理想位置（§3.3）
2. 接敵アンカーへブレンド（前衛のみ。leadingRowAdvanceT）
3. resolveOverlaps(PLAYER_VISUAL_MIN_GAP)  ← プレイヤー必須・最終工程
4. 敵: アンカー + 軽い separation（重なり時のみ）
```

**禁止（現行バグ温床）：**

- `compressLeadingRowTowardEnemy` による前衛の同一 X 圧縮
- `contact.visualX += lane` 等 layout 外の直接変更
- Engaged 中の一方通行 visual approach

**凍結フィールド（接敵開始時）：**

- `engagedVisualLaneX` — 前列レーン（前列構成変化時のみ再計算。L4）
- `engagedMeleeVisualSlot` — 近接敵の奥行き（接敵開始時 `battleX` 順で固定）
- `engagedVisualTargetPlayerId` — 遠距離敵の狙いプレイヤー（layout で必ず参照。L5）

### 4.3 接敵トリガー（standoff cap）

**正本：** `shouldStartApproach`（`resolveEnemyMarchCapX`）

1. 最前線の生存敵（プレイヤーに最も近い敵 = **`min(battleX)`**）を取る
2. プレイヤー前衛の `battleX`（**`max(battleX)`** の前衛列）と双方射程から `resolveEnemyMarchEngageGap` を算出
3. 敵の進軍上限 `cap = playerContactX + gap`（新軸・前方側）
4. 敵 `battleX <= cap`（十分左に進んだ）→ `engaged = true`

**表示閾値**（`BATTLE_ENEMY_MARCH_VISIBLE_MAX_X` 等）は **スプライト出現のみ**。Engaged 開始条件ではない。

### 4.4 自動接近（`battleX`）

- プレイヤー前衛（`formationRow !== 'back'`）：生存近接敵がいればその前線を基準。いなければ優先ターゲット基準（`resolvePlayerApproachBattleX`）
- プレイヤー後衛：優先ターゲット基準
- 敵：ターゲット基準 + 近接前線 cap
- **スキル `move` 中・シーケンス busy 中**の actor は自動接近対象外

### 4.5 スキル `move`（L1）

- `battleX` — `SkillSequenceRunner` が線形補間（正本）
- `visualX` — **layout 対象外**。`getActiveMoves()` の overlay のみ
- 敵背後へのプレイヤー `behindTarget` はスコープ内。敵のプレイヤー背後移動はスコープ外

### 4.6 カメラ

- 接敵中：`combatCameraX` で生存プレイヤーの screen 重心がキャンバス中央へ（補間）
- `FormationReset` 完了時：`combatCameraX = 0`、`visualX` / `battleX` 正規化
- 接敵開始時：`combatCameraX !== 0` なら `bakeCombatCameraIntoVisualX`（一度だけ）
- HUD は `combatCameraX` の影響を受けない

### 4.7 非接敵 tick

Wave 進軍・FormationReset 中等、**非接敵中**も DoT/HoT・バフ/デバフ持続・CD 進行は継続。スキル発動・脅威 decay は `Engaged` 中のみ（[combat.md](combat.md) と整合）。

---

## 5. モジュール構成（作り直し後）

| モジュール | 責務 |
|------------|------|
| `combatPosition.ts` | **pure `battleX`**。接近・cap・knockback・`resolveMoveBattleX`。render へ import しない |
| `battleLayout.ts`（新設） | `resolveLayoutTargets`、隊形スロット、overlap、engaged layout |
| `battleCamera.ts`（新設） | `combatCameraX`、`toScreenX`、`bakeCombatCameraIntoVisualX` |
| `battleConstants.ts`（新設 or `types.ts`） | §2.6 定数の単一正本 |
| `BattleEngine.ts` | BattlePhase FSM、tick 順序のオーケストレーション |
| `formationLayout.ts` | `groundY`、HUD 余白、`CANVAS_W` 等 **キャンバス定数のみ** |
| `BattleCanvas.ts` | snapshot → 描画 |

**依存方向：** `battleLayout` → `combatPosition` / `battleConstants`（一方向）。`combatPosition` → `formationLayout` **禁止**。

---

## 6. 現状の問題と解消方針

### 6.1 症状

- 接敵中のスプライト **振動・ワープ・ちらつき**（前列死亡・Wave 跨ぎ）
- 接敵前後の **隊形ジャンプ**（カメラ bake / reset の不統一）
- **Wave 1 と Wave 2+** で reset 挙動が異なる
- 近接/遠距離の **前線ずれ**（判定式の分裂）
- テストが 120000 tick + 緩い閾値で回帰を疑似的に担保

### 6.2 根本原因

| ID | 内容 |
|----|------|
| R1 | `battleX` と `visualX` の二重パイプライン + 橋渡し散在 |
| R2 | `BattleEngine` の位相フラグごと分岐（bake 対象が不一致） |
| R3 | `combatPosition` ↔ `formationLayout` 循環依存・重複定数 |
| R4 | 近接判定が `traits.rangePx` と `resolveMaxEffectiveRangePx` で分裂 |

### 6.3 解消ロジック（確定済み）

| ID | 採用 |
|----|------|
| L1 | 単一 Layout Tick。`move` busy actor は layout スキップ、visual は overlay |
| L2 | 単一 `FormationReset`（Wave 1 は背景・時間差分のみ） |
| L3 | Engaged 中 visual **双方向**補間 |
| L4 | レーンは `engagedVisualLaneX` のみ。`visualX` 直接 mutation 禁止 |
| L5 | `engagedVisualTargetPlayerId` を layout で必ず参照 |
| L6 | `resolveMaxEffectiveRangePx <= 0` を唯一の近接判定 |
| L7 | モジュール分割 + 一方向 import |
| L8 | 軸反転を座標系として一括適用 |
| L9 | layout snapshot 単体テストへ置換 |
| L10 | プレイヤー `resolveOverlaps` 不変条件。敵重なり可 |

**overlap 解消は維持（案 B）。** 捨てるのは圧縮・一方通行 approach・layout 外 mutation。

### 6.4 背後移動スコープ

| 対象 | 含む |
|------|------|
| 敵のプレイヤー背後移動 | **いいえ** |
| プレイヤー `move`（`behindTarget` 等） | **はい** |

---

## 付録 A. 業界参考（補足）

| 型 | 参考にした点 | 採用 |
|----|-------------|------|
| A 横スクロール | 右進軍、前方スポーン、パララックス背景 | L2/L8 |
| B 固定スロット | `row + slotIndex × spacing` | スロット割当・L10 |
| C リアルタイム接近 | 射程内 approach、凍結アンカー | L5・自動接近 |
| D レーン TD | Wave + `spawnX` | §3 |

採用しない：A* / 静止グリッド戦闘 / 敵の背後回り AI。

---

## 関連ドキュメント

- [combat.md](combat.md) — ダメージ、CD、脅威、ステータス（座標節は本書へ委譲）
- [classes-and-skills.md](classes-and-skills.md) — スキル `move` スキーマ
- `data/stages.json` — Wave / `spawnX`
