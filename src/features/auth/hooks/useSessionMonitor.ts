'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { useRouter } from 'next/navigation';

import { SESSION_CONFIG, SESSION_SECURITY } from '@/lib/auth/session-config';
import { logger } from '@/lib/logger';
import { createClient } from '@/lib/supabase/client';

import { useAuthStore } from '@/stores/useAuthStore';

export interface SessionMonitorState {
  /** セッションが有効かどうか */
  isSessionValid: boolean;
  /** タイムアウト警告を表示すべきか */
  showTimeoutWarning: boolean;
  /** 残り時間（秒） */
  remainingTime: number;
  /** アイドル時間（秒） */
  idleTime: number;
  /** セッション延長処理 */
  extendSession: () => Promise<void>;
  /** 手動ログアウト */
  logout: () => Promise<void>;
}

/**
 * セッション監視フック
 *
 * - アイドルタイムアウト監視（15分）
 * - タイムアウト警告表示（5分前）
 * - アクティビティ検出によるセッション延長
 * - 自動ログアウト処理
 *
 * @see SESSION_CONFIG - セッション設定値
 * @see SESSION_SECURITY - セキュリティ設定
 */
export function useSessionMonitor(): SessionMonitorState {
  const router = useRouter();
  const session = useAuthStore((state) => state.session);
  const signOut = useAuthStore((state) => state.signOut);

  const [isSessionValid, setIsSessionValid] = useState(true);
  const [showTimeoutWarning, setShowTimeoutWarning] = useState(false);
  const [remainingTime, setRemainingTime] = useState(SESSION_CONFIG.idleTimeout);
  const [idleTime, setIdleTime] = useState(0);

  // eslint-disable-next-line react-hooks/purity -- useRef初期値でマウント時刻を取得（1回限り）
  const lastActivityRef = useRef<number>(Date.now());
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * アクティビティを記録
   */
  const recordActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    setIdleTime(0);

    // 警告表示中なら解除
    if (showTimeoutWarning) {
      setShowTimeoutWarning(false);
    }
  }, [showTimeoutWarning]);

  /**
   * セッション延長
   */
  const extendSession = useCallback(async () => {
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.refreshSession();

      if (error) {
        logger.error('[SessionMonitor] Failed to extend session:', error);
        return;
      }

      // アクティビティを記録
      recordActivity();
      setShowTimeoutWarning(false);
      setRemainingTime(SESSION_CONFIG.idleTimeout);
    } catch (err) {
      logger.error('[SessionMonitor] Session extension error:', err);
    }
  }, [recordActivity]);

  /**
   * ログアウト処理
   */
  const logout = useCallback(async () => {
    try {
      await signOut();
      router.push(SESSION_SECURITY.logoutRedirect);
    } catch (err) {
      logger.error('[SessionMonitor] Logout error:', err);
      // エラーでもリダイレクト
      router.push(SESSION_SECURITY.logoutRedirect);
    }
  }, [signOut, router]);

  /**
   * タイムアウト時の処理
   */
  const handleTimeout = useCallback(async () => {
    logger.log('[SessionMonitor] Session timed out');
    setIsSessionValid(false);
    setShowTimeoutWarning(false);

    await signOut();
    router.push(SESSION_SECURITY.timeoutRedirect);
  }, [signOut, router]);

  /**
   * セッション状態チェック
   */
  const checkSession = useCallback(() => {
    if (!session) {
      setIsSessionValid(false);
      return;
    }

    const now = Date.now();
    const idle = Math.floor((now - lastActivityRef.current) / 1000);
    setIdleTime(idle);

    const remaining = SESSION_CONFIG.idleTimeout - idle;
    setRemainingTime(Math.max(0, remaining));

    // タイムアウト
    if (remaining <= 0) {
      handleTimeout();
      return;
    }

    // 警告表示（5分前）
    if (remaining <= SESSION_SECURITY.timeoutWarning && !showTimeoutWarning) {
      setShowTimeoutWarning(true);
      logger.log('[SessionMonitor] Timeout warning triggered');
    }
  }, [session, showTimeoutWarning, handleTimeout]);

  /**
   * アクティビティイベントリスナー設定
   */
  useEffect(() => {
    if (!session) return;

    const activityEvents = ['mousedown', 'keydown', 'scroll', 'touchstart'];

    // スロットリング: 1秒に1回だけ記録
    let lastRecorded = 0;
    const throttledRecordActivity = () => {
      const now = Date.now();
      if (now - lastRecorded > 1000) {
        lastRecorded = now;
        recordActivity();
      }
    };

    activityEvents.forEach((event) => {
      window.addEventListener(event, throttledRecordActivity, { passive: true });
    });

    return () => {
      activityEvents.forEach((event) => {
        window.removeEventListener(event, throttledRecordActivity);
      });
    };
  }, [session, recordActivity]);

  /**
   * 定期チェック（10秒ごと）
   */
  useEffect(() => {
    if (!session) {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
        checkIntervalRef.current = null;
      }
      return;
    }

    // 初期チェック
    checkSession();

    // 定期チェック
    checkIntervalRef.current = setInterval(checkSession, 10000);

    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
        checkIntervalRef.current = null;
      }
    };
  }, [session, checkSession]);

  /**
   * ページ可視性変更時のチェック
   */
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && session) {
        checkSession();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [session, checkSession]);

  return {
    isSessionValid,
    showTimeoutWarning,
    remainingTime,
    idleTime,
    extendSession,
    logout,
  };
}
