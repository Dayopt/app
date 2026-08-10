---
status: current
last_verified: 2026-07-13
code:
  - apps/product/src/features/timeblock
  - apps/product/src/features/calendar
  - supabase/migrations/20260713120023_drop_time_model_compatibility_layer.sql
---

# time-model-split 完了サマリー

ADR-025 で決定した Entry 単一モデルの分割は、2026-07-13 に Phase 1（Step 0-9）を完了した。runtime、物理 DB、公開契約、current docs の正本は Plan / Record で統一されている。

## 最終モデル

- `plans`: Dayopt 内の予定。過去 Plan は時間を凍結し、内容訂正・記録・skip を許可する
- `records`: Dayopt 内の明示記録。`plan_id` は任意で、1 Plan:N Records と予定外 Record を表現する
- `external_calendar_events`: Phase 2 の外部カレンダーミラー用テーブル。同期と ghost UI は未実装
- Calendar / Review: Plan と Record の2レーン、および未記録・skip・予定に対する記録・予定外の4分類を使う

## 最終契約

- tRPC の正本は `plans` / `records` / `statistics`
- DB の正本は `plans` / `records`。`entries`、`entries_effective`、一時 `logs` view、Log 名 RPC alias は存在しない
- Record RPC は `confirm_day_plans_to_records` / `soft_delete_record` / `restore_record`
- iCal export は既存 URL で plans のみを配信する
- MCP は `plans.list` / `records.list` を正本とし、`entries.list` は旧 client 向けの合成互換として残す
- GDPR export / delete は plans / records を扱う

## 移行結果

1. Step 1-7 で schema、backfill、server、統計、Calendar、作成・編集、Review を dormant に構築した
2. Step 8 で runtime と公開契約を plans / records へ切り替えた
3. Step 9a で Entry 由来の dead code と旧公開用語を除去した
4. Step 9b で物理 `logs` を `records` へ rename し、`entries` と依存 DB 資産を削除した。deploy 間隙用に `logs` view と Log 名 RPC alias を一時作成した
5. Step 9c で一時互換層を削除し、生成型、RLS snapshot、runtime code、current docs を最終 schema と Record 用語へ揃えた
6. clean replay で判明した squashed baseline の table grant 欠落を補完し、RLS の前段となる relation privilege を production と一致させた。profiles の billing column write 制限は維持した

Step 9c migration は、Step 9b 直後からの upgrade と全 migration の fresh replay の両方で適用できることを確認した。migration 適用後は `records` table と Record 名 RPC のみが catalog に残り、`logs` REST resource は利用できない。fresh DB でも authenticated client の RLS integration contract が成立する。

## Phase 2 へ残した範囲

- Google Calendar 取り込み、OAuth connection、同期 cursor
- `external_calendar_events` の同期・prune
- ghost 表示と Plan / Record への変換

自動記録モデルは Phase 1 の最終状態に含めない。将来必要になった場合は、`records.source` と Review の解釈を明示的に拡張する。

## 参照

- [全体設計](./overview.md)
- [Step 9 cleanup](./step-9-cleanup.md)
- [ADR-025: time-model-split(../../../product/log/2026-07-09-time-model-split.md)
- [Plan / Record 仕様(../../../product/specs/plan-record.md)
- [GitHub Issue #1580](https://github.com/Dayopt/dayopt/issues/1580)
