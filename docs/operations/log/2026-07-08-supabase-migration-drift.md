---
status: active
superseded_by: 2026-07-12-incident-supabase-production-migration-stall.md
last_verified: 2026-07-08
issue: 1462
code: supabase/migrations
---

# Supabase main branch MIGRATIONS_FAILED 調査

Issue #1462 の初期調査として、Supabase main branch status と production migration history を非破壊で確認した。

## 確認結果

- Supabase project `dayopt` (`yvglwblxrnrenfifsnje`) の default branch `main` は `MIGRATIONS_FAILED` のまま。
- Preview project status は `ACTIVE_HEALTHY`。
- production DB の `supabase_migrations.schema_migrations` で確認できる最新 migration は `20260604232051_grant_authenticated_rpc_helpers`。
- repo の `supabase/migrations/` には `20260604232051` より後の migration が 10 本ある。

未適用候補:

- `20260610000000_entry_auto_record_model.sql`
- `20260613000000_drop_orphan_tag_detail_rpcs.sql`
- `20260615000000_drop_unused_stats_rpcs.sql`
- `20260616000000_rename_duration_to_planned_duration.sql`
- `20260704050000_harden_remaining_definer_rpc_user_guard.sql`
- `20260704051000_allow_service_role_definer_rpc_guard.sql`
- `20260705070000_restrict_profiles_billing_column_grants.sql`
- `20260705070100_restrict_profiles_billing_column_grants_for_anon.sql`
- `20260706120000_enforce_entry_tag_owner.sql`
- `20260706120100_backfill_entry_tag_owner_mismatch.sql`

## 判断

GitHub integration が production migration の通常経路である前提は維持する。ただし、現時点では repo の migration と production DB の migration history が一致していないため、#1462 はまだ close しない。

この状態では、security migration を merge しても production DB へ反映済みとは判断できない。launch 前に Supabase dashboard の production deployment log を確認し、失敗した migration 名と SQL error を特定する必要がある。

## 復旧ゲート

- Supabase dashboard の production deployment / branch log で失敗箇所を特定する。
- production DB の backup / PITR 状態を確認する。
- `supabase db push --dry-run` で未適用 migration を確認し、対象 migration ファイルの destructive change / backfill / lock risk をレビューする。
- 手動 `supabase db push` が必要な場合は、作業理由と dry-run 結果を後続 log に残してから実行する。
- 適用後に `supabase_migrations.schema_migrations` の最新 version と branch status を再確認する。

## 検証

- Supabase branch list: default `main` status `MIGRATIONS_FAILED`
- production migration history read: latest `20260604232051_grant_authenticated_rpc_helpers`
- local migration list read: `20260706120100_backfill_entry_tag_owner_mismatch.sql` まで存在
