# 進行・育成

**Phase 1** で存在するものと、以降のフェーズで追加するもの。

## Phase 1（現状）

- **セーブなし。** リロードで `stage_1` のデモ編成にリセット。
- **EXP・レベルなし**（型定義のみ将来用に存在）。
- **スキル成長なし。** 編成は `parties.json` 固定。
- **ステージループ：** Victory / Defeat 後、3秒待って同一ウェーブ再スポーン（HP全回復）。
- **メタ通貨なし**（globalExp、強化ツリー）。
- **描画：** アニメーション基盤 + ロール別プレースホルダー（本番スプライトは Phase 3）。

Phase 1 は戦闘 + 表示のサンドボックス。

---

## Phase 2 — 個別成長とステージ

### ステージ進行

- `stages.json` に順序付きステージと `expReward` を定義。
- Victory → 次ステージへ（最終後のループは TBD）。
- Defeat → `currentStageId` 維持、同ステージ再戦。

### 個別レベル（ステのみ）

```typescript
interface CharacterProgress {
  level: number;  // 初期 1
  exp: number;
}
```

- 勝利で生存味方全員に EXP（詳細ルールは 2a で確定）。
- LvUP で **maxHp, atk, def** が `levelCurves.json` に従って上昇。
- **REG は成長しない。**
- **Phase 2 では LvUP してもスキルは増えない。**

### セーブ（`SaveManager`）

予定キー：`localStorage` → `auto-battle-idle:save`

```typescript
interface SaveGameState {
  version: number;
  stageProgress: { currentStageId: string; totalClears: number };
  party: {
    classId: ClassId;
    progress: CharacterProgress;
    build: CharacterBuild;
  }[];
}
```

保存タイミング：Victory/Defeat 後、60秒ごと、unload 時。

### 進行 UI

- 現在ステージ名
- メンバー別 Lv（コンパクト）
- ステージクリア / LvUP のログ（console または将来 DOM）

---

## Phase 3 — 本番スプライトアニメーション

進行・育成とは独立した **見た目フェーズ**。詳細は [phase-roadmap.md](../plans/phase-roadmap.md) を参照。

- クラス別・敵別の本番ドット絵スプライトシート
- Phase 1 の `SpriteAnimator` / イベント連動は維持、`SpriteRegistry` とアセットのみ差し替え

---

## Phase 4 — スキル習得・戦闘拡張

### スキル習得

```typescript
interface SkillUnlockEntry {
  level: number;
  skillId: string;
  kind: 'passive' | 'active';
}
// classes.json の skillUnlocks[] に定義
```

- LvUP 時、該当エントリを `learnedPassiveIds` / `learnedActiveIds` に追加。
- 新アクティブの自動装備はしない（装備 UI は後回し）。
- 例（予定）：Bulwark Lv3 → `rally_mend`；Hawkeye Lv2 → `sharp_eye`

### AGI

- `CombatStats` に `agi` を追加。
- **基本攻撃 CD のみ**加速（アクティブ枠は対象外）。
- 式：`remaining -= deltaTime × (100 + effectiveAgi) / 100`

### アクティブ2枠目

- `equippedActiveSlots` 最大長 2。
- 解放条件は未定（ステージマイルストーン / Lv / クラス別等）。

---

## Phase 5 — パーティ全体メタ

### globalExp

- 個別 EXP とは別リソース。
- 勝利とオフライン時間で付与（抽象計算、戦闘シミュレーションなし）。

### 強化ツリー

- `data/enhancementTree.json`
- globalExp を消費；**maxHp / atk / def / agi** をパーティ全体に強化。
- REG は対象外。

### オフライン報酬

- セーブに `lastActiveAt` を保持。
- 起動時に経過時間分の globalExp を付与（上限あり）。

### Electron デスクトップ

- 小さな常に前面ウィンドウ；`ambient` 表示モードを流用。
- セーブ形式はブラウザと同一。

---

## 最終ステータス式（目標）

```
finalStat = クラス基礎値
          + levelGrowth(level)      // Phase 2
          × enhancementMultiplier   // Phase 5
```

スキル・パッシブは戦闘時に上乗せ（[combat.md](combat.md) 参照）。
