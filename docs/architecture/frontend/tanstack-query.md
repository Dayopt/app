---
status: current
last_verified: 2026-07-02
code: apps/product/src/lib/tanstack-query
---

# TanStack Query 使用ガイド

DayoptにおけるTanStack Query（React Query）の標準的な使用方法とベストプラクティス。

---

## Query Key Factory パターン

### 基本構造

```typescript
export const featureKeys = {
  all: ['feature'] as const,
  lists: () => [...featureKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) => [...featureKeys.lists(), { filters }] as const,
  details: () => [...featureKeys.all, 'detail'] as const,
  detail: (id: string) => [...featureKeys.details(), id] as const,
};
```

### 階層的なキャッシュ無効化

```typescript
// すべてのタグ関連クエリを無効化
queryClient.invalidateQueries({ queryKey: tagKeys.all });

// リストのみ無効化
queryClient.invalidateQueries({ queryKey: tagKeys.lists() });

// 特定のフィルタのみ無効化
queryClient.invalidateQueries({ queryKey: tagKeys.list({ includeChildren: true }) });

// 特定のタグ詳細のみ無効化
queryClient.invalidateQueries({ queryKey: tagKeys.detail('tag-id') });
```

---

## キャッシュ戦略

### 機能別キャッシュ設定

```typescript
// src/lib/tanstack-query/cache-config.ts
export const cacheStrategies = {
  events: activeCache, // 30秒
  calendars: activeCache, // 30秒
  tags: standardCache, // 5分
  smartFolders: standardCache, // 5分
  userSettings: staticCache, // 1時間
};
```

| 機能              | staleTime | gcTime | 理由                 |
| ----------------- | --------- | ------ | -------------------- |
| **Events**        | 30秒      | 2分    | リアルタイム性が重要 |
| **Calendar**      | 30秒      | 2分    | 同期が重要           |
| **Tags**          | 5分       | 10分   | 頻繁に変更されない   |
| **Smart Folders** | 5分       | 10分   | 設定的な性質         |
| **User Settings** | 1時間     | 2時間  | ほぼ静的             |

### 使用例

```typescript
export function useEvents(filters?: EventFilters) {
  return useQuery({
    queryKey: eventKeys.list(filters),
    queryFn: () => fetchEvents(filters),
    ...cacheStrategies.events,
  });
}
```

---

## エラーハンドリング

### 統一エラーハンドラー

```typescript
import { handleQueryError } from '@/lib/tanstack-query/error-handler';

export function useCreateTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: tagAPI.createTag,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tagKeys.all });
    },
    onError: (error) => {
      handleQueryError(error, {
        queryKey: tagKeys.all,
        operation: 'create',
        feature: 'tags',
      });
    },
  });
}
```

### リトライ戦略

グローバル設定で自動適用（`src/components/providers.tsx`）:

- **404エラー**: リトライしない
- **401/403エラー**: リトライしない
- **429エラー**: 最大2回、長めの遅延でリトライ
- **その他のエラー**: 最大3回、指数バックオフでリトライ

---

## 楽観的更新

### Mutation内での楽観的更新

```typescript
export function useCreateTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: tagAPI.createTag,
    onMutate: async (newTag) => {
      await queryClient.cancelQueries({ queryKey: tagKeys.lists() });
      const previous = queryClient.getQueryData(tagKeys.lists());

      // 楽観的更新
      queryClient.setQueryData(tagKeys.lists(), (old) => [...old, newTag]);

      return { previous };
    },
    onError: (error, variables, context) => {
      // エラー時にロールバック
      if (context?.previous) {
        queryClient.setQueryData(tagKeys.lists(), context.previous);
      }
    },
  });
}
```

---

## テスト方法

### テストヘルパー

```typescript
function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: Infinity,
      },
    },
  })
}

function createWrapper() {
  const queryClient = createTestQueryClient()
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}
```

### テスト例

```typescript
describe('useTags', () => {
  it('should fetch tags', async () => {
    const { result } = renderHook(() => useTags(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(3);
  });
});
```

---

## マイグレーション: useEffect → TanStack Query

```typescript
// ❌ Before: 手動fetch
const [data, setData] = useState([]);
const [loading, setLoading] = useState(false);

useEffect(() => {
  setLoading(true);
  fetch('/api/data')
    .then((res) => res.json())
    .then(setData)
    .finally(() => setLoading(false));
}, []);

// ✅ After: TanStack Query
const { data, isLoading } = useQuery({
  queryKey: dataKeys.lists(),
  queryFn: () => fetch('/api/data').then((res) => res.json()),
  ...cacheStrategies.standard,
});
```

---

## 関連ページ

- [データフロー](../data-flow.md)
- [状態管理](state-management.md)

---

**最終更新**: 2026-02-12 | **バージョン**: v1.0
