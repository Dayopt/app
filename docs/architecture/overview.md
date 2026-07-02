---
status: current
last_verified: 2026-07-02
code: packages/
---

# Packages Overview

Dayopt の monorepo は、アプリを増やすためだけではなく、責務を小さく保つために `packages/*` を使う。
このページは「どのコードをどの package に出すか」を決めるための境界メモであり、大規模な移動計画ではない。

> ⚠️ **このページは陳腐化している**（database 部分のみ追従更新済み、全面更新は別タスク）。現状との差分:
> `packages/design`→`packages/foundations`、`packages/ui`→`packages/components`、`packages/types` は削除済み、
> `apps/admin` は存在しない、`packages/database` は product 専用のため `apps/product/src/lib/database` へ移設済み。

## Package Map

- `packages/design`: design tokens / theme css / CSS variables。React components, domain logic, DB 型は入れない。
- `packages/ui`: React UI primitives / reusable components。Supabase, Stripe, feature-specific business rules は入れない。
- `packages/config`: public constants / metadata / URL definitions。secrets, request-scoped values, server-only clients は入れない。
- `packages/domain`: Dayopt domain model / pure types / helpers。DB row shape, React, Next, Supabase, Zustand は入れない。
- `apps/product/src/lib/database`（旧 `packages/database`）: Supabase/Postgres boundary。generated types / table names / row helper types を扱う。product 専用のため package ではなく product-local。
- `packages/billing`: Free / Pro plans, subscription status, entitlement, public-safe pricing constants。Stripe secret key, SDK, webhook handlers, checkout / portal 実装は入れない。

## Dependency Direction

`packages/*` は app / feature へ戻る import を作らない。共有 package 同士も、下位の意味を上位に漏らさない。

```txt
apps/product, apps/web, apps/admin, apps/storybook
  -> packages/ui
  -> packages/design

apps/product, apps/web
  -> packages/config
  -> packages/domain
  -> packages/billing
```

`packages/ui` は `packages/design` の token / CSS variables を使えるが、`packages/design` は `packages/ui` を知らない。
`packages/domain` は DB row shape を知らない。DB の都合を domain model に漏らす場合は product 側（`apps/product/src/lib/database`）で吸収する。

## Current Phase

`packages/design`, `packages/ui`, `packages/config`, `packages/domain` は最小の公開面を持つ package として動き始めている。
`packages/domain` は Dayopt の意味を表す pure TypeScript package で、現時点では `TimeRange`, `EntryOrigin`, `Tag`, `ReviewPeriod`, `UserPreference`, `Chronotype` などの軽い型・定数・helper だけを持つ。

`packages/database` は Supabase generated types と DB row helper の境界として動き始めている。converter は受け皿だけを先に作り、DB access を含む service は product 側に残す。
`packages/billing` は Free / Pro の公開 plan model, subscription status, `pro_access` entitlement, pricing 表示用定数の境界として動き始めている。Stripe SDK / secret / webhook / checkout / portal は product 側の server-only 境界に残す。
`packages/types` はまだ第一段階の placeholder に近い。

## Integration Audit

現時点の shared package 統合では、`packages/*` から `apps/*` / product feature / app alias へ戻る依存は作らない。`packages/ui` の React / Radix 依存は UI primitive の責務として許容し、`packages/database` の Stripe 文字列は generated DB type と table name 由来の DB boundary として扱う。

Source of truth:

- URL / domain / contact / public brand constants: `packages/config`
- Entry origin / fulfillment score / date-time preference / pure Dayopt concept: `packages/domain`
- Supabase generated type / table name / row helper type: `packages/database`
- Free / Pro plan / subscription status / `pro_access` entitlement / public pricing: `packages/billing`

Apps 側に残る legal / i18n / docs / test fixture の URL, email, price 文字列は、ユーザー向け文言・履歴・例示が混ざるため機械的には置換しない。DB access の `.from('entries')` / `.from('tags')` / `.from('user_settings')` も Supabase 型推論と呼び出し箇所が多いため、`databaseTables` 適用は段階的な follow-up にする。

## Foundation Readiness

Package foundation は第一段階として運用可能な状態にある。root scripts の `build:packages`, `typecheck:packages`, `check:workspace`, `lint:boundaries`, `build`, `build:web`, `build-storybook` は現在の package 構成を検証対象に含め、CI も `packages-build` job で `pnpm build:packages` を実行する。

ここからは新しい package を増やすより、既存 apps が shared package を低リスクに使う段階へ進む。優先順は `packages/ui` の product / web 実利用、`packages/config` の残り hardcode 置換、`packages/database.databaseTables` の段階適用、`packages/billing` の pricing / plan 表示整理とする。
`apps/web` でも design theme / UI primitives / config social links / billing pricing の採用を始めている。broader UI migration と design token consolidation は段階的な follow-up として扱う。

product 側の product-first adoption は一段落した。config / billing / database / domain / assets / ui の 6 package は逆依存なく product surfaces で利用され、shell のブランド名ラベルも product-local の `APP_NAME`（= `dayoptBrand.name`）経由に揃えた。残るのは `apps/web` への adoption（config → assets → ui → billing の順）と、`.from('table')` の大規模 service sweep など follow-up であり、これらは別 PR で段階的に進める。

## Package Boundaries

### `packages/design`

Dayopt の見た目の source of truth。React component は持たず、tokens と theme だけを扱う。
CSS variables は `--dayopt-*` prefix で公開し、既存 app の `--background`, `--primary`, `--radius-*` などは上書きしない。

Storybook 表示:

- `Design/Colors`
- `Design/Typography`
- `Design/Spacing`
- `Design/Radius`
- `Design/Shadows`

### `packages/ui`

Domain logic を持たない React UI primitive の置き場。Button, Badge, Card, Logo のように複数 app で使える部品だけを入れる。
`apps/product` では settings / account / fallback surfaces で Button, Badge, Card の runtime 利用を段階的に広げている。Interactive core surfaces は app-local のままにし、submit / mutation / billing flow は避けながら進める。
`apps/web` では marketing / shell / docs header / fallback surfaces から採用し、form / search / content interaction は web-local のままにする。

知ってよいもの:

- React
- accessibility primitives
- `packages/design`
- generic utility

知ってはいけないもの:

- `apps/product/src/features/*`
- Supabase / database row
- Stripe / billing secret
- user session / auth policy
- entry/tag/calendar 固有の business rule

### `packages/config`

Product/web が共有する public constants の置き場。副作用を持たず、Next.js / React / Zod / env / server-only に依存しない。
`apps/product` では low-risk な public brand / domain / URL / contact constants から利用を広げている。
`apps/web` では social links と docs repository links から利用を広げ、legal / i18n / content 本文は copy として残す。

入れてよいもの:

- Dayopt の domain と canonical URL
- support / security / contact email
- brand name / public social URL
- URL join helper

入れないもの:

- env validation
- secrets
- request-scoped value
- Next.js metadata generator 本体
- server-only client

### `packages/domain`

Dayopt の「意味」を pure TypeScript の型・定数・helper にする。DB に保存する形ではなく、アプリが考える概念を置く。

入れてよいもの:

- pure TypeScript types
- enum 相当の union type / const arrays
- Date と primitive だけを使う pure helper
- DB/UI に依存しない business concept

入れないもの:

- Supabase generated types
- DB row shape
- React component / props
- Zustand store state
- Next.js route / server-only helper
- CSS / UI token

### `apps/product/src/lib/database`（旧 `packages/database`）

Supabase/Postgres 上の形を扱う境界。generated types, table names, row helper types を公開する。
product 専用（web・他 package から参照なし）のため package ではなく product-local（`@/lib/database`）に置く。
`types:generate` の出力先も `apps/product/src/lib/database/generated/database.types.ts`。

例:

- `Database`
- `Row<'entries'>` / `Insert<'tags'>`
- `databaseTables`

入れないもの:

- Supabase client instance
- service role secret
- route handler / server action
- React / Zustand / UI component

### `packages/billing`

公開してよい plan / subscription / entitlement 定義を置く境界。client import できる public-safe な billing model だけを扱う。
`apps/product` では billing / settings の表示判定で利用を広げている。Stripe runtime は product-local のままにする。

例:

- Free / Pro plan id と plan name
- Free `$0`, Pro `$5/month` の公開価格表示用定数
- `free | active | past_due | canceled | trialing` の subscription status
- `pro_access` entitlement と pure helper

入れないもの:

- Stripe secret key / webhook secret
- Stripe SDK client
- webhook handler
- checkout / customer portal 実装
- env validation / server action / route handler

## Extraction Rules

抽出は「共通化したいから」ではなく、責務境界が明確になった時だけ行う。

- UI だけで成立し、domain を知らない: `packages/ui`
- 見た目の token / CSS variable / theme: `packages/design`
- URL / metadata / public constants: `packages/config`
- DB なしで説明できる Dayopt の business definition: `packages/domain`
- Supabase row / generated type / domain converter: `packages/database`
- plan / subscription / entitlement の公開定義: `packages/billing`
- Dayopt に依存しない pure helper: 再利用先が明確になるまでは利用する app 内に置く
- secret, admin, webhook, service-role を使う共通処理: product の server-only 境界に置く

## Storybook Policy

Storybook は `packages/design` と `packages/ui` の公開面を確認する場所にする。

- `packages/design`: token の一覧、意味、使用禁止例を `Design/*` で可視化する。
- `packages/ui`: props と状態を `UI/*` で可視化する。
- `packages/domain`, `packages/database`, `packages/billing`: UI カタログではなく docs と decision table で境界を説明する。
- `apps/product` 固有の feature component は `Features/*` に残し、汎用化できたものだけ `packages/ui` に移す。

## Ownership And Operations

- `Design/*`: design tokens。Source of truth は `packages/design`。
- `UI/*`: reusable UI primitives。Source of truth は `packages/ui`。
- `Foundations/*`: legacy / product-facing foundations。Source of truth は `apps/product` 由来の既存 Storybook 表示。
- `Primitives/*`: legacy reusable UI primitives。Source of truth は `apps/product/src/lib/components/ui/`。
- `Features/*`: product feature UI。Source of truth は `apps/product/src/features/*`。
- `Operations/*`: deployment / release ops。Source of truth は `docs/operations/`。
- `Architecture/*`: engineering decisions。Source of truth は `docs/architecture/`。

## Before Auth Package

`packages/auth` はまだ作らない。auth / permission は現時点では product-only で、admin app や同じ permission model を使う second runtime がまだないため、まず product-local auth domain として `apps/product` 内で境界を整える。

Current placement:

- Pure product auth model / access policy: `apps/product/src/lib/auth/domain`
- Product auth runtime: `apps/product/src/lib/supabase`, `apps/product/src/proxy.ts`, auth routes, server actions

Future extraction:

- `packages/database.databaseTables` を DB access call site に少しずつ適用できるか確認する。
- billing / legal / pricing 文言は i18n の表示責務と `packages/billing` の public constants の境界を分けて扱う。
- admin app または別 runtime が同じ permission model を必要とした時点で、product auth domain を `packages/auth` の pure model として昇格する。
- 昇格後も Supabase client, cookie, middleware, session refresh, route handler は product 側に残す。
