# 戦闘フィールド（位置・移動・描画）

実装：`src/battle/battleLayout.ts`, `combatPosition.ts`, `partyFormation.ts`, `BattleEngine.ts`  
描画：`src/render/BattleCanvas.ts`（`screenX = battleX`）

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
| 画面 | `screenX` | 計算値 | **`battleX` と同一**（カメラ廃止） |
| 背景 | `worldOffsetX` | `BattleEngine` | 地面タイルのパララックス（Victory 退場時のみ） |

**統一原則（R1 解消）：**

- **`battleX` が唯一の横位置正本。** ロジックと描画は同じ値を参照する
- 隊形スペーシングは `battleX` に直接反映（§3.3 スロット ideal を battle 座標として使用）
- 近接帯（`rangePx` 0〜50）は **`contact - engagedMinBodyGap() - rangePx`** で奥行き分離。同射程のみ接触線共有可（L10）。混成前列・後列は `resolveOverlaps` で間隔確保
- `visualX` は **snapshot 互換ミラー**（`battleX` と同値。layout ロジックは参照しない）
- `src/render` は `battleX`（= `screenX`）のみ参照し、戦闘ルールを持たない

### 2.3 毎 tick パイプライン

```
BattlePhase 判定
  → tickBattleX（PartyDeploy / 自動接近・knockback・隊形 overlap 解消）
  → skill move（busy actor。SkillSequenceRunner が battleX を補間）
  → BattleSnapshot
```

接敵開始・前列/近接構成変化時のみ `applyEngagedFormationToBattleX`（1 回 bake）。**毎 tick の layout 再計算・visual 補間は行わない。**

### 2.4 一方通行（フェーズ別）

| フェーズ | プレイヤー `battleX` 自動接近 | 敵 `battleX` 自動接近 |
|----------|------------------------------|----------------------|
| `PartyDeploy` | 右のみ（左外 → 初期位置） | 左のみ（右外 → spawn 位置） |
| 接敵（`Engaged`） | 射程ベース接近（§4.4 `resolvePlayerApproachBattleX`） | 左のみ・射程ベース接近（§4.4 `resolveEnemyApproachBattleX`） |
| スキル `move` 中 | シーケンスが正本 | 同左 |

**スコープ外：** 敵がプレイヤー背後へ回る AI / 敵 `move`（後列狙い）。プレイヤー側の `behindTarget` 等スキル `move` は §4.4 で維持。

### 2.5 攻撃位置・move（新軸）

```
effectiveRangePx = effect.range ?? actor.traits.rangePx
近接帯（rangePx <= 50）命中: battleDistance <= 0 かつ battleDistance >= -(engagedMinBodyGap() + rangePx)
遠隔帯（rangePx > 50）命中: battleDistance <= effectiveRangePx
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

### 2.6 定数（単一正本：`battleConstants.ts` / `types.ts` / `rangeLimits.ts`）

| 定数 | 用途 |
|------|------|
| `CANVAS_W`（480） | 画面幅 |
| `COMBAT_CAMERA_CENTER_X`（240） | 敵 spawn オフセット基準（カメラは廃止、名前のみ残す） |
| `PARTY_FORMATION_LEFT_ANCHOR`（20） | 味方隊列左端（射程最長ユニット） |
| `PARTY_FORMATION_SLOT_SPACING`（32） | 味方隊列スロット間隔 |
| `SPAWN_X_MAX`（240） | 敵 `spawnX` 上限（中心からの右オフセット） |
| `PLAYER_VISUAL_MIN_GAP` | プレイヤー overlap 解消（≈ `SPRITE_WIDTH + bodyClearance`） |
| `RANGED_ATTACK_THRESHOLD_PX`（50） | 遠隔帯境界。`rangePx <= 50` = 近接帯（0〜50） |
| `MELEE_RANGE_MAX_PX`（50） | 近接帯上限 |
| `CONFIGURABLE_RANGE_PX_MAX` | `traits.rangePx` / `effect.range` の設定上限（`CANVAS_W - PARTY_FORMATION_LEFT_ANCHOR`） |
| `SCROLL_SPEED` / `APPROACH_SPEED` | Victory 退場パララックス / 接敵・PartyDeploy 接近（px/s） |

`formationRow` は Y 描画・ターゲット用。X 深度の正本は射程順一列（`partyFormation.ts`）。

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
        { "templateId": "stage1_1", "spawnX": 120 }
      ]
    }
  ]
}
```

- `spawnX` — **画面中心（240px）からの右オフセット**。`0 <= spawnX <= 240`。`battleX = 240 + spawnX`（240 で中央、240 で右端 480）

### 3.3 プレイヤー隊形（射程順一列）

1. **X 配置正本** — 全生存味方を **射程降順（長い＝左）** で一列。同射程は **物理 `attacker`** を左
2. **スロット間隔** — 左端 `PARTY_FORMATION_LEFT_ANCHOR`（20px）、以降 `+32px`
3. **`formationRow`** — Y 描画・スキルターゲット用（`classes.json`）。X 深度には使わない
4. **overlap 解消** — §4.2（接敵時プレイヤー必須）

**近接判定（統一）：** `isMeleeUnit(u) := isMeleeRangePx(resolveMaxEffectiveRangePx(u))`（`< RANGED_ATTACK_THRESHOLD_PX`）

### 3.4 Wave ライフサイクル

1. **`WaveAnnouncement` + `PartyDeploy`（同時）** — Wave 告知オーバーレイ表示と同時に、味方を画面左外から初期位置へ、敵を画面右外から `spawnX` 解決位置へ移動
2. **接敵** — 告知 fade-out 開始から 250ms 経過 **かつ** PartyDeploy 到達後に `Engaged`
3. 敵全滅 → 死亡演出 → `PostCombatSettle`
4. 次 Wave あり → `VictoryExit` と同様の右退場（`worldOffsetX` パララックス）→ Wave 告知 + PartyDeploy（同時）
5. ステージクリア → `VictoryExit`（接敵終了時の `battleX` を維持し右退場のみ）

**生死と表示：**

- プレイヤー：同一 Wave 中は死体表示。次 Wave 進軍開始でスプライトのみ非表示（HP0・HUD は維持）
- 敵：Wave 終了で差し替え。死体は Wave 内のみ

---

## 4. フェーズと移動

### 4.1 BattlePhase FSM

| Phase | 概要 |
|-------|------|
| `WaveAnnouncement` | 各 Wave 開始。告知オーバーレイ（Victory 同様の fade/hold/fade） |
| `PartyDeploy` | 告知と **同時**。味方左外 → 初期位置、敵右外 → spawn 位置 |
| `Engaged` | 告知 fade-out 開始 + 250ms かつ Deploy 到達後。自動接近・スキル |
| `PostCombatSettle` | 敵全滅後の死亡演出待ち |
| `VictoryExit` | Wave 間・ステージクリア。位置維持のまま右退場（`worldOffsetX` パララックス） |
| `Defeat` / `Respawn` | 既存 combat フローに準拠 |

`PartyDeploy` / 告知中はスキル発動を停止。CD / DoT / HoT は継続。

### 4.2 `applyEngagedFormationToBattleX`（R1-fix + L10）

**呼び出しタイミング：** 接敵開始・前列死亡・近接→遠隔のみ構成変化（毎 tick 不可）

```
1. スロット ideal battleX（§3.3）
2. 接敵アンカーへ前衛を配置
3. resolveOverlaps(PLAYER_VISUAL_MIN_GAP) on battleX  ← プレイヤー必須
4. 敵: 近接帯は接触線共有（重なり可）。遠隔は近接前線 + `enemyRangedRearGap` より後方
```

**禁止：**

- `battleX` / `visualX` 二重パイプラインと橋渡し sync
- 毎 tick の layout 目標再計算 + visual 補間
- layout 外の座標直接 mutation

**凍結フィールド（接敵開始時）：**

- `engagedMeleeVisualSlot` — 近接敵の奥行き（接敵開始時 `battleX` 順で固定）
- `engagedVisualTargetPlayerId` — 遠距離敵の狙いプレイヤー（L5）

### 4.3 接敵開始

**正本：** Wave 告知と PartyDeploy が同時開始。接敵（`engaged = true`）は **告知 fade-out 開始 + 250ms** 経過 **かつ** 全ユニットが deploy 目標に到達した時点。

敵左進軍・standoff cap による接敵トリガーは廃止。

### 4.4 自動接近（`battleX`）

- プレイヤー前衛（`formationRow !== 'back'`）：生存近接敵がいればその前線を基準。いなければ優先ターゲット基準（`resolvePlayerApproachBattleX`）
- プレイヤー後衛：優先ターゲット基準
- 敵：ターゲット基準 + 近接前線 cap
- **スキル `move` 中・シーケンス busy 中**の actor は自動接近対象外

### 4.5 スキル `move`

- `battleX` — `SkillSequenceRunner` が線形補間（正本・描画も同値）
- 敵背後へのプレイヤー `behindTarget` はスコープ内。敵のプレイヤー背後移動はスコープ外

### 4.6 非接敵 tick

`PartyDeploy` / `PostCombatSettle` 中も DoT/HoT・バフ/デバフ持続・CD 進行は継続。スキル発動・脅威 decay は `Engaged` 中のみ（[combat.md](combat.md) と整合）。

---

## 5. モジュール構成（作り直し後）

| モジュール | 責務 |
|------------|------|
| `combatPosition.ts` | **pure `battleX`**。接近・cap・knockback・`resolveMoveBattleX`。render へ import しない |
| `battleLayout.ts` | 隊形スロット、overlap、`applyEngagedFormationToBattleX` |
| `partyFormation.ts` | 射程順一列の ideal `battleX` |
| `battleConstants.ts`（新設 or `types.ts`） | §2.6 定数の単一正本 |
| `BattleEngine.ts` | BattlePhase FSM、tick 順序のオーケストレーション |
| `formationLayout.ts` | `groundY`、HUD 余白、`CANVAS_W` 等 **キャンバス定数のみ** |
| `BattleCanvas.ts` | snapshot → 描画 |

**依存方向：** `battleLayout` → `combatPosition` / `battleConstants`（一方向）。`combatPosition` → `formationLayout` **禁止**。

---

## 6. 現状の問題と解消方針

### 6.1 症状（解消済み / 監視中）

**解消済み（2026-06 レガシー整理）：**

- 接敵中の layout 収束フラグ（`engagedEnemyLayoutTargets`）と combat approach の二重分岐
- `battleLayout` が `visualX` を正本として layout bake と approach が乖離
- 後衛が隊形深度 cap で射程停止より前方へ引きずられる問題

**監視中：**

- 前列死亡・Wave 跨ぎ時のワープ（layout snap と approach の競合）
- 混成前列の overlap 補正タイミング

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
| L6 | `isMeleeRangePx(resolveMaxEffectiveRangePx(u))` を唯一の近接判定（`<= 50`） |
| L7 | モジュール分割 + 一方向 import |
| L8 | 軸反転を座標系として一括適用 |
| L9 | layout snapshot 単体テストへ置換 |
| L10 | 近接帯は `rangePx` 差で battleX 奥行き分離。混成前列のみ `resolveOverlaps` |

**廃止：** L1（毎 tick layout tick）、L3（visual 双方向補間を approach 正本へ統合）、接敵 layout 収束タイマー（`engagedEnemyLayoutTargets`）、`engageStandoff.ts` 等の未使用 helper。

**overlap 解消は維持。** 捨てるのは二重パイプライン・毎 tick layout 再計算・layout 収束と approach の競合。

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
