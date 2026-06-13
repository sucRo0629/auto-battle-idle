# ステータス（Phase 1〜4）

| 略称 | フィールド | 説明 |
|------|------------|------|
| HP | maxHp | 体力（**Lv1 基準値**。`classes.json`） |
| ATK | atk | 攻撃力 / **`atkBased` 回復・バリア** の基礎（Lv1 基準） |
| DEF | def | 物理防御（Lv1 基準） |
| REG | reg | 魔法耐性。非魔法系は 0、魔法系クラスは 5/10/15/20 のいずれか。**Lv 成長しない** |
| SPD | attackSpeedTier | 攻撃速度（5 段階 enum）。**基本攻撃 CD のみ**に影響。未指定は `normal` |

## Lv 成長（Phase 4）

成長対象は **HP / ATK / DEF のみ**。REG・SPD は Lv とともに変化しない。

### 成長式（線形加算）

```
stat(Lv) = Lv1 基準値 + 加算値 × (Lv - 1)
```

- 毎 Lv 同じ整数が加わる（係数%・複利ではない）
- 加算値は `classes.json` の **成長段階** + `levelCurves.json` の **growthPresets** から解決（`resolveStatGrowth` / `computeStatsAtLevel`）

### データの分担

| データ | 意味 |
|--------|------|
| `classes.json` — `maxHp` / `atk` / `def` | Lv1 基準値 |
| `classes.json` — `growthTier` | HP / ATK / DEF 各 **1=低 / 2=中 / 3=高**（独立） |
| `classes.json` — `growthPresetKey` | `role=attacker` のみ。`caster` = 術師合成（下表） |
| `levelCurves.json` — `growthPresets` | ロール別マスタ表（段階 → LvUP 1 回あたりの加算） |
| `levelCurves.json` — `expPerLevel` | LvUP に必要な EXP（`expPerLevel × 現在 Lv`） |

旧 `statGrowth.byClass` は **廃止**。プレイ可能クラスは `growthTier` 必須。

### growthPresets（3 種）

| キー | 参照クラス |
|------|------------|
| `defender` | 衛士 |
| `attacker` | 剣士・弓士（および術師の **ATK 成長**） |
| `supporter` | 薬師（および術師の **HP / DEF 成長**） |

**術師 `growthPresetKey: "caster"`** — JSON に第 4 表は持たない。ステごとに preset を合成:

| ステ | 参照 preset |
|------|-------------|
| maxHp | `supporter` |
| def | `supporter` |
| atk | `attacker` |

各 preset × 各ステで **tier 1 < 2 < 3**（validate で強制）。具体数値は `data/levelCurves.json` を正本とする。

## 攻撃速度（SPD）

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

**現状:** クラス `attackSpeedTier` のみ反映。**未実装（予定）:** パッシブ `attackSpeedTierShift`、buff/debuff の `attackSpeed` による tier ステップ変更。アクティブ枠 CD（`activeCooldownRate`）とは別系統。

## エディタ（開発用）

`ClassEditorStep`（Step 1）で Lv1 ステ・成長段階・SPD・術師 preset を編集し、**Lv10 試算**をプレビュー。`growthPresets` マスタ自体の GUI 編集はスコープ外（JSON 直編集）。
