---
name: trpc-router-creating
description: DayoptのtRPC v11ルーターを作成。サービス層分離、Zodバリデーション、エラーハンドリングを適用。
effort: medium
maxTurns: 15
---

# tRPC Router Creating Skill

DayoptプロジェクトのtRPC v11ルーターを規約に沿って作成するスキルです。

## このスキルを使用するタイミング

以下のキーワードが含まれる場合に自動的に起動：

- 「APIを作成」「エンドポイント追加」
- 「tRPCルーター」「router作成」
- 「バックエンド実装」
- 「CRUD API」

## ルーター構造（feature-colocated）

```
src/features/{feature}/server/
├── router.ts              # ルーター定義
├── {feature}-service.ts   # ビジネスロジック
├── types.ts               # feature内の型定義（optional）
└── __tests__/
    └── router.test.ts
```

大規模featureの場合（例: entry）:

```
src/features/entry/server/
├── router.ts              # 個別ルーター
├── router-index.ts        # ルーターのマージ・エクスポート
├── entry-service.ts       # メインサービス
├── service-index.ts       # サービスのマージ
├── statistics.ts          # 統計（optional）
├── types.ts
└── __tests__/
```

## 作成手順

### 1. サービス層（ビジネスロジック）

```typescript
// src/features/{feature}/server/{feature}-service.ts
import type { Database } from '@/lib/database.types';
import type { SupabaseClient } from '@supabase/supabase-js';

type Db{Entity}Row = Database['public']['Tables']['{entities}']['Row'];

export function create{Entity}Service(supabase: SupabaseClient<Database>) {
  return {
    async list(params: { userId: string; limit?: number; offset?: number }) {
      const { data, error } = await supabase
        .from('{entities}')
        .select('*')
        .eq('user_id', params.userId)
        .range(params.offset ?? 0, (params.offset ?? 0) + (params.limit ?? 50) - 1);

      if (error) throw error;
      return data;
    },

    async getById(params: { userId: string; id: string }) {
      const { data, error } = await supabase
        .from('{entities}')
        .select('*')
        .eq('id', params.id)
        .eq('user_id', params.userId)
        .single();

      if (error) throw error;
      return data;
    },

    async create(params: { userId: string; input: Create{Entity}Input }) {
      const { data, error } = await supabase
        .from('{entities}')
        .insert({ ...params.input, user_id: params.userId })
        .select()
        .single();

      if (error) throw error;
      return data;
    },

    async update(params: { userId: string; id: string; input: Update{Entity}Input }) {
      const { data, error } = await supabase
        .from('{entities}')
        .update(params.input)
        .eq('id', params.id)
        .eq('user_id', params.userId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },

    async delete(params: { userId: string; id: string }) {
      const { error } = await supabase
        .from('{entities}')
        .delete()
        .eq('id', params.id)
        .eq('user_id', params.userId);

      if (error) throw error;
      return { success: true };
    },
  };
}
```

### 2. ルーター定義

```typescript
// src/features/{feature}/server/router.ts
import { z } from 'zod';

import { logger } from '@/lib/logger';
import { handleServiceError } from '@/lib/trpc/errors';
import { createTRPCRouter, protectedProcedure } from '@/lib/trpc/procedures';
import { create{Entity}Service } from './{feature}-service';

export const {feature}Router = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }) => {
    const service = create{Entity}Service(ctx.supabase);
    try {
      return await service.list({ userId: ctx.userId });
    } catch (error) {
      handleServiceError(error);
    }
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const service = create{Entity}Service(ctx.supabase);
      try {
        return await service.getById({ userId: ctx.userId, id: input.id });
      } catch (error) {
        handleServiceError(error);
      }
    }),

  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(100),
      // other fields
    }))
    .mutation(async ({ ctx, input }) => {
      const service = create{Entity}Service(ctx.supabase);
      try {
        return await service.create({ userId: ctx.userId, input });
      } catch (error) {
        handleServiceError(error);
      }
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      data: z.object({ name: z.string().min(1).max(100) }).partial(),
    }))
    .mutation(async ({ ctx, input }) => {
      const service = create{Entity}Service(ctx.supabase);
      try {
        return await service.update({ userId: ctx.userId, id: input.id, input: input.data });
      } catch (error) {
        handleServiceError(error);
      }
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const service = create{Entity}Service(ctx.supabase);
      try {
        return await service.delete({ userId: ctx.userId, id: input.id });
      } catch (error) {
        handleServiceError(error);
      }
    }),
});
```

### 3. メインルーターに登録

```typescript
// src/lib/trpc/root.ts
import { {feature}Router } from '@/features/{feature}/server/router';

export const appRouter = createTRPCRouter({
  // existing routers...
  {feature}: {feature}Router,
});
```

## アーキテクチャ

```
┌─────────────────────┐
│   tRPC Router       │  ← Zodバリデーション + エラーハンドリング
├─────────────────────┤
│   Service Layer     │  ← ビジネスロジック
├─────────────────────┤
│   Supabase Client   │  ← データアクセス
└─────────────────────┘
```

## 重要なインポートパス

```typescript
import { createTRPCRouter, protectedProcedure } from '@/lib/trpc/procedures';
import { handleServiceError } from '@/lib/trpc/errors';
import { logger } from '@/lib/logger';
import type { Database } from '@/lib/database.types';
```

## チェックリスト

- [ ] サービス層を `src/features/{feature}/server/{feature}-service.ts` に作成
- [ ] ルーターを `src/features/{feature}/server/router.ts` に作成
- [ ] `protectedProcedure` を使用（認証必須）
- [ ] `handleServiceError` でエラーハンドリング
- [ ] `user_id` でフィルタリング（マルチテナント）
- [ ] テストファイル作成
- [ ] `src/lib/trpc/root.ts` に登録

## 既存ルーター参考

```
src/features/
├── entry/server/      # 最も大規模な例（router-index + service-index）
├── tags/server/       # 標準的なCRUD例
├── auth/server/       # ユーザー管理
├── settings/server/   # billing-router含む複数ルーター
└── notifications/server/  # email-router, preferences-router含む
```

## 関連スキル

- `/optimistic-update` - クライアント側のキャッシュ更新
- `/store-creating` - Zustandストアとの連携
- `/security` - 認証/認可の詳細パターン
- `/test` - tRPCエンドポイントのテスト
