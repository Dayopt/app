---
status: current
last_verified: 2026-08-11
code:
  - apps/product/src/features/external-calendar
  - apps/product/src/app/api/cron/calendar-sync/route.ts
  - supabase/migrations/20260723233814_add_calendar_connection_tables.sql
---

# external-calendar-import 完了サマリー

外部カレンダー（Google）を one-way で取り込む経路を、接続から同期・切断まで通した。マイルストーン「連携ができる」に到達している。Calendar 画面には何も出さない — ghost 表示と Plan / Record 変換は次 project の担当で、本 project はその受け皿までを作った。

## 完了した契約

- `calendar_connections` / `calendar_connection_calendars` を RLS + column-scoped GRANT 付きで追加した。`refresh_token_enc` / `granted_scopes` / `provider_account_id` は authenticated の grant から外し、書き込みは service_role に限定している。owner 整合は複合 FK が持つ
- Google 専用の OAuth client で `calendar.readonly` だけを要求し、refresh token は AES-256-GCM でアプリ層暗号化して保存する。access token は保存しない
- 同期エンジン（`sync-service.ts`）が full / 増分 / 410 フォールバック / tombstone / mark-and-sweep / window prune を担う。upsert key は `(user_id, provider, connection_id, provider_calendar_id, provider_event_id)`
- **dismissed 不可侵**と **prune の anti-join** は regression test で凍結した（`sync-service.test.ts` / `event-pruning.test.ts`）
- Vercel cron（15 分毎）と tRPC `syncNow` が同一の service 関数を呼ぶ。`CRON_SECRET` 未設定時、cron route は 503 を返して静かに無効化される
- Settings の Integrations カテゴリから接続・カレンダー選択・状態表示・「今すぐ同期」・切断・再接続ができる。接続系 procedure は `proProcedure` でゲート可能な形にした
- 切断は revoke（best-effort）→ 未参照ミラー行の削除 → connection の hard delete の 3 段。plans / records から参照済みの行は歴史的アンカーとして残る
- Step 7 で observability を揃えた: 静かな打ち切り（ページ上限・prune batch 上限）、schema drift（parse できない item の件数）、失効しなかった provider grant を Sentry へ送る。選択カレンダーの読み取り失敗を「0 件同期の成功」に畳まないよう修正した
- 再接続は同意画面に `login_hint` で対象アカウントを示唆する（一致判定は従来どおり `sub`）。使用済み code による失敗は汎用文言から分離した

## 受入条件との差分

overview §14 の 6 項目のうち、**1（実カレンダーでの production 確認）と 2（cron の 15 分毎の増分同期）は production secret の設定が前提**で、本 project の PR 時点では未実施。secret（`human/google-calendar` の 4 field と `human/supabase` の `CRON_SECRET`）は Dashboard 作業として `docs/operations/secrets.md` §Change Procedure に従い別途行う。設定前は cron が 503 を返し続けるのが正常な状態で、アプリ本体には影響しない。

Preview 環境では OAuth 接続を意図的に無効にしている（Google が redirect_uri の完全一致を要求し、deploy ごとに変わる Preview URL を GCP に登録できないため。overview §14-1）。そのため reauth の一連動作は Preview ではなく unit test と Storybook（`GoogleCalendarSettingsView.stories.tsx` の `ReauthorizationRequiredState`）で検証した。

`CRON_SECRET` を env の all-or-nothing refine に含める案は採用していない。含めると「cron secret だけ設定済み + calendar 未設定」でアプリ全体が起動不能になる（PR #1731 で実証）。経緯は overview §5-5。

## 次 project へ持ち越した未決事項

ghost の視覚表現、recurrence instance の取り込み粒度、`confirmed` 相当フラグ、終日イベントの本対応、Free / Pro 境界の 5 件（overview §15）。ghost UX のスケッチは overview §12 に残してある。

詳細な設計と決定の経緯は [overview](./overview.md) を参照する。
