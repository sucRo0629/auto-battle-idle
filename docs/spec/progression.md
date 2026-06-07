# 進行・育成

**Phase 1** で存在するものと、以降のフェーズで追加するもの。

## Phase 1（完了）

- セーブなし・EXP/Lv なしの戦闘サンドボックス。
- Victory / Defeat 後、3秒待って HP 全回復し同一ウェーブ再スポーン。
- 描画：アニメーション基盤 + ロール別プレースホルダー（本番スプライトは Phase 6）。

---

## Phase 2 — 個別成長とステージ（完了）

### ステージ進行

- `stages.json` に順序付きステージを定義。
- **Victory** → 次のステージへ進行（最終ステージの次は同ステージを周回）。`totalClears` を +1。
- **Defeat** → `currentStageId` を 1 つ前のステージへロールバック（先頭ステージでは据え置き）。
- 戦闘終了後は 3 秒待って HP 全回復し再スポーン（Phase 1 と同様）。

### EXP 報酬

- ステージ単位の `expReward` は使わない。
- 勝利時、**撃破した敵の `exp` 合計**（`enemies.json` の各テンプレート）を生存味方全員に付与。
- 計算：`computeStageExpReward` がステージ内の全ウェーブ・全敵の `exp` を合算。

### 個別レベル（ステのみ）

```typescript
interface CharacterProgress {
  level: number;  // 初期 1
  exp: number;
}
```

- LvUP で **maxHp, atk, def** が `levelCurves.json` に従って上昇。
- **REG は成長しない。**
- **Phase 2 では LvUP してもスキルは増えない。**

### セーブ（`SaveManager`）

`localStorage` キー：

| モード | キー |
|--------|------|
| 確認モード | `auto-battle-idle:save:verify` |
| リリースモード | `auto-battle-idle:save:release` |

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

初回セーブは `parties.json`（確認モードは `test-parties.json`）からパーティを生成。

保存タイミング：Victory/Defeat 後、60秒ごと、`beforeunload` 時。

### 進行 UI

- 現在ステージ名（Canvas 左上）
- メンバー別 Lv / Exp バー（パーティ HUD）
- ステージクリア / LvUP / ステージロールバックのログ（console）

---

## Phase 3 — スキル習得・戦闘拡張（次フェーズ）

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

## Phase 4 — パーティ全体メタ

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

- 小さな常に前面ウィンドウ
- セーブ形式はブラウザと同一

---

## Phase 6 — 本番スプライトアニメーション

進行・育成とは独立した **見た目フェーズ**（Phase 3〜4 の後）。詳細は [phase-roadmap.md](../plans/phase-roadmap.md) を参照。

- クラス別・敵別の本番ドット絵スプライトシート
- Phase 1 の `SpriteAnimator` / イベント連動は維持、`SpriteRegistry` とアセットのみ差し替え

---

## Phase 7 — スキル VFX

Phase 6 完了後。`skills.json` の `vfx` フィールドでスキル別エフェクトをデータ駆動化。

---

## Phase 8 — バランス調整

Phase 3〜7 完了後。敵 `exp`、成長曲線、クラス/スキル/ステージ数値の体感チューニング。詳細は [phase-roadmap.md](../plans/phase-roadmap.md) を参照。

---

## 最終ステータス式（目標）

```
finalStat = クラス基礎値
          + levelGrowth(level)      // Phase 2
          × enhancementMultiplier   // Phase 4
```

スキル・パッシブは戦闘時に上乗せ（[combat.md](combat.md) 参照）。
