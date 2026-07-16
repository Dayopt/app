---
status: frozen
date: 2026-07-16
code:
  - apps/product/src/features/calendar/components/search/TimeblockSearchDialog.tsx
  - packages/components/src/overlays/dialog.tsx
---

# モバイル検索を標準的な全高bottom sheetにする

## 原文

> 検索のモバイルのUIなんだけど、おかしくない？デファクトスタンダードな検索の作りにしたい

> ボトムシートだからいいのかな？

> そうしましょう

## 決定と理由

- bottom sheet自体は維持し、短い選択用の高さ80%表示から、検索入力に適した全高表示へ変更する
- 検索欄を上部に固定し、その右側に「キャンセル」を置く
- 検索結果と空・loading・error状態は、keyboard表示中も残りの領域だけをscrollする
- desktopは既存の中央dialogを維持する

## 実装状態

- 現行契約は[Calendar仕様](../specs/calendar.md)を正本とする
- [block-search Project](../../projects/block-search/overview.md)で実装と検証を管理する
