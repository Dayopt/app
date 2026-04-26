# App Routes Overview

`src/app/[locale]/**` 配下の Next.js App Router routing を総覧。Route Group / Composition Layer / 認証境界の関係を一望できるようまとめる。`/api/**` は別途 [api-overview.md](./api-overview.md) を参照。

策定日: 2026-04-26
スコープ（このドキュメントの本体）: `src/app/[locale]/(app)/**` 配下の認証必須ページ群。`(auth)` / `(public)` / ルート直下は次セッションで追記。

## Route Group 構造

```
src/app/
├── layout.tsx                  ← ルート layout（テーマ・font・globals.css）
├── globals.css
├── error.tsx, not-found.tsx
├── opengraph-image.tsx
├── icon.* / manifest.ts / robots.ts / sitemap.ts
└── [locale]/
    ├── (app)/                  ← 認証必須グループ（このセッションの対象）
    │   ├── layout.tsx          ← IntlProvider + Providers + BaseLayout
    │   ├── error.tsx, not-found.tsx
    │   ├── (modes)/            ← メインモード（calendar / stats / ai）
    │   │   ├── calendar/
    │   │   ├── stats/
    │   │   └── ai/
    │   ├── settings/
    │   ├── playground/
    │   ├── _providers/         ← Providers ツリー
    │   ├── _shell/             ← Shell layout components
    │   └── _overlays/          ← グローバルダイアログ群
    ├── (auth)/                 ← 認証フロー（次セッション）
    └── (public)/               ← 公開ページ（次セッション）
```

## (app) Group: 認証必須ページ

すべて `Supabase Auth` のセッションが前提。`(app)/layout.tsx` で `Providers`（tRPC / TanStack Query / Auth Store / Calendar Settings / Theme）を注入し、`BaseLayout` で sidebar + header を提供する。

### Layout 系

| Path                                                               | Type           | 責務                                                                                                                           |
| ------------------------------------------------------------------ | -------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| [`(app)/layout.tsx`](<../src/app/[locale]/(app)/layout.tsx>)       | layout         | IntlProvider（app namespace のみ）+ Providers + BaseLayout + GlobalOverlays。`metadata.robots: noindex` で認証ページを検索除外 |
| [`(app)/error.tsx`](<../src/app/[locale]/(app)/error.tsx>)         | error boundary | (app) Group 内のページエラーを BaseLayout 内側で表示。i18n 対応、Sentry にも記録                                               |
| [`(app)/not-found.tsx`](<../src/app/[locale]/(app)/not-found.tsx>) | not-found      | (app) Group 内の 404。BaseLayout 内側で表示し、ナビ崩れを防ぐ                                                                  |

### (modes) — メインモード

| Path                                                                                                           | Type           | 責務 / 主な合成元                                                                                                    |
| -------------------------------------------------------------------------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------- |
| [`(modes)/calendar/day/page.tsx`](<../src/app/[locale]/(app)/(modes)/calendar/day/page.tsx>)                   | page (server)  | `prefetchCalendarData` → `HydrationBoundary` → `CalendarViewClient`（day view）。`generateMetadata` で i18n タイトル |
| [`(modes)/calendar/week/page.tsx`](<../src/app/[locale]/(app)/(modes)/calendar/week/page.tsx>)                 | page (server)  | week view。同上の prefetch + Suspense streaming                                                                      |
| [`(modes)/calendar/[nday]/page.tsx`](<../src/app/[locale]/(app)/(modes)/calendar/[nday]/page.tsx>)             | page (server)  | 多日数 view（2day〜9day）。`[nday]` で動的セグメント                                                                 |
| `(modes)/calendar/{day,week,[nday]}/loading.tsx`                                                               | loading        | 共通 `CalendarSkeleton` を表示                                                                                       |
| `(modes)/calendar/{day,week,[nday]}/error.tsx`                                                                 | error boundary | calendar segment 専用エラー                                                                                          |
| [`(modes)/calendar/_composition/`](<../src/app/[locale]/(app)/(modes)/calendar/_composition/>)                 | —              | `CalendarViewClient` ほか、各 view の合成 layer                                                                      |
| [`(modes)/calendar/_server/`](<../src/app/[locale]/(app)/(modes)/calendar/_server/>)                           | —              | `prefetchCalendarData` / `parseDateParam` / `CalendarSkeleton` 等の server-only ヘルパ                               |
| [`(modes)/stats/page.tsx`](<../src/app/[locale]/(app)/(modes)/stats/page.tsx>)                                 | page (server)  | `/stats` → `/stats/review` への redirect のみ                                                                        |
| [`(modes)/stats/layout.tsx`](<../src/app/[locale]/(app)/(modes)/stats/layout.tsx>)                             | layout         | `StatsLayoutShell`（ヘッダー + タブバー）。子 page は children のみ差替                                              |
| [`(modes)/stats/review/page.tsx`](<../src/app/[locale]/(app)/(modes)/stats/review/page.tsx>)                   | page (server)  | レビュー（週間/月間サマリ）                                                                                          |
| [`(modes)/stats/insights/page.tsx`](<../src/app/[locale]/(app)/(modes)/stats/insights/page.tsx>)               | page (server)  | AI インサイト                                                                                                        |
| [`(modes)/stats/progress/page.tsx`](<../src/app/[locale]/(app)/(modes)/stats/progress/page.tsx>)               | page (server)  | 進捗ダッシュボード                                                                                                   |
| [`(modes)/stats/badges/page.tsx`](<../src/app/[locale]/(app)/(modes)/stats/badges/page.tsx>)                   | page (server)  | バッジ獲得状況                                                                                                       |
| [`(modes)/stats/tags/[tagId]/page.tsx`](<../src/app/[locale]/(app)/(modes)/stats/tags/[tagId]/page.tsx>)       | page (server)  | タグ詳細（特定 tag の statistics）                                                                                   |
| [`(modes)/stats/error.tsx`](<../src/app/[locale]/(app)/(modes)/stats/error.tsx>)                               | error boundary | stats segment 専用エラー                                                                                             |
| [`(modes)/ai/page.tsx`](<../src/app/[locale]/(app)/(modes)/ai/page.tsx>)                                       | page (server)  | AI モード ルート（`AiMainContent` を render）                                                                        |
| [`(modes)/ai/threads/[threadId]/page.tsx`](<../src/app/[locale]/(app)/(modes)/ai/threads/[threadId]/page.tsx>) | page (server)  | AI スレッド詳細                                                                                                      |

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
- 合成対象: feature barrel (`@/features/calendar`, `@/features/stats`, `@/features/entry` 等)
- 出力: 1 つの client component ツリー

`page.tsx` 自体は薄く保つ（prefetch + Suspense + 合成 component の呼出）。view の差し替えやデータ取得方式の変更は composition layer 内で完結させる。詳細は [.claude/rules/feature-boundaries.md](../.claude/rules/feature-boundaries.md) の Composition Layer / Composition Hub を参照。

## providers / shell / overlays

| Path                                                                                             | 責務                                                                          |
| ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| [`(app)/_providers/Providers.tsx`](<../src/app/[locale]/(app)/_providers/Providers.tsx>)         | tRPC / TanStack Query / Auth Store / Calendar Settings / Theme などのデータ層 |
| [`(app)/_shell/base-layout.tsx`](<../src/app/[locale]/(app)/_shell/base-layout.tsx>)             | sidebar + header + main の UI shell                                           |
| [`(app)/_overlays/GlobalOverlays.tsx`](<../src/app/[locale]/(app)/_overlays/GlobalOverlays.tsx>) | ContactDialog / TourOrchestrator など global dialog 群を集約マウント          |

## Auth 境界の確認

- `(app)` 配下の page で auth check は **layout 経由で間接的に行われる**（Providers 内の `AuthStoreInitializer` で session 取得 → 未認証なら `/login` へ redirect）
- ページ単体での auth ガードは不要。新規 page を追加するときは `(app)` 配下に置けば自動的に認証必須となる
- 認証スキップしたい page は `(public)/` か `(auth)/` に置く（次セッション参照）

## 関連ドキュメント

- API endpoints: [api-overview.md](./api-overview.md)
- Feature 境界: [.claude/rules/feature-boundaries.md](../.claude/rules/feature-boundaries.md)
- アーキテクチャ全体: [.claude/rules/architecture.md](../.claude/rules/architecture.md)
