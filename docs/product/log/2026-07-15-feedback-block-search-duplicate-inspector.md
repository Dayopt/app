---
status: frozen
date: 2026-07-15
superseded_by: docs/product/log/2026-07-15-feedback-block-search-open-only.md
code:
  - apps/product/src/features/calendar/components/search/TimeblockSearchDialog.tsx
  - apps/product/src/features/timeblock/components/editor/TimeblockInspector.tsx
---

# 検索の複製UIを最新のインスペクターへ統合したい

## 原文

> 作りはいいね。ただ複製時のUIが古いやつになってない？最新のcodex/timeslot-ui-tuningブランチを統合してそっちのをそのまま反映できる？

## 決定と理由

- `codex/timeslot-ui-tuning`の最新実装を統合し、検索結果の副操作も同じ複製Inspectorへ接続する
- 検索専用の「複製用にコピー」は廃止し、タイトル・メモ・tag・日時・Plan / Record種別を引き継いだ未保存の詳細カードを開く
- Calendar内では現在の表示日を維持する。Calendar外から検索した場合だけ、Inspectorが利用できる対象日のCalendarへ移動してから開く
- 新しい行は「複製を作成」で明示作成し、元の`id` / `plan_id`や関係は引き継がない

## 置き換える判断

- [当初のブロック検索判断](./2026-07-15-feedback-block-search.md)にあるclipboard経由の再利用契約を、この直接複製Inspector契約で置き換える
- 検索結果の行を選んで元ブロックを開く導線は変更しない

## 実装状態

- 現行契約は[Calendar仕様](../specs/calendar.md)と[Plan / Record仕様](../specs/plan-record.md)を正本とする
- [block-search Project](../../projects/block-search/overview.md)で実装と検証を管理する
