# クラスとスキル

ゲームデータは `data/*.json`。型とローダー：`src/battle/types.ts`, `loadGameData.ts`

## ロール（3種）

| ロール | 役割 |
|--------|------|
| `defender` | 前列タンク + 軽い支援（buff/heal 可） |
| `attacker` | ダメージディーラー（近接/遠隔はクラス traits で決定） |
| `supporter` | 回復・支援（中列/後列が典型） |

`classId` 命名：`{role}_{flavor}`（例：`defender_bulwark`）

## 配置

`formationRow` で列を決定：`front` → `middle` → `back`（左＝敵側）。

同一列内の横並び順はパーティ **配列順**。

敵のターゲットは **戦場 X**（`closestAlly`）：位置が最も近い生存味方。ロール優先はなし。

## デモクラス（Phase 1）

| classId | 表示名 | ロール | 列 | 射程 | HP | ATK | DEF | REG |
|---------|--------|--------|-----|------|----|-----|-----|-----|
| `defender_bulwark` | Bulwark | defender | front | melee | 300 | 12 | 24 | 0 |
| `attacker_berserker` | Berserker | attacker | front | melee | 120 | 28 | 10 | 0 |
| `supporter_cleric` | Cleric | supporter | middle | ranged (100px) | 100 | 14 | 10 | 0 |
| `attacker_hawkeye` | Hawkeye | attacker | back | ranged (140px) | 90 | 18 | 6 | 0 |

`spriteKey` / `iconKey` 未指定時はロール別プレースホルダーを使用（Phase 1）。**Phase 6** でクラス別本番スプライトシートに差し替え。

## スキル枠

| 枠 | 数（Phase 1〜2） | 出所 | UI |
|----|-------------------|------|-----|
| **basic** | 1 | `ClassPreset.basicAttackSkillId` | 非表示 |
| **active** | 1（装備） | `build.equippedActiveSlots[0]` | HUD リキャストバー |

- 基本攻撃も `skills.json` の `actives` に定義し、`slotKind: 'basic'` で実行。
- 基本攻撃 ID を `equippedActiveSlots` に入れない。
- Phase 3 以降：アクティブ最大2枠。

## ビルドルール

```typescript
interface CharacterBuild {
  learnedPassiveIds: string[];   // すべて同時発動
  learnedActiveIds: string[];    // 習得プール（Phase 3+ で LvUP 時に増加）
  equippedActiveSlots: string[]; // Phase 1〜2: 長さ1
}
```

- **パッシブ：** `learnedPassiveIds` の全 ID が同時に有効（枠上限なし）
- **アクティブ：** 装備枠のみ CD 完了時に自動発動

### パッシブの合成

| 効果 | 合成ルール |
|------|------------|
| `damageMultiplier` | 乗算 |
| `damageTakenMultiplier` | 乗算 |
| `healBonus` | 加算 |
| `activeCooldownRate` | 乗算（active 枠のみ） |
| `targetRuleOverride` | 配列の後ろのパッシブが優先 |

## ターゲットルール

| ルール | 使用例 |
|--------|--------|
| `closestAlly` | 敵スキル（Bite 等） |
| `frontEnemy` | 味方の多くの攻撃（X が最も近い敵） |
| `lowestHpEnemy` | Hawkeye（`snipe` パッシブで上書き） |
| `mostDamagedAlly` | Heal, Iron Guard |

## デモ編成（`parties.json` → `demo`）

| キャラ | パッシブ | 装備アクティブ | 基本攻撃（非表示） |
|--------|----------|----------------|-------------------|
| Bulwark | Thick Skin（被ダメ ×0.9） | Iron Guard | bulwark_strike |
| Berserker | Brute（与ダメ ×1.15） | Slash | berserker_strike |
| Cleric | Gentle Touch（回復 +4） | Heal | cleric_strike |
| Hawkeye | Snipe → 最低 HP 敵 | Arrow | hawkeye_shot |

### Iron Guard（defender buff）

- 対象：`mostDamagedAlly`
- 効果：`damageTaken × 0.75` を 5 秒
- CD：4 秒
- VFX：対象スプライトの白い光（約0.8秒）

## スキル一覧（Phase 1）

### パッシブ

| id | 効果 |
|----|------|
| `thick_skin` | 被ダメ ×0.9 |
| `brute` | 与ダメ ×1.15 |
| `gentle_touch` | 回復 +4 |
| `snipe` | ターゲット → `lowestHpEnemy` |

### アクティブ（抜粋）

| id | 効果 | CD | 備考 |
|----|------|-----|------|
| `*_strike` / `hawkeye_shot` | 物理ダメージ | 約2秒 | 各クラスの基本攻撃 |
| `iron_guard` | damageTaken buff | 4秒 | defender のみ |
| `slash` | 物理ダメージ | 3秒 | attacker |
| `heal` | 回復 | 5秒 | supporter, defender |
| `arrow` | 物理ダメージ | 2.5秒 | attacker |
| `bite` | 物理ダメージ | 2.5秒 | test_enemy |

## 敵（Phase 1）

| id | HP | ATK | DEF | スキル |
|----|-----|-----|-----|--------|
| `test_enemy` | 200 | 50 | 4 | bite（`closestAlly`） |

ステージ `stage_1`：test_enemy × 2。`expReward: 10`（Phase 2 まで未使用）。

## コンテンツ追加手順

1. `classes.json` にクラスを追加
2. 必要なら `skills.json` にスキルを追加
3. `parties.json` または将来のセーブ形式で ID を参照
4. 起動時 `validateGameData` が ID 参照の整合性をチェック
