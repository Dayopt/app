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

## 環境構成（2環境構成）

| 環境           | Supabase                   | Vercel                    |
| -------------- | -------------------------- | ------------------------- |
| **Preview**    | dayopt-staging（Tokyo）    | npm run dev / Preview URL |
| **Production** | t3-nico's Project（Tokyo） | mainマージで自動デプロイ  |

- ローカル開発は Preview Supabase に直接接続（`vercel env pull` で自動同期）
- オフライン開発が必要な場合は `USE_LOCAL_DB=true` でローカルDB（127.0.0.1:54321）にフォールバック
- マイグレーションは mainマージ時に Staging へ自動適用、Production は手動 `db push`
- 環境変数は `src/env.ts` で Zod バリデーション（サーバーサイドのみ）
- 詳細: `docs/development/migration-checklist.md`
