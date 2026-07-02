---
status: current
last_verified: 2026-07-02
---

# Hooks Pattern

tRPC カスタムフックの統一実装パターン。全 Feature 共通で適用する。

---

## データ取得フック

```typescript
import { api } from '@/lib/trpc';
import { cacheStrategies } from '@/lib/tanstack-query/cache-config';

export function useItems(filters?: ItemFilters, options?: { enabled?: boolean }) {
  return api.items.list.useQuery(filters, {
    ...cacheStrategies.items,
    retry: 1,
    ...options,
  });
}
```

---

## ミューテーションフック

```typescript
export function useItemMutations() {
  const utils = api.useUtils();

  const invalidateItems = () => {
    void utils.items.list.invalidate();
  };

  const createItem = api.items.create.useMutation({
    onSuccess: () => {
      toast.success('作成しました');
      invalidateItems();
    },
    onError: () => {
      toast.error('作成に失敗しました');
    },
  });

  return { createItem };
}
```

---

## チェックリスト

| 項目               | 説明                         |
| ------------------ | ---------------------------- |
| `api` クライアント | `trpc` ではなく `api` を使用 |
| `cacheStrategies`  | キャッシュ戦略を適用         |
| `retry: 1`         | リトライを1回に設定          |
| JSDoc              | パラメータと戻り値を説明     |
| `void`             | Promiseを明示的に無視        |

---

## キャッシュ戦略

| データ種別       | 戦略             | staleTime |
| ---------------- | ---------------- | --------- |
| アクティブデータ | `activeCache`    | 30秒      |
| 通常のデータ     | `standardCache`  | 5分       |
| 短期キャッシュ   | `shortTermCache` | 1分       |
| 静的データ       | `staticCache`    | 1時間     |

---

## ファイル命名規則

```
src/features/{feature}/hooks/
├── use{Feature}s.ts         # 一覧取得
├── use{Feature}.ts          # 単一取得
├── use{Feature}Mutations.ts # ミューテーション
└── index.ts                 # エクスポート
```

---

**最終更新**: 2026-02-17
