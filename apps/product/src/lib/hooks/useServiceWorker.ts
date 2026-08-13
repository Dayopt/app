'use client';

import { useCallback, useEffect, useState } from 'react';

import { logger } from '@/lib/logger';

interface ServiceWorkerState {
  /** Service Workerがサポートされているか */
  isSupported: boolean;
  /** 登録済みか */
  isRegistered: boolean;
  /** 登録中か */
  isRegistering: boolean;
  /** エラー */
  error: Error | null;
}

interface UseServiceWorkerResult extends ServiceWorkerState {
  /** キャッシュをクリア */
  clearCache: () => Promise<void>;
}

/**
 * Service Worker を管理するフック
 *
 * sw.js は install 時に skipWaiting するため新バージョンは検出後すぐ有効化される。
 * 更新の適用は次回リロードで反映される既存挙動に委ね、このフックは更新通知 UI を持たない。
 *
 * @example
 * ```tsx
 * const { isRegistered, clearCache } = useServiceWorker()
 * ```
 */
export function useServiceWorker(): UseServiceWorkerResult {
  const [state, setState] = useState<ServiceWorkerState>({
    isSupported: false,
    isRegistered: false,
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

        // 定期的に更新チェック（1時間ごと）。sw.js は install 時に skipWaiting するため、
        // 検出した新バージョンは次回リロードで自動的に有効化される（通知 UI は持たない）

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
    clearCache,
  };
}
