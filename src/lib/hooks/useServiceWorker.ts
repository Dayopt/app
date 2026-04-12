'use client';

import { useCallback, useEffect, useState } from 'react';

import { logger } from '@/lib/logger';

export interface ServiceWorkerState {
  /** Service Workerがサポートされているか */
  isSupported: boolean;
  /** 登録済みか */
  isRegistered: boolean;
  /** 更新が利用可能か */
  updateAvailable: boolean;
  /** 登録中か */
  isRegistering: boolean;
  /** エラー */
  error: Error | null;
}

export interface UseServiceWorkerResult extends ServiceWorkerState {
  /** 手動で更新を適用 */
  applyUpdate: () => void;
  /** キャッシュをクリア */
  clearCache: () => Promise<void>;
}

/**
 * Service Worker を管理するフック
 *
 * @example
 * ```tsx
 * const { isRegistered, updateAvailable, applyUpdate } = useServiceWorker()
 *
 * if (updateAvailable) {
 *   return <button onClick={applyUpdate}>アップデートを適用</button>
 * }
 * ```
 */
export function useServiceWorker(): UseServiceWorkerResult {
  const [state, setState] = useState<ServiceWorkerState>({
    isSupported: false,
    isRegistered: false,
    updateAvailable: false,
    isRegistering: false,
    error: null,
  });

  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);

  // Service Worker 登録
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    // 開発環境ではService Workerを登録しない（HMRとの競合を防止）
    if (process.env.NODE_ENV === 'development') {
      setState((prev) => ({ ...prev, isSupported: true }));
      return;
    }

    setState((prev) => ({ ...prev, isSupported: true, isRegistering: true }));

    const registerSW = async () => {
      try {
        // デプロイごとにSWを更新するためのバージョン文字列
        // Vercel: NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA
        // フォールバック: ビルド時刻ベース
        const swVersion =
          process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 8) ||
          process.env.NEXT_PUBLIC_BUILD_ID ||
          '';
        const swUrl = swVersion ? `/sw.js?v=${swVersion}` : '/sw.js';

        const reg = await navigator.serviceWorker.register(swUrl, {
          scope: '/',
        });

        setRegistration(reg);
        setState((prev) => ({
          ...prev,
          isRegistered: true,
          isRegistering: false,
        }));

        // 更新チェック
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (!newWorker) return;

          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              setState((prev) => ({ ...prev, updateAvailable: true }));
            }
          });
        });

        // 定期的に更新チェック（1時間ごと）
        setInterval(
          () => {
            reg.update();
          },
          60 * 60 * 1000,
        );
      } catch (error) {
        logger.error('[SW] Registration failed:', error);
        setState((prev) => ({
          ...prev,
          isRegistering: false,
          error: error instanceof Error ? error : new Error('Registration failed'),
        }));
      }
    };

    // ページ読み込み完了後に登録
    if (document.readyState === 'complete') {
      registerSW();
      return;
    }

    window.addEventListener('load', registerSW);
    return () => window.removeEventListener('load', registerSW);
  }, []);

  // 更新適用
  const applyUpdate = useCallback(() => {
    if (!registration?.waiting) return;

    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    window.location.reload();
  }, [registration]);

  // キャッシュクリア
  const clearCache = useCallback(async () => {
    if (!registration?.active) return;

    registration.active.postMessage({ type: 'CLEAR_CACHE' });

    // 追加でブラウザキャッシュもクリア
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames.filter((name) => name.startsWith('dayopt-')).map((name) => caches.delete(name)),
      );
    }
  }, [registration]);

  return {
    ...state,
    applyUpdate,
    clearCache,
  };
}
