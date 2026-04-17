---
name: supabase
description: 新規 Supabase migration ファイル（`supabase/migrations/*.sql`）を追加する時、既存 schema に RLS ポリシーを設計・変更する時、Storage バケットポリシーを編集する時、Realtime 購読（`postgres_changes`）を新規実装する時、Edge Functions（`supabase/functions/`）を追加・デプロイする時、Staging / Production の 3 環境分離運用で DB 変更を適用する時に発動。3 環境構成の安全な運用パターンを適用する。アプリケーション層のみの変更では発動しない。
effort: high
maxTurns: 25
---

# Supabaseスキル

Dayoptでの Supabase 運用パターンを支援するスキル。

## When to Use

以下の状況で発動:

- `supabase/migrations/*.sql` に新規 migration ファイルを追加する時
- 既存テーブルに RLS ポリシーを新規定義、または `USING` / `WITH CHECK` を変更する時
- Storage バケットポリシー（`storage.objects` の RLS）を編集する時
- Realtime 購読（`postgres_changes` subscription）を新規実装・変更する時
- `supabase/functions/` 配下に Edge Function を追加・デプロイする時
- DB 変更が Staging のみに適用され、Production 適用が未完了の状態を検出した時

## When NOT to Use

- アプリケーション層のみの変更（tRPC router 内部ロジック、`trpc-router-creating` skill の領域、DB 未変更）
- 認証フローのみの変更で DB schema が変わらない時（`security` skill の領域）
- 型生成結果（`src/lib/supabase/types.ts`）のみの更新（`types:generate` 後の自動反映）

## 絶対ルール

- Edge Functions デプロイは `supabase functions deploy {name} --use-api` を必須とする（この環境に Docker がないため、デフォルトの Docker ビルドは失敗する）
- `db push` は `--project-ref` を受け付けない。リンク済みプロジェクト（`supabase link`）に対して実行される前提で操作する
- Staging と Production を**同時にデプロイしない**。Staging → 開発者確認 → 指示後に Production の順序を厳守する

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
