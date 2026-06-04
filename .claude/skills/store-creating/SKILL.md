---
name: store-creating
description: Dayopt に新規 Zustand store を追加する時、UI の client-side 状態（モーダル開閉、選択状態、一時フォーム値など）が複数コンポーネントで共有される時、persist middleware での永続化が必要な state を追加する時、useState の prop drilling が深く store 化の判断をする時に発動。devtools / persist / 型安全パターンを適用する。server state の管理時や、単一 component 内の local state のみの時は発動しない。
effort: low
maxTurns: 10
---

# Store Creating Skill

DayoptプロジェクトのZustand storeを規約に沿って作成するスキルです。

## When to Use

以下の状況で発動:

- `apps/product/src/lib/stores/` 配下に新規 Zustand store を追加する時
- 新規 feature に UI の client-side 共有状態（モーダル開閉、選択状態、ウィザード state）が必要になった時
- persist middleware で localStorage に永続化したい state を定義する時
- devtools / persist middleware を既存 store に追加・変更する時
- useState の prop drilling が 3 階層以上深くなり、store 化の判断をする時

## When NOT to Use

- サーバー状態の管理（`trpc-router-creating` + TanStack Query の領域、Zustand は使わない）
- 単一 component 内で完結する local state（`useState` で十分、store は過剰）
- URL state（クエリパラメータ・ルーティング state は `searchParams` / `useRouter` の領域）

## ストアのパターン

### 1. 基本ストア（CRUD操作）

```typescript
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

interface EntityState {
  // State
  items: Entity[];
  isLoading: boolean;
  error: string | null;

  // Actions
  addItem: (item: CreateEntityInput) => Promise<boolean>;
  updateItem: (id: string, updates: UpdateEntityInput) => Promise<boolean>;
  deleteItem: (id: string) => Promise<boolean>;
  getItemById: (id: string) => Entity | undefined;

  // Helpers
  reset: () => void;
}

export const useEntityStore = create<EntityState>()(
  devtools(
    persist(
      (set, get) => ({
        items: [],
        isLoading: false,
        error: null,

        addItem: async (data) => {
          try {
            set({ isLoading: true, error: null });
            // API call or local update
            const newItem: Entity = {
              id: generateId(),
              ...data,
              created_at: new Date(),
              updated_at: new Date(),
            };
            set((state) => ({
              items: [...state.items, newItem],
              isLoading: false,
            }));
            return true;
          } catch (error) {
            set({ error: (error as Error).message, isLoading: false });
            return false;
          }
        },

        updateItem: async (id, updates) => {
          try {
            set((state) => ({
              items: state.items.map((item) =>
                item.id === id ? { ...item, ...updates, updated_at: new Date() } : item,
              ),
            }));
            return true;
          } catch (error) {
            logger.error('Failed to update:', error);
            return false;
          }
        },

        deleteItem: async (id) => {
          set((state) => ({
            items: state.items.filter((item) => item.id !== id),
          }));
          return true;
        },

        getItemById: (id) => get().items.find((item) => item.id === id),

        reset: () => set({ items: [], isLoading: false, error: null }),
      }),
      {
        name: 'entity-storage',
        partialize: (state) => ({ items: state.items }),
      },
    ),
    { name: 'entity-store' },
  ),
);
```

### 2. UIステートストア（persist なし）

```typescript
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

interface UIState {
  isOpen: boolean;
  selectedId: string | null;

  open: () => void;
  close: () => void;
  setSelectedId: (id: string | null) => void;
}

export const useDialogStore = create<UIState>()(
  devtools(
    (set) => ({
      isOpen: false,
      selectedId: null,

      open: () => set({ isOpen: true }),
      close: () => set({ isOpen: false, selectedId: null }),
      setSelectedId: (id) => set({ selectedId: id }),
    }),
    { name: 'dialog-store' },
  ),
);
```

### 3. フィルター/ソートストア

```typescript
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

type SortField = 'name' | 'created_at' | 'updated_at';
type SortOrder = 'asc' | 'desc';

interface FilterState {
  search: string;
  sortField: SortField;
  sortOrder: SortOrder;
  filters: Record<string, unknown>;

  setSearch: (search: string) => void;
  setSort: (field: SortField, order: SortOrder) => void;
  setFilter: (key: string, value: unknown) => void;
  clearFilters: () => void;
}

export const useEntityFilterStore = create<FilterState>()(
  devtools(
    persist(
      (set) => ({
        search: '',
        sortField: 'created_at',
        sortOrder: 'desc',
        filters: {},

        setSearch: (search) => set({ search }),
        setSort: (field, order) => set({ sortField: field, sortOrder: order }),
        setFilter: (key, value) =>
          set((state) => ({
            filters: { ...state.filters, [key]: value },
          })),
        clearFilters: () => set({ search: '', filters: {} }),
      }),
      { name: 'entity-filter-storage' },
    ),
    { name: 'entity-filter-store' },
  ),
);
```

## 命名規則

| パターン     | ファイル名                     | export名                    |
| ------------ | ------------------------------ | --------------------------- |
| メインストア | `use{Entity}Store.ts`          | `use{Entity}Store`          |
| 選択ストア   | `use{Entity}SelectionStore.ts` | `use{Entity}SelectionStore` |
| フィルター   | `use{Entity}FilterStore.ts`    | `use{Entity}FilterStore`    |
| ソート       | `use{Entity}SortStore.ts`      | `use{Entity}SortStore`      |
| ダイアログ   | `use{Entity}DialogStore.ts`    | `use{Entity}DialogStore`    |

## チェックリスト

- [ ] `devtools` ミドルウェア使用（開発時デバッグ用）
- [ ] 永続化が必要なら `persist` ミドルウェア使用
- [ ] `partialize` で永続化対象を明示
- [ ] store名は一意（devtools識別用）
- [ ] インターフェース定義は State と Actions を分離
- [ ] エラーハンドリング実装
- [ ] テストファイル作成（`use{Entity}Store.test.ts`）

## 既存ストア参考

```
apps/product/src/features/tags/stores/
└── useTagCacheStore.ts      # Realtime競合防止フラグ（isMutating）

apps/product/src/features/calendar/stores/
├── useCalendarFilterStore.ts  # フィルター
├── useCalendarScrollStore.ts  # スクロール位置
└── useCalendarDragStore.ts    # ドラッグ状態
```

## 関連スキル

- `/optimistic-update` - ストアとキャッシュの連携
- `/trpc-router-creating` - データソースとなるAPI作成
- `/test` - ストアのテスト作成
