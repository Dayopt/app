---
paths:
  - 'src/**/*.{ts,tsx}'
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

REST維持: `/api/auth/*`, `/api/health/*`, `/api/v1/system/*`, `/api/config/*`

## 状態管理

Zustand でグローバル、useState でローカル。セレクタで必要な状態のみ購読。

## tRPC実装パターン

Router → Service → Supabase の3層構造。feature-colocated で配置。

```
src/features/{feature}/server/
├── router.ts              # ルーター（Zodバリデーション + エラーハンドリング）
├── {feature}-service.ts   # サービス層（ビジネスロジック）
└── __tests__/
```

- ルーター集約: `src/lib/trpc/root.ts`
- 共通: `@/lib/trpc/procedures`（createTRPCRouter, protectedProcedure）、`@/lib/trpc/errors`（handleServiceError）
- 詳細: `.claude/skills/trpc-router-creating/SKILL.md`

## 楽観的更新

ユーザー操作mutationは全て楽観的更新を実装。不可逆操作は除く。
詳細: `.claude/skills/optimistic-update/SKILL.md`

## エラー境界

機能単位で設置。アプリ全体を1つでラップしない。

## 環境構成（1 project + branches 構成）

1 Supabase project + persistent staging branch + ephemeral preview branches で運用する。git と同じ世界観（`main` = production / `staging` = persistent / `feat/*` = preview）。

| 環境           | 実体                        | ライフサイクル              | 用途                                                 |
| -------------- | --------------------------- | --------------------------- | ---------------------------------------------------- |
| **Preview**    | Supabase preview branch     | PR open〜close（ephemeral） | 日常の開発・PR検証                                   |
| **Staging**    | persistent branch `staging` | 長命・固定URL               | Stripe webhook検証、hotfix検証、closed beta          |
| **Production** | main project                | 永続                        | 実ユーザー                                           |
| **Local**      | `supabase start`            | 任意                        | 緊急避難用（オフライン時等、デフォルトでは使わない） |

- ローカル開発は preview branch に `vercel env pull` で接続（自動同期）
- オフライン開発が必要な場合のみ `USE_LOCAL_DB=true` でローカル Supabase（127.0.0.1:54321）にフォールバック
- マイグレーションは PR で preview branch に自動適用、main merge で production に自動適用。staging branch 経由は Stripe 検証・hotfix・closed beta 用の特殊ケースのみ
- 環境変数は `src/env.ts` で Zod バリデーション（サーバーサイドのみ）
- 詳細: `.claude/skills/supabase/SKILL.md` / `docs/development/migration-checklist.md`
