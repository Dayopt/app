---
paths:
  - 'src/features/**'
  - 'src/app/**'
  - 'src/shell/**'
---

# Feature Boundaries

## 階層モデル（DAG）

```
Layer 0 (基盤):    tags, chronotype             ← 他featureに依存しない
Layer 1 (中核):    entry                        ← Layer 0 の barrel を使える
Layer 2 (体験):    calendar, review, ai,        ← Layer 0+1 を使える
                   palette
Cross-cutting:     settings                     ← 全feature の barrel を使える
Independent:       auth, notifications,         ← 他featureに依存しない
                   contact, onboarding, tour
```

## 依存ルール（ESLint `error` で強制）

- 上位→下位の barrel import のみ許可
- deep import は常に禁止（`@/features/entry/hooks/*` ❌）
- 同層間・下位→上位の参照は禁止
- 共有層から `@/features/*` をimportすると **error**
- `ai/server` はサーバー合成層として例外

## Barrel Export

各featureの `index.ts` が公開API。**明示的named export** のみ。

## Colocation

feature固有のモジュール（hooks, stores, schemas）は feature内に配置。
複数featureで使う型のみ `src/types/` に残す。

## Cross-cutting UI state

複数 feature から参照される global UI state（例: date/timezone settings, calendar navigation state）は `src/lib/stores/` に置く。feature 内の store を他 feature から直接 import するのは禁止（feature の内部 state 形に依存してしまい、refactor blast radius が読めなくなる）。

例:

- `@/lib/stores/useCalendarSettingsStore` ← timezone / view / week 設定
- `@/lib/stores/useCalendarNavigationStore` ← 現在表示中の日付 / view type
- `@/lib/stores/useShellStore` ← sidebar width / bottom sheet 等 UI shell state

feature は `@/lib/stores/*` から直接 import する。calendar feature も自身の barrel を経由せず直接参照する。

## Composition Layer

| 層                     | パス                                       |
| ---------------------- | ------------------------------------------ |
| Logic Composition      | `src/app/*/_composition/`                  |
| Layout Composition     | `src/shell/layout/`                        |
| Provider Composition   | `src/shell/providers/`                     |
| Shell State / Contexts | `src/shell/stores/`, `src/shell/contexts/` |

## Composition Hub

一部の feature は「機能単位」ではなく「ページ全体を合成する hub」として機能する。これらは Composition Layer（`src/app/*/page.tsx` / `src/app/*/_composition/`）からのみ import され、**他 feature からは import しない**。

現在該当する hub:

- `features/calendar` — calendar page 全体の合成（views / tag-filter / navigation / interaction を同居）。191 ファイル、6 サブディレクトリ

hub の barrel は「ページから見た public API」のみを export する。hub 内部の sub-component / helper / lib は barrel に出さない（Composition Layer 以外からは触らない）。

なぜ hub 扱いなのか:

- 歴史的に 1 feature 内に view / filter / navigation / interaction が同居し、相互依存が密で切り分けが困難
- pre-launch 時点では解体リスクが大きいため、「blast radius は hub 内部に閉じる」という形で境界を運用で担保する
- launch 後に子 feature（`calendar-view` / `calendar-filter` / `calendar-interaction` 等）へ段階的に剥がす予定（`~/.claude/plans/p1-5-calendar-decomposition.md` 参照）

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
- `npm run lint:boundaries` で違反数の増加を自動ブロック
