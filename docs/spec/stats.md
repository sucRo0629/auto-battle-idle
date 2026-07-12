# ステータス

実装（legacy）: `src/battle/stats.ts`, `computeStatsAtLevel`, `data/classes.json`, `data/levelCurves.json`

**R2 注記:** 本書 **§現行方針（R2）** が新仕様の正本。**§Legacy — Lv 成長・攻撃速度 Tier** は現行 production 実装の説明。具体数値のデータ確定は **R4 以降**。

上位方針: [combat-architecture.md §0.4](../combat-architecture.md#04-攻撃間隔)、[class-philosophy.md §0](../class-philosophy.md#0-現行兵科設計原則r1)

---

## 現行方針（R2）

### 兵科基礎ステータス

兵科本体が持つ基礎値。**恒久 Lv 成長・EXP による加算は上位設計から外す**（legacy §Legacy を参照）。

| 項目 | 役割 | 備考 |
| ---- | ---- | ---- |
| **基礎 HP** | 耐久の基準 | 兵科ごとの基礎値。Wave 間 HP 回復の有無は **R3** |
| **基礎 ATK** | 与ダメ・回復・バリア量の基準 | `atkBased` 効果の基礎 |
| **基礎 DEF** | 物理被ダメ軽減の基準 | 魔法被ダメには非適用 |
| **基礎 RES** | 魔法被ダメ軽減の基準 | 物理兵科は原則 0。魔法兵科は非 0 |
| **攻撃間隔** | 通常行動周期（秒） | 旧 attackSpeed Tier の代替。詳細は [combat.md §攻撃間隔](combat.md#攻撃間隔) |
| **射程** | 基本射程帯 | 戦闘方式が上書きしうる |

**ステータスに含めないもの:**

| 項目 | 正本 |
| ---- | ---- |
| Hit 数 | 戦闘方式側（[combat.md §Attack と Hit](combat.md#attack-と-hit)） |
| 対象数 | 戦闘方式側 |
| Hit 構造（係数・分配） | 戦闘方式側 |
| 優先ターゲット | 兵科固定（[classes-and-skills.md §新仕様構造](classes-and-skills.md#新仕様構造r2)） |
| ダメージ属性 | 兵科固定（原則） |

### 移動速度

**当面は全兵科共通値**、または内部実装値として扱う。兵科差分の主要軸にはしない。移動速度差・移動阻害は **R8 作戦内パッシブ候補** として保留。

### RES の成長

魔法耐性（RES）は **Lv とともに変化しない** 方針を維持する（legacy 実装も RES は成長対象外）。

### 未確定（R4 / R5 前）

| 項目 | 送り先 |
| ---- | ------ |
| 各兵科の基礎 HP / ATK / DEF / RES の具体値 | R4 データ確定 |
| 各兵科の攻撃間隔（秒） | R5 試作前 |
| 各兵科の射程（px） | R5 試作前 |
| JSON フィールド名・型 | R4 |

---

## Legacy — Lv 成長・攻撃速度 Tier

> **現行 production 実装の説明。** 新仕様では Lv 成長・growthTier・attackSpeed Tier・Instant Lv20 前提は正本から外す。R5 以降の実装で段階的に廃止する。

### 略称（legacy データ）

| 略称 | フィールド | 説明 |
|------|------------|------|
| HP | maxHp | 体力（**Lv1 基準値**。`classes.json`） |
| ATK | atk | 攻撃力 / **`atkBased` 回復・バリア** の基礎（Lv1 基準） |
| DEF | def | 物理防御（Lv1 基準） |
| RES | res | 魔法耐性。非魔法系は 0、魔法系クラスは 5/10/15/20 のいずれか。**Lv 成長しない** |
| SPD | attackSpeedTier | 攻撃速度（5 段階 enum）。**基本攻撃 CD のみ**に影響。未指定は `normal` |

### Lv 成長（Phase 4 — legacy）

成長対象は **HP / ATK / DEF のみ**。RES（魔法耐性）・SPD は Lv とともに変化しない。

```
stat(Lv) = Lv1 基準値 + 加算値 × (Lv - 1)
```

- 加算値は `classes.json` の **成長段階** + `levelCurves.json` の **growthPresets** から解決（`resolveStatGrowth` / `computeStatsAtLevel`）
- 旧 `statGrowth.byClass` は **廃止**。プレイ可能クラスは `growthTier` 必須

### growthPresets（legacy）

| キー | 参照クラス |
|------|------------|
| `defender` | 衛士 |
| `attacker` | 剣士・弓士（および術師の **ATK 成長**） |
| `supporter` | 薬師（および術師の **HP / DEF 成長**） |

**術師 `growthPresetKey: "caster"`** — ステごとに preset を合成: maxHp/def → `supporter`、atk → `attacker`。

### 攻撃速度 Tier（legacy — 廃止方向）

数値フィールド **`agi` は設けない**。クラスは **5 段階 ID のみ**。

| ID | UI ラベル |
|----|-----------|
| `slow` | 遅い |
| `somewhatSlow` | やや遅い |
| `normal` | 普通（既定） |
| `somewhatFast` | やや早い |
| `fast` | 早い |

`levelCurves.json` の `attackSpeedPresets` が **基本攻撃 CD 係数**（`basicCooldownRate`）を定義。`normal` = 1.0。

```
実効 basic CD 進行: remaining -= deltaTime × basicCooldownRate
実効 interval 目安 ≈ skill.interval ÷ basicCooldownRate
```

**新仕様への移行:** 上記 Tier / `basicCooldownRate` は **秒単位の攻撃間隔** へ置き換える（§現行方針）。`attackSpeed` buff / debuff / `attackSpeedTierShift` も一時効果整理（[combat.md §一時バフ / デバフ](combat.md#一時バフ--デバフ)）へ送る。

### エディタ（legacy 開発用）

`ClassEditorStep`（Step 1）で Lv1 ステ・成長段階・SPD・術師 preset を編集し、**Lv10 試算**をプレビュー。新仕様のエディタは **R9**。
