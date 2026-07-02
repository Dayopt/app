---
status: current
last_verified: 2026-07-02
---

# App Routes Overview

`src/app/[locale]/**` 配下の Next.js App Router routing を総覧。Route Group / Composition Layer / 認証境界の関係を一望できるようまとめる。`/api/**` は別途 [api-overview](./api-overview.md) を参照。

策定日: 2026-04-26（最終更新: 2026-05-12 に onboarding route group 削除を反映）
スコープ: `src/app/**` 配下の Next.js App Router 全 route。`/api/**` は除外（[api-overview](./api-overview.md) 参照）。`(public)` Route Group は現時点で存在しない。

## Route Group 構造

```
src/app/
├── layout.tsx                  ← ルート layout（HTML / theme / font / globals.css）
├── error.tsx, global-error.tsx ← root-level error boundaries
├── not-found.tsx               ← root-level 404
├── sitemap.ts                  ← 多言語 sitemap（app 側の最小公開 URL のみ）
├── opengraph-image.tsx         ← OG image generator (edge runtime)
├── maintenance/route.ts        ← /maintenance（locale プレフィックスなし、Provider バイパス）
├── offline/page.tsx            ← /offline（PWA フォールバック）
├── api/                        ← REST / Webhook（api-overview.md 参照）
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

## (app) Group: 認証必須ページ

すべて `Supabase Auth` のセッションが前提。`(app)/layout.tsx` で `Providers`（tRPC / TanStack Query / Auth Store / Calendar Settings / Theme）を注入し、`BaseLayout` で sidebar + header を提供する。

### Layout 系

| Path                                                               | Type           | 責務                                                                                                                           |
| ------------------------------------------------------------------ | -------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| [`(app)/layout.tsx`](<../src/app/[locale]/(app)/layout.tsx>)       | layout         | IntlProvider（app namespace のみ）+ Providers + BaseLayout + GlobalOverlays。`metadata.robots: noindex` で認証ページを検索除外 |
| [`(app)/error.tsx`](<../src/app/[locale]/(app)/error.tsx>)         | error boundary | (app) Group 内のページエラーを BaseLayout 内側で表示。i18n 対応、Sentry にも記録                                               |
| [`(app)/not-found.tsx`](<../src/app/[locale]/(app)/not-found.tsx>) | not-found      | (app) Group 内の 404。BaseLayout 内側で表示し、ナビ崩れを防ぐ                                                                  |

### (workspace) — メインモード

| Path                                                                                                                   | Type           | 責務 / 主な合成元                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------- |
| [`(workspace)/day/page.tsx`](<../src/app/[locale]/(app)/(workspace)/day/page.tsx>)                                     | page (server)  | `prefetchCalendarData` → `HydrationBoundary` → `CalendarViewClient`（day view）。`generateMetadata` で i18n タイトル |
| [`(workspace)/week/page.tsx`](<../src/app/[locale]/(app)/(workspace)/week/page.tsx>)                                   | page (server)  | week view。同上の prefetch + Suspense streaming                                                                      |
| [`(workspace)/[nday]/page.tsx`](<../src/app/[locale]/(app)/(workspace)/[nday]/page.tsx>)                               | page (server)  | 多日数 view（2day〜9day）。`[nday]` で動的セグメント                                                                 |
| `(workspace)/{day,week,[nday]}/loading.tsx`                                                                            | loading        | 共通 `CalendarSkeleton` を表示                                                                                       |
| `(workspace)/{day,week,[nday]}/error.tsx`                                                                              | error boundary | calendar segment 専用エラー                                                                                          |
| [`(workspace)/_composition/`](<../src/app/[locale]/(app)/(workspace)/_composition/>)                                   | —              | `CalendarViewClient` ほか、各 view の合成 layer                                                                      |
| [`(workspace)/_server/`](<../src/app/[locale]/(app)/(workspace)/_server/>)                                             | —              | `prefetchCalendarData` / `parseDateParam` / `CalendarSkeleton` 等の server-only ヘルパ                               |
| [`(workspace)/review/page.tsx`](<../src/app/[locale]/(app)/(workspace)/review/page.tsx>)                               | page (server)  | 振り返り単一ページ（`ReviewView` を render）                                                                         |
| [`(workspace)/review/layout.tsx`](<../src/app/[locale]/(app)/(workspace)/review/layout.tsx>)                           | layout         | `ReviewLayout`（日付ナビ + 粒度セレクタヘッダー）                                                                    |
| [`(workspace)/review/tags/[tagId]/page.tsx`](<../src/app/[locale]/(app)/(workspace)/review/tags/[tagId]/page.tsx>)     | page (server)  | タグ詳細（特定 tag のサマリ）                                                                                        |
| [`(workspace)/review/error.tsx`](<../src/app/[locale]/(app)/(workspace)/review/error.tsx>)                             | error boundary | review segment 専用エラー                                                                                            |
| [`(workspace)/ai/page.tsx`](<../src/app/[locale]/(app)/(workspace)/ai/page.tsx>)                                       | page (server)  | AI モード ルート（`AiMainContent` を render）                                                                        |
| [`(workspace)/ai/threads/[threadId]/page.tsx`](<../src/app/[locale]/(app)/(workspace)/ai/threads/[threadId]/page.tsx>) | page (server)  | AI スレッド詳細                                                                                                      |

### settings

| Path                                                                                       | Type            | 責務                                                                                |
| ------------------------------------------------------------------------------------------ | --------------- | ----------------------------------------------------------------------------------- |
| [`settings/page.tsx`](<../src/app/[locale]/(app)/settings/page.tsx>)                       | page (client)   | settings 一覧。client component、`useAuthStore` + `SETTINGS_CATEGORIES` で nav 表示 |
| [`settings/layout.tsx`](<../src/app/[locale]/(app)/settings/layout.tsx>)                   | layout (client) | settings 用の slot 構造                                                             |
| [`settings/[category]/page.tsx`](<../src/app/[locale]/(app)/settings/[category]/page.tsx>) | page (client)   | カテゴリ別 settings（`SettingsContent` を render）                                  |

### playground

| Path                                                                                       | Type | 責務                                                                      |
| ------------------------------------------------------------------------------------------ | ---- | ------------------------------------------------------------------------- |
| [`playground/dnd-tags/page.tsx`](<../src/app/[locale]/(app)/playground/dnd-tags/page.tsx>) | page | dnd-kit 検証用の dev playground（production では `noindex` 継承で隠れる） |

## composition layer の使い方

各 mode の `_composition/` には「ページから見た合成 hub」を集める:

- 入力: `params` / `searchParams` / `prefetched data`
- 合成対象: feature barrel (`@/features/calendar`, `@/features/review`, `@/features/entry` 等)
- 出力: 1 つの client component ツリー

`page.tsx` 自体は薄く保つ（prefetch + Suspense + 合成 component の呼出）。view の差し替えやデータ取得方式の変更は composition layer 内で完結させる。詳細は [.claude/rules/feature-boundaries.md](../../.claude/rules/feature-boundaries.md) の Composition Layer / Composition Hub を参照。

## providers / shell / overlays

| Path                                                                                             | 責務                                                                          |
| ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| [`(app)/_providers/Providers.tsx`](<../src/app/[locale]/(app)/_providers/Providers.tsx>)         | tRPC / TanStack Query / Auth Store / Calendar Settings / Theme などのデータ層 |
| [`(app)/_shell/base-layout.tsx`](<../src/app/[locale]/(app)/_shell/base-layout.tsx>)             | sidebar + header + main の UI shell                                           |
| [`(app)/_overlays/GlobalOverlays.tsx`](<../src/app/[locale]/(app)/_overlays/GlobalOverlays.tsx>) | ContactDialog / TourOrchestrator など global dialog 群を集約マウント          |

## Auth 境界の確認

- `(app)` 配下の page で auth check は **layout 経由で間接的に行われる**（Providers 内の `AuthStoreInitializer` で session 取得 → 未認証なら `/login` へ redirect）
- ページ単体での auth ガードは不要。新規 page を追加するときは `(app)` 配下に置けば自動的に認証必須となる
- 認証スキップしたい page は `(auth)/` に置く（下記参照）

## (auth) Group: 認証フロー

未認証ユーザー向けの login / signup / reset 系ページ。`AuthClientLayout` で軽量な `PublicProviders`（Theme + Tooltip のみ）を注入し、`AuthLayout` で UI を組み立てる。tRPC / TanStack Query などのデータ層は持たない（Supabase Auth Client SDK を直接利用）。

### Layout 系

| Path                                                             | Type            | 責務                                                                                                       |
| ---------------------------------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------- |
| [`(auth)/layout.tsx`](<../src/app/[locale]/(auth)/layout.tsx>)   | layout (server) | IntlProvider（`common` / `auth` / `error` namespace のみ）+ `AuthClientLayout`。`metadata.robots: noindex` |
| [`(auth)/loading.tsx`](<../src/app/[locale]/(auth)/loading.tsx>) | loading         | 認証フロー共通のローディング表示                                                                           |

### Pages

| Path                                                                                               | Type          | 責務                                                           |
| -------------------------------------------------------------------------------------------------- | ------------- | -------------------------------------------------------------- |
| [`(auth)/auth/page.tsx`](<../src/app/[locale]/(auth)/auth/page.tsx>)                               | page (server) | `/auth` ルートへの直接アクセス時の入口（リダイレクト or 案内） |
| [`(auth)/auth/login/page.tsx`](<../src/app/[locale]/(auth)/auth/login/page.tsx>)                   | page (server) | `LoginForm` を中央配置で render                                |
| [`(auth)/auth/signup/page.tsx`](<../src/app/[locale]/(auth)/auth/signup/page.tsx>)                 | page (server) | `SignupForm`                                                   |
| [`(auth)/auth/password/page.tsx`](<../src/app/[locale]/(auth)/auth/password/page.tsx>)             | page (server) | `PasswordResetForm`（リセットメール送信）                      |
| [`(auth)/auth/reset-password/page.tsx`](<../src/app/[locale]/(auth)/auth/reset-password/page.tsx>) | page (server) | `ResetPasswordForm`（リセットリンク経由の新パスワード設定）    |
| [`(auth)/auth/mfa-verify/page.tsx`](<../src/app/[locale]/(auth)/auth/mfa-verify/page.tsx>)         | page (server) | MFA TOTP コード検証                                            |
| [`(auth)/auth/mfa-verify/layout.tsx`](<../src/app/[locale]/(auth)/auth/mfa-verify/layout.tsx>)     | layout        | MFA 専用 wrapper                                               |

## [locale] 直下

locale ルーティングの境界。HTML lang / dir、metadata、redirect を担う。

| Path                                                                                                              | Type            | 責務                                                                                          |
| ----------------------------------------------------------------------------------------------------------------- | --------------- | --------------------------------------------------------------------------------------------- |
| [`[locale]/layout.tsx`](../../apps/product/src/app/[locale]/layout.tsx)                                           | layout (server) | `<html lang dir>` の確定、`generateMetadata` で多言語 OG / canonical、未対応 locale を 404 に |
| [`[locale]/page.tsx`](../../apps/product/src/app/[locale]/page.tsx)                                               | page (server)   | `/{locale}` → `/{locale}/week` redirect。`force-dynamic`                                      |
| [`[locale]/error.tsx`](../../apps/product/src/app/[locale]/error.tsx)                                             | error boundary  | locale 全体のエラー（IntlProvider 未マウントケース含む）                                      |
| [`[locale]/playground/dnd-multi-container/`](../../apps/product/src/app/[locale]/playground/dnd-multi-container/) | dev             | dnd-kit Multiple Containers の検証用                                                          |
| [`[locale]/test-email/`](../../apps/product/src/app/[locale]/test-email/)                                         | dev             | email template の preview ページ                                                              |

## ルート直下（src/app/）

locale プレフィックスを持たない routing と Next.js metadata route 群。

| Path                                                                      | Type                | 責務                                                                                                                 |
| ------------------------------------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------- |
| [`layout.tsx`](../../apps/product/src/app/layout.tsx)                     | root layout         | HTML 骨格 / theme provider / font / `globals.css` の読み込み。**この layout は触らない** が原則（影響範囲が全 page） |
| [`error.tsx`](../../apps/product/src/app/error.tsx)                       | root error boundary | App router の最上位エラー                                                                                            |
| [`global-error.tsx`](../../apps/product/src/app/global-error.tsx)         | global error        | layout も含めた致命エラー時の最終手段（`<html>` から自前で組む）                                                     |
| [`not-found.tsx`](../../apps/product/src/app/not-found.tsx)               | root 404            | 全 path 共通の 404                                                                                                   |
| [`sitemap.ts`](../../apps/product/src/app/sitemap.ts)                     | metadata route      | 多言語 sitemap。app 側は SaaS のため公開 URL 最小（マーケは web/ 側）                                                |
| [`opengraph-image.tsx`](../../apps/product/src/app/opengraph-image.tsx)   | metadata route      | edge runtime で動的 OG 画像生成。`@/lib/og-colors` で色固定                                                          |
| [`maintenance/route.ts`](../../apps/product/src/app/maintenance/route.ts) | route handler       | `/maintenance`。Route Handler で raw HTML を返し、Provider ツリーをバイパスして CSP を回避                           |
| [`offline/page.tsx`](../../apps/product/src/app/offline/page.tsx)         | page (client)       | PWA オフラインフォールバック。`navigator.language` で ja/en を切替                                                   |

## 認証境界の全体像

```
未認証 → (auth)            : login / signup / reset / mfa
認証済み → (app)
locale 不正 / path 不在    → [locale]/error.tsx, not-found.tsx, root not-found.tsx
致命エラー                 → global-error.tsx
オフライン (PWA)           → /offline
メンテナンス時             → /maintenance
```

## 関連ドキュメント

- API endpoints: [api-overview](./api-overview.md)
- Feature 境界: [.claude/rules/feature-boundaries.md](../../.claude/rules/feature-boundaries.md)
- アーキテクチャ全体: [.claude/rules/architecture.md](../../.claude/rules/architecture.md)
