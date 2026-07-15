---
status: frozen
date: 2026-07-15
code: apps/product/src/features/calendar/components/ShortcutCheatSheetDialog.tsx
superseded_by: docs/product/log/2026-07-15-feedback-sidebar-help-menu-right.md
---

# ショートカット一覧は背景を覆わずに表示する

ショートカット一覧を開いた際は背景をオーバーレイで暗くせず、Sidebarのヘルプメニューはボタン右上に表示したいという要望。

---

## 原文

> ショートカット開いたときに背景をオーバーせずに普通に表示でおｋ．あとヘルプアイコン開く場所はボタンの右上かな

## 文脈

- ショートカット一覧は中央Dialogとして追加され、既定の背景overlayが表示されていた
- Sidebar右端の「？」アイコンからヘルプメニューを開ける

## 解釈

- ショートカット一覧の面と閉じる操作は維持し、背景overlayだけを表示しない
- ヘルプメニューは「？」ボタンの上側に出し、右端をボタンに揃える

## 対応

- Dialogに背景overlayの表示を切り替えるオプションを追加し、ショートカット一覧では非表示にする
- Sidebarのヘルプメニューは`side="top"`、`align="end"`の配置を維持する
