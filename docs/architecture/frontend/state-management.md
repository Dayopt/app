---
status: current
last_verified: 2026-07-02
---

# 状態管理ガイド: Zustand vs Context API

Dayoptにおける状態管理の判断基準。**原則: 新規はZustandを優先する。**

---

## 判断フローチャート

```
外部ライブラリが提供するContext？
(next-themes, react-hook-form等)
│
├─ YES → Context API（変更不可）
│
└─ NO
   │
   ▼
5秒に1回以上変更される？
│
├─ YES → Zustand
│
└─ NO
   │
   ▼
10個以上のコンポーネントが参照？
│
├─ YES → Zustand
│
└─ NO
   │
   ▼
永続化（LocalStorage）が必要？
│
├─ YES → Zustand
│
└─ NO
   │
   ▼
Redux DevToolsでデバッグしたい？
│
├─ YES → Zustand
│
└─ NO → どちらでもOK（Zustand推奨）
```

---

## 状態の種類と管理方法

| 状態の種類               | 管理方法       | 例                               |
| ------------------------ | -------------- | -------------------------------- |
| **サーバーデータ**       | TanStack Query | プラン一覧、タグ                 |
| **UI状態（グローバル）** | Zustand        | サイドバー開閉、選択中のアイテム |
| **UI状態（ローカル）**   | useState       | フォームの入力値、モーダルの開閉 |
| **URL状態**              | Next.js Router | 現在のページ、クエリパラメータ   |

---

## Zustand 使用例

### 基本パターン

```typescript
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { createSelectors } from '@/lib/zustand/createSelectors';

interface SidebarState {
  isOpen: boolean;
  toggle: () => void;
}

const useSidebarStoreBase = create<SidebarState>()(
  devtools(
    (set) => ({
      isOpen: true,
      toggle: () => set((state) => ({ isOpen: !state.isOpen })),
    }),
    { name: 'sidebar-store' },
  ),
);

export const useSidebarStore = createSelectors(useSidebarStoreBase);
```

### selector必須パターン

```typescript
// ✅ .use.プロパティ名() で取得（最も簡潔）
const isOpen = useSidebarStore.use.isOpen();
const toggle = useSidebarStore.use.toggle();

// ✅ 手動selectorでも可
const isOpen = useSidebarStore((state) => state.isOpen);

// ❌ 全プロパティ取得（不要な再レンダリングが発生）
const { isOpen, toggle } = useSidebarStore();
```

### 永続化が必要な場合

```typescript
import { persist } from 'zustand/middleware';

export const useLocalUiSettingsStore = create<LocalUiSettingsState>()(
  persist(
    (set) => ({
      hourHeight: 72,
      showWeekends: true,
    }),
    { name: 'calendar-settings' },
  ),
);
```

---

## Context API 使用例（正当な理由が必要）

### 外部ライブラリ（変更不可）

```typescript
// next-themes, react-hook-form, react-dnd
// → ライブラリが提供するContextをそのまま使う
```

### 特定機能内の軽量状態

```typescript
// ✅ 理由をコメントに明記すること
// 理由: カレンダー内部のみで使用、更新頻度が低いためContext APIで十分
const CalendarNavigationContext = createContext<CalendarNavigationContextValue | null>(null);
```

---

## 現在の使用状況

### Zustand

| ストア            | 説明           | 理由                           |
| ----------------- | -------------- | ------------------------------ |
| `useAuthStore`    | 認証状態       | 頻繁な更新、アプリ全体で使用   |
| `useSidebarStore` | サイドバー開閉 | 多数のコンポーネントから参照   |
| `useEventStore`   | イベント管理   | 複雑な状態、デバッグツール必要 |
| `useTaskStore`    | タスク管理     | 複雑な状態、デバッグツール必要 |

### Context API（正当な理由あり）

| Context                          | 理由                   |
| -------------------------------- | ---------------------- |
| `ThemeProvider` (next-themes)    | 外部ライブラリ         |
| `FormProvider` (react-hook-form) | 外部ライブラリ         |
| `DndProvider` (react-dnd)        | 外部ライブラリ         |
| `CalendarNavigationContext`      | 特定機能内、低頻度更新 |
| `ToastProvider`                  | UIライブラリパターン   |

---

## パフォーマンスの違い

### Context API の問題

```typescript
// Provider の値が変わると、すべての子が再レンダリング
<ThemeContext.Provider value={{ theme, setTheme }}>
  <ComponentA />  {/* theme未使用でも再レンダリング */}
  <ComponentB />  {/* theme未使用でも再レンダリング */}
</ThemeContext.Provider>
```

### Zustand の最適化

```typescript
// selectorで必要な状態のみ購読 → 関係ないコンポーネントは再レンダリングしない
function ComponentA() {
  const theme = useThemeStore((state) => state.theme); // themeが変わった時だけ
}

function ComponentB() {
  // useThemeStoreを使用していない → 再レンダリングされない
}
```

---

**最終更新**: 2026-02-12 | **バージョン**: v1.0
