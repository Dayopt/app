/**
 * Zustand persist 用プラットフォーム抽象ストレージアダプター
 *
 * localStorage直接参照を pluggable adapter に変更し、
 * React Native移行時に AsyncStorage へ差替が即座に可能にする。
 *
 * @example
 * ```typescript
 * // Zustand persist で使用
 * persist(storeCreator, {
 *   name: 'my-store',
 *   storage: platformStorage(),
 * })
 *
 * // カスタムシリアライザー付き（Set/Map等の非JSON型）
 * persist(storeCreator, {
 *   name: 'my-store',
 *   storage: createPlatformStorage({
 *     serialize: (state) => customSerialize(state),
 *     deserialize: (raw) => customDeserialize(raw),
 *   }),
 * })
 *
 * // React Native への差替（将来）
 * import AsyncStorage from '@react-native-async-storage/async-storage';
 * setPlatformStorageBackend({
 *   getItem: (name) => AsyncStorage.getItem(name),
 *   setItem: (name, value) => AsyncStorage.setItem(name, value),
 *   removeItem: (name) => AsyncStorage.removeItem(name),
 * })
 * ```
 */

import type { PersistStorage, StateStorage, StorageValue } from 'zustand/middleware';
import { createJSONStorage } from 'zustand/middleware';

// ---------------------------------------------------------------------------
// バックエンド（実際のストレージ実装）
// ---------------------------------------------------------------------------

/** ストレージバックエンドのインターフェース（StateStorage互換） */
export interface StorageBackend {
  getItem: (name: string) => string | null | Promise<string | null>;
  setItem: (name: string, value: string) => void | Promise<void>;
  removeItem: (name: string) => void | Promise<void>;
}

/** localStorage ベースのデフォルトバックエンド */
const localStorageBackend: StorageBackend = {
  getItem: (name) => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(name);
  },
  setItem: (name, value) => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(name, value);
  },
  removeItem: (name) => {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(name);
  },
};

let currentBackend: StorageBackend = localStorageBackend;

/**
 * ストレージバックエンドを差し替える
 *
 * React Native 移行時に AsyncStorage 等を注入するためのエントリポイント。
 * アプリ起動時（ストア初期化前）に1度だけ呼ぶこと。
 */
export function setPlatformStorageBackend(backend: StorageBackend): void {
  currentBackend = backend;
}

// ---------------------------------------------------------------------------
// StateStorage ラッパー（currentBackend に委譲）
// ---------------------------------------------------------------------------

/**
 * currentBackend に委譲する StateStorage 実装
 *
 * Zustand の createJSONStorage に渡すための低レベルアダプター。
 * バックエンドが差し替えられても、既存のストアが自動で新バックエンドを使用する。
 */
const backendStorage: StateStorage = {
  getItem: (name) => {
    const value = currentBackend.getItem(name);
    if (value instanceof Promise) {
      return value.then((v) => v ?? null);
    }
    return value ?? null;
  },
  setItem: (name, value) => {
    currentBackend.setItem(name, value);
  },
  removeItem: (name) => {
    currentBackend.removeItem(name);
  },
};

// ---------------------------------------------------------------------------
// Zustand PersistStorage 実装
// ---------------------------------------------------------------------------

/**
 * Zustand persist 用のデフォルトプラットフォームストレージ
 *
 * createJSONStorage を介して StateStorage → PersistStorage に変換。
 * カスタムシリアライズが不要なストアはこれを使用する。
 */
export function platformStorage<S>(): PersistStorage<S> | undefined {
  return createJSONStorage<S>(() => backendStorage);
}

// ---------------------------------------------------------------------------
// カスタムシリアライザー付きストレージファクトリー
// ---------------------------------------------------------------------------

/** カスタムシリアライズ/デシリアライズオプション */
export interface CustomStorageOptions<TState> {
  /** 永続化前にstateを変換（Set→Array等） */
  serialize: (state: TState) => unknown;
  /** 復元時にstateを変換（Array→Set等） */
  deserialize: (raw: unknown) => TState;
}

/**
 * カスタムシリアライザー付きのプラットフォームストレージを生成
 *
 * Set/Map等のJSON非対応型を永続化するストア向け。
 * PersistStorage インターフェースに直接準拠する。
 */
export function createPlatformStorage<TState>(
  options: CustomStorageOptions<TState>,
): PersistStorage<TState> {
  return {
    getItem: (name) => {
      const raw = currentBackend.getItem(name);

      const transform = (str: string | null): StorageValue<TState> | null => {
        if (!str) return null;
        const parsed = JSON.parse(str) as StorageValue<unknown>;
        return {
          ...parsed,
          state: options.deserialize(parsed.state),
        };
      };

      if (raw instanceof Promise) {
        return raw.then(transform);
      }
      return transform(raw);
    },

    setItem: (name, value) => {
      const serialized: StorageValue<unknown> = {
        ...value,
        state: options.serialize(value.state),
      };
      currentBackend.setItem(name, JSON.stringify(serialized));
    },

    removeItem: (name) => {
      currentBackend.removeItem(name);
    },
  };
}
