# Electron シェル（Phase 7 — 配布用）

**ロードマップ:** [phase-roadmap.md §Phase 7](../docs/plans/phase-roadmap.md#phase-7--デスクトップ配布electron) — Release M1 向け zip。常駐 UI（常時前面・トレイ）は **廃止予定**。

## ウィンドウ構成（現状 — 開発用）

| ウィンドウ | ファイル | 役割 |
|-----------|---------|------|
| Battle | `dist/index.html` | 戦闘表示（常に前面・frameless） |
| Menu | `dist/menu.html` | メニュー / スキル管理（第2ウィンドウ） |

ブラウザ開発時は `DomFormationScreenHost` が戦闘画面と切り替える **Formation Screen**（フルスクリーン HTML UI）を表示します。
Electron 起動時は `ElectronBattleMenuHost` が第2ウィンドウを開きます。

## 起動

```bash
npm run build
npm run electron
```

または一括:

```bash
npm run electron:dev
```

## IPC

- `menu:open` — 戦闘ウィンドウからメニューウィンドウを開く
- `menu:init` — メニューウィンドウへパーティ状態を送信
- `menu:build-changed` — スキルセット変更を戦闘ウィンドウへ即時反映
- `menu:close` — メニューウィンドウを閉じる

トレイアイコンからも「メニューを開く」が利用できます。

## アーキテクチャ

```
Battle Window (index.html)
  └─ GameSession + BattleView
  └─ menu_book ボタン → IPC menu:open

Menu Window (menu.html)
  └─ MetaMenuOverlay (window モード)
  └─ セット変更 → IPC menu:build-changed → GameSession.updateMemberBuild
```

`src/platform/menuHost.ts` が実行環境に応じて `DomFormationScreenHost` / `ElectronBattleMenuHost` を切り替えます。
