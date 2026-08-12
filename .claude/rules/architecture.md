---
paths:
  - 'apps/product/src/**/*.{ts,tsx}'
---

# アーキテクチャ・設計

## データフェッチング

内部APIは全てtRPC化完了。新規APIは必ずtRPCで実装する。

```typescript
// ✅ tRPC + TanStack Query
const { data } = api.plans.list.useQuery();

// ✅ Server Component での直接取得
const data = await serverHelpers.plans.list.fetch();

// ❌ 禁止
useEffect(() => { fetch('/api/plans').then(...) }, []);
```

REST維持: `/api/health/*`, `/api/v1/system/*`, `/api/integrations/*`, `/api/mcp`, `/api/oauth/token`, `/api/cron/*`

`/api/integrations/*` は外部 IdP との redirect flow（OAuth の start / callback）なので tRPC 化できない。302 と cookie を返す必要があり、呼び出し元がブラウザのナビゲーションだから。

## 状態管理

Zustand でグローバル、useState でローカル。セレクタで必要な状態のみ購読。

### Store リネーム / 移動 / 削除時のチェックリスト

`useXxxStore` を別 store に統合・別 path へ移動・削除する時、以下を必ず grep で確認する。見落とすと Storybook preview が無限リロードに陥る（2026-04-22 の事故事例）:

```bash
grep -rn "useOldStoreName" apps/product/src apps/storybook 2>/dev/null
```

特に要チェック:

- **`.storybook/mocks/stores.tsx`** — `STORE_REGISTRY` の key と import path
- **`.storybook/decorators/`** — decorator で直接参照していないか
- **Feature barrel** (`apps/product/src/features/*/index.ts`) — re-export を消した場合、consumer 側が `@/features/xxx` から import し続けていないか
- **Story ファイル** (`*.stories.tsx`) の `parameters.storeMocks` キー

typecheck では `.storybook/` 配下の未 import ファイルが listFiles に乗らないケースがあるため、grep が第一防衛線。

## i18n namespace の削除 / リネーム

messages/ 配下の `{namespace}.json` を削除・リネームする時、以下を必ず grep で確認する。見落とすと Toaster 等のグローバルコンポーネントが MISSING_MESSAGE で crash し、Storybook / 本番でリロードループになる（2026-04-22 の事故事例）:

```bash
# useTranslations / getTranslations の namespace 参照
grep -rnE "useTranslations\(['\"]{ns}['\"]|getTranslations\(['\"]{ns}['\"]" apps/product/src apps/storybook

# namespace リストへのハードコード
grep -rn "['\"]{ns}['\"]" apps/product/src/app/\*\*/layout.tsx apps/product/src/lib/i18n/
```

特に要チェック:

- **`APP_NAMESPACES` / `AUTH_NAMESPACES` 等の namespace 配列** — `apps/product/src/app/[locale]/*/layout.tsx`
- **グローバルに mount される component** — `Toaster` / `GlobalOverlays` / `IntlProvider` 等、失敗するとアプリ全体が落ちる
- **`.storybook/mocks/` / `decorators/`** — storybook の i18n mock

## tRPC実装パターン

Router → Service → Supabase の3層構造。feature-colocated で配置。

```
apps/product/src/features/{feature}/server/
├── router.ts              # ルーター（Zodバリデーション + エラーハンドリング）
├── {feature}-service.ts   # サービス層（ビジネスロジック）
└── __tests__/
```

- ルーター集約: `apps/product/src/lib/trpc/root.ts`
- 共通: `@/lib/trpc/procedures`（createTRPCRouter, protectedProcedure）、`@/lib/trpc/errors`（handleServiceError）
- 詳細: `.claude/skills/trpc-router-creating/SKILL.md`

## ロジックの置き場（新規は TS / 既存 PL/pgSQL は凍結）

DB にロジックが沈むと型安全・ユニットテスト・dead-code 検出（knip）の網の外に出る。
migration churn（pre_drop/post_drop の踊り）の温床にもなる。そのため:

- **新規の集計・ビジネスロジックは TS の service 層に書く**（`features/{feature}/server/{feature}-service.ts`）。
  RPC を新設してよいのは「RLS で表現できない原子的バッチ操作」に限る（例: `confirm_day_plans_to_records`）。
- **既存の PL/pgSQL 関数は凍結資産**: 修正は bug fix のみ。機能追加は TS 側に寄せ、DB 関数を肥大化させない。
- DB 関数を drop する時は、コード側（呼び出し元）削除を先に production へ deploy → 静穏確認 →
  drop migration の順を守る（呼び出し中の関数を消すと 500 になる）。
- 新規 table / view / RPC の migration は `RLS + policy + GRANT` を 1 セットでレビューする。
  `authenticated` / `anon` / `service_role` のどれに何を公開するかを migration 内に明示し、
  Data API 自動公開や既存 function privilege の保持に依存しない。
- Realtime (`supabase_realtime` publication / `postgres_changes`) を追加する時は、購読対象 table と
  RLS policy の意図を同じ PR に残す。現状は publication 空を期待値とする。
- 「現在有効な RLS / GRANT / Realtime publication」は全 migration を読まず
  [`docs/engineering/data/db/rls-snapshot.md`](../../docs/engineering/data/db/rls-snapshot.md)
  （`pnpm rls:snapshot` で再生成、CI で drift 検出）を参照する。

## 楽観的更新

ユーザー操作mutationは全て楽観的更新を実装。不可逆操作は除く。
詳細: `.claude/skills/optimistic-update/SKILL.md`

## エラー境界

機能単位で設置。アプリ全体を1つでラップしない。

## 環境構成の参照先

Supabase project、branch topology、migration / deploy 経路は運用変更が起きやすいため、この architecture rule に固定値を複製しない。Supabase を扱う前に次の正本を読む。

- 手順と安全制約: `.claude/skills/supabase/SKILL.md`
- 現行 topology と環境責務: `docs/engineering/infra.md`

agent prompt、plan、review で project ID、branch の有無、table 数などを前提にせず、必要な時点で正本と code / schema を再確認する。
