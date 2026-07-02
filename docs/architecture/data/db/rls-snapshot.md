---
status: current
last_verified: 2026-07-02
---

# RLS / schema snapshot（自動生成）

> **生成元**: `scripts/generate-rls-snapshot.ts`（`pnpm rls:snapshot`）。DB の `pg_policies` /
> RLS 有効状態を deterministic に書き出した snapshot。**手で編集しない**。migration 変更時は
> CI（`pnpm rls:snapshot:check`）が drift を検出する。再生成で更新すること。
>
> 集計: public スキーマの policy 29 件 / RLS 対象テーブル 11 件。

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
