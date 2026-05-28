---
name: optimistic-update
description: tRPC mutation を新規実装する時、ユーザー操作に直接対応する mutation で即座の UI フィードバックが必要な時、既存 mutation に Realtime 購読との競合対策を追加する時、`onMutate` / `onError` / `onSettled` の実装漏れを検出した時に発動。キャッシュ操作とロールバック、Realtime 競合対策を指導する。read-only query の実装時や server-side mutation のみの時は発動しない。
effort: medium
maxTurns: 15
---

# 楽観的更新スキル

tRPC + TanStack Queryを使用した楽観的更新（Optimistic Updates）の実装を支援するスキル。

## When to Use

以下の状況で発動:

- 新規 tRPC mutation を実装する時（ユーザー操作起点のもの）
- 同じ resource を Realtime 購読と mutation の両方で扱う実装を追加する時
- TanStack Query のキャッシュ操作（`utils.xxx.setData` / `utils.xxx.invalidate`）を直接書く時
- 既存 mutation に `onMutate` / `onError` / `onSettled` が欠けていると気付いた時
- UI 応答性の改善依頼（「操作後のレスポンスが遅い」「即座に反映したい」）が出た時

## When NOT to Use

- read-only な query の実装時（mutation を伴わないため対象外）
- server-side 完結する mutation（バックグラウンドジョブなど、UI 即時反映不要）
- `onSuccess` で invalidate するだけの単純なケース（楽観更新の複雑さを入れる価値がない）

## 基本方針

**ユーザー操作に対応する全mutationで楽観的更新を実装する**

楽観的更新により、ユーザーはサーバーレスポンスを待たずに即座にUIフィードバックを得られる。
これは体感速度を200-800ms改善し、アプリケーションの応答性を大幅に向上させる。

## 実装パターン

### 基本テンプレート

```typescript
import { api } from '@/lib/trpc';

export function useCreateEntity() {
  const utils = api.useUtils();

  return api.entity.create.useMutation({
    // 1. 楽観的更新
    onMutate: async (input) => {
      // 進行中のクエリをキャンセル（競合防止）
      await utils.entity.list.cancel();

      // 現在のキャッシュをスナップショット（ロールバック用）
      const previous = utils.entity.list.getData();

      // キャッシュを楽観的に更新
      utils.entity.list.setData(undefined, (old) => {
        if (!old) return old;
        const tempId = `temp-${Date.now()}`;
        return [
          ...old,
          {
            id: tempId,
            ...input,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ];
      });

      return { previous };
    },

    // 2. エラー時ロールバック
    onError: (_err, _input, context) => {
      if (context?.previous) {
        utils.entity.list.setData(undefined, context.previous);
      }
    },

    // 3. 完了時に再検証
    onSettled: () => {
      void utils.entity.list.invalidate();
    },
  });
}
```

### 更新操作のパターン

```typescript
export function useUpdateEntity() {
  const utils = api.useUtils();

  return api.entity.update.useMutation({
    onMutate: async ({ id, data }) => {
      await utils.entity.list.cancel();
      await utils.entity.getById.cancel({ id });

      const previousList = utils.entity.list.getData();
      const previousItem = utils.entity.getById.getData({ id });

      // リストキャッシュを更新
      utils.entity.list.setData(undefined, (old) => {
        if (!old) return old;
        return old.map((item) =>
          item.id === id ? { ...item, ...data, updated_at: new Date().toISOString() } : item,
        );
      });

      // 個別キャッシュも更新
      utils.entity.getById.setData({ id }, (old) => {
        if (!old) return old;
        return { ...old, ...data, updated_at: new Date().toISOString() };
      });

      return { previousList, previousItem };
    },

    onError: (_err, { id }, context) => {
      if (context?.previousList) {
        utils.entity.list.setData(undefined, context.previousList);
      }
      if (context?.previousItem) {
        utils.entity.getById.setData({ id }, context.previousItem);
      }
    },

    onSettled: (_data, _err, { id }) => {
      void utils.entity.list.invalidate();
      void utils.entity.getById.invalidate({ id });
    },
  });
}
```

### 削除操作のパターン

```typescript
export function useDeleteEntity() {
  const utils = api.useUtils();

  return api.entity.delete.useMutation({
    onMutate: async ({ id }) => {
      await utils.entity.list.cancel();

      const previous = utils.entity.list.getData();

      // リストから即座に削除
      utils.entity.list.setData(undefined, (old) => {
        if (!old) return old;
        return old.filter((item) => item.id !== id);
      });

      return { previous };
    },

    onError: (_err, _input, context) => {
      if (context?.previous) {
        utils.entity.list.setData(undefined, context.previous);
      }
    },

    onSettled: () => {
      void utils.entity.list.invalidate();
    },
  });
}
```

## Realtime競合対策

Supabase Realtimeと楽観的更新を併用する場合、競合を防ぐためにフラグを使用する。

```typescript
// stores/useEntityCacheStore.ts
import { create } from 'zustand';

interface EntityCacheStore {
  isMutating: boolean;
  setMutating: (value: boolean) => void;
}

export const useEntityCacheStore = create<EntityCacheStore>((set) => ({
  isMutating: false,
  setMutating: (value) => set({ isMutating: value }),
}));
```

```typescript
// hooks/useEntityRealtime.ts
export function useEntityRealtime() {
  const utils = api.useUtils();
  const isMutating = useEntityCacheStore((s) => s.isMutating);

  useEffect(() => {
    const channel = supabase
      .channel('entities')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'entities' }, () => {
        // mutation中はRealtimeによるキャッシュ更新をスキップ
        if (!isMutating) {
          void utils.entity.list.invalidate();
        }
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [isMutating, utils]);
}
```

```typescript
// mutationでフラグを管理
export function useCreateEntity() {
  const utils = api.useUtils();
  const setMutating = useEntityCacheStore((s) => s.setMutating);

  return api.entity.create.useMutation({
    onMutate: async (input) => {
      setMutating(true); // mutation開始
      // ... 楽観的更新
    },

    onSettled: () => {
      setMutating(false); // mutation完了
      void utils.entity.list.invalidate();
    },
  });
}
```

## 楽観的更新が不要な場合

以下のケースでは楽観的更新を適用しない：

1. **不可逆操作**: アカウント削除、支払い処理など
   - 確認ダイアログを表示し、完了を待つ

2. **サーバー計算が必要**: IDの発行、複雑な集計など
   - ただし一時IDで対応可能な場合は実装する

3. **低頻度操作**: 月1回程度の設定変更など
   - ただし一貫性のため実装を推奨

## チェックリスト

新規mutation作成時：

- [ ] ユーザー操作に対応するか？ → 楽観的更新を実装
- [ ] 不可逆操作か？ → 楽観的更新なし、確認ダイアログを表示
- [ ] 複数キャッシュに影響するか？ → 全キャッシュを更新
- [ ] Realtimeと併用するか？ → isMutatingフラグで競合防止

実装時：

- [ ] `onMutate`でキャッシュをスナップショット
- [ ] `onError`でロールバック
- [ ] `onSettled`で再検証（invalidate）
- [ ] 関連する全キャッシュを更新（list + getById）

## 既存実装参考

```
src/features/tags/hooks/
├── useTagCrudMutations.ts   # CRUD楽観的更新（作成・更新・削除を統合）
├── useTagMergeMutation.ts   # マージ操作の楽観的更新
├── useTagsOptimistic.ts     # キャッシュ操作ヘルパー
└── useTagOperations.ts      # 高レベル操作（UI連携）
```

## 関連スキル

- `/store-creating` - Zustandストア作成
- `/trpc-router-creating` - tRPCルーター作成
