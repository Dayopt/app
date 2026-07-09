# RLS / schema snapshot（自動生成）

> **生成元**: `scripts/generate-rls-snapshot.ts`（`pnpm rls:snapshot`）。DB の `pg_policies` /
> RLS 有効状態 / GRANT / Realtime publication を deterministic に書き出した snapshot。
> **手で編集しない**。migration 変更時は CI（`pnpm rls:snapshot:check`）が drift を検出する。
> 再生成で更新すること。
>
> 集計: public スキーマの policy 42 件 / RLS 対象テーブル 14 件 / GRANT 105 件 / Realtime publication 0 件。

## RLS 有効状態（public テーブル）

| table                     | RLS enabled | forced |
| ------------------------- | ----------- | ------ |
| email_suppressions        | ✅          | —      |
| entries                   | ✅          | —      |
| external_calendar_events  | ✅          | —      |
| logs                      | ✅          | —      |
| mfa_recovery_codes        | ✅          | —      |
| oauth_audit_log           | ✅          | —      |
| oauth_authorization_codes | ✅          | —      |
| oauth_tokens              | ✅          | —      |
| plans                     | ✅          | —      |
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

### external_calendar_events

| policy                                                   | cmd    | permissive | roles           | USING                                   | WITH CHECK                              |
| -------------------------------------------------------- | ------ | ---------- | --------------- | --------------------------------------- | --------------------------------------- |
| Service role has full access to external calendar events | ALL    | PERMISSIVE | {service_role}  | true                                    | true                                    |
| Users can view own external calendar events              | SELECT | PERMISSIVE | {authenticated} | (( SELECT auth.uid() AS uid) = user_id) | —                                       |
| Users can dismiss own external calendar events           | UPDATE | PERMISSIVE | {authenticated} | (( SELECT auth.uid() AS uid) = user_id) | (( SELECT auth.uid() AS uid) = user_id) |

### logs

| policy                               | cmd    | permissive | roles           | USING                                                                           | WITH CHECK                                                                      |
| ------------------------------------ | ------ | ---------- | --------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Service role has full access to logs | ALL    | PERMISSIVE | {service_role}  | true                                                                            | true                                                                            |
| Users can delete own logs            | DELETE | PERMISSIVE | {authenticated} | ((( SELECT auth.uid() AS uid) = user_id) AND (source <> 'auto_migrated'::text)) | —                                                                               |
| Users can insert own logs            | INSERT | PERMISSIVE | {authenticated} | —                                                                               | ((( SELECT auth.uid() AS uid) = user_id) AND (source <> 'auto_migrated'::text)) |
| Users can view own logs              | SELECT | PERMISSIVE | {authenticated} | ((( SELECT auth.uid() AS uid) = user_id) AND (deleted_at IS NULL))              | —                                                                               |
| Users can update own logs            | UPDATE | PERMISSIVE | {authenticated} | ((( SELECT auth.uid() AS uid) = user_id) AND (source <> 'auto_migrated'::text)) | ((( SELECT auth.uid() AS uid) = user_id) AND (source <> 'auto_migrated'::text)) |

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

### plans

| policy                                | cmd    | permissive | roles           | USING                                                              | WITH CHECK                              |
| ------------------------------------- | ------ | ---------- | --------------- | ------------------------------------------------------------------ | --------------------------------------- |
| Service role has full access to plans | ALL    | PERMISSIVE | {service_role}  | true                                                               | true                                    |
| Users can delete own plans            | DELETE | PERMISSIVE | {authenticated} | (( SELECT auth.uid() AS uid) = user_id)                            | —                                       |
| Users can insert own plans            | INSERT | PERMISSIVE | {authenticated} | —                                                                  | (( SELECT auth.uid() AS uid) = user_id) |
| Users can view own plans              | SELECT | PERMISSIVE | {authenticated} | ((( SELECT auth.uid() AS uid) = user_id) AND (deleted_at IS NULL)) | —                                       |
| Users can update own plans            | UPDATE | PERMISSIVE | {authenticated} | (( SELECT auth.uid() AS uid) = user_id)                            | (( SELECT auth.uid() AS uid) = user_id) |

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

| object type | object                                                                                                                                                                                                                                                                                  | grantee             | privileges                     |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ------------------------------ |
| column      | public.external_calendar_events.dismissed_at                                                                                                                                                                                                                                            | authenticated       | UPDATE                         |
| column      | public.profiles.avatar_url                                                                                                                                                                                                                                                              | authenticated       | INSERT, UPDATE                 |
| column      | public.profiles.email                                                                                                                                                                                                                                                                   | authenticated       | INSERT                         |
| column      | public.profiles.full_name                                                                                                                                                                                                                                                               | authenticated       | INSERT, UPDATE                 |
| column      | public.profiles.id                                                                                                                                                                                                                                                                      | authenticated       | INSERT                         |
| column      | public.profiles.updated_at                                                                                                                                                                                                                                                              | authenticated       | UPDATE                         |
| routine     | public.auto_shrink_neighbors(p_user_id uuid, p_entry_id uuid, p_actual_start timestamp with time zone, p_actual_end timestamp with time zone)                                                                                                                                           | service_role        | EXECUTE                        |
| routine     | public.backfill_entries_to_plans_logs(p_backfill_now timestamp with time zone)                                                                                                                                                                                                          | service_role        | EXECUTE                        |
| routine     | public.batch_rename_tags(p_user_id uuid, p_tag_ids uuid[], p_new_names text[])                                                                                                                                                                                                          | authenticated       | EXECUTE                        |
| routine     | public.batch_rename_tags(p_user_id uuid, p_tag_ids uuid[], p_new_names text[])                                                                                                                                                                                                          | service_role        | EXECUTE                        |
| routine     | public.batch_reorder_tags(p_user_id uuid, p_tag_ids uuid[], p_sort_orders integer[])                                                                                                                                                                                                    | service_role        | EXECUTE                        |
| routine     | public.batch_reorder_tags_hierarchy(p_user_id uuid, p_tag_ids uuid[], p_parent_ids uuid[], p_sort_orders integer[])                                                                                                                                                                     | authenticated       | EXECUTE                        |
| routine     | public.batch_reorder_tags_hierarchy(p_user_id uuid, p_tag_ids uuid[], p_parent_ids uuid[], p_sort_orders integer[])                                                                                                                                                                     | service_role        | EXECUTE                        |
| routine     | public.bulk_soft_delete_entries(p_entry_ids uuid[], p_user_id uuid)                                                                                                                                                                                                                     | authenticated       | EXECUTE                        |
| routine     | public.bulk_soft_delete_entries(p_entry_ids uuid[], p_user_id uuid)                                                                                                                                                                                                                     | service_role        | EXECUTE                        |
| routine     | public.check_tag_has_children()                                                                                                                                                                                                                                                         | service_role        | EXECUTE                        |
| routine     | public.check_tag_hierarchy()                                                                                                                                                                                                                                                            | service_role        | EXECUTE                        |
| routine     | public.confirm_day_plans_to_logs(p_user_id uuid, p_start_at timestamp with time zone, p_end_at timestamp with time zone, p_confirmed_at timestamp with time zone)                                                                                                                       | authenticated       | EXECUTE                        |
| routine     | public.confirm_day_plans_to_logs(p_user_id uuid, p_start_at timestamp with time zone, p_end_at timestamp with time zone, p_confirmed_at timestamp with time zone)                                                                                                                       | service_role        | EXECUTE                        |
| routine     | public.count_unused_recovery_codes(p_user_id uuid)                                                                                                                                                                                                                                      | authenticated       | EXECUTE                        |
| routine     | public.count_unused_recovery_codes(p_user_id uuid)                                                                                                                                                                                                                                      | service_role        | EXECUTE                        |
| routine     | public.custom_access_token_hook(event jsonb)                                                                                                                                                                                                                                            | service_role        | EXECUTE                        |
| routine     | public.custom_access_token_hook(event jsonb)                                                                                                                                                                                                                                            | supabase_auth_admin | EXECUTE                        |
| routine     | public.enforce_entry_tag_owner()                                                                                                                                                                                                                                                        | PUBLIC              | EXECUTE                        |
| routine     | public.enforce_log_external_event_owner()                                                                                                                                                                                                                                               | service_role        | EXECUTE                        |
| routine     | public.enforce_log_plan_owner()                                                                                                                                                                                                                                                         | service_role        | EXECUTE                        |
| routine     | public.enforce_log_tag_owner()                                                                                                                                                                                                                                                          | service_role        | EXECUTE                        |
| routine     | public.enforce_plan_external_event_owner()                                                                                                                                                                                                                                              | service_role        | EXECUTE                        |
| routine     | public.enforce_plan_tag_owner()                                                                                                                                                                                                                                                         | service_role        | EXECUTE                        |
| routine     | public.get_active_dates(p_user_id uuid, p_start_date date, p_end_date date)                                                                                                                                                                                                             | authenticated       | EXECUTE                        |
| routine     | public.get_active_dates(p_user_id uuid, p_start_date date, p_end_date date)                                                                                                                                                                                                             | service_role        | EXECUTE                        |
| routine     | public.get_active_users_for_reflection(p_week_start date, p_threshold_days integer, p_limit integer)                                                                                                                                                                                    | service_role        | EXECUTE                        |
| routine     | public.get_blank_rate(p_user_id uuid, p_start_date timestamp with time zone, p_end_date timestamp with time zone, p_wake_hour integer, p_sleep_hour integer)                                                                                                                            | authenticated       | EXECUTE                        |
| routine     | public.get_blank_rate(p_user_id uuid, p_start_date timestamp with time zone, p_end_date timestamp with time zone, p_wake_hour integer, p_sleep_hour integer)                                                                                                                            | service_role        | EXECUTE                        |
| routine     | public.get_daily_hours(p_user_id uuid, p_year integer)                                                                                                                                                                                                                                  | authenticated       | EXECUTE                        |
| routine     | public.get_daily_hours(p_user_id uuid, p_year integer)                                                                                                                                                                                                                                  | service_role        | EXECUTE                        |
| routine     | public.get_dow_distribution(p_user_id uuid, p_start_date timestamp with time zone, p_end_date timestamp with time zone)                                                                                                                                                                 | authenticated       | EXECUTE                        |
| routine     | public.get_dow_distribution(p_user_id uuid, p_start_date timestamp with time zone, p_end_date timestamp with time zone)                                                                                                                                                                 | service_role        | EXECUTE                        |
| routine     | public.get_estimation_accuracy(p_user_id uuid, p_start_date timestamp with time zone, p_end_date timestamp with time zone)                                                                                                                                                              | authenticated       | EXECUTE                        |
| routine     | public.get_estimation_accuracy(p_user_id uuid, p_start_date timestamp with time zone, p_end_date timestamp with time zone)                                                                                                                                                              | service_role        | EXECUTE                        |
| routine     | public.get_fulfillment_trend(p_user_id uuid, p_start date, p_end date)                                                                                                                                                                                                                  | service_role        | EXECUTE                        |
| routine     | public.get_hourly_distribution(p_user_id uuid, p_start_date timestamp with time zone, p_end_date timestamp with time zone)                                                                                                                                                              | authenticated       | EXECUTE                        |
| routine     | public.get_hourly_distribution(p_user_id uuid, p_start_date timestamp with time zone, p_end_date timestamp with time zone)                                                                                                                                                              | service_role        | EXECUTE                        |
| routine     | public.get_monthly_hours(p_user_id uuid, p_months integer)                                                                                                                                                                                                                              | authenticated       | EXECUTE                        |
| routine     | public.get_monthly_hours(p_user_id uuid, p_months integer)                                                                                                                                                                                                                              | service_role        | EXECUTE                        |
| routine     | public.get_plan_summary(p_user_id uuid)                                                                                                                                                                                                                                                 | service_role        | EXECUTE                        |
| routine     | public.get_stats_kpi_summary(p_user_id uuid, p_start_date timestamp with time zone, p_end_date timestamp with time zone, p_wake_hour integer, p_sleep_hour integer)                                                                                                                     | authenticated       | EXECUTE                        |
| routine     | public.get_stats_kpi_summary(p_user_id uuid, p_start_date timestamp with time zone, p_end_date timestamp with time zone, p_wake_hour integer, p_sleep_hour integer)                                                                                                                     | service_role        | EXECUTE                        |
| routine     | public.get_stats_page_data(p_user_id uuid, p_start_date timestamp with time zone, p_end_date timestamp with time zone, p_prev_start timestamp with time zone, p_prev_end timestamp with time zone, p_year integer, p_monthly_months integer, p_wake_hour integer, p_sleep_hour integer) | authenticated       | EXECUTE                        |
| routine     | public.get_stats_page_data(p_user_id uuid, p_start_date timestamp with time zone, p_end_date timestamp with time zone, p_prev_start timestamp with time zone, p_prev_end timestamp with time zone, p_year integer, p_monthly_months integer, p_wake_hour integer, p_sleep_hour integer) | service_role        | EXECUTE                        |
| routine     | public.get_tag_stats(p_user_id uuid)                                                                                                                                                                                                                                                    | authenticated       | EXECUTE                        |
| routine     | public.get_tag_stats(p_user_id uuid)                                                                                                                                                                                                                                                    | service_role        | EXECUTE                        |
| routine     | public.get_time_by_tag(p_user_id uuid, p_start_date timestamp with time zone, p_end_date timestamp with time zone)                                                                                                                                                                      | authenticated       | EXECUTE                        |
| routine     | public.get_time_by_tag(p_user_id uuid, p_start_date timestamp with time zone, p_end_date timestamp with time zone)                                                                                                                                                                      | service_role        | EXECUTE                        |
| routine     | public.get_time_pl_data(p_user_id uuid, p_start_date timestamp with time zone, p_end_date timestamp with time zone, p_prev_start timestamp with time zone, p_prev_end timestamp with time zone, p_wake_hour integer, p_sleep_hour integer)                                              | authenticated       | EXECUTE                        |
| routine     | public.get_time_pl_data(p_user_id uuid, p_start_date timestamp with time zone, p_end_date timestamp with time zone, p_prev_start timestamp with time zone, p_prev_end timestamp with time zone, p_wake_hour integer, p_sleep_hour integer)                                              | service_role        | EXECUTE                        |
| routine     | public.get_timeboxing_adherence(p_user_id uuid, p_start date, p_end date)                                                                                                                                                                                                               | authenticated       | EXECUTE                        |
| routine     | public.get_timeboxing_adherence(p_user_id uuid, p_start date, p_end date)                                                                                                                                                                                                               | service_role        | EXECUTE                        |
| routine     | public.get_total_time(p_user_id uuid)                                                                                                                                                                                                                                                   | authenticated       | EXECUTE                        |
| routine     | public.get_total_time(p_user_id uuid)                                                                                                                                                                                                                                                   | service_role        | EXECUTE                        |
| routine     | public.get_user_timezone(p_user_id uuid)                                                                                                                                                                                                                                                | authenticated       | EXECUTE                        |
| routine     | public.get_user_timezone(p_user_id uuid)                                                                                                                                                                                                                                                | service_role        | EXECUTE                        |
| routine     | public.get_vault_secret(p_name text)                                                                                                                                                                                                                                                    | service_role        | EXECUTE                        |
| routine     | public.get_weekly_focus_score(p_user_id uuid, p_weeks integer)                                                                                                                                                                                                                          | authenticated       | EXECUTE                        |
| routine     | public.get_weekly_focus_score(p_user_id uuid, p_weeks integer)                                                                                                                                                                                                                          | service_role        | EXECUTE                        |
| routine     | public.handle_new_user()                                                                                                                                                                                                                                                                | service_role        | EXECUTE                        |
| routine     | public.increment_tag_sort_orders(p_user_id uuid)                                                                                                                                                                                                                                        | service_role        | EXECUTE                        |
| routine     | public.invoke_edge_function(p_function_name text, p_body jsonb)                                                                                                                                                                                                                         | service_role        | EXECUTE                        |
| routine     | public.issue_oauth_token_pair(p_user_id uuid, p_client_id text, p_scopes text[], p_refresh_hash text, p_access_hash text, p_refresh_expires_at timestamp with time zone, p_access_expires_at timestamp with time zone, p_parent_refresh_id uuid)                                        | service_role        | EXECUTE                        |
| routine     | public.merge_tags(p_user_id uuid, p_source_tag_id uuid, p_target_tag_id uuid)                                                                                                                                                                                                           | authenticated       | EXECUTE                        |
| routine     | public.merge_tags(p_user_id uuid, p_source_tag_id uuid, p_target_tag_id uuid)                                                                                                                                                                                                           | service_role        | EXECUTE                        |
| routine     | public.merge_tags_with_hierarchy(p_user_id uuid, p_source_tag_id uuid, p_target_tag_id uuid)                                                                                                                                                                                            | authenticated       | EXECUTE                        |
| routine     | public.merge_tags_with_hierarchy(p_user_id uuid, p_source_tag_id uuid, p_target_tag_id uuid)                                                                                                                                                                                            | service_role        | EXECUTE                        |
| routine     | public.prevent_time_model_source_change()                                                                                                                                                                                                                                               | service_role        | EXECUTE                        |
| routine     | public.rename_tag_group(p_user_id uuid, p_old_prefix text, p_new_prefix text)                                                                                                                                                                                                           | authenticated       | EXECUTE                        |
| routine     | public.rename_tag_group(p_user_id uuid, p_old_prefix text, p_new_prefix text)                                                                                                                                                                                                           | service_role        | EXECUTE                        |
| routine     | public.restore_entry(p_entry_id uuid, p_user_id uuid)                                                                                                                                                                                                                                   | authenticated       | EXECUTE                        |
| routine     | public.restore_entry(p_entry_id uuid, p_user_id uuid)                                                                                                                                                                                                                                   | service_role        | EXECUTE                        |
| routine     | public.restore_log(p_log_id uuid, p_user_id uuid)                                                                                                                                                                                                                                       | authenticated       | EXECUTE                        |
| routine     | public.restore_log(p_log_id uuid, p_user_id uuid)                                                                                                                                                                                                                                       | service_role        | EXECUTE                        |
| routine     | public.restore_plan(p_plan_id uuid, p_user_id uuid)                                                                                                                                                                                                                                     | authenticated       | EXECUTE                        |
| routine     | public.restore_plan(p_plan_id uuid, p_user_id uuid)                                                                                                                                                                                                                                     | service_role        | EXECUTE                        |
| routine     | public.soft_delete_entry(p_entry_id uuid, p_user_id uuid)                                                                                                                                                                                                                               | authenticated       | EXECUTE                        |
| routine     | public.soft_delete_entry(p_entry_id uuid, p_user_id uuid)                                                                                                                                                                                                                               | service_role        | EXECUTE                        |
| routine     | public.soft_delete_log(p_log_id uuid, p_user_id uuid)                                                                                                                                                                                                                                   | authenticated       | EXECUTE                        |
| routine     | public.soft_delete_log(p_log_id uuid, p_user_id uuid)                                                                                                                                                                                                                                   | service_role        | EXECUTE                        |
| routine     | public.soft_delete_plan(p_plan_id uuid, p_user_id uuid)                                                                                                                                                                                                                                 | authenticated       | EXECUTE                        |
| routine     | public.soft_delete_plan(p_plan_id uuid, p_user_id uuid)                                                                                                                                                                                                                                 | service_role        | EXECUTE                        |
| routine     | public.trunc_week_tz(ts timestamp with time zone, tz text, week_start integer)                                                                                                                                                                                                          | authenticated       | EXECUTE                        |
| routine     | public.trunc_week_tz(ts timestamp with time zone, tz text, week_start integer)                                                                                                                                                                                                          | service_role        | EXECUTE                        |
| routine     | public.update_personalization(p_user_id uuid, p_path text, p_value jsonb)                                                                                                                                                                                                               | authenticated       | EXECUTE                        |
| routine     | public.update_personalization(p_user_id uuid, p_path text, p_value jsonb)                                                                                                                                                                                                               | service_role        | EXECUTE                        |
| routine     | public.update_updated_at()                                                                                                                                                                                                                                                              | service_role        | EXECUTE                        |
| routine     | public.use_recovery_code(p_user_id uuid, p_code_hash text)                                                                                                                                                                                                                              | authenticated       | EXECUTE                        |
| routine     | public.use_recovery_code(p_user_id uuid, p_code_hash text)                                                                                                                                                                                                                              | service_role        | EXECUTE                        |
| routine     | public.vault_secret_exists(p_name text)                                                                                                                                                                                                                                                 | service_role        | EXECUTE                        |
| table       | public.external_calendar_events                                                                                                                                                                                                                                                         | authenticated       | SELECT                         |
| table       | public.external_calendar_events                                                                                                                                                                                                                                                         | service_role        | DELETE, INSERT, SELECT, UPDATE |
| table       | public.logs                                                                                                                                                                                                                                                                             | authenticated       | DELETE, INSERT, SELECT, UPDATE |
| table       | public.logs                                                                                                                                                                                                                                                                             | service_role        | DELETE, INSERT, SELECT, UPDATE |
| table       | public.plans                                                                                                                                                                                                                                                                            | authenticated       | DELETE, INSERT, SELECT, UPDATE |
| table       | public.plans                                                                                                                                                                                                                                                                            | service_role        | DELETE, INSERT, SELECT, UPDATE |
| table       | public.profiles                                                                                                                                                                                                                                                                         | service_role        | INSERT, UPDATE                 |
| view        | public.entries_effective                                                                                                                                                                                                                                                                | authenticated       | SELECT                         |
| view        | public.entries_effective                                                                                                                                                                                                                                                                | service_role        | SELECT                         |

## Realtime publication

`supabase_realtime` に含まれる public table。空なら Realtime 公開なし。

- なし
