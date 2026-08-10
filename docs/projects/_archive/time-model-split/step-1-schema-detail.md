---
status: current
last_verified: 2026-07-09
code:
  - supabase/migrations/20260708232500_add_time_model_tables.sql
---

# Step 1: Plan / Log schema detail

Phase 1 の最初の実装 PR として、`entries` をまだ温存したまま `plans` / `logs` / `external_calendar_events` の器だけを追加する。データ移行、router 差し替え、`entries` / `entries_effective` の削除は後続 Step に分ける。

## Goal

既存 runtime を壊さずに、Plan / Log 分割後の書き込み先になる新テーブルと DB 側の所有者整合を先に固定する。

## Minimum Viable Approach

1. `external_calendar_events` を最小ミラー table として作る。同期ジョブや ghost UI はまだ作らないが、`plans` / `logs` の FK を最初から正しく張るため table は先に置く。
2. `plans` と `logs` を追加し、時間順序 CHECK、source CHECK、source と external FK の shape CHECK、`plans_no_overlap` / `logs_no_overlap` EXCLUDE を設定する。時間順序 CHECK は後続 backfill で soft delete 済み歴史行を保持できるよう、`deleted_at IS NOT NULL` の行を許可する。
3. `source` は provenance なので `BEFORE UPDATE OF source` trigger で不変にする。
4. `tag_id` / `plan_id` / `external_calendar_event_id` は constraint trigger で同一 `user_id` の所有物だけを許可する。
5. RLS は `auth.uid() = user_id` を基本にする。soft delete 済み `plans` / `logs` は SELECT から隠す。

## Scope

この Step で追加するもの:

- `public.external_calendar_events`
- `public.plans`
- `public.logs`
- EXCLUDE / CHECK / FK / index / updated_at trigger
- owner consistency trigger
- RLS policies / GRANT

この Step で追加しないもの:

- `entries` からの backfill
- `entries` / `entries_effective` の drop
- `plans` / `logs` tRPC router
- Calendar / Inspector / Review UI
- 外部カレンダー OAuth / sync cursor / prune job / ghost UI

## Reversibility Table

| Step                                               | Tag     | 備考                                                                              |
| -------------------------------------------------- | ------- | --------------------------------------------------------------------------------- |
| `external_calendar_events` / `plans` / `logs` 追加 | [hours] | table 追加だけで既存 runtime から未参照。drop migration で戻せる                  |
| EXCLUDE / CHECK / FK / owner trigger               | [hours] | schema rollback が必要。既存 `entries` には触れない                               |
| RLS / GRANT 追加                                   | [hours] | policy / grant rollback が必要。Data API 公開範囲が変わるため snapshot で確認する |

## Security Notes

- `plans` / `logs` は authenticated user が自分の rows のみ CRUD できる。
- `external_calendar_events` は provider mirror なので authenticated user には `SELECT` と `dismissed_at` の `UPDATE` だけを許可する。同期用の `INSERT` / `DELETE` は service role の責務に残す。
- `external_calendar_events` の provider event uniqueness は `provider_calendar_id` まで含め、Google Calendar の event id が calendar 単位で一意な前提に合わせる。
- `external_calendar_events` は `status = 'cancelled'` の tombstone だけ `title` / `start_at` / `end_at` 欠落を許可し、通常 event は CHECK で必須化する。
- owner consistency trigger は RLS だけに頼らず、service role / 将来 RPC 経路から foreign tag / plan / external event を保持できないようにする。

## Follow-up

次の PR は `entries` → `plans` / `logs` の migration 詳細設計に進む。特に `overview.md` §8 未決 4（auto-record backfill を明示記録と区別するか）は、データ移行 SQL を書く前に決める。
