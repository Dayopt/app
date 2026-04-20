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

## 環境構成（単一 project 運用）

ローンチ前の簡易構成。単一 Supabase project (`yvglwblxrnrenfifsnje`) で dev / preview / production をすべて賄う。

| 環境           | 実体                   | 用途                                      |
| -------------- | ---------------------- | ----------------------------------------- |
| **Local**      | `supabase start`       | オフライン開発（デフォルトでは使わない）  |
| **Production** | `yvglwblxrnrenfifsnje` | dev / preview / production 全てここを向く |

- ローカル開発は Vercel env を `vercel env pull` で取得し、Production project に接続
- オフライン開発が必要な場合のみ `USE_LOCAL_DB=true` でローカル Supabase（127.0.0.1:54321）にフォールバック
- マイグレーションは main merge で GitHub Actions が Production に適用
- 環境変数は `src/env.ts` で Zod バリデーション（サーバーサイドのみ）
- **破壊的操作の制限**: preview / dev が production DB を直接触るため、`db reset` 等は厳禁。RLS 信頼前提
- **将来計画**: Pro plan + GitHub integration + persistent staging branch + ephemeral preview branches への移行（ローンチ後）
- 詳細: `.claude/skills/supabase/SKILL.md` / `docs/development/migration-checklist.md`
