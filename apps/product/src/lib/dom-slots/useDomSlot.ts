'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * 名前付き DOM スロットのレジストリ（feature 非依存）
 *
 * shell 層が用意した portal 先の DOM ノードを、feature 側のコンポーネントが
 * React Context を経由せずに購読するための最小限のプリミティブ。
 * 同一要素の再登録は no-op にし、ref callback の再実行による無用な再描画を防ぐ。
 */
class DomSlotRegistry {
  private readonly slots = new Map<string, HTMLElement | null>();
  private readonly listeners = new Map<string, Set<() => void>>();

  set(key: string, element: HTMLElement | null) {
    if (this.slots.get(key) === element) return;
    this.slots.set(key, element);
    this.listeners.get(key)?.forEach((listener) => listener());
  }

  get(key: string): HTMLElement | null {
    return this.slots.get(key) ?? null;
  }

  subscribe(key: string, listener: () => void) {
    if (!this.listeners.has(key)) this.listeners.set(key, new Set());
    const keyListeners = this.listeners.get(key)!;
    keyListeners.add(listener);
    return () => {
      keyListeners.delete(listener);
    };
  }
}

const registry = new DomSlotRegistry();

/** key に紐づく DOM 要素を登録する。ref callback から呼ぶ。 */
export function setDomSlot(key: string, element: HTMLElement | null): void {
  registry.set(key, element);
}

/** key に登録された DOM 要素を購読する（未登録時は null）。 */
export function useDomSlot(key: string): HTMLElement | null {
  const subscribe = useCallback(
    (onStoreChange: () => void) => registry.subscribe(key, onStoreChange),
    [key],
  );
  const getSnapshot = useCallback(() => registry.get(key), [key]);
  const getServerSnapshot = useCallback(() => null, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
