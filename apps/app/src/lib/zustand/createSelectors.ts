import type { StoreApi, UseBoundStore } from 'zustand';

/**
 * Zustand storeにauto-generated selectorsを追加するユーティリティ
 *
 * これにより、storeの各プロパティに対してselectorが自動生成され、
 * 不要な再レンダリングを防止できます。
 *
 * @example
 * ```tsx
 * // Store定義時
 * const useSidebarStoreBase = create<SidebarState>()(...)
 * export const useSidebarStore = createSelectors(useSidebarStoreBase)
 *
 * // コンポーネントで使用
 * // ❌ 従来の方法（全プロパティ監視 → 不要な再レンダリング）
 * const { isOpen, toggle } = useSidebarStore()
 *
 * // ✅ selector使用（必要なプロパティのみ監視）
 * const isOpen = useSidebarStore.use.isOpen()
 * const toggle = useSidebarStore.use.toggle()
 * ```
 *
 * @see https://docs.pmnd.rs/zustand/guides/auto-generating-selectors
 */
type WithSelectors<S> = S extends { getState: () => infer T }
  ? S & { use: { [K in keyof T]: () => T[K] } }
  : never;

export function createSelectors<S extends UseBoundStore<StoreApi<object>>>(
  _store: S,
): WithSelectors<S> {
  const store = _store as WithSelectors<S>;
  store.use = {} as WithSelectors<S>['use'];

  for (const k of Object.keys(store.getState())) {
    (store.use as Record<string, () => unknown>)[k] = () => store((s) => s[k as keyof typeof s]);
  }

  return store;
}
