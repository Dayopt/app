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
Layer 2 (体験):    calendar, stats, ai, search, ← Layer 0+1 を使える
                   history, palette
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

## Composition Layer

| 層                     | パス                                       |
| ---------------------- | ------------------------------------------ |
| Logic Composition      | `src/app/*/_composition/`                  |
| Layout Composition     | `src/shell/layout/`                        |
| Provider Composition   | `src/shell/providers/`                     |
| Shell State / Contexts | `src/shell/stores/`, `src/shell/contexts/` |

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
