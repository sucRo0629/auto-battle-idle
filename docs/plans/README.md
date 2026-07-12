# Plans（開発計画）

Hensei Only の開発ロードマップ。

- **[フェーズロードマップ](phase-roadmap.md)** — Phase 1〜12 の内容・状態・依存関係（**番号順**）
- **[Phase 4 ロードマップ](phase-4-roadmap.md)** — 4a〜4e の作業順・チェックリスト・完了条件
- **[Release マイルストーン](phase-roadmap.md#release-マイルストーン)** — M1 体験版 / M2 初版 Chapter 1（Phase 4 詳細: [§Release M1 サマリ](phase-4-roadmap.md#release-m1-サマリphase-4-との関係)）
- **[itch.io Devlog 方針](itch-io-devlog.md)** — ストアページ・Devlog の開始タイミングと M1 チェックリスト
- **[マスター作業順（完了）](master-work-order.md)** — Phase 1〜3 + battle-field cleanup アーカイブ
- **[敵エディタ改修計画](enemy-editor-refactor.md)** — クラススキル参照モデルへの tooling 移行（未着手）
- **[戦場移動 一本化の残タスク](battle-movement-unification-remaining.md)** — `formationRow` 依存排除・spec 矛盾解消（未着手）

## 概要（番号順）

| Phase | 内容 | Release |
| ----- | ---- | ------- |
| **1–3** | 戦闘コア・セーブ・スキル習得 | — |
| **4** | クラスマスタ + 編成 UI（**4a〜4d 完了**）。**4e i18n は M1 直前** | M1 準備 → **Phase 6** |
| **5** | 演出 PNG / VFX / 演出ラボ | 並行可 |
| **6** | **体験版** 敵・`stages-demo`・Lv1 バランス（8 クラス） | **M1** |
| **7** | Electron **配布 zip** | **M1** |
| **8** | **本編** 敵・`stages.json`・Lv1 バランス（13 クラス）・編集 GUI | **M2** |
| **9** | 印術師・法陣師（9a / 9b） | M3+ |
| **10–11** | ローグライク / 印術・法陣ローグ | 後 |
| **12** | Stage Records / Level Sync | 8b 後 |

**データ分離:** 体験版ステージ（Phase **6b**）と本編ステージ（Phase **8b**）は **別 JSON**。混在しない。

ゲームルール: [spec](../spec/README.md)
