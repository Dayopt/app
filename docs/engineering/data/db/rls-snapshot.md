# RLS / schema snapshot（自動生成）

> **生成元**: `scripts/generate-rls-snapshot.ts`（`pnpm rls:snapshot`）。DB の `pg_policies` /
> RLS 有効状態 / GRANT / Realtime publication を deterministic に書き出した snapshot。
> **手で編集しない**。migration 変更時は CI（`pnpm rls:snapshot:check`）が drift を検出する。
> 再生成で更新すること。
>
> 集計: public スキーマの policy 29 件 / RLS 対象テーブル 11 件 / GRANT 75 件 / Realtime publication 0 件。

## RLS 有効状態（public テーブル）

| table                     | RLS enabled | forced |
| ------------------------- | ----------- | ------ |
| email_suppressions        | ✅          | —      |
| entries                   | ✅          | —      |
| mfa_recovery_codes        | ✅          | —      |
| oauth_audit_log           | ✅          | —      |
| oauth_authorization_codes | ✅          | —      |
| oauth_tokens              | ✅          | —      |
| profiles                  | ✅          | —      |
| reports                   | ✅          | —      |
| stripe_webhook_events     | ✅          | —      |
| tags                      | ✅          | —      |
| user_settings             | ✅          | —      |

## ポリシー一覧（table 別）

### email_suppressions

| policy                   | cmd | permissive | roles                | USING | WITH CHECK |
| ------------------------ | --- | ---------- | -------------------- | ----- | ---------- |
| No browser client access | ALL | PERMISSIVE | {anon,authenticated} | false | false      |

### entries

| policy                     | cmd    | permissive | roles    | USING                                                              | WITH CHECK                              |
| -------------------------- | ------ | ---------- | -------- | ------------------------------------------------------------------ | --------------------------------------- |
| Users can delete own plans | DELETE | PERMISSIVE | {public} | (( SELECT auth.uid() AS uid) = user_id)                            | —                                       |
| Users can insert own plans | INSERT | PERMISSIVE | {public} | —                                                                  | (( SELECT auth.uid() AS uid) = user_id) |
| Users can view own plans   | SELECT | PERMISSIVE | {public} | ((( SELECT auth.uid() AS uid) = user_id) AND (deleted_at IS NULL)) | —                                       |
| Users can update own plans | UPDATE | PERMISSIVE | {public} | (( SELECT auth.uid() AS uid) = user_id)                            | (( SELECT auth.uid() AS uid) = user_id) |

### mfa_recovery_codes

| policy                              | cmd    | permissive | roles    | USING                                   | WITH CHECK                              |
| ----------------------------------- | ------ | ---------- | -------- | --------------------------------------- | --------------------------------------- |
| Users can delete own recovery codes | DELETE | PERMISSIVE | {public} | (( SELECT auth.uid() AS uid) = user_id) | —                                       |
| Users can insert own recovery codes | INSERT | PERMISSIVE | {public} | —                                       | (( SELECT auth.uid() AS uid) = user_id) |
| Users can view own recovery codes   | SELECT | PERMISSIVE | {public} | (( SELECT auth.uid() AS uid) = user_id) | —                                       |

### oauth_audit_log

| policy                       | cmd    | permissive | roles    | USING                                   | WITH CHECK |
| ---------------------------- | ------ | ---------- | -------- | --------------------------------------- | ---------- |
| Users can view own audit log | SELECT | PERMISSIVE | {public} | (( SELECT auth.uid() AS uid) = user_id) | —          |

### oauth_authorization_codes

| policy                   | cmd | permissive | roles                | USING | WITH CHECK |
| ------------------------ | --- | ---------- | -------------------- | ----- | ---------- |
| No browser client access | ALL | PERMISSIVE | {anon,authenticated} | false | false      |

### oauth_tokens

| policy                          | cmd    | permissive | roles    | USING                                   | WITH CHECK |
| ------------------------------- | ------ | ---------- | -------- | --------------------------------------- | ---------- |
| Users can view own oauth_tokens | SELECT | PERMISSIVE | {public} | (( SELECT auth.uid() AS uid) = user_id) | —          |

### profiles

| policy                                   | cmd    | permissive | roles           | USING                              | WITH CHECK                         |
| ---------------------------------------- | ------ | ---------- | --------------- | ---------------------------------- | ---------------------------------- |
| Service role has full access to profiles | ALL    | PERMISSIVE | {service_role}  | true                               | true                               |
| Users can delete own profile             | DELETE | PERMISSIVE | {authenticated} | (( SELECT auth.uid() AS uid) = id) | —                                  |
| Service role can insert profiles         | INSERT | PERMISSIVE | {service_role}  | —                                  | true                               |
| Users can insert own profile             | INSERT | PERMISSIVE | {authenticated} | —                                  | (( SELECT auth.uid() AS uid) = id) |
| Users can view own profile               | SELECT | PERMISSIVE | {authenticated} | (( SELECT auth.uid() AS uid) = id) | —                                  |
| Users can update own profile             | UPDATE | PERMISSIVE | {authenticated} | (( SELECT auth.uid() AS uid) = id) | —                                  |

### reports

| policy                       | cmd    | permissive | roles          | USING                                   | WITH CHECK |
| ---------------------------- | ------ | ---------- | -------------- | --------------------------------------- | ---------- |
| Users can delete own reports | DELETE | PERMISSIVE | {public}       | (( SELECT auth.uid() AS uid) = user_id) | —          |
| System can create reports    | INSERT | PERMISSIVE | {service_role} | —                                       | true       |
| Users can view own reports   | SELECT | PERMISSIVE | {public}       | (( SELECT auth.uid() AS uid) = user_id) | —          |

### stripe_webhook_events

| policy                   | cmd | permissive | roles                | USING | WITH CHECK |
| ------------------------ | --- | ---------- | -------------------- | ----- | ---------- |
| No browser client access | ALL | PERMISSIVE | {anon,authenticated} | false | false      |

### tags

| policy                    | cmd    | permissive | roles    | USING                                   | WITH CHECK                              |
| ------------------------- | ------ | ---------- | -------- | --------------------------------------- | --------------------------------------- |
| Users can delete own tags | DELETE | PERMISSIVE | {public} | (( SELECT auth.uid() AS uid) = user_id) | —                                       |
| Users can insert own tags | INSERT | PERMISSIVE | {public} | —                                       | (( SELECT auth.uid() AS uid) = user_id) |
| Users can view own tags   | SELECT | PERMISSIVE | {public} | (( SELECT auth.uid() AS uid) = user_id) | —                                       |
| Users can update own tags | UPDATE | PERMISSIVE | {public} | (( SELECT auth.uid() AS uid) = user_id) | (( SELECT auth.uid() AS uid) = user_id) |

### user_settings

| policy                        | cmd    | permissive | roles           | USING                                   | WITH CHECK                              |
| ----------------------------- | ------ | ---------- | --------------- | --------------------------------------- | --------------------------------------- |
| Users can delete own settings | DELETE | PERMISSIVE | {authenticated} | (( SELECT auth.uid() AS uid) = user_id) | —                                       |
| Users can insert own settings | INSERT | PERMISSIVE | {authenticated} | —                                       | (( SELECT auth.uid() AS uid) = user_id) |
| Users can view own settings   | SELECT | PERMISSIVE | {authenticated} | (( SELECT auth.uid() AS uid) = user_id) | —                                       |
| Users can update own settings | UPDATE | PERMISSIVE | {authenticated} | (( SELECT auth.uid() AS uid) = user_id) | (( SELECT auth.uid() AS uid) = user_id) |

## GRANT 一覧（public schema）

| object type | object                                 | grantee             | privileges     |
| ----------- | -------------------------------------- | ------------------- | -------------- |
| routine     | public.auto_shrink_neighbors           | service_role        | EXECUTE        |
| routine     | public.batch_rename_tags               | authenticated       | EXECUTE        |
| routine     | public.batch_rename_tags               | service_role        | EXECUTE        |
| routine     | public.batch_reorder_tags              | service_role        | EXECUTE        |
| routine     | public.batch_reorder_tags_hierarchy    | authenticated       | EXECUTE        |
| routine     | public.batch_reorder_tags_hierarchy    | service_role        | EXECUTE        |
| routine     | public.bulk_soft_delete_entries        | authenticated       | EXECUTE        |
| routine     | public.bulk_soft_delete_entries        | service_role        | EXECUTE        |
| routine     | public.check_tag_has_children          | service_role        | EXECUTE        |
| routine     | public.check_tag_hierarchy             | service_role        | EXECUTE        |
| routine     | public.count_unused_recovery_codes     | authenticated       | EXECUTE        |
| routine     | public.count_unused_recovery_codes     | service_role        | EXECUTE        |
| routine     | public.custom_access_token_hook        | service_role        | EXECUTE        |
| routine     | public.custom_access_token_hook        | supabase_auth_admin | EXECUTE        |
| routine     | public.get_active_dates                | authenticated       | EXECUTE        |
| routine     | public.get_active_dates                | service_role        | EXECUTE        |
| routine     | public.get_active_users_for_reflection | service_role        | EXECUTE        |
| routine     | public.get_blank_rate                  | authenticated       | EXECUTE        |
| routine     | public.get_blank_rate                  | service_role        | EXECUTE        |
| routine     | public.get_daily_hours                 | authenticated       | EXECUTE        |
| routine     | public.get_daily_hours                 | service_role        | EXECUTE        |
| routine     | public.get_dow_distribution            | authenticated       | EXECUTE        |
| routine     | public.get_dow_distribution            | service_role        | EXECUTE        |
| routine     | public.get_estimation_accuracy         | authenticated       | EXECUTE        |
| routine     | public.get_estimation_accuracy         | service_role        | EXECUTE        |
| routine     | public.get_fulfillment_trend           | service_role        | EXECUTE        |
| routine     | public.get_hourly_distribution         | authenticated       | EXECUTE        |
| routine     | public.get_hourly_distribution         | service_role        | EXECUTE        |
| routine     | public.get_monthly_hours               | authenticated       | EXECUTE        |
| routine     | public.get_monthly_hours               | service_role        | EXECUTE        |
| routine     | public.get_plan_summary                | service_role        | EXECUTE        |
| routine     | public.get_stats_kpi_summary           | authenticated       | EXECUTE        |
| routine     | public.get_stats_kpi_summary           | service_role        | EXECUTE        |
| routine     | public.get_stats_page_data             | authenticated       | EXECUTE        |
| routine     | public.get_stats_page_data             | service_role        | EXECUTE        |
| routine     | public.get_tag_stats                   | authenticated       | EXECUTE        |
| routine     | public.get_tag_stats                   | service_role        | EXECUTE        |
| routine     | public.get_time_by_tag                 | authenticated       | EXECUTE        |
| routine     | public.get_time_by_tag                 | service_role        | EXECUTE        |
| routine     | public.get_time_pl_data                | authenticated       | EXECUTE        |
| routine     | public.get_time_pl_data                | service_role        | EXECUTE        |
| routine     | public.get_timeboxing_adherence        | authenticated       | EXECUTE        |
| routine     | public.get_timeboxing_adherence        | service_role        | EXECUTE        |
| routine     | public.get_total_time                  | authenticated       | EXECUTE        |
| routine     | public.get_total_time                  | service_role        | EXECUTE        |
| routine     | public.get_user_timezone               | authenticated       | EXECUTE        |
| routine     | public.get_user_timezone               | service_role        | EXECUTE        |
| routine     | public.get_vault_secret                | service_role        | EXECUTE        |
| routine     | public.get_weekly_focus_score          | authenticated       | EXECUTE        |
| routine     | public.get_weekly_focus_score          | service_role        | EXECUTE        |
| routine     | public.handle_new_user                 | service_role        | EXECUTE        |
| routine     | public.increment_tag_sort_orders       | service_role        | EXECUTE        |
| routine     | public.invoke_edge_function            | service_role        | EXECUTE        |
| routine     | public.issue_oauth_token_pair          | service_role        | EXECUTE        |
| routine     | public.merge_tags                      | authenticated       | EXECUTE        |
| routine     | public.merge_tags                      | service_role        | EXECUTE        |
| routine     | public.merge_tags_with_hierarchy       | authenticated       | EXECUTE        |
| routine     | public.merge_tags_with_hierarchy       | service_role        | EXECUTE        |
| routine     | public.rename_tag_group                | authenticated       | EXECUTE        |
| routine     | public.rename_tag_group                | service_role        | EXECUTE        |
| routine     | public.restore_entry                   | authenticated       | EXECUTE        |
| routine     | public.restore_entry                   | service_role        | EXECUTE        |
| routine     | public.soft_delete_entry               | authenticated       | EXECUTE        |
| routine     | public.soft_delete_entry               | service_role        | EXECUTE        |
| routine     | public.trunc_week_tz                   | authenticated       | EXECUTE        |
| routine     | public.trunc_week_tz                   | service_role        | EXECUTE        |
| routine     | public.update_personalization          | authenticated       | EXECUTE        |
| routine     | public.update_personalization          | service_role        | EXECUTE        |
| routine     | public.update_updated_at               | service_role        | EXECUTE        |
| routine     | public.use_recovery_code               | authenticated       | EXECUTE        |
| routine     | public.use_recovery_code               | service_role        | EXECUTE        |
| routine     | public.vault_secret_exists             | service_role        | EXECUTE        |
| table       | public.entries_effective               | authenticated       | SELECT         |
| table       | public.entries_effective               | service_role        | SELECT         |
| table       | public.profiles                        | service_role        | INSERT, UPDATE |

## Realtime publication

`supabase_realtime` に含まれる public table。空なら Realtime 公開なし。

- なし
