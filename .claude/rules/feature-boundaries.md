---
paths:
  - 'apps/product/src/features/**'
  - 'apps/product/src/app/**'
  - 'apps/product/src/lib/**'
---

# Feature Boundaries

## 階層モデル（DAG）

```
Layer 0 (基盤):    activities          ← 他featureに依存しない
Layer 1 (中核):    timeblock, external-calendar ← Layer 0 の barrel を使える
Layer 2 (体験):    calendar, review    ← Layer 0+1 を使える
Independent:       auth, contact       ← 他featureに依存しない
Composition:       settings            ← DAG 除外。通常feature扱いしない
```

source of truth は [`apps/product/eslint.config.mjs`](../../apps/product/eslint.config.mjs) の Feature Boundary ブロック。feature の追加・削除・層変更時は eslint.config.mjs を先に直し、本 doc を追従させる。

## 依存ルール（ESLint `error` で強制）

- 上位→下位の barrel import のみ許可
- deep import は常に禁止（`@/features/timeblock/hooks/*` ❌）
- 同層間・下位→上位の参照は禁止
- 共有層から `@/features/*` をimportすると **error**
- **settings は DAG から除外** — 後述 [Composition Feature: settings](#composition-feature-settings) を参照
- **`*.stories.tsx` は DAG 除外** — composition プレビュー層として cross-feature import を許容（各 feature の boundary rule で `ignores: ['**/*.stories.{ts,tsx}']`）
- **Composition Layer からの `next/dynamic` component deep import は例外** — 後述 [Composition Layer からの dynamic import 例外](#composition-layer-からの-dynamic-import-例外) を参照

## domain は全 feature に作らない

`features/{name}/domain/` は **pure logic（DB / React / Zustand / TZ 非依存）が複数箇所で参照される or 単体テストで凍結すべき挙動を持つ場合のみ** 作る。

- 例: `features/timeblock/domain/`、`features/activities/domain/`、`features/review/domain/`
- domain を作らない feature: `contact`（pure logic が薄い）、`settings`（composition なので rule は外部）

「全 feature に domain を作る」は **方針ではない**。pure rule が無い feature には domain は無いのが正しい状態。

### domain 配下に barrel を置くかは feature ごとに選ぶ

`domain/index.ts`（および `domain/{sub}/index.ts`）は**必須ではない**。現状 `domain/` を持つ 5 feature のうち barrel があるのは 2 つだけで、これは揃えるべき不統一ではない。

| feature    | domain barrel | 理由                                                                                                                  |
| ---------- | ------------- | --------------------------------------------------------------------------------------------------------------------- |
| auth       | あり          | consumer が barrel 経由で参照している                                                                                 |
| timeblock  | あり          | 同上（9 export）                                                                                                      |
| calendar   | **なし**      | consumer が leaf を直接 import しており、barrel が孤児化した（[#1857](https://github.com/Dayopt/dayopt/issues/1857)） |
| review     | なし          | 同上                                                                                                                  |
| activities | なし          | 同上                                                                                                                  |

判断基準は「**barrel 経由の consumer が実際にいるか**」。いなければ置かない。`auth` / `timeblock` に倣って空振りの barrel を足すと、knip が unused file として検出し続ける（実際に #1854 で 4 件検出された）。feature barrel（`features/{name}/index.ts`）は cross-feature の公開 API として必須だが、domain barrel は feature 内部の都合なのでこの制約を受けない。

## RPC / DB response transformer は domain ではなく server

RPC row の snake_case shape に密結合した変換（snake → camel rename / null → undefined 変換 / outer key rename など）は **`features/{name}/server/` に server transformer として置く**。

- 命名規則: `aggregate{Subject}` (pure) / `transform{Subject}` (snake→camel) / `unpack{Subject}` (RPC field default 埋め)
- 1 procedure 1 file が原則。同ドメインの subset shape は 1 file に集約してよい（例: `statistics-kpi-unpackers.ts`）
- domain には RPC / DB shape を持ち込まない（境界を明確に保つ）

## Composition Feature: settings

`settings` は通常 feature の DAG には乗せず、**cross-cutting composition** として扱う。

### 特徴

- ESLint の feature boundary 制約(上位/下位の層制限)からは **除外**。ただし deep import 禁止(barrel のみ許可)は他 feature と同様に強制される(`features/settings/**` 専用ルール)
- 他 feature の store / barrel を組み合わせて「設定」UI を合成する composition feature
- **自身の domain は持たない**（business rule は composing される側の feature が持つ）
- server route (`userSettingsRouter`, `billingRouter`) は settings UI からの書き込み入口として settings 配下に同居

### deep import 優先順

settings → 他 feature の参照はどの feature に対しても許可されるが、**deep import(`@/features/X/hooks/*` 等)は ESLint で error**。優先順を守る:

1. **`apps/product/src/lib/stores/*` から取得できる場合は lib 経由を優先**（例: `@/lib/stores/useShellStore`）
2. **feature の barrel に export されている場合は barrel 経由を優先**（例: `@/features/auth` の barrel）
3. **barrel に無い場合は先に barrel へ export を追加する**。個別ケースで回避できない場合のみ、理由コメント付きの `eslint-disable-next-line`（`.claude/rules/code-style.md` の運用に従う）を最終手段とする

### Layer 1 → Layer 2 は不可（adapter は source 側に置く）

`features/timeblock`（Layer 1）から `features/review`（Layer 2）の import は DAG 違反のため不可。

「review UI で消費される transformer だから review/domain に置きたい」と思っても、**adapter は source 側 (timeblock) に置く**のが正解。consumer 側 (review) は tRPC 経由で受ける。

## Barrel Export

各featureの `index.ts` が公開API。**明示的named export** のみ。

## Colocation

feature固有のモジュール（hooks, stores, schemas）は feature内に配置。
複数featureで使う型のみ `apps/product/src/lib/types/` に残す。

## Cross-cutting UI state

複数 feature から参照される global UI state（例: date/timezone settings, calendar navigation state）は `apps/product/src/lib/stores/` に置く。feature 内の store を他 feature から直接 import するのは禁止（feature の内部 state 形に依存してしまい、refactor blast radius が読めなくなる）。

例:

- `@/lib/stores/useCalendarSettingsStore` ← timezone / view / week 設定
- `@/lib/stores/useCalendarNavigationStore` ← 現在表示中の日付 / view type
- `@/lib/stores/useShellStore` ← sidebar width / bottom sheet 等 UI shell state

feature は `@/lib/stores/*` から直接 import する。calendar feature も自身の barrel を経由せず直接参照する。

## Composition Layer

旧 `src/shell/` ディレクトリはモノレポ移行で解体され、ルーティング合成（`app/`）と再利用層（`lib/`）に吸収された。現在の合成箇所:

| 層                   | パス                                                                                                                                                |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Logic Composition    | `apps/product/src/app/**/_composition/`                                                                                                             |
| Layout Composition   | `apps/product/src/app/**/layout.tsx`                                                                                                                |
| Provider Composition | `apps/product/src/app/[locale]/(app)/_providers/Providers.tsx`（concern 別 Provider は `apps/product/src/lib/**`、例: `lib/i18n/IntlProvider.tsx`） |
| Shell State          | `apps/product/src/lib/stores/`（例: `useShellStore`）                                                                                               |

### Composition Layer からの dynamic import 例外

`next/dynamic` による **component の** deep import は、code-splitting 目的に限り barrel 経由の原則から除外する（[#1859](https://github.com/Dayopt/dayopt/issues/1859)）。

- **対象は component の dynamic import のみ**。型・util・store の deep import は従来どおり禁止
- **理由**: barrel 経由にすると、barrel が re-export する全モジュールが dynamic chunk の起点になる。値 export の多い barrel（例: `calendar/index.ts` は 23 値 export、`CalendarController` を含む）を経由すると、1 つの dialog の chunk に feature 全体を引き込むリスクがある
- **例外にしない場合**: barrel の値 export が dynamic import 対象そのものだけ（1:1 facade）なら、例外を使わず barrel 経由にする。`contact/index.ts`（値 export は `ContactDialog` のみ）はこれに当たる
- 適用例: `apps/product/src/app/[locale]/(app)/_overlays/GlobalOverlays.tsx` — `ContactDialog` は 1:1 facade の barrel 経由。`SettingsDialog` / `TimeblockInspector` / `TimeblockSearchDialog` は値 export の多い barrel（feature 全体を引き込むリスクがある）を避け、deep import のまま
- ESLint の `no-restricted-imports`（`eslint.config.mjs` の `src/app/**` ルール）は `import()` 式を検出しない。この例外を明文化した結果として、現状の挙動（検出しない）は意図どおり

## Composition Hub

一部の feature は「機能単位」ではなく「ページ全体を合成する hub」として機能する。これらは Composition Layer（`apps/product/src/app/*/page.tsx` / `apps/product/src/app/*/_composition/`）からのみ import され、**他 feature からは import しない**。

現在該当する hub:

- `features/calendar` — calendar page 全体の合成（views / activity-filter / navigation / interaction を同居）。191 ファイル、6 サブディレクトリ

hub の barrel は「ページから見た public API」のみを export する。hub 内部の sub-component / helper / lib は barrel に出さない（Composition Layer 以外からは触らない）。

なぜ hub 扱いなのか:

- 歴史的に 1 feature 内に view / filter / navigation / interaction が同居し、相互依存が密で切り分けが困難
- pre-launch 時点では解体リスクが大きいため、「blast radius は hub 内部に閉じる」という形で境界を運用で担保する
- 子featureへの分割は現時点でactiveな取り組みではない。着手する場合は epic issue 本文に current DAG と移行手順を先に定義する

## Feature標準ディレクトリ構造

```
features/{name}/
  index.ts          # barrel（公開API、これだけ外から見える）
  components/       # UIコンポーネント
  hooks/            # React hooks
  types.ts          # 型定義（複雑なfeatureは types/ ディレクトリ）
  constants.ts      # 定数
  lib/              # 内部ロジック（utils/は使わない、lib/に統一）
  server/           # tRPC router + service
  stores/           # Zustand stores
  schemas/          # Zod schemas
```

使わないサブディレクトリは作らない。あるなら必ずこの名前。

## エラーハンドリング

- 全ServiceErrorは `ServiceError`（`@/lib/trpc/errors`）を継承
- ルーターのcatchブロックは `handleServiceError(error)` を使用
- guard clause（バリデーション系throw）は `TRPCError` 直接で可

## 要点

- feature内部を編集する時、同層・上位featureを見る必要がない
- barrel export を変えない限り外部に影響しない
- `pnpm lint:boundaries` で違反数の増加を自動ブロック
