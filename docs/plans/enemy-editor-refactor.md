# 敵エディタ改修計画

**状態:** 未着手（計画のみ）  
**関連フェーズ:** Phase **6a**（体験版敵テンプレ）、Phase **8a**（本編敵テンプレ）  
**設計方針の正本:** [enemy-design-concept.md](../enemy-design-concept.md)  
**データ正本:** `data/enemies.json`（テンプレ）、`data/skills/`（スキル定義）

---

## 背景

[enemy-design-concept.md](../enemy-design-concept.md) では敵を **「クラス × 数量 × 補正タグ」** として扱う。プレイヤーと同じスキル ID を参照し、ステータスと編成だけ敵用に調整する。

一方、現行の敵エディタ（`EnemyEditorStep` / `editorApi` / `applyEnemyBundle`）は **クラスエディタのコピー** として実装されている。

```
敵 1 体 = enemies.json 1 件 + data/skills/actives/{enemyId}.json 1 ファイル（専用スキル一式）
```

この前提で敵に `at_hunter_active_1` など **既存クラススキル ID** を付けて保存すると、`{enemyId}.json` にスキル定義が複製され、ロード時の **グローバル ID 上書き** が起きる。

### 再現事例（2026-06）

| 項目 | 内容 |
| ---- | ---- |
| 敵テンプレ | `enemy_at_hunter`（`activeSkillIds: ["at_hunter_active_1"]`） |
| 生成ファイル | `data/skills/actives/enemy_at_hunter.json` |
| 症状 | `at_hunter_active_1` が `placedField`（毒罠）ではなく `damage` に上書きされ、味方ハンターも巻き添えで壊れる |
| 暫定対処 | 敵専用 JSON を削除し、`enemies.json` でクラススキル ID を直接参照 |

---

## 目標データモデル

```text
敵テンプレ = enemies.json の 1 エントリ
  ├─ ステータス（maxHp / atk / def / reg / exp / traits / attackSpeedTier）
  ├─ basicAttackSkillId  → 既存 active ID を参照可（{enemyId}_basic_attack に限定しない）
  ├─ passiveSkillIds[]   → 既存 passive ID を参照
  ├─ activeSkillIds[]    → 既存 active ID を参照
  └─ （任意）敵専用スキル → {enemyId}_* のみ data/skills/ に実体を持つ
```

**原則**

- クラスと同じスキルは **参照のみ**。敵用 JSON へ複製しない。
- 敵専用スキル（ボス強化パッシブ、数値差分の通常攻撃など）だけ `{enemyId}.json` に保存する。
- スキルレジストリは引き続き **全 `actives/*.json` のマージ**（`loadGameData.ts`）。重複 ID はエラーとする。

[enemy-design-concept.md §12](../enemy-design-concept.md#12-新クラスお披露目敵としての段階導入) の「弱・中・強」段階は、**同じクラススキル ID のサブセット** と **敵ステータス** で表現する。クラス定義の再作成は不要。

---

## 現状 vs 目標

| 観点 | 現状（問題） | 目標 |
| ---- | ------------ | ---- |
| スキル保存先 | 敵に紐づく全スキルを `{enemyId}.json` に書き込み | 参照スキルは `enemies.json` の ID リストのみ。所有スキルだけ JSON |
| `basicAttackSkillId` | `buildEnemyFromDraft` が常に `{enemyId}_basic_attack` に上書き | テンプレに記載した ID を尊重（`at_hunter_basic_attack` 等） |
| スキル追加 UI | `addEnemySkill` → `nextClassSkillId(enemyId, …)` で新規 ID 発行のみ | 「既存スキルを参照」と「敵専用スキルを新規作成」の二経路 |
| バリデーション | 同一 ID の複数ファイルを検出しない | ロード / 保存時に重複 ID をエラー |
| 演出ラボ | 敵選択時も entity 単位でスキル JSON を upsert しうる | 参照スキル編集時はクラス側ファイルへ、または読み取り専用 |

---

## 実装フェーズ（推奨順）

### Phase A — 安全装置（再発防止）

**スコープ:** validate のみ。UI 変更なし。

- [ ] `validateGameData` に **スキル ID グローバル重複検出**（`actives` / `passives` をファイル横断で集計）
- [ ] 敵スキルファイル `{enemyId}.json` に **`{enemyId}_` プレフィックス外の ID** が含まれる場合は警告またはエラー（移行期間は warn → 後に error）
- [ ] 既存データの棚卸し（`enemy_*.json` にクラス ID が混在していないか Grep）

**触るファイル:** `src/battle/data/validateGameData.ts`、テスト

### Phase B — 保存経路の分離

**スコープ:** エディタ API + dev server。UI は現状のままでも、手動で参照 ID を入れたテンプレは壊れなくなる。

- [ ] `SkillDraftEntry`（または同等）に `ownership: 'owned' | 'ref'` を導入
- [ ] `initEnemySkillEntriesFromPreset` — レジストリ上の stem が `enemyId` と一致するスキルのみ `owned`、それ以外は `ref`
- [ ] `collectSkillsFromDrafts` / `saveEnemyBundle` — `owned` のみ `replaceEntitySkillsInFiles` へ。`ref` は `enemies.json` の ID リストのみ更新
- [ ] `buildEnemyFromDraft` — `basicAttackSkillId` の強制上書きをやめ、エントリ / テンプレの値を尊重
- [ ] `enemyId` 変更時 — `owned` スキルのみ ID リネーム（`ref` は触らない）

**触るファイル:**

- `src/editor/editorApi.ts`
- `src/editor/EditorApp.ts`（`prepareEnemySkillEntriesForSave` 等）
- `vite-plugin-editor-api.ts`（`applyEnemyBundle`）
- `src/battle/data/skillsJsonFs.ts`（必要なら）

### Phase C — UI

**スコープ:** 編集体験を設計方針に合わせる。

- [ ] 「既存スキルを参照」— クラス別 / 一覧ピッカー（`fetchSkills` のレジストリ）
- [ ] 参照スキルは **読み取り専用** 表示（編集はクラスタブへ誘導）
- [ ] 「敵専用スキルを新規作成」— 現行の `addEnemySkill` 相当（`{enemyId}_*` ID）
- [ ] （任意）**ベースクラス選択** — `classId` からスキル ID 雛形とステータス参考値を一括セット
- [ ] `EnemyEditorStep` の手入力 ID 行をピッカー中心に置き換え

**触るファイル:**

- `src/editor/EnemyEditorStep.ts`
- `src/editor/EditorApp.ts`
- `src/editor/SkillEditorStep.ts`（敵タブ連携）

### Phase D — 演出ラボ整合

- [ ] `applyPresentationSkill` — 敵 + 参照スキル編集時に `{enemyId}.json` へ丸ごと書かない
- [ ] 敵の traits / 敵専用通常攻撃 VFX のみパッチする経路を維持

**触るファイル:** `vite-plugin-editor-api.ts`、`src/presentation/PresentationLabApp.ts`

---

## 実装パス（コード索引）

| 領域 | パス |
| ---- | ---- |
| 敵テンプレ UI | `src/editor/EnemyEditorStep.ts` |
| ドラフト構築・保存 | `src/editor/editorApi.ts`（`buildEnemyFromDraft`, `initEnemySkillEntriesFromPreset`, `collectEnemySkillRefs`） |
| エディタ統合 | `src/editor/EditorApp.ts`（`saveEnemy`, `addEnemySkill`, `buildEnemySkillOptions`） |
| 保存 API | `vite-plugin-editor-api.ts`（`applyEnemyBundle`） |
| スキル JSON 書き込み | `src/battle/data/skillsJsonFs.ts`（`replaceEntitySkillsInFiles`） |
| ランタイム読み込み | `src/battle/data/loadGameData.ts` |
| バリデーション | `src/battle/data/validateGameData.ts` |
| 戦闘生成 | `src/battle/entities.ts`（`createEnemyFromTemplate`） |

エントリ: `editor.html` → 敵タブ

---

## 完了条件（acceptance criteria）

1. 敵テンプレに `at_hunter_active_1` を付けてエディタ保存しても、**`at_hunter.json` の定義が変わらない**
2. `validateGameData` が **意図しないスキル ID 重複** を検出する
3. 敵専用通常攻撃 `{enemyId}_basic_attack` のみ `{enemyId}.json` に保存できる
4. `basicAttackSkillId` にクラス通常攻撃 ID（例: `at_hunter_basic_attack`）を指定して保存・再読み込みできる
5. 既存の test 敵（`test_enemy` 等）が引き続き validate / 戦闘可能
6. [enemy-design-concept.md §12](../enemy-design-concept.md#12-新クラスお披露目敵としての段階導入) の段階導入（スキルサブセット）をエディタのみで作成できる（Phase C 完了時）

---

## 移行期の運用（エディタ改修まで）

エディタ改修が入るまでの **安全な手順**:

1. `data/enemies.json` にテンプレを追加・編集する
2. `passiveSkillIds` / `activeSkillIds` / `basicAttackSkillId` には **既存スキル ID をそのまま** 書く
3. **`data/skills/actives/enemy_*.json` にクラススキル ID を置かない**（敵エディタで保存しない）
4. 敵専用の通常攻撃だけ必要なら `{enemyId}_basic_attack` を `{enemyId}.json` に 1 件だけ置く
5. `data/stages.json`（または `stages-demo.json`）の `templateId` で Wave に配置する

---

## 既知の戦闘実装メモ（エディタ外）

敵が `placedField` 系スキルを使う場合、設置中心の解決（`resolvePlacedFieldCenterX`）は現状 **敵配列側のクラスタ** を見る。単体敵では足元設置になり、味方クラスタ中心への設置とは異なる。挙動変更は combat / battle-field の spec とセットで別タスクとする（本改修のスコープ外）。

---

## 関連ドキュメント

- [enemy-design-concept.md](../enemy-design-concept.md) — 敵の設計思想・段階導入
- [progression.md](../spec/progression.md) — `enemies.json` / ステージ / EXP
- [classes-and-skills.md](../spec/classes-and-skills.md) — スキル JSON スキーマ・エディタ同期ルール
- [phase-roadmap.md §6a](phase-roadmap.md#6a--敵テンプレ体験版) — 体験版敵テンプレ作業
- `.cursor/rules/skill-data-editor-sync.mdc` — スキル schema 変更時のエディタ同期
