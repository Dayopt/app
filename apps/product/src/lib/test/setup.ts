/**
 * DOM を必要とする unit test（`unit-dom` project、`environment: 'happy-dom'`）の setup。
 *
 * module mock は `setup-node.ts` と共有する（片方だけに mock を足すと、node 側の
 * test だけが静かに素の実装を掴む）。ここには **DOM が存在する前提の処理だけ**を書く。
 */
import './setup-node';

import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// テスト後のクリーンアップ
afterEach(() => {
  cleanup();
});

// グローバルモック設定（ブラウザ環境では既にネイティブで存在するためスキップ）
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

// matchMedia のモック（ブラウザ環境では既にネイティブで存在するためスキップ）
if (typeof window !== 'undefined' && !window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => {},
    }),
  });
}

// IntersectionObserver のモック（ブラウザ環境では既にネイティブで存在するためスキップ）
if (typeof globalThis.IntersectionObserver === 'undefined') {
  globalThis.IntersectionObserver = class IntersectionObserver {
    readonly root: Element | null = null;
    readonly rootMargin: string = '';
    readonly thresholds: ReadonlyArray<number> = [];
    constructor(_callback: IntersectionObserverCallback, _options?: IntersectionObserverInit) {}
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  } as unknown as typeof IntersectionObserver;
}
