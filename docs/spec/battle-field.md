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

`battleX` / `screenX` は **値が大きいほど前方（右）**。

距離単位は **px** のまま（1 battle 単位 ≒ 1 画面 px）。擬似 m は採用しない。

### 2.2 座標層（R1-fix: 単一座標）

| 層 | コード名 | 更新責務 | 用途 |
|----|----------|----------|------|
| フィールド | `battleX` | `combatPosition.ts` / `BattleEngine` / `battleLayout.ts` | 射程・接近・隊形・knockback・描画基準（正本） |
| 画面 | `screenX` | 計算値 | `battleX + combatCameraX` |
| カメラ | `combatCameraX` | `battleCamera.ts` | 接敵中パーティ重心をキャンバス中央へ |
| 背景 | `worldOffsetX` | `BattleEngine` | 地面タイルのパララックスのみ |

**統一原則（R1 解消）：**

- **`battleX` が唯一の横位置正本。** ロジックと描画は同じ値を参照する
- 隊形スペーシングは `battleX` に直接反映（§3.3 スロット ideal を battle 座標として使用）
- 近接帯（`rangePx` 0〜24）は **`contact - engagedMinBodyGap() - rangePx`** で奥行き分離。同射程のみ接触線共有可（L10）。混成前列・後列は `resolveOverlaps` で間隔確保
- `visualX` は **非推奨・削除予定**。snapshot 互換のため当面 `battleX` と同値を出力してもよい
- `src/render` は `battleX + combatCameraX`（= `screenX`）のみ参照し、戦闘ルールを持たない

### 2.3 毎 tick パイプライン

```
BattlePhase 判定
  → tickBattleX（自動接近・knockback・隊形 overlap 解消）
  → skill move（busy actor。SkillSequenceRunner が battleX を補間）
  → tickCamera
  → BattleSnapshot
```

接敵開始・前列/近接構成変化時のみ `applyEngagedFormationToBattleX`（1 回 bake）。**毎 tick の layout 再計算・visual 補間は行わない。**

### 2.4 一方通行（フェーズ別）

| フェーズ | プレイヤー `battleX` 自動接近 | 敵 `battleX` 自動接近 |
|----------|------------------------------|----------------------|
| 進軍（`WaveApproach` 等） | 増加のみ（右） | 減少のみ（左） |
| 接敵（`Engaged`） | 前方寄り（詳細 §4） | 減少のみ（左） |
| スキル `move` 中 | シーケンスが正本 | 同左 |

**スコープ外：** 敵がプレイヤー背後へ回る AI / 敵 `move`（後列狙い）。プレイヤー側の `behindTarget` 等スキル `move` は §4.4 で維持。

### 2.5 攻撃位置・move（新軸）

```
effectiveRangePx = effect.range ?? actor.traits.rangePx
近接帯（rangePx < 25）命中: battleDistance <= 0 かつ battleDistance >= -(engagedMinBodyGap() + rangePx)
遠隔帯（rangePx >= 25）命中: battleDistance <= effectiveRangePx
```

**攻撃可能 `battleX`（プレイヤー → 敵・近接帯）：** `target.battleX - engagedMinBodyGap() - rangePx`  
**攻撃可能 `battleX`（プレイヤー → 敵・遠隔帯）：** `target.battleX - rangePx`  
**攻撃可能 `battleX`（敵 → プレイヤー・近接）：** `target.battleX + engagedMinBodyGap()`  
**攻撃可能 `battleX`（敵 → プレイヤー・遠隔）：** `target.battleX + rangePx`

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
| `RANGED_ATTACK_THRESHOLD_PX`（25） | 遠隔帯下限。`rangePx < 25` = 近接帯（0〜24） |
| `MELEE_RANGE_MAX_PX`（24） | 近接帯上限 |
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

3. **理想 battleX（非接敵）：** `ROW_X[row] + slotIndex × PLAYER_ROW_SPACING`
4. **列内順（射程）** — 同一列では **射程が短いほど前方（右）**、長いほど後方（左）。例: 後列で range 40 の療養師は range 50 の弓術士より右（前線側）
5. **overlap 解消** — §4.2（プレイヤーのみ必須）

**近接判定（統一）：** `isMeleeUnit(u) := isMeleeRangePx(resolveMaxEffectiveRangePx(u))`（`< RANGED_ATTACK_THRESHOLD_PX`）

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

### 4.2 `applyEngagedFormationToBattleX`（R1-fix + L10）

**呼び出しタイミング：** 接敵開始・前列死亡・近接→遠隔のみ構成変化（毎 tick 不可）

```
1. スロット ideal battleX（§3.3）
2. 接敵アンカーへ前衛を配置
3. resolveOverlaps(PLAYER_VISUAL_MIN_GAP) on battleX  ← プレイヤー必須
4. 敵: アンカー + separation（重なり時のみ）
```

**禁止：**

- `battleX` / `visualX` 二重パイプラインと橋渡し sync
- 毎 tick の layout 目標再計算 + visual 補間
- layout 外の座標直接 mutation

**凍結フィールド（接敵開始時）：**

- `engagedMeleeVisualSlot` — 近接敵の奥行き（接敵開始時 `battleX` 順で固定）
- `engagedVisualTargetPlayerId` — 遠距離敵の狙いプレイヤー（L5）

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

### 4.5 スキル `move`

- `battleX` — `SkillSequenceRunner` が線形補間（正本・描画も同値）
- 敵背後へのプレイヤー `behindTarget` はスコープ内。敵のプレイヤー背後移動はスコープ外

### 4.6 カメラ

- 接敵中：`combatCameraX` で生存プレイヤーの screen 重心がキャンバス中央へ（補間）
- `FormationReset` 完了時：`combatCameraX = 0`、`battleX` 正規化
- 接敵開始時：`combatCameraX !== 0` なら `bakeCombatCameraIntoBattleX`（一度だけ）
- HUD は `combatCameraX` の影響を受けない

### 4.7 非接敵 tick

Wave 進軍・FormationReset 中等、**非接敵中**も DoT/HoT・バフ/デバフ持続・CD 進行は継続。スキル発動・脅威 decay は `Engaged` 中のみ（[combat.md](combat.md) と整合）。

---

## 5. モジュール構成（作り直し後）

| モジュール | 責務 |
|------------|------|
| `combatPosition.ts` | **pure `battleX`**。接近・cap・knockback・`resolveMoveBattleX`。render へ import しない |
| `battleLayout.ts` | 隊形スロット、overlap、`applyEngagedFormationToBattleX` |
| `battleCamera.ts` | `combatCameraX`、`toScreenX`、`bakeCombatCameraIntoBattleX` |
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
| **R1-fix** | **`battleX` 単一座標。** `visualX` 廃止。描画 = ロジック |
| L2 | 単一 `FormationReset`（Wave 1 は背景・時間差分のみ） |
| L5 | `engagedVisualTargetPlayerId` を layout で必ず参照 |
| L6 | `isMeleeRangePx(resolveMaxEffectiveRangePx(u))` を唯一の近接判定（`< 25`） |
| L7 | モジュール分割 + 一方向 import |
| L8 | 軸反転を座標系として一括適用 |
| L9 | layout snapshot 単体テストへ置換 |
| L10 | 近接帯は `rangePx` 差で battleX 奥行き分離。混成前列のみ `resolveOverlaps` |

**廃止：** L1（毎 tick layout tick）、L3（visual 双方向補間）、L4（`engagedVisualLaneX`）、`battleX`/`visualX` 橋渡し。

**overlap 解消は維持。** 捨てるのは二重パイプライン・毎 tick layout 再計算・visual 補間。

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

## 付録 B. 仕様準拠テスト ID

| 接頭辞 | ファイル | 内容 |
|--------|----------|------|
| F-* | `battleFieldFormation.test.ts` | §3.3 隊形 pure（BattleEngine 不使用） |
| A-* | `battleFieldArchitecture.test.ts` | L1 / §4.2 / §4.6 構造 invariant。`it.fails` は現行未準拠 |
| I-* | `battleFieldIntegration.test.ts` | §4.1 画面結果・勝利演出（最小核） |

**I-* 維持ケース（統合）:**

| ID | 内容 |
|----|------|
| I-§4.1-01 | 接敵前 march の味方画面左寄せ |
| I-§4.1-03b | Wave 1 接敵中 15s 味方 on-screen |
| I-§4.1-07 | Wave 1 接敵中 敵 on-screen + per-tick delta 安定 |
| I-§4.1-05 | Wave 1 全滅→Wave 2 march 開始までの ally screen jump 上限 |
| I-§4.1-06a | 勝利/全滅遷移時の ally screen jump 上限 |
| I-§4.1-06b | Wave 2 敵全滅 tick の ally screen jump 上限 |
| I-Victory-01 | 勝利直後 on-screen（退場 march 待ち） |
| I-Victory-02 | 勝利後の右方向退場 march |

A-/F- で代替した旧 I-*（§4.6 カメラ、§3.3 隊形順、振動 sign-flip 等）は削除済み。layout pure テストは `battleLayout.test.ts` に集約。

共通 harness: `src/battle/test/battleFieldSpec.harness.ts`

---

## 関連ドキュメント

- [combat.md](combat.md) — ダメージ、CD、脅威、ステータス（座標節は本書へ委譲）
- [classes-and-skills.md](classes-and-skills.md) — スキル `move` スキーマ
- `data/stages.json` — Wave / `spawnX`
