---
status: frozen
date: 2026-07-15
superseded_by: docs/product/log/2026-07-15-feedback-block-search-tag-note.md
code: apps/product/src/features/calendar/components/search/TimeblockSearchDialog.tsx
---

# 検索結果は対象ブロックを開く操作に限定したい

## 原文

> 検索するとそのときに飛ぶでいいんじゃないんだっけ？ごめん、その仕様が自然よね？検索画面で複製できるって別にいらない機能だと思う

## 決定と理由

- 検索結果の行を選ぶと対象日のCalendarへ移動し、元ブロックのInspectorを開く
- 検索画面から複製する副操作は置かず、結果行の操作を1つに限定する
- 複製したい場合は対象へ移動した後、統合済みの最新Inspectorにある共通の「複製」を使う
- 低頻度の検索で判断を増やさず、「見つける・開く」という役割だけを持たせる

## 置き換える判断

- [検索から最新の複製Inspectorを直接開く判断](./2026-07-15-feedback-block-search-duplicate-inspector.md)を、この単一操作の契約で置き換える
- 検索対象、結果表示、Sidebar / mobile / shortcutの入口は変更しない

## 実装状態

- 現行契約は[Calendar仕様](../specs/calendar.md)を正本とする
- [block-search Project](../../projects/block-search/overview.md)で実装と検証を管理する
