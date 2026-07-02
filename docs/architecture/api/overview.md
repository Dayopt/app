---
status: current
last_verified: 2026-07-02
---

# API Endpoints Overview

`src/app/api/**` 配下の REST/Webhook endpoint 総覧。tRPC procedure は `/api/trpc/[procedure-path]` に集約され、procedure 単位の仕様は各 feature の `server/router.ts` を参照すること。

策定日: 2026-04-26
スコープ: `src/app/api/**` の Route Handler 全 8 ファイル

## 一覧

| Path                                                                                         | Method     | 認証                   | Rate Limit                 | Runtime                  | 副作用 / 説明                                                                                                                                                                         |
| -------------------------------------------------------------------------------------------- | ---------- | ---------------------- | -------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`/api/health`](../../../apps/product/src/app/api/health/route.ts)                           | GET        | なし                   | なし                       | nodejs                   | DB / Upstash Redis / メモリ使用量を check し `healthy` / `degraded` / `unhealthy` を返す。デプロイ後の動作確認・モニタリング用                                                        |
| [`/api/csp-report`](../../../apps/product/src/app/api/csp-report/route.ts)                   | POST       | なし                   | なし                       | nodejs                   | ブラウザから CSP 違反レポートを受け取り Sentry に送信。`chrome-extension://` 等の拡張機能由来は除外                                                                                   |
| [`/api/trpc/[trpc]`](../../../apps/product/src/app/api/trpc/[trpc]/route.ts)                 | GET / POST | procedure 依存         | procedure 依存             | nodejs                   | tRPC procedure のルーティング本体。すべての procedure (`@/lib/trpc/root`) をここで受ける。cache: 認証済み `private, no-store` / 未認証 `no-cache`                                     |
| [`/api/beacon/entry-save`](../../../apps/product/src/app/api/beacon/entry-save/route.ts)     | POST       | Supabase Auth (Cookie) | なし                       | nodejs                   | `navigator.sendBeacon()` 経由のエントリ緊急保存。ブラウザ閉じ時に tRPC mutation が使えないための fallback。`useDebouncedSave` から呼ばれる                                            |
| [`/api/auth`](../../../apps/product/src/app/api/auth/route.ts)                               | GET / POST | mixed                  | POST 10/分（login/reset）  | nodejs                   | Supabase 認証管理。POST: signin / signup / reset / verify。GET: session / user 取得                                                                                                   |
| [`/api/v1/calendar/[token]`](../../../apps/product/src/app/api/v1/calendar/[token]/route.ts) | GET        | token (URL)            | あり (`icalFeedRateLimit`) | nodejs                   | iCal フィード配信。秘密 token で RLS バイパス、Service Role で対象ユーザーの entries を `entriesToICal` で iCalendar 形式に変換                                                       |
| [`/api/webhooks/resend`](../../../apps/product/src/app/api/webhooks/resend/route.ts)         | POST       | Resend signature       | なし                       | nodejs (maxDuration 30s) | Resend からの bounce / complained / delivered を受け、bounce/complained は Supabase の suppression list に書込                                                                        |
| [`/api/webhooks/stripe`](../../../apps/product/src/app/api/webhooks/stripe/route.ts)         | POST       | Stripe signature       | なし                       | nodejs (maxDuration 30s) | checkout.session.completed / customer.subscription.updated / customer.subscription.deleted を処理。subscription state の DB 反映、トランザクションメール送信、Sentry へのイベント記録 |

## 共通方針

- **Runtime**: 全 endpoint `nodejs`。`edge` は使用していない（Supabase server client / Stripe SDK が node API 依存のため）
- **エラーログ**: `@/lib/logger` で構造化ログ。webhook / 認証エラーは Sentry にも送信
- **入力バリデーション**: Zod (`@/lib/zod`) を全ハンドラで使用
- **Supabase アクセス**: 一般 endpoint は `@/lib/supabase/server` の `createClient`（Cookie ベース、RLS 適用）。webhook と iCal feed は `@/lib/supabase/oauth` の `createServiceRoleClient`（RLS バイパス）
- **REST 維持の理由**: tRPC を主軸としつつ、以下は REST のままにする:
  - `/api/health`: 単純な GET、外部監視ツール対応
  - `/api/csp-report`: ブラウザが直接 POST する CSP report-uri
  - `/api/beacon/entry-save`: `navigator.sendBeacon()` は tRPC client を使えない
  - `/api/auth`: Supabase Auth と密接、Cookie 設定の都合
  - `/api/v1/calendar/[token]`: 外部カレンダーアプリが直接 GET、tRPC 形式不可
  - `/api/webhooks/*`: 外部サービスが直接 POST、レスポンス形式が tRPC と合わない

## 変更ガイドライン

- 新規 endpoint を追加する前に、tRPC procedure で済まないか検討する（`features/*/server/router.ts`）
- REST 維持の理由に該当しない場合は tRPC を採用
- 認証必須の endpoint は Supabase server client + Cookie で `getUser()` 検証、または webhook signature 検証
- rate limit が必要な場合は `@/lib/rate-limit/upstash` の `withUpstashRateLimit` を使う
- 副作用（DB 書込・メール送信・外部 API 呼出）は logger でトレース可能にする

## 関連ドキュメント

- tRPC procedure 設計: [.claude/skills/trpc-router-creating/SKILL.md](../../../.claude/skills/trpc-router-creating/SKILL.md)
- アーキテクチャ全体: [.claude/rules/architecture.md](../../../.claude/rules/architecture.md)
- Supabase Branching 運用: [.claude/skills/supabase/SKILL.md](../../../.claude/skills/supabase/SKILL.md)
