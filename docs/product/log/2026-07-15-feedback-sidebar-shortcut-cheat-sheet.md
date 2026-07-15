---
status: frozen
date: 2026-07-15
code:
  - apps/product/src/components/shell/sidebar
  - apps/product/src/features/calendar
---

# Sidebarのヘルプメニューからショートカット一覧を開く

Calendarのショートカット一覧を、キーボード操作だけでなくSidebar右端のヘルプメニューからも発見できるようにする要望。

---

## 原文

> ok.ここまでコミット。そのうえで次のチートシートを右側の項目に追加したい https://github.com/Dayopt/dayopt/issues/1480

## 文脈

- Sidebar右端には丸囲みの「？」アイコンとヘルプメニューを追加済み
- Issue #1480はCalendarの登録済みショートカットを一覧表示するDialogを求めている

## 解釈

- `?`キーに加え、Sidebar右端のヘルプメニューにもショートカット一覧の項目を置く
- どちらの導線も同じDialogを開き、表示内容は実際のshortcut registryを正とする

## 対応

- ヘルプメニューへ「キーボードショートカット」を追加する
- 登録済みhandlerの表示metadataから一覧を組み立て、localeとplatformに合う表記で表示する
