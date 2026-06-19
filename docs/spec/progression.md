# 進行・育成

**Phase 1** で存在するものと、以降のフェーズで追加するもの。

## Phase 1（完了）

- セーブなし・EXP/Lv なしの戦闘サンドボックス。
- Victory / Defeat 後、3 秒待って HP 全回復し同一ウェーブ再スポーン。
- 描画：アニメーション基盤 + ロール別プレースホルダー（本番スプライトは Phase 5）。

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
  level: number; // 初期 1
  exp: number;
}
```

- LvUP で **maxHp, atk, def** が上昇（**Phase 4** で成長段階 + `growthPresets` 方式に刷新。詳細は [stats.md](stats.md)）。
- **REG は成長しない。**
- **Phase 2 では LvUP してもスキルは増えない。**

### セーブ（`SaveManager`）

`localStorage` キー：

| モード         | キー                            |
| -------------- | ------------------------------- |
| 確認モード     | `auto-battle-idle:save:verify`  |
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

初回セーブは `parties.json` からパーティを生成。

保存タイミング：Victory/Defeat 後、60 秒ごと、`beforeunload` 時。パーティ編集時は即時。

### 習得済みビルドの永続化

各メンバーの `build: CharacterBuild` をセーブに含める。

| フィールド                               | 永続化のタイミング                                                                  |
| ---------------------------------------- | ----------------------------------------------------------------------------------- |
| `learnedPassiveIds` / `learnedActiveIds` | LvUP 時に `classes.json` の `skills[]` から再計算して更新                           |

- ロード時：`migrateSaveClassIds` で旧 classId（例: `at_sniper` → `at_ballista`）を置換したうえで、`reconcilePartyBuilds` がレベルと習得リストを突き合わせ、不整合を修復してから再保存する。
- `equippedActiveSlots` は歴史的互換フィールドとして残る場合があるが、設計上は使用しない。ロード時の整合対象は習得済みリストを正とする。
- 新アクティブ習得時は、付け替え操作なしで常時使用可能になる。

### 進行 UI

- 現在ステージ名（Canvas 左上）
- メンバー別 Lv / Exp バー（パーティ HUD）
- **パーティ編成メニュー**（`SkillMenuPanel`）— 選択中メンバーの **Lv 反映ステータス**を表示
  - **HP** のみ英字表記、それ以外は日本語（攻撃力 / 防御力 / 魔法耐性 / 攻撃速度）
  - 攻撃速度は内部略称 **SPD**（`attackSpeedTier`）。UI では 5 段階ラベル（遅い〜早い）
  - 編成画面ではスキル buff 込みの実効値は表示しない（素のクラス + Lv）
- ステージクリア / LvUP / ステージロールバックのログ（console）

---

## Phase 3 — スキル習得・戦闘拡張（完了）

### スキル習得

```typescript
interface ClassSkillUnlock {
  level: number; // この Lv 以上で習得
  skillIds: string[];
}
// classes.json の skills[] に定義。種別は data/skills/ から解決
```

- LvUP 時、`resolveLearnedSkills` が該当 `skillIds` を `learnedPassiveIds` / `learnedActiveIds` に反映。
- 習得したアクティブは、Lv に応じた枠数内で常時使用可能になる。付け替え・セット操作は行わない。
- 習得エントリは `classes.json` の各クラス `skills[]` に定義する。

### アクティブ枠（最大 4）

- 戦闘参加は **`learnedActiveIds`**（習得即参加）。
- 段階解放: Lv0=2 / Lv10=3 / Lv20=4（`getUnlockedActiveSlotCount`）。
- Party HUD: 2×2 リキャスト + 多段チャージストックピップ（`maxCharges > 0` 時）。

### 習得済みビルドの永続化

`reconcileMemberBuild` / `reconcilePartyBuilds`（`skillBuild.ts`）がレベルと `skills[]` から習得リストを同期する。詳細は Phase 2 セーブ節を参照。

---

## Phase 4 — クラスマスタ

Phase 3 の習得機構 + キャラクターデータ GUI で **クラス 15 種**を確定する。

- 数値・習得タイミングの最終調整は **Phase 7**
- スキル説明（`formatSkillText`）は **データ PR ごと** に同梱（Phase 4b）。一括 polish は Phase 7 前

### ステータス・成長（Phase 4a）

- **Lv1 基準値** — `classes.json` の `maxHp` / `atk` / `def`
- **成長段階** — 同ファイルの `growthTier`（HP / ATK / DEF 各 低・中・高）
- **成長マスタ** — `levelCurves.json` の `growthPresets`（defender / attacker / supporter）
- **術師** — `growthPresetKey: "caster"` で HP/DEF は supporter 表、ATK は attacker 表
- **攻撃速度** — `attackSpeedTier` + `attackSpeedPresets`（基本攻撃 CD のみ）
- 計算: `src/progression/levelGrowth.ts`（`resolveStatGrowth`, `computeStatsAtLevel`）
- 開発 GUI: `ClassEditorStep` に成長段階・SPD・Lv10 プレビュー

詳細は [stats.md](stats.md)。

---

## Phase 5 — 演出アセット + 演出調整ツール

進行・育成とは独立。**確定 classId / enemyId から順次** PNG とタイミングを載せる。詳細は [phase-roadmap.md](../plans/phase-roadmap.md)。

- `data/entityAnimLayout.json` + `sheets/bodies/{id}.png`（idle/move/death、味方・敵共通レイアウト）
- 通常攻撃・全 active = `sheets/skills/*.png`（64×48 strip）。遠隔 basic も弓引き PNG で body 可
- **演出調整ツール** — Canvas プレビュー + VFX / タイミング調整

---

## Phase 6 — VFX PNG 描画（完了）

Phase 5 の演出ラボで VFX **調整** は済。Phase 6 で戦闘 VFX を PNG strip（`sheets/vfx/`）描画に統一した。

---

## Phase 7 — バランス調整

Phase 3〜6 完了後。敵 `exp`、成長曲線、クラス/スキル/ステージ数値の体感チューニング。詳細は [phase-roadmap.md](../plans/phase-roadmap.md) を参照。

### アクティブ枠構造

- 全クラス共通で Lv0=2、Lv10=3、Lv20=4。
- `getUnlockedActiveSlotCount` はこの Lv 段階を返す。
- **UI**（HUD / スキル表示）と**戦闘**（`createCooldowns` 等）の両方で、習得済みアクティブの常時使用枠として扱う。
- 付け替え・セット・装備変更によるビルド分岐は行わない。ビルドは `classes.json` の習得構造で決まる。

---

## Phase 8 — パーティ全体メタ

Phase 7（バランス調整）完了後に着手。Electron シェルは `electron/main.mjs` に基盤のみ一部実装済み。

### globalExp

- 個別 EXP とは別リソース。
- 勝利とオフライン時間で付与（抽象計算、戦闘シミュレーションなし）。

### 強化ツリー

- `data/enhancementTree.json`
- globalExp を消費；**maxHp / atk / def** をパーティ全体に強化。
- REG は対象外。

### オフライン報酬

- セーブに `lastActiveAt` を保持。
- 起動時に経過時間分の globalExp を付与（上限あり）。

### Electron デスクトップ

- 小さな常に前面ウィンドウ
- セーブ形式はブラウザと同一

---

## 最終ステータス式（目標）

```
finalStat = Lv1 基準値（classes.json）
          + resolveStatGrowth(growthTier, growthPresets) × (Lv - 1)
          × enhancementMultiplier   // Phase 8
```

スキル・パッシブは戦闘時に上乗せ（[combat.md](combat.md) 参照）。
