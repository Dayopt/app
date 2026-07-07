---
status: current
last_verified: 2026-07-08
---

# インフラ・環境・API/Routing 総覧

環境構成（Local / PR Preview / Production）、CI品質ゲートのロードマップ、Bot 対策（Turnstile）、API endpoints 総覧、Supabase 型自動生成、App Router routing 総覧、パフォーマンス監視の原則、開発コマンド一覧、マイグレーション/リリースチェックリスト、DB Migration Rollback 手順書。「環境・デプロイ・シークレットは?」の正。

---

## 環境構成

Dayopt の標準ルートは `local → PR Preview → production`。Vercel Preview が production Supabase DB を触らないことを最優先にする。

### 環境一覧

| 環境           | Supabase                          | Vercel                          | URL              |
| -------------- | --------------------------------- | ------------------------------- | ---------------- |
| **Local**      | `supabase start`                  | `pnpm dev`                      | localhost:3000   |
| **PR Preview** | PR ごとの Supabase Preview Branch | Vercel Preview (`product`)      | `*.vercel.app`   |
| **Production** | `dayopt` main                     | main merge で Production deploy | `app.dayopt.app` |

persistent staging は常設しない。固定 URL が必要な Stripe / OAuth callback / closed beta 検証が出た時だけ、Vercel staging と Supabase persistent branch を追加する。

### Supabase Project

| Project | Reference ID           | Region | 用途                          |
| ------- | ---------------------- | ------ | ----------------------------- |
| dayopt  | `yvglwblxrnrenfifsnje` | Tokyo  | production main + PR branches |

Supabase GitHub integration が migrations / Edge Functions / Storage buckets の deployment owner。GitHub Actions から `supabase db push` は通常実行しない。

### 環境変数の管理

#### 1Password master / replica

Secrets の正本は `docs/operations/secrets.md`。1Password は production / shared / optional staging の長寿命 secrets だけを管理する。PR Preview Branch credentials は 1Password に保存せず、Supabase / Vercel integration の ephemeral replica として扱う。

#### Vercel environment

```txt
Production → Dayopt-Production の Supabase credentials
Preview    → Supabase Vercel integration が PR Branch credentials を注入
Development/local → .op-env.local + op run
```

Preview environment に production Supabase credentials を手動設定しない。残っている場合は削除または Preview scope から外す。

#### `.op-env.local`

repository root の `.op-env.local.example` を `.op-env.local` にコピーし、`op://` 参照だけを書く。実値・dummy secret・placeholder secret は書かない。

### Local Development

```bash
supabase start
pnpm dev
```

`pnpm dev` は `op run` 経由のまま。デフォルトでは `supabase status -o env` から Supabase local の URL / anon key / service role key を取得し、値を表示せずに product app へ渡す。`.env.local` の実値保存は禁止。

一時的に `.op-env.local` の Supabase refs をそのまま使う場合だけ、明示的に切り替える。

```bash
DAYOPT_SUPABASE_TARGET=op pnpm dev
```

### Migration

詳細は本ファイルの「マイグレーション & リリース チェックリスト」セクション。

- PR open: Supabase Preview Branch が作成され、migration と seed が適用される
- PR review: Vercel Preview が対応する Supabase Preview Branch を参照する
- main merge: Supabase integration が production に migration を適用する
- emergency only: 手動 `supabase db push`

### GitHub Actions Secrets

CI / E2E 用の build env は GitHub Secrets に残す。migration 用の `SUPABASE_ACCESS_TOKEN` / DB password は通常 workflow からは使わない。緊急手動 runbook 用に残す場合も、1Password master から同期し、値を出力しない。

### デプロイフロー

```txt
feature branch → PR
  ├── Supabase Preview Branch
  └── Vercel Preview (product)
        ↓
      review
        ↓
main merge
  ├── Supabase main deployment
  └── Vercel Production
```

### トラブルシューティング

| 症状                                   | 対処                                                                           |
| -------------------------------------- | ------------------------------------------------------------------------------ |
| Supabase PR check が出ない             | Supabase GitHub integration / required check 設定を確認                        |
| Vercel Preview が production DB を見る | Vercel Preview env から production Supabase vars を削除し integration を再同期 |
| migration が Preview Branch で失敗     | Supabase deployment log を確認し、migration を修正して PR branch に push       |
| Production に反映されない              | Supabase GitHub integration の production deployment log を確認                |

---

## ADR-016: CI品質ゲート段階的導入ロードマップ

> proposed（2026-03-19）

### コンテキスト

現在のCI（`.github/workflows/ci.yml`）は lint / typecheck / test / storybook-tests / build の5ジョブ + quality-gate / security-gate で構成済み。以下のツールはインストール・設定済みだがCIゲート未連携:

- **size-limit** — バンドルサイズ計測（`npm run size`）
- **Lighthouse CI** — パフォーマンス・a11y計測（`lighthouserc.cjs` 設定済み）
- **knip** — デッドコード検出（`npm run quality:deadcode`）
- **diff-coverage** — 差分カバレッジ（`scripts/diff-coverage.ts`）
- **axe-core** — a11yテスト

過剰自動化を避ける現方針は正しいが、トリガー条件付きのロードマップで「いつ何を自動化するか」を明確にする。

### 原則

| #   | 原則                 | 説明                                                                |
| --- | -------------------- | ------------------------------------------------------------------- |
| 1   | **warn → error**     | 新チェックは必ず warn で導入 → 最低2週間安定後に error 昇格         |
| 2   | **Gate-first**       | PRブロッキングはCI Gateに集約し、週次スナップショット生成は持たない |
| 3   | **15分バジェット**   | 全ジョブ並列で最大15分以内。重いジョブは別ワークフローに分離        |
| 4   | **即時ロールバック** | `continue-on-error: true` に戻すだけで warn 降格可能                |

### Phase 1: 基盤固め + ゲート有効化

**トリガー**: TypeScript errors = 0 達成 &nbsp;|&nbsp; **実装コスト**: 中（1-2日）

| ゲート            | 内容                                                                 | ブロッキング |
| ----------------- | -------------------------------------------------------------------- | ------------ |
| Branch Protection | `quality-gate` + `e2e-quality-gate` を required status checks に設定 | Yes          |
| typecheck         | quality-gate に typecheck を含めた状態で required 化                 | Yes          |
| diff-coverage     | ci.yml test ジョブ後に `npm run test:diff-coverage` → PR Comment     | Warn         |
| knip              | lint ジョブに `npm run quality:deadcode` 追加 → PR Comment で警告    | Warn         |

**前提条件**: 型エラー 0 達成、quality-gate 配下の全ジョブが green

**なぜこの順番か**: 型チェックは最もROIが高く既存ジョブとして稼働済み。required化するだけで即効性がある。

### Phase 2: サイズ・パフォーマンス可視化

**トリガー**: GA直前 + Phase 1 が2週間以上安定 &nbsp;|&nbsp; **実装コスト**: 小（半日）

| ゲート        | 内容                                                            | ブロッキング |
| ------------- | --------------------------------------------------------------- | ------------ |
| size-limit    | `andresz1/size-limit-action` で PR にバンドルサイズ差分コメント | Warn         |
| Lighthouse CI | 新ワークフロー `lighthouse.yml` で PR 実行                      | Warn         |
| a11y 計測     | Storybook Tests または Lighthouse CI で警告として可視化         | Warn         |

**前提条件**: `.size-limit` エントリポイントを package.json に設定

**なぜこの順番か**: GAに向けてパフォーマンスの基準値を把握する必要がある。まず warn で傾向を掴む。

### Phase 3: ゲート厳格化

**トリガー**: GA後1ヶ月 or 有料ユーザー100人超 + Phase 2 の warn が4週間安定 &nbsp;|&nbsp; **実装コスト**: 中（1日）

| ゲート             | 内容                                                        | ブロッキング |
| ------------------ | ----------------------------------------------------------- | ------------ |
| diff-coverage 昇格 | critical path (auth/server/supabase) 80% 未満 → PR ブロック | Yes          |
| size-limit 昇格    | バンドルサイズ上限超過 → PR ブロック                        | Yes          |
| knip 昇格          | 新規 unused exports の追加を禁止                            | Yes          |
| circular deps      | `npm run deps:circular` で現在の2件を超えたら fail          | Yes          |
| カバレッジ閾値     | statements 55% 未満で警告                                   | Warn         |

**前提条件**: Phase 2 の warn に false positive がないこと

**なぜこの順番か**: 有料ユーザーが増えると品質劣化のインパクトが大きくなる。warn 期間のデータから現実的な閾値を設定。

### Phase 4: フルゲート

**トリガー**: 有料ユーザー1,000人超 or 開発者3人以上 + Phase 3 が3ヶ月安定 &nbsp;|&nbsp; **実装コスト**: 大（2-3日）

| ゲート             | 内容                                                                | ブロッキング |
| ------------------ | ------------------------------------------------------------------- | ------------ |
| Lighthouse CI 昇格 | performance &ge; 60, accessibility &ge; 90, CLS &lt; 0.1            | Yes          |
| カバレッジ昇格     | statements 65% 未満 → PR ブロック                                   | Yes          |
| a11y CI化          | storybook-tests ジョブに a11y テスト統合                            | Yes          |
| security 強化      | `npm audit --production --audit-level=high` を security-gate に追加 | Yes          |
| E2E critical       | smoke + critical-path spec を ci.yml に統合                         | Yes          |

**前提条件**: テストカバレッジ 70% 超、Lighthouse performance 70+ 安定、Phase 3 が3ヶ月以上安定

**なぜこの順番か**: フルゲートは生産性とのトレードオフが大きい。チーム規模・ユーザー数が十分に大きくなってから。

### 現在の品質指標（2026-03-19）

| 指標                       | 値           | 状態 |
| -------------------------- | ------------ | ---- |
| TypeScript errors          | 34           | fail |
| Test coverage (statements) | 43.64%       | —    |
| Feature boundaries         | 0 violations | pass |
| Circular dependencies      | 2            | —    |
| Dead code (unused exports) | 0            | pass |
| Dead code (unused files)   | 22           | —    |
| A11y                       | 未計測       | skip |

### 関連

- `docs/log/decisions/016-ci-quality-gates-roadmap.md` — ADR本体
- `.github/workflows/ci.yml` — 段階的に変更する中心ファイル
- `scripts/diff-coverage.ts` — Phase 1 でCI連携
- `lighthouserc.cjs` — Phase 2 でCI連携
- `.claude/rules/quality.md` — 品質基準の定義

---

## Bot 対策（Cloudflare Turnstile）

Dayopt は bot 対策として **Cloudflare Turnstile** を使う。reCAPTCHA v3 + v2 fallback から 2026-04 に乗り換え、マーケティングサイトとアプリの両方で同じ仕組みに統一した。

### 適用範囲

| 画面                | repo | 対象フロー             | 検証主体                       |
| ------------------- | ---- | ---------------------- | ------------------------------ |
| `/contact` フォーム | web  | GitHub Issue 作成前    | 自前 siteverify POST           |
| `/signup` フォーム  | app  | `supabase.auth.signUp` | Supabase Auth (Bot Protection) |

widget は 1 つ（`Dayopt-Shared/turnstile`）で **1 widget 複数 hostname**（`dayopt.app` / `localhost` / `*.vercel.app`）をカバーする。環境別に site-key を分けない。

### 実装レイヤー

#### app repo

```
src/lib/turnstile/
├── config.ts       # SITE_KEY + isTurnstileEnabled()
├── Turnstile.tsx   # <Turnstile> widget ラッパ
└── index.ts        # barrel
```

- `SignupForm.tsx` が `<Turnstile onSuccess={setToken}>` で token を state に保持
- `useAuthStore.signUp(email, password, { captchaToken })` で Supabase へ渡す
- Supabase が secret 検証する（app は secret を持たない）

#### web repo

```
src/lib/turnstile/
├── config.ts       # SITE_KEY + VERIFY_URL
├── verify.ts       # verifyTurnstile(token, ip)
├── Turnstile.tsx   # <Turnstile> widget ラッパ
└── index.ts        # barrel
```

- `contact-form.tsx` で widget を表示、token を state に保持
- `/api/contact/route.ts` が CSRF → rate limit → honeypot → **`verifyTurnstile`** の順に検証
- Turnstile 失敗時は 403 `BOT_DETECTED` を返す

### Secret 管理

Secrets 運用の正本は `docs/operations/secrets.md`。1Password が master で、Supabase Dashboard の Turnstile secret は replica として手動同期する。

#### 1Password vault

```
Dayopt-Shared/turnstile
├── NEXT_PUBLIC_TURNSTILE_SITE_KEY
└── TURNSTILE_SECRET_KEY
```

#### env 参照

- **app** — `.op-env.local`:
  ```
  NEXT_PUBLIC_TURNSTILE_SITE_KEY=op://Dayopt-Shared/turnstile/NEXT_PUBLIC_TURNSTILE_SITE_KEY
  ```
  （app は secret を持たない）
- **web** — `.op-env.local`:
  ```
  NEXT_PUBLIC_TURNSTILE_SITE_KEY=op://Dayopt-Shared/turnstile/NEXT_PUBLIC_TURNSTILE_SITE_KEY
  TURNSTILE_SECRET_KEY=op://Dayopt-Shared/turnstile/TURNSTILE_SECRET_KEY
  ```
- **Supabase Auth** — Dashboard → Authentication → Bot & Abuse Protection → Turnstile
  - `TURNSTILE_SECRET_KEY` を 1Password master から手動同期する
  - app の signup flow はこの dashboard 設定に依存する

### 検証フロー

#### web contact form

```
user submit
  → [client] Turnstile widget で token 取得
  → [client] POST /api/contact { ..., turnstileToken }
  → [server] CSRF 検証
  → [server] rate limit
  → [server] honeypot (website field)
  → [server] verifyTurnstile(token, ip) ─ siteverify POST
      ├ success: true  → GitHub Issue 作成
      └ success: false → 403 BOT_DETECTED
```

#### app signup

```
user submit
  → [client] Turnstile widget で token 取得
  → [client] supabase.auth.signUp({ options: { captchaToken } })
  → [Supabase] Turnstile secret で検証（dashboard 設定）
      ├ success: true  → user 作成
      └ success: false → AuthError
```

### 運用

#### Rotation

1. Cloudflare dashboard で widget の site/secret を regenerate
2. 1Password `Dayopt-Shared/turnstile` の fields を更新
3. Supabase Auth dashboard の secret key を差し替え
4. アプリ再デプロイは**不要**（op 経由で次回起動時に新値が注入される）

#### 開発時フォールバック

Cloudflare 公式の dev 用テストキーを使う場合でも、repo docs や `.op-env.local.example` には literal 値を書かない。必要な値は Cloudflare docs で確認し、一時作業後は `.op-env.local` を `op://` 参照へ戻す。

### 移行経緯

#### 旧実装（〜 2026-04）

- `src/lib/recaptcha/`（config / verify / hooks / RecaptchaScript）
- `/api/auth` route に v3 score 検証コード
- `RECAPTCHA_SECRET_KEY_V3` / `V2`、`NEXT_PUBLIC_RECAPTCHA_SITE_KEY_V3` / `V2`

#### 課題

- auth route の v3 検証は **dead code**（caller が `recaptchaToken` を送っていなかった）
- Google トラッキング依存、v2 challenge の UX 摩擦
- スコア閾値（MODERATE=0.5）の運用判断が難しい

#### 置換後（2026-04〜）

- `src/lib/recaptcha/` 削除
- Supabase Auth 公式の `options.captchaToken` 連携に切替 → dead code 解消
- score 判定不要（Turnstile は success boolean のみ）
- reCAPTCHA 4 env key 削除、Turnstile 1 env key（app）/ 2 env key（web）に簡素化

### 関連ファイル

- `src/lib/turnstile/`（app / web 両方）
- `src/features/auth/components/SignupForm.tsx`（app）
- `src/features/auth/stores/useAuthStore.ts`（app、`captchaToken` option 追加）
- `src/app/api/auth/route.ts`（app、reCAPTCHA 分岐削除）
- `src/app/[locale]/(auth)/client-layout.tsx`（app、`RecaptchaScript` 削除）
- `src/app/[locale]/(marketing)/contact/contact-form.tsx`（web）
- `src/app/api/contact/route.ts`（web、`verifyTurnstile` 挿入）
- `src/platform/config/env.ts`（web、env 追加）
- `src/env.ts`（app、env 置換）
- `.op-env.local.example`（app / web 両方の参照例）
- `Dayopt-Shared/turnstile` item（1Password）

### 今後の拡張余地

- **app の API route 化**: 現状 signup は client-side Supabase 直呼び。将来 server-side で追加の anti-abuse（IP 評価、メールドメイン検査など）を挟むなら `/api/auth/signup` route に統一する。route 側の Turnstile 検証は既に schema 上で受け付け可能な形に残してある
- **Turnstile analytics 活用**: Cloudflare dashboard の challenge 通過率 / 失敗率を週次で確認する運用を確立する
- **ログイン flow への適用**: ブルートフォース対策として login にも Turnstile を追加する余地あり（現状は rate limit のみ）

---

## API Endpoints Overview

`src/app/api/**` 配下の REST/Webhook endpoint 総覧。tRPC procedure は `/api/trpc/[procedure-path]` に集約され、procedure 単位の仕様は各 feature の `server/router.ts` を参照すること。

策定日: 2026-04-26
スコープ: `src/app/api/**` の Route Handler 全 8 ファイル

### 一覧

| Path                       | Method     | 認証                   | Rate Limit                 | Runtime                  | 副作用 / 説明                                                                                                                                                                         |
| -------------------------- | ---------- | ---------------------- | -------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/health`              | GET        | なし                   | なし                       | nodejs                   | DB / Upstash Redis / メモリ使用量を check し `healthy` / `degraded` / `unhealthy` を返す。デプロイ後の動作確認・モニタリング用                                                        |
| `/api/csp-report`          | POST       | なし                   | なし                       | nodejs                   | ブラウザから CSP 違反レポートを受け取り Sentry に送信。`chrome-extension://` 等の拡張機能由来は除外                                                                                   |
| `/api/trpc/[trpc]`         | GET / POST | procedure 依存         | procedure 依存             | nodejs                   | tRPC procedure のルーティング本体。すべての procedure (`@/lib/trpc/root`) をここで受ける。cache: 認証済み `private, no-store` / 未認証 `no-cache`                                     |
| `/api/beacon/entry-save`   | POST       | Supabase Auth (Cookie) | なし                       | nodejs                   | `navigator.sendBeacon()` 経由のエントリ緊急保存。ブラウザ閉じ時に tRPC mutation が使えないための fallback。`useDebouncedSave` から呼ばれる                                            |
| `/api/auth`                | GET / POST | mixed                  | POST 10/分（login/reset）  | nodejs                   | Supabase 認証管理。POST: signin / signup / reset / verify。GET: session / user 取得                                                                                                   |
| `/api/v1/calendar/[token]` | GET        | token (URL)            | あり (`icalFeedRateLimit`) | nodejs                   | iCal フィード配信。秘密 token で RLS バイパス、Service Role で対象ユーザーの entries を `entriesToICal` で iCalendar 形式に変換                                                       |
| `/api/webhooks/resend`     | POST       | Resend signature       | なし                       | nodejs (maxDuration 30s) | Resend からの bounce / complained / delivered を受け、bounce/complained は Supabase の suppression list に書込                                                                        |
| `/api/webhooks/stripe`     | POST       | Stripe signature       | なし                       | nodejs (maxDuration 30s) | checkout.session.completed / customer.subscription.updated / customer.subscription.deleted を処理。subscription state の DB 反映、トランザクションメール送信、Sentry へのイベント記録 |

### 共通方針

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

### 変更ガイドライン

- 新規 endpoint を追加する前に、tRPC procedure で済まないか検討する（`features/*/server/router.ts`）
- REST 維持の理由に該当しない場合は tRPC を採用
- 認証必須の endpoint は Supabase server client + Cookie で `getUser()` 検証、または webhook signature 検証
- rate limit が必要な場合は `@/lib/rate-limit/upstash` の `withUpstashRateLimit` を使う
- 副作用（DB 書込・メール送信・外部 API 呼出）は logger でトレース可能にする

### 関連ドキュメント

- tRPC procedure 設計: `.claude/skills/trpc-router-creating/SKILL.md`（`trpc-router-creating` skill）
- Supabase Branching 運用: `.claude/skills/supabase/SKILL.md`（`supabase` skill）

---

## Supabase 型自動生成

Supabase CLIを使用して、データベーススキーマからTypeScript型定義を自動生成する。

### コマンド

| コマンド                            | ソース          | 用途                                      |
| ----------------------------------- | --------------- | ----------------------------------------- |
| `npm run types:generate`            | production main | `types:generate:production` の互換 alias  |
| `npm run types:generate:production` | production main | production main から生成                  |
| `npm run types:generate:local`      | Local DB        | ローカルから生成（`supabase start` 必要） |

PR Preview Branch の schema は Supabase integration check で検証する。型生成は production main か local のどちらかを明示して行う。

全コマンドとも `apps/product/src/lib/database/generated/database.types.ts` に出力。

### 使用タイミング

#### 必須

- データベーススキーマを変更した後
- 新しいテーブルを追加した後
- カラムの型を変更した後

#### 推奨

- 定期的（週1回程度）
- 本番環境のスキーマと同期を確認する

### ワークフロー

```bash
# 1. マイグレーション作成
npm run migration:create add_new_table
# マイグレーションファイルを編集

# 2. ローカルで適用確認
npm run db:reset

# 3. 型を再生成
npm run types:generate:local

# 4. 型チェック
npm run typecheck

# 5. コミット
git add apps/product/src/lib/database/generated/database.types.ts
git commit -m "chore(types): supabase型定義を更新"
```

### カスタム型

`apps/product/src/lib/database/generated/database.types.ts` は自動生成ファイル。**直接編集禁止**。

カスタム型が必要な場合は別ファイルに定義:

```typescript
// apps/product/src/lib/database/types.ts
import type { Database } from './generated/database.types';

export type PlanRow = Database['public']['Tables']['plans']['Row'];
export type TagRow = Database['public']['Tables']['tags']['Row'];
```

### トラブルシューティング

| エラー                 | 対処                                                                                         |
| ---------------------- | -------------------------------------------------------------------------------------------- |
| `project_id not found` | Supabase プロジェクトの存在を確認                                                            |
| `connection refused`   | ローカル: `supabase start` を実行 / リモート: ネットワーク確認                               |
| 生成された型がおかしい | production main か local のどちらから生成したか確認。local は `supabase db reset` でリセット |

---

## App Routes Overview

`src/app/[locale]/**` 配下の Next.js App Router routing を総覧。Route Group / Composition Layer / 認証境界の関係を一望できるようまとめる。`/api/**` は上記「API Endpoints Overview」を参照。

策定日: 2026-04-26（最終更新: 2026-05-12 に onboarding route group 削除を反映）
スコープ: `src/app/**` 配下の Next.js App Router 全 route。`/api/**` は除外。`(public)` Route Group は現時点で存在しない。

### Route Group 構造

```
src/app/
├── layout.tsx                  ← ルート layout（HTML / theme / font / globals.css）
├── error.tsx, global-error.tsx ← root-level error boundaries
├── not-found.tsx               ← root-level 404
├── sitemap.ts                  ← 多言語 sitemap（app 側の最小公開 URL のみ）
├── opengraph-image.tsx         ← OG image generator (edge runtime)
├── maintenance/route.ts        ← /maintenance（locale プレフィックスなし、Provider バイパス）
├── offline/page.tsx            ← /offline（PWA フォールバック）
├── api/                        ← REST / Webhook（API Endpoints Overview 参照）
└── [locale]/
    ├── layout.tsx              ← locale-scoped HTML lang / dir / metadata
    ├── page.tsx                ← / → /{locale}/week へ redirect
    ├── error.tsx               ← locale-scoped error boundary
    ├── (app)/                  ← 認証必須グループ
    │   ├── layout.tsx          ← IntlProvider + Providers + BaseLayout
    │   ├── error.tsx, not-found.tsx
    │   ├── (workspace)/        ← day / week / [nday] / review（URL 上は calendar namespace なし）
    │   ├── settings/
    │   ├── playground/
    │   ├── _providers/         ← Providers ツリー
    │   ├── _shell/             ← Shell layout components
    │   └── _overlays/          ← グローバルダイアログ群
    ├── (auth)/                 ← 認証フロー（login / signup / reset / mfa-verify）
    │   ├── layout.tsx          ← IntlProvider (auth namespace) + AuthClientLayout
    │   ├── loading.tsx
    │   └── auth/{login,signup,password,reset-password,mfa-verify}/page.tsx
    ├── playground/             ← dev playground（locale 直下）
    └── test-email/             ← email template preview
```

### (app) Group: 認証必須ページ

すべて `Supabase Auth` のセッションが前提。`(app)/layout.tsx` で `Providers`（tRPC / TanStack Query / Auth Store / Calendar Settings / Theme）を注入し、`BaseLayout` で sidebar + header を提供する。

#### Layout 系

| Path                  | Type           | 責務                                                                                                                           |
| --------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `(app)/layout.tsx`    | layout         | IntlProvider（app namespace のみ）+ Providers + BaseLayout + GlobalOverlays。`metadata.robots: noindex` で認証ページを検索除外 |
| `(app)/error.tsx`     | error boundary | (app) Group 内のページエラーを BaseLayout 内側で表示。i18n 対応、Sentry にも記録                                               |
| `(app)/not-found.tsx` | not-found      | (app) Group 内の 404。BaseLayout 内側で表示し、ナビ崩れを防ぐ                                                                  |

#### (workspace) — メインモード

| Path                                                 | Type           | 責務 / 主な合成元                                                                                                    |
| ---------------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------- |
| `(workspace)/day/page.tsx`                           | page (server)  | `prefetchCalendarData` → `HydrationBoundary` → `CalendarViewClient`（day view）。`generateMetadata` で i18n タイトル |
| `(workspace)/week/page.tsx`                          | page (server)  | week view。同上の prefetch + Suspense streaming                                                                      |
| `(workspace)/[nday]/page.tsx`                        | page (server)  | 多日数 view（2day〜9day）。`[nday]` で動的セグメント                                                                 |
| `(workspace)/{day,week,[nday]}/loading.tsx`          | loading        | 共通 `CalendarSkeleton` を表示                                                                                       |
| `(workspace)/{day,week,[nday]}/error.tsx`            | error boundary | calendar segment 専用エラー                                                                                          |
| `(workspace)/_composition/`                          | —              | `CalendarViewClient` ほか、各 view の合成 layer                                                                      |
| `(workspace)/_server/`                               | —              | `prefetchCalendarData` / `parseDateParam` / `CalendarSkeleton` 等の server-only ヘルパ                               |
| `(workspace)/review/*`, `(workspace)/ai/*`（旧構成） | —              | 独立ルートとしては現存しない。Calendar panel への統合作業中。本表の記述は移行完了後に更新する                        |

#### settings

| Path                           | Type            | 責務                                                                                |
| ------------------------------ | --------------- | ----------------------------------------------------------------------------------- |
| `settings/page.tsx`            | page (client)   | settings 一覧。client component、`useAuthStore` + `SETTINGS_CATEGORIES` で nav 表示 |
| `settings/layout.tsx`          | layout (client) | settings 用の slot 構造                                                             |
| `settings/[category]/page.tsx` | page (client)   | カテゴリ別 settings（`SettingsContent` を render）                                  |

#### playground

| Path                           | Type | 責務                                                                      |
| ------------------------------ | ---- | ------------------------------------------------------------------------- |
| `playground/dnd-tags/page.tsx` | page | dnd-kit 検証用の dev playground（production では `noindex` 継承で隠れる） |

### composition layer の使い方

各 mode の `_composition/` には「ページから見た合成 hub」を集める:

- 入力: `params` / `searchParams` / `prefetched data`
- 合成対象: feature barrel (`@/features/calendar`, `@/features/review`, `@/features/entry` 等)
- 出力: 1 つの client component ツリー

`page.tsx` 自体は薄く保つ（prefetch + Suspense + 合成 component の呼出）。view の差し替えやデータ取得方式の変更は composition layer 内で完結させる。詳細は `.claude/rules/feature-boundaries.md` の Composition Layer / Composition Hub を参照。

### providers / shell / overlays

| Path                                 | 責務                                                                          |
| ------------------------------------ | ----------------------------------------------------------------------------- |
| `(app)/_providers/Providers.tsx`     | tRPC / TanStack Query / Auth Store / Calendar Settings / Theme などのデータ層 |
| `(app)/_shell/base-layout.tsx`       | sidebar + header + main の UI shell                                           |
| `(app)/_overlays/GlobalOverlays.tsx` | ContactDialog / TourOrchestrator など global dialog 群を集約マウント          |

### Auth 境界の確認

- `(app)` 配下の page で auth check は **layout 経由で間接的に行われる**（Providers 内の `AuthStoreInitializer` で session 取得 → 未認証なら `/login` へ redirect）
- ページ単体での auth ガードは不要。新規 page を追加するときは `(app)` 配下に置けば自動的に認証必須となる
- 認証スキップしたい page は `(auth)/` に置く（下記参照）

### (auth) Group: 認証フロー

未認証ユーザー向けの login / signup / reset 系ページ。`AuthClientLayout` で軽量な `PublicProviders`（Theme + Tooltip のみ）を注入し、`AuthLayout` で UI を組み立てる。tRPC / TanStack Query などのデータ層は持たない（Supabase Auth Client SDK を直接利用）。

#### Layout 系

| Path                 | Type            | 責務                                                                                                       |
| -------------------- | --------------- | ---------------------------------------------------------------------------------------------------------- |
| `(auth)/layout.tsx`  | layout (server) | IntlProvider（`common` / `auth` / `error` namespace のみ）+ `AuthClientLayout`。`metadata.robots: noindex` |
| `(auth)/loading.tsx` | loading         | 認証フロー共通のローディング表示                                                                           |

#### Pages

| Path                                  | Type          | 責務                                                           |
| ------------------------------------- | ------------- | -------------------------------------------------------------- |
| `(auth)/auth/page.tsx`                | page (server) | `/auth` ルートへの直接アクセス時の入口（リダイレクト or 案内） |
| `(auth)/auth/login/page.tsx`          | page (server) | `LoginForm` を中央配置で render                                |
| `(auth)/auth/signup/page.tsx`         | page (server) | `SignupForm`                                                   |
| `(auth)/auth/password/page.tsx`       | page (server) | `PasswordResetForm`（リセットメール送信）                      |
| `(auth)/auth/reset-password/page.tsx` | page (server) | `ResetPasswordForm`（リセットリンク経由の新パスワード設定）    |
| `(auth)/auth/mfa-verify/page.tsx`     | page (server) | MFA TOTP コード検証                                            |
| `(auth)/auth/mfa-verify/layout.tsx`   | layout        | MFA 専用 wrapper                                               |

### [locale] 直下

locale ルーティングの境界。HTML lang / dir、metadata、redirect を担う。

| Path                                       | Type            | 責務                                                                                          |
| ------------------------------------------ | --------------- | --------------------------------------------------------------------------------------------- |
| `[locale]/layout.tsx`                      | layout (server) | `<html lang dir>` の確定、`generateMetadata` で多言語 OG / canonical、未対応 locale を 404 に |
| `[locale]/page.tsx`                        | page (server)   | `/{locale}` → `/{locale}/week` redirect。`force-dynamic`                                      |
| `[locale]/error.tsx`                       | error boundary  | locale 全体のエラー（IntlProvider 未マウントケース含む）                                      |
| `[locale]/playground/dnd-multi-container/` | dev             | dnd-kit Multiple Containers の検証用                                                          |
| `[locale]/test-email/`                     | dev             | email template の preview ページ                                                              |

### ルート直下（src/app/）

locale プレフィックスを持たない routing と Next.js metadata route 群。

| Path                   | Type                | 責務                                                                                                                 |
| ---------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `layout.tsx`           | root layout         | HTML 骨格 / theme provider / font / `globals.css` の読み込み。**この layout は触らない** が原則（影響範囲が全 page） |
| `error.tsx`            | root error boundary | App router の最上位エラー                                                                                            |
| `global-error.tsx`     | global error        | layout も含めた致命エラー時の最終手段（`<html>` から自前で組む）                                                     |
| `not-found.tsx`        | root 404            | 全 path 共通の 404                                                                                                   |
| `sitemap.ts`           | metadata route      | 多言語 sitemap。app 側は SaaS のため公開 URL 最小（マーケは web/ 側）                                                |
| `opengraph-image.tsx`  | metadata route      | edge runtime で動的 OG 画像生成。`@/lib/og-colors` で色固定                                                          |
| `maintenance/route.ts` | route handler       | `/maintenance`。Route Handler で raw HTML を返し、Provider ツリーをバイパスして CSP を回避                           |
| `offline/page.tsx`     | page (client)       | PWA オフラインフォールバック。`navigator.language` で ja/en を切替                                                   |

### 認証境界の全体像

```
未認証 → (auth)            : login / signup / reset / mfa
認証済み → (app)
locale 不正 / path 不在    → [locale]/error.tsx, not-found.tsx, root not-found.tsx
致命エラー                 → global-error.tsx
オフライン (PWA)           → /offline
メンテナンス時             → /maintenance
```

### 関連ドキュメント

- Feature 境界: `.claude/rules/feature-boundaries.md`

---

## パフォーマンス監視の原則

> **平均は見ない。p95だけを見る。**

### なぜp95か

- ユーザー体験は「一部の遅い人」で評価される
- BtoCでは「たまに遅い」が致命傷
- 平均値は問題を隠す

| 指標    | 役割                       |
| ------- | -------------------------- |
| **p95** | 体感品質・改善対象         |
| **p99** | 障害・事故の早期検知       |
| 平均    | 参考値（判断には使わない） |

### 速度指標

#### フロント（最優先）

ユーザーが「遅い」と感じる正体。

| 指標    | 意味                         | 基準（p95） |
| ------- | ---------------------------- | ----------- |
| **LCP** | 画面が表示されたと感じるまで | ≤ 2.5s      |
| **INP** | 操作に反応するまで           | ≤ 200ms     |
| **CLS** | レイアウトのズレ             | < 0.1       |

#### API

| 指標        | 基準（p95）  |
| ----------- | ------------ |
| API latency | ≤ 300ms      |
| 初期表示API | 最優先で監視 |

#### DB

| 指標           | 基準（p95） |
| -------------- | ----------- |
| クエリ実行時間 | ≤ 100ms     |

### 安定性指標

安定性 = 「失敗しても安心できること」

| 指標               | 基準          |
| ------------------ | ------------- |
| 主要導線エラー率   | < 0.1%        |
| タイムアウト率     | p95/p99で監視 |
| 同一エラーの再発率 | 月次チェック  |

**注意**: 全体エラー率ではなく、ログイン後・保存・課金など"致命導線"だけを見る。

### 最小SLO（目標値）

| 項目                     | 目標              |
| ------------------------ | ----------------- |
| ログイン後トップ LCP p95 | ≤ 3.0s            |
| 主要API latency p95      | ≤ 300ms           |
| 主要導線エラー率         | < 0.1%（増加NG）  |
| p95悪化時                | **改善Issue必須** |

### 行動ルール

数字は「合否」ではなく「行動トリガー」。

| 状況      | アクション             |
| --------- | ---------------------- |
| p95が悪化 | 改善Issueを必ず1つ作る |
| p95が良化 | 正解パターンとして記録 |

#### やってはいけないこと

- 数字だけ下げて満足
- 体感が変わらない最適化
- 最大値（p100）を追いかける

### React最適化クイックリファレンス

| パターン      | 使うとき             |
| ------------- | -------------------- |
| `useMemo`     | 高コストな計算       |
| `useCallback` | 子に渡すコールバック |
| `React.memo`  | 重いコンポーネント   |

**最適化が不要なケース**:

- 単純なコンポーネント（メモ化のオーバーヘッドの方が大きい）
- propsが毎回変わる場合
- 再レンダリングが問題になっていない場合

監視・計測の運用は `docs/operations/monitoring.md` を参照。

Next.js のビルド時最適化（PPR、prefetch、bundle 最適化等）は [`conventions-frontend.md`](./conventions-frontend.md) の「Next.js パフォーマンス最適化」セクションを参照。

---

## 開発コマンド一覧

Dayoptプロジェクトで使用可能な全npmコマンドのリファレンス。

### 基本開発コマンド（頻出）

```bash
pnpm dev                    # 1Password 経由で開発サーバー起動
npm run typecheck           # 型チェック
npm run lint                # コード品質チェック
npm run lint:boundaries     # feature境界チェック
npm run test:run            # ユニットテスト実行
npm run check               # typecheck + lint + test:run（一括）
```

> **Secrets**: 実値は `.env.local` に置かず、1Password master と `.op-env.local` の `op://` 参照を `pnpm dev` で注入する。`pnpm dev` は通常 Supabase local を参照する。素の起動が必要な一時作業だけ `pnpm dev:raw`、`.op-env.local` の Supabase refs をそのまま使う時だけ `DAYOPT_SUPABASE_TARGET=op pnpm dev` を使う。詳細は `docs/operations/secrets.md`。
> 開発サーバー（`pnpm dev`, `npm run storybook`）の起動・停止はユーザー責務。

### 全コマンド一覧

#### 開発サーバー

```bash
pnpm dev                    # .op-env.local + op run 経由で next dev
pnpm dev:raw                # 素の next dev（一時作業用）
npm run storybook           # Storybook（ポート6006）
```

#### ビルド

```bash
npm run build               # next build
npm run build-storybook     # Storybook ビルド
npm run bundle:analyze      # バンドル解析付きビルド
```

#### コード品質

```bash
npm run lint                # ESLint（--max-warnings 0）
npm run lint:fix            # ESLint 自動修正
npm run lint:boundaries     # feature間の直接importを検出
npm run lint:boundaries:update  # 許可リスト更新
npm run lint:tokens         # Tailwindセマンティックトークンチェック
npm run typecheck           # tsc --noEmit
npm run format              # Prettier フォーマット
npm run format:check        # Prettier チェックのみ
```

#### テスト

```bash
npm run test                # Vitest（watchモード）
npm run test:run            # Vitest（1回実行）
npm run test:unit           # ユニットテスト
npm run test:watch          # ウォッチモード
npm run test:ui             # Vitest UI
npm run test:coverage       # カバレッジ付き実行
npm run test:coverage:summary  # カバレッジサマリー表示
npm run test:diff-coverage  # 差分カバレッジ
npm run test-storybook      # Storybook テスト
npm run test:integration    # 統合テスト
npm run test:e2e            # Playwright E2Eテスト
npm run test:e2e:smoke      # E2Eスモークテスト
npm run test:e2e:critical   # E2Eクリティカルパス
npm run test:e2e:ui         # Playwright UIモード
npm run test:e2e:headed     # ブラウザ表示付きE2E
```

#### Supabase / DB

```bash
npm run db:reset            # ローカルDB リセット
npm run db:reset-linked:unsafe # 手動リンク先をリセット（緊急時のみ）
npm run db:seed             # 開発データ投入
npm run db:fresh            # リセット + シード
npm run migration:create    # マイグレーション作成
npm run migration:list      # マイグレーション一覧
npm run migration:status    # DB差分確認
npm run types:generate          # Supabase production main から apps/product/src/lib/database に型生成
npm run types:generate:production # production main から apps/product/src/lib/database に型生成
npm run types:generate:local    # ローカルから apps/product/src/lib/database に型生成
```

#### 環境変数

```bash
pnpm env:check           # secret 値を表示せず env の存在確認
pnpm secrets:check       # tracked files と untracked .env* の literal secret 検出
pnpm 1password:check     # 1Password schema の vault/item/field 存在確認
pnpm vercel:env          # Vercel 環境変数一覧
pnpm vercel:env:pull:unsafe  # apps/product/.env.local に一時同期
```

#### i18n

```bash
npm run i18n:check          # 翻訳キーの整合性チェック
npm run i18n:unused         # 未使用の翻訳キーを検出
```

#### セキュリティ・ライセンス

```bash
npm run license:check       # ライセンスチェック
npm run license:audit       # ライセンスサマリー
npm run license:report      # ライセンスCSVレポート
npm run security:audit      # npm audit（production）
npm run security:check      # npm audit（moderate以上）
npm run security:full       # audit + typecheck + lint
npm run security:audit:actions  # GitHub Actions監査
```

#### パフォーマンス

```bash
npm run size                # バンドルサイズチェック
npm run size:why            # バンドルサイズ分析
npm run perf:lighthouse     # Lighthouse CI
npm run deps:circular       # 循環依存検出
npm run deps:outdated       # 古いパッケージ一覧
```

#### ドキュメント

```bash
npm run docs:check          # コード-ドキュメント整合性
npm run docs:validate       # リンク + ルール検証
```

#### Sentry

```bash
npm run sentry:test         # Sentry接続テスト
npm run sentry:verify       # Sentry設定検証
```

#### Git ログ

```bash
npm run log:feat            # feat: コミットのみ表示
npm run log:fix             # fix: コミットのみ表示
npm run log:type            # 型別コミット一覧（最新20件）
```

### pre-commit フック（自動実行）

コミット時に以下が自動で実行される:

1. **lint-staged**: ステージされた `.ts/.tsx` に prettier + eslint
2. **typecheck**: `.ts/.tsx` ファイルが含まれる場合のみ `tsc --noEmit`
3. **license:check**: `package.json` 変更時のみライセンスチェック

---

## マイグレーション & リリース チェックリスト

### 運用モデル

Dayopt の標準ルートは `local → PR Preview → production`。

- **Supabase project**: `dayopt`
- **Project ref**: `yvglwblxrnrenfifsnje`
- **Local**: `supabase start` と `pnpm dev` (`op run`) を使う
- **PR Preview**: PR ごとの Supabase Preview Branch と Vercel Preview を使う
- **Production**: `main` merge 後だけ Supabase main と Vercel Production に反映する

| 環境           | Supabase                          | Vercel                         | 用途                         |
| -------------- | --------------------------------- | ------------------------------ | ---------------------------- |
| **Local**      | `supabase start`                  | `pnpm dev`                     | 手元の開発                   |
| **PR Preview** | PR ごとの Supabase Preview Branch | Vercel Preview URL (`product`) | migration / 機能の本番前検証 |
| **Production** | `dayopt` main                     | Production deployment          | 実ユーザー                   |

persistent staging は標準ルートでは使わない。固定 URL が必要な Stripe / OAuth / closed beta 検証が発生した時だけ、Vercel staging と Supabase persistent branch を追加する。

### Integration Setup

Supabase Dashboard で `dayopt` project に GitHub integration を接続する。

- Repository: `Dayopt/dayopt`
- Working directory: `.`
- Production branch: `main`
- Automatic branching: enabled
- Deploy to production: enabled
- Preview Branch seed: `supabase/seed.sql`

Supabase Vercel integration は `product` Vercel project のみに接続する。`web` は今回の Supabase Preview Branch 切替対象外。

GitHub branch protection では Supabase integration の required check を有効化する。これにより、Preview Branch への migration 適用が失敗した PR は merge できない。

### リリースフロー全体像

```txt
feature branch → PR open
                  ├── Supabase: Preview Branch 作成 + migration 適用 + seed
                  └── Vercel: product Preview が Preview Branch env を参照

PR review → checks pass → main merge
                  ├── Supabase: main/production に migration 適用
                  └── Vercel: product Production deploy
```

Vercel Preview は production Supabase DB を参照しない。PR close / merge 後の Preview Branch は Supabase 側で削除または停止される。

### マイグレーション手順

#### 1. 作成

```bash
npm run migration:create <migration_name>
# supabase/migrations/YYYYMMDDHHMMSS_<migration_name>.sql を編集
```

#### 2. ローカル検証

```bash
supabase start
npm run db:reset
npm run db:seed
pnpm dev
```

#### 3. PR Preview 検証

PR を作成すると Supabase GitHub integration が Preview Branch を作成し、`supabase/migrations/**` を適用する。Vercel integration が `product` の Preview deployment に対応する Supabase env vars を注入する。

確認すること:

- Supabase PR check が green
- Vercel Preview が production DB ではなく Preview Branch を参照している
- migration に依存する機能が Preview URL で動く
- seed data だけで動作確認でき、本番データを必要としない

#### 4. Production 適用

`main` merge 後、Supabase GitHub integration が production に migration を適用する。GitHub Actions から `supabase db push` は実行しない。

### Emergency Runbook

通常運用では手動 `supabase db push` を使わない。Supabase integration 障害などで緊急対応が必要な場合だけ、Production の 1Password secret を使い、作業ログに理由を残して実行する。

```bash
supabase link --project-ref yvglwblxrnrenfifsnje
supabase db push --dry-run
supabase db push
```

### マイグレーション統合時の注意

- [ ] RLS が有効で、`auth.uid() = user_id` の境界が維持されている
- [ ] 新規 table / view / RPC は `GRANT` を明示し、`RLS + policy + GRANT` を 1 セットでレビューしている
- [ ] `authenticated` への Data API 権限は必要最小限にしている
- [ ] `anon` への権限付与は公開読み取りなど明示理由がある場合だけに限定している
- [ ] service-role 専用 table / RPC は browser client から使えないことを RLS / GRANT の両方で確認している
- [ ] Realtime が必要な table だけ `supabase_realtime` publication に入っている
- [ ] `IF NOT EXISTS` / `IF EXISTS` で冪等化している
- [ ] ローカルで `db:reset` が通る
- [ ] `pnpm rls:snapshot` を再生成し、RLS / GRANT / Realtime publication の差分を確認している
- [ ] Supabase Preview Branch check が green
- [ ] Production 適用前に Vercel Preview で主要導線を確認した

### GRANT / Realtime 監査

Supabase Data API / GraphQL API から新規 `public` object を使う時は、RLS だけでなく
`GRANT` が必要になる。migration review では以下を確認する。

- table: user data は `authenticated` に必要な `SELECT` / `INSERT` / `UPDATE` / `DELETE` だけを付与する
- view: `security_invoker = true` を使い、必要な role に `SELECT` を明示する
- RPC: app-facing 関数は `authenticated`、service-role 専用関数は `service_role` / platform role に限定する
- public read が必要な object 以外は `anon` に付与しない
- `CREATE OR REPLACE FUNCTION` は既存権限を保持しうるため、意図する `GRANT` / `REVOKE` を migration 内に明示する

権限と Realtime publication は snapshot に含める。migration 変更後は local DB に適用してから再生成する。

```bash
pnpm rls:snapshot
pnpm rls:snapshot:check
```

Realtime publication の手動確認 SQL:

```sql
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
ORDER BY schemaname, tablename;
```

2026-07-08 時点の期待値は production / local ともに空。アプリコード側にも `postgres_changes`
購読はない。Realtime を再導入する時は、購読する table、必要な RLS policy、publication 追加理由を
同じ PR に残す。

### スキーマ変更を含むリリースの順序

| 変更種別         | 順序の原則                                   |
| ---------------- | -------------------------------------------- |
| 新カラム追加     | 先に DB、後にアプリ（デフォルト値必須）      |
| カラム削除       | 先にアプリ（参照除去）、後に DB              |
| 型変更           | 2 段階（新カラム追加 → backfill → 旧削除）   |
| NOT NULL 追加    | 先に backfill で全行埋める → 制約追加        |
| RLS ポリシー変更 | 新ポリシー追加 → アプリ更新 → 旧ポリシー削除 |

### 関連

- skill: `.agents/skills/supabase/SKILL.md`
- secrets: `docs/operations/secrets.md`

---

## DB Migration Rollback 手順書

本番デプロイ事故時の逆マイグレーションSQL集。Supabaseはネイティブのrollback機構を持たないため、**逆SQLを新しいマイグレーションとして適用する**方式で対応する。

> **対象**: `supabase/migrations/` 配下の全17マイグレーション（baseline除く）

### 緊急対応フローチャート

```
1. 障害検知
   ↓
2. メンテナンスモード有効化
   NEXT_PUBLIC_MAINTENANCE_MODE=true を Vercel で設定
   ↓
3. 影響範囲特定
   どのマイグレーションが原因か特定する
   ↓
4. バックアップ取得
   該当テーブルの事前バックアップSQLを実行（下記参照）
   ↓
5. pg_cron ジョブ停止（Vault/Edge Function関連の場合）
   SELECT cron.unschedule('ジョブ名');
   ↓
6. ロールバックSQL実行
   Supabase Dashboard > SQL Editor で実行
   ※ 依存関係に注意: 新しいものから逆順に適用
   ↓
7. マイグレーション履歴更新
   DELETE FROM supabase_migrations.schema_migrations
   WHERE version = 'ロールバックしたバージョン';
   ↓
8. アプリ動作確認
   Staging で確認後、メンテナンスモード解除
```

### カテゴリ別ロールバック方針

| 操作                        | ロールバック方法              | データ損失   |
| --------------------------- | ----------------------------- | ------------ |
| CREATE TABLE                | DROP TABLE                    | あり         |
| ALTER TABLE ADD COLUMN      | ALTER TABLE DROP COLUMN       | あり         |
| CREATE INDEX                | DROP INDEX                    | なし         |
| CREATE EXTENSION            | DROP EXTENSION                | なし（通常） |
| CREATE FUNCTION             | DROP FUNCTION                 | なし         |
| CREATE OR REPLACE FUNCTION  | 旧版で CREATE OR REPLACE      | なし         |
| DROP POLICY + CREATE POLICY | 旧ポリシーで DROP + CREATE    | なし         |
| GRANT/REVOKE                | 逆の REVOKE/GRANT             | なし         |
| ALTER TABLE ADD CONSTRAINT  | ALTER TABLE DROP CONSTRAINT   | なし         |
| Data migration (UPDATE)     | **不可逆** — バックアップ必須 | —            |

### 各マイグレーションの逆SQL

#### 1. `20260317022728_fix_security_definer_idor.sql`

| 項目       | 値                                                     |
| ---------- | ------------------------------------------------------ |
| 内容       | SECURITY DEFINER関数にauth.uid()チェック追加（13関数） |
| リスク     | LOW                                                    |
| データ損失 | なし                                                   |

> **ロールバック非推奨**: セキュリティ修正。ロールバックするとIDOR脆弱性が復活する。

逆SQL: `00000000000000_baseline.sql` から元の関数定義を取り出し `CREATE OR REPLACE` で上書き。auth.uid()チェックを含まない版に戻す。

#### 2. `20260317040426_add_entry_time_overlap_constraint.sql`

| 項目       | 値                             |
| ---------- | ------------------------------ |
| 内容       | btree_gist拡張 + EXCLUSION制約 |
| リスク     | LOW                            |
| データ損失 | なし                           |

```sql
-- ロールバック
ALTER TABLE public.entries DROP CONSTRAINT IF EXISTS entries_no_time_overlap;
-- btree_gist は他で使用していなければ削除可:
-- DROP EXTENSION IF EXISTS btree_gist;
```

#### 3. `20260317040428_add_reminder_idempotency.sql`

| 項目       | 値                               |
| ---------- | -------------------------------- |
| 内容       | notifications UNIQUEインデックス |
| リスク     | LOW                              |
| データ損失 | なし                             |

```sql
DROP INDEX IF EXISTS public.idx_notifications_entry_type_unique;
```

#### 4. `20260317100000_add_ical_feed_token.sql`

| 項目       | 値                                      |
| ---------- | --------------------------------------- |
| 内容       | user_settings に ical_feed_token カラム |
| リスク     | MEDIUM                                  |
| データ損失 | あり（iCalフィードURL無効化）           |

```sql
-- 事前バックアップ
CREATE TABLE _backup_user_settings_ical AS
SELECT user_id, ical_feed_token FROM user_settings
WHERE ical_feed_token IS NOT NULL;

-- ロールバック
DROP INDEX IF EXISTS idx_user_settings_ical_feed_token;
ALTER TABLE user_settings DROP COLUMN IF EXISTS ical_feed_token;
```

復旧: ユーザーが設定画面からトークンを再生成する必要あり。

#### 5. `20260317120000_add_stripe_billing_columns.sql`

| 項目       | 値                                                                   |
| ---------- | -------------------------------------------------------------------- |
| 内容       | profiles に stripe_customer_id, subscription_status, subscription_id |
| リスク     | **HIGH**                                                             |
| データ損失 | あり（課金データ消失）                                               |

```sql
-- 事前バックアップ（必須）
CREATE TABLE _backup_profiles_billing AS
SELECT id, stripe_customer_id, subscription_status, subscription_id
FROM profiles
WHERE stripe_customer_id IS NOT NULL;

-- ロールバック
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS chk_subscription_status;
DROP INDEX IF EXISTS idx_profiles_stripe_customer_id;
ALTER TABLE profiles
  DROP COLUMN IF EXISTS subscription_id,
  DROP COLUMN IF EXISTS subscription_status,
  DROP COLUMN IF EXISTS stripe_customer_id;
```

復旧: `_backup_profiles_billing` からカラム再追加 + INSERT で復元。

#### 6. `20260318083030_optimize_tag_sort_and_rls.sql`

| 項目       | 値                                        |
| ---------- | ----------------------------------------- |
| 内容       | increment_tag_sort_orders関数 + RLS最適化 |
| リスク     | LOW                                       |
| データ損失 | なし                                      |

```sql
DROP FUNCTION IF EXISTS public.increment_tag_sort_orders(UUID);

-- reflections RLS（bare auth.uid() 版に戻す）
DROP POLICY IF EXISTS "Users can view own reflections" ON public.reflections;
CREATE POLICY "Users can view own reflections" ON public.reflections
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can create own reflections" ON public.reflections;
CREATE POLICY "Users can create own reflections" ON public.reflections
  FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own reflections" ON public.reflections;
CREATE POLICY "Users can update own reflections" ON public.reflections
  FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own reflections" ON public.reflections;
CREATE POLICY "Users can delete own reflections" ON public.reflections
  FOR DELETE USING (auth.uid() = user_id);

-- notification_preferences INSERT
DROP POLICY IF EXISTS "Users can insert own notification preferences" ON public.notification_preferences;
CREATE POLICY "Users can insert own notification preferences" ON public.notification_preferences
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
```

#### 8. `20260318090000_create_get_time_by_tag_function.sql`

| 項目       | 値                  |
| ---------- | ------------------- |
| 内容       | get_time_by_tag関数 |
| リスク     | LOW                 |
| データ損失 | なし                |

```sql
DROP FUNCTION IF EXISTS public.get_time_by_tag(UUID, TIMESTAMPTZ, TIMESTAMPTZ);
```

#### 9. `20260318091249_create_email_suppressions.sql`

| 項目       | 値                          |
| ---------- | --------------------------- |
| 内容       | email_suppressions テーブル |
| リスク     | MEDIUM                      |
| データ損失 | あり（バウンス記録消失）    |

```sql
-- 事前バックアップ
CREATE TABLE _backup_email_suppressions AS SELECT * FROM email_suppressions;

-- ロールバック
DROP TABLE IF EXISTS public.email_suppressions CASCADE;
```

#### 10. `20260318120000_create_stats_kpi_functions.sql`

| 項目       | 値                                       |
| ---------- | ---------------------------------------- |
| 内容       | KPI関数7つ                               |
| リスク     | LOW                                      |
| データ損失 | なし                                     |
| 依存       | **先に #11, #12 をロールバックすること** |

```sql
DROP FUNCTION IF EXISTS public.get_plan_rate(UUID, TIMESTAMPTZ, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.get_estimation_accuracy(UUID, TIMESTAMPTZ, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.get_context_switches(UUID, TIMESTAMPTZ, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.get_blank_rate(UUID, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS public.get_energy_map(UUID, TIMESTAMPTZ, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.get_cumulative_time(UUID, TIMESTAMPTZ, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.get_avg_fulfillment(UUID, TIMESTAMPTZ, TIMESTAMPTZ);
```

#### 11. `20260318130000_fix_stats_context_switches_and_energy_map.sql`

| 項目       | 値                                                  |
| ---------- | --------------------------------------------------- |
| 内容       | KPI関数のauth.uid()チェック + TZ対応 + REVOKE/GRANT |
| リスク     | LOW                                                 |
| データ損失 | なし                                                |

> **ロールバック非推奨**: auth.uid()チェック（セキュリティ修正）を含む。

逆SQL: `20260318120000` の関数定義で `CREATE OR REPLACE`（auth.uid()チェックなし版）+ PUBLIC への GRANT 復元。

```sql
-- REVOKE authenticated + GRANT PUBLIC に戻す（セキュリティ低下）
REVOKE ALL ON FUNCTION public.get_plan_rate(UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_plan_rate(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO PUBLIC;
-- 他6関数も同様...

-- + 20260318120000 の関数定義で CREATE OR REPLACE（auth.uid()チェックなし）

-- 旧 get_energy_map(UUID, DATE, DATE) overload を復元する場合:
-- 20260317022728 の get_energy_map 定義を参照
```

#### 12. `20260318140000_create_stats_kpi_summary.sql`

| 項目       | 値                            |
| ---------- | ----------------------------- |
| 内容       | get_stats_kpi_summary統合関数 |
| リスク     | LOW                           |
| データ損失 | なし                          |

```sql
REVOKE ALL ON FUNCTION public.get_stats_kpi_summary(UUID, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, INTEGER) FROM authenticated;
DROP FUNCTION IF EXISTS public.get_stats_kpi_summary(UUID, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, INTEGER);
```

#### 13. `20260318150000_add_entries_soft_delete.sql`

| 項目       | 値                                            |
| ---------- | --------------------------------------------- |
| 内容       | entries に deleted_at カラム + SELECT RLS更新 |
| リスク     | **HIGH**                                      |
| データ損失 | あり（ソフトデリート区別が消失）              |
| 依存       | **先に #17 をロールバックすること**           |

```sql
-- 事前バックアップ（必須）
CREATE TABLE _backup_entries_soft_deleted AS
SELECT id, user_id, title, deleted_at FROM entries WHERE deleted_at IS NOT NULL;

-- ロールバック
DROP POLICY "Users can view own plans" ON public.entries;
CREATE POLICY "Users can view own plans" ON public.entries
  FOR SELECT USING ((SELECT auth.uid()) = user_id);

DROP INDEX IF EXISTS idx_entries_deleted_at;
ALTER TABLE public.entries DROP COLUMN IF EXISTS deleted_at;
```

復旧: ロールバック後、ソフトデリート済みデータはHARD DELETEされた状態になる。`_backup_entries_soft_deleted` から復元するには、deleted_at カラムを再追加して UPDATE する。

#### 14. `20260319000000_enable_vault.sql`

| 項目       | 値                                |
| ---------- | --------------------------------- |
| 内容       | supabase_vault拡張                |
| リスク     | **HIGH**                          |
| データ損失 | あり（Vault内シークレット全消失） |

> **ロールバック非推奨**: pg_cronジョブ、Edge Function呼び出しが全て停止する。

```sql
-- CASCADE: 依存する関数 (get_vault_secret, vault_secret_exists, invoke_edge_function) も削除される
DROP EXTENSION IF EXISTS supabase_vault CASCADE;
```

#### 15. `20260319000001_vault_helper_functions.sql`

| 項目       | 値                                    |
| ---------- | ------------------------------------- |
| 内容       | get_vault_secret, vault_secret_exists |
| リスク     | MEDIUM                                |
| データ損失 | なし                                  |
| 依存       | **先に #16 をロールバックすること**   |

```sql
DROP FUNCTION IF EXISTS public.vault_secret_exists(TEXT);
DROP FUNCTION IF EXISTS public.get_vault_secret(TEXT);
```

#### 16. `20260319000003_vault_invoke_edge_function.sql`

| 項目       | 値                       |
| ---------- | ------------------------ |
| 内容       | invoke_edge_function関数 |
| リスク     | MEDIUM                   |
| データ損失 | なし                     |

```sql
-- 事前: cronジョブを確認・停止
-- SELECT * FROM cron.job WHERE command LIKE '%invoke_edge_function%';
-- SELECT cron.unschedule('check-reminders');

DROP FUNCTION IF EXISTS public.invoke_edge_function(TEXT, JSONB);
```

#### 17. `20260319083000_rls_audit_fixes.sql`

| 項目       | 値                                               |
| ---------- | ------------------------------------------------ |
| 内容       | storage UPDATEポリシー + soft-deleteフィルタ追加 |
| リスク     | LOW                                              |
| データ損失 | なし                                             |

```sql
-- storage ポリシー削除
DROP POLICY IF EXISTS "Users can update own attachments" ON storage.objects;

-- entry_tags SELECT（soft-deleteフィルタなし版に戻す）
DROP POLICY IF EXISTS "Users can view own plan_tags" ON public.entry_tags;
CREATE POLICY "Users can view own plan_tags" ON public.entry_tags
  FOR SELECT USING ((SELECT auth.uid()) = user_id);

```

#### 18. `20260319090000_create_stripe_webhook_events.sql`

| 項目       | 値                             |
| ---------- | ------------------------------ |
| 内容       | stripe_webhook_events テーブル |
| リスク     | LOW                            |
| データ損失 | あり（冪等性ログ消失、実害低） |

```sql
DROP TABLE IF EXISTS public.stripe_webhook_events CASCADE;
```

### ロールバック依存関係

逆順で適用すること。特に重要な依存チェーン:

```
#17 → #13 (soft_delete)     ← #17が13のdeleted_atカラムに依存
#16 → #15 → #14 (vault)     ← invoke_edge_function → helpers → extension
#12 → #11 → #10 (stats)     ← summary → fix → kpi_functions
```

**安全なロールバック順序**（最新から）:

```
18 → 17 → 16 → 15 → 14 → 13 → 12 → 11 → 10 → 9 → 8 → 7 → 6 → 5 → 4 → 3 → 2 → 1
```

### 共通チェックリスト

#### ロールバック前

- [ ] メンテナンスモード有効化（`NEXT_PUBLIC_MAINTENANCE_MODE=true`）
- [ ] 該当テーブルのバックアップSQL実行
- [ ] pg_cronジョブ停止（Vault関連の場合）
- [ ] Stripeの受信Webhook一時停止（課金関連の場合）
- [ ] 影響を受けるtRPCルーターの確認

#### ロールバック後

- [ ] `supabase_migrations.schema_migrations` から該当レコード削除
- [ ] Staging環境で動作確認
- [ ] メンテナンスモード解除
- [ ] アプリの主要機能（ログイン、エントリ作成、カレンダー表示）の手動確認

#### マイグレーション履歴の更新

```sql
-- ロールバックしたマイグレーションを履歴から削除
DELETE FROM supabase_migrations.schema_migrations
WHERE version = '20260319090000';  -- 該当バージョンに置き換え
```

### リスクサマリー

| リスク     | マイグレーション                                                                   |
| ---------- | ---------------------------------------------------------------------------------- |
| **HIGH**   | #5 (stripe billing), #13 (soft delete), #14 (vault)                                |
| **MEDIUM** | #4 (ical token), #9 (email suppressions), #15 (vault helpers), #16 (edge function) |
| **LOW**    | #1-3, #6, #8, #10-12, #17-18                                                       |
| **非推奨** | #1 (IDOR fix), #11 (auth.uid() check), #14 (vault extension)                       |
