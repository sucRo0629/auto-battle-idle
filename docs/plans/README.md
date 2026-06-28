# Plans（開発計画）

Auto Battle Idle の開発ロードマップ。

- **[フェーズロードマップ](phase-roadmap.md)** — Phase 1〜12 の内容・状態・依存関係（**番号順**）
- **[Release マイルストーン](phase-roadmap.md#release-マイルストーン)** — M1 体験版 / M2 初版 Chapter 1

## 概要（番号順）

| Phase | 内容 | Release |
| ----- | ---- | ------- |
| **1–3** | 戦闘コア・セーブ・スキル習得 | — |
| **4** | クラスマスタ + 編成 UI + **4e i18n** | M1 準備 |
| **5** | 演出 PNG / VFX / 演出ラボ | 並行可 |
| **6** | **体験版** 敵・`stages-demo`・Lv1 バランス（8 クラス） | **M1** |
| **7** | Electron **配布 zip** | **M1** |
| **8** | **本編** 敵・`stages.json`・Lv1 バランス（13 クラス）・編集 GUI | **M2** |
| **9** | 印術師・法陣師（9a / 9b） | M3+ |
| **10–11** | ローグライク / 印術・法陣ローグ | 後 |
| **12** | Stage Records / Level Sync | 8b 後 |

**データ分離:** 体験版ステージ（Phase **6b**）と本編ステージ（Phase **8b**）は **別 JSON**。混在しない。

ゲームルール: [spec](../spec/README.md)
