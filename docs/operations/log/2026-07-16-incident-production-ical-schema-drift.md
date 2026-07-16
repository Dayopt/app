---
status: frozen
date: 2026-07-16
last_verified: 2026-07-16
issue: 1631
code: supabase/migrations/20260715234412_repair_ical_feed_token_schema.sql
---

# Production user_settings の iCal schema drift

2026-07-16、Issue #1625 の production contract smoke 中に、ログイン済み Calendar が設定取得に失敗する事象を確認した。production の migration 履歴と物理 schema が一致しておらず、`user_settings.ical_feed_token` と対応する unique index が欠落していた。

## 起きた事実

- `userSettings.get` は Postgres error `42703`（`column user_settings.ical_feed_token does not exist`）で失敗した。
- Vercel runtime errors では、確認時点の直近15分に14回、1ユーザーで発生していた。
- production の `supabase_migrations.schema_migrations` には `20260317100000_add_ical_feed_token` が記録されていた。
- production の `information_schema.columns` には `public.user_settings.ical_feed_token` が存在しなかった。
- production の `pg_indexes` には `idx_user_settings_ical_feed_token` が存在しなかった。
- canonical schema、generated Database types、`publicUserSettingsSelect` は column が存在する前提だった。
- `user_settings` のその他の canonical column は production に存在しており、今回確認した差分は iCal column と index に限定されていた。
- secret 値、iCal token、その他のユーザーデータ値は取得・記録していない。

## 影響

- `userSettings.get` が `INTERNAL_SERVER_ERROR` となり、ログイン済みユーザーが Calendar shell を利用できなかった。
- migration が履歴上は適用済みのため、同じ migration の再実行を待つだけでは復旧しない。
- production health も `unhealthy` / `degraded` であり、Issue #1625 の不可逆 column drop は開始できない。

## 復旧方針

- 過去の migration 履歴を変更せず、新規 repair migration で物理 schema を canonical schema に合わせる。
- migration は既存環境で再実行可能な `ADD COLUMN IF NOT EXISTS` / `CREATE UNIQUE INDEX IF NOT EXISTS` を使い、続けて型、nullable、default、unique、predicate を catalog で検証する。
- migration 全体を明示 transaction に入れ、`lock_timeout = '5s'` で長時間の lock 待ちを避ける。
- local reset と Supabase Preview Branch で検証した後、ユーザー承認を得て main へ mergeし、GitHub integration から production に自動適用する。
- production Dashboard SQL Editor、手動 `db push`、migration history の直接修正は行わない。

## 検証ゲート

- local fresh migration replay が成功する。
- `userSettings.get`、iCal token 取得・再生成の integration test が成功する。
- Preview で column の型・default と partial unique index が canonical schema に一致する。
- production 自動適用後、同じ catalog query が一致し、Calendar shell と `userSettings.get` が復旧する。
- Vercel runtime errors で同じ `42703` が再発しない。
- `/api/health` が連続して `healthy` を返す。戻らない場合は Issue #1630 で別原因を継続調査する。

## Local 検証

- `pnpm db:fresh`: 全 migration の fresh replay 成功。
- production と同じ欠落状態を local で再現し、`20260715234412_repair_ical_feed_token_schema.sql` の単体適用で復旧した。
- 復旧後の catalog は `uuid`、nullable、default `gen_random_uuid()`、unique partial index で canonical schema と一致した。
- `pnpm test:integration`: 4 files / 101 tests 成功。`userSettings.get` と iCal token の取得・再生成を含む。
- `pnpm rls:snapshot:check`: 差分なし。
- local Supabase security advisor: 0件。performance advisor の既存指摘に今回の追加差分はない。
- `pnpm typecheck`、`pnpm lint`、`pnpm lint:boundaries`、`pnpm check`、`pnpm docs:check`: 成功。

## 関連

- GitHub Issue #1631
- GitHub Issue #1630
- GitHub Issue #1625
- [Supabase Database Migrations](https://supabase.com/docs/guides/deployment/database-migrations)
