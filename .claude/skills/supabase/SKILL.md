---
name: supabase
description: Supabaseスキル。RLS設計、マイグレーション作成、Realtime購読の実装時に自動発動。3環境分離での安全な運用を支援。
effort: high
maxTurns: 25
---

# Supabaseスキル

Dayoptでの Supabase 運用パターンを支援するスキル。

## When to Use（自動発動条件）

- 新しいテーブル/カラムを追加する時
- RLSポリシーを設計する時
- Realtime購読を実装する時
- マイグレーションを作成する時
- 「supabase」「RLS」「migration」キーワード

## 3環境構成

| 環境           | Supabase                   | 用途           |
| -------------- | -------------------------- | -------------- |
| **Local**      | 127.0.0.1:54321            | 開発・デバッグ |
| **Staging**    | dayopt-staging（Tokyo）    | PRレビュー     |
| **Production** | t3-nico's Project（Tokyo） | 実ユーザー     |

**重要**: 各環境のDBとAuthは完全に独立。アカウント共有不可。

## マイグレーション作成

### 命名規則

```
supabase/migrations/
├── YYYYMMDDHHMMSS_description.sql
```

例: `20241027000000_create_tickets_sessions_tags.sql`

### 作成手順

```bash
# 1. ローカルで作成
supabase migration new add_new_column

# 2. SQLを編集
# supabase/migrations/YYYYMMDDHHMMSS_add_new_column.sql

# 3. ローカルで適用・テスト
supabase db reset

# 4. Stagingに適用
supabase db push --linked

# 5. Productionに適用（慎重に）
# Supabase Dashboard > SQL Editor で実行
```

### マイグレーションテンプレート

```sql
-- テーブル作成
CREATE TABLE IF NOT EXISTS public.new_table (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLSを有効化
ALTER TABLE public.new_table ENABLE ROW LEVEL SECURITY;

-- RLSポリシー
CREATE POLICY "Users can view own data"
  ON public.new_table FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own data"
  ON public.new_table FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own data"
  ON public.new_table FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own data"
  ON public.new_table FOR DELETE
  USING (auth.uid() = user_id);

-- updated_atトリガー
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.new_table
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- インデックス
CREATE INDEX idx_new_table_user_id ON public.new_table(user_id);
```

## RLS設計パターン

### 基本ルール

```
1. 全テーブルでRLSを有効化
2. auth.uid() = user_id でフィルタ
3. tRPC側でも ctx.userId でフィルタ（二重チェック）
```

### パターン別ポリシー

```sql
-- 読み取り専用（公開データ）
CREATE POLICY "Public read access"
  ON public.public_table FOR SELECT
  USING (true);

-- 自分のデータのみ
CREATE POLICY "Own data only"
  ON public.user_data FOR ALL
  USING (auth.uid() = user_id);

-- 親子関係（例: タグ → プラン）
CREATE POLICY "Access via parent"
  ON public.plan_tags FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.plans
      WHERE plans.id = plan_tags.plan_id
      AND plans.user_id = auth.uid()
    )
  );
```

### RLSデバッグ

```sql
-- 現在のユーザーIDを確認
SELECT auth.uid();

-- ポリシーを確認
SELECT * FROM pg_policies WHERE tablename = 'your_table';

-- RLSを一時的に無効化（開発時のみ）
SET session_replication_role = replica;
-- テスト後、必ず戻す
SET session_replication_role = DEFAULT;
```

## Realtime購読

### 基本パターン

```typescript
import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

export function useEntityRealtime(onUpdate: () => void) {
  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel('entity-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'entities',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          console.log('Change received:', payload);
          onUpdate();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [onUpdate]);
}
```

### 楽観的更新との競合防止

```typescript
// stores/useEntityCacheStore.ts
export const useEntityCacheStore = create<{
  isMutating: boolean;
  setMutating: (value: boolean) => void;
}>((set) => ({
  isMutating: false,
  setMutating: (value) => set({ isMutating: value }),
}));

// hooks/useEntityRealtime.ts
export function useEntityRealtime() {
  const isMutating = useEntityCacheStore((s) => s.isMutating);

  useEffect(() => {
    const channel = supabase
      .channel('entities')
      .on('postgres_changes', { ... }, () => {
        // mutation中はスキップ
        if (!isMutating) {
          void utils.entity.list.invalidate();
        }
      })
      .subscribe();
    // ...
  }, [isMutating]);
}
```

## クライアント設定

```typescript
// src/lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
```

```typescript
// src/lib/supabase/server.ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookies) => cookies.forEach((c) => cookieStore.set(c)),
      },
    },
  );
}
```

## チェックリスト

マイグレーション作成時：

- [ ] RLSを有効化したか
- [ ] 適切なRLSポリシーを設定したか
- [ ] `user_id` カラムがあるか（ユーザーデータの場合）
- [ ] `ON DELETE CASCADE` を設定したか
- [ ] インデックスを追加したか
- [ ] ローカルでテストしたか

Realtime実装時：

- [ ] `filter` でユーザーIDを指定したか
- [ ] クリーンアップ（removeChannel）を実装したか
- [ ] 楽観的更新との競合を考慮したか

## 関連エージェント

- **database-architect** — スキーマ設計評価、インデックス戦略、N+1検出、マイグレーション安全性分析

> このスキルは「マイグレーション・RLS・Realtimeの実装手順書」、エージェントは「DB設計の品質評価・最適化提案」。

## 関連スキル

- `/optimistic-update` - Realtime競合対策
- `/security` - 認証/認可パターン
- `/trpc-router-creating` - Service層でのSupabase使用
