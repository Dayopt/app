---
status: frozen
date: 2026-07-15
code:
  - apps/product/src/features/calendar/components/search/TimeblockSearchDialog.tsx
  - apps/product/src/features/timeblock/components/editor/TimeblockInspector.tsx
  - apps/product/src/features/timeblock/server/timeblock-search-query.ts
---

# ブロック検索をタグとメモに揃えたい

## 原文

> そもそもタイトルってないよね？タイトル＝タグだから、タグとメモを検索じゃない？

## 決定と理由

- 通常UIではタグ名をブロックの表示名とし、独立したタイトルは扱わない
- 検索対象はactiveなタグ名とメモだけにする。DB互換の`title`は検索条件にも結果表示にも使わない
- 結果はタグ名を主表示、メモを補足表示とし、タグを解決できない場合は「タグなし」と表示する
- 結果行の操作は対象日のCalendarと元ブロックのInspectorを開くことだけにし、検索内に複製などの副操作は置かない

## 置き換える判断

- [検索結果を開く操作へ限定する判断](./2026-07-15-feedback-block-search-open-only.md)の単一操作契約を維持しつつ、「検索対象と結果表示は変更しない」という前提をこの契約で置き換える

## 実装状態

- 現行契約は[Calendar仕様](../specs/calendar.md)と[Plan / Record仕様](../specs/plan-record.md)を正本とする
- [block-search Project](../../projects/block-search/overview.md)で実装と検証を管理する
