'use client';

import type { ReactNode } from 'react';
import { useEffect } from 'react';

import { toast } from '@/lib/toast';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

import { selectSessionExpired, useAuthStore } from '../stores/useAuthStore';

import { useSessionMonitor } from '../hooks/useSessionMonitor';

import { SessionTimeoutDialog } from './SessionTimeoutDialog';

interface SessionMonitorProviderProps {
  children: ReactNode;
}

/**
 * セッション監視プロバイダー
 *
 * 認証済みページで使用し、セッションタイムアウトを監視する
 * タイムアウト警告時にダイアログを表示
 * セッション失効時にトースト通知 + ログインへリダイレクト
 *
 * @example
 * ```tsx
 * // layout.tsx
 * <SessionMonitorProvider>
 *   {children}
 * </SessionMonitorProvider>
 * ```
 */
export function SessionMonitorProvider({ children }: SessionMonitorProviderProps) {
  const { showTimeoutWarning, remainingTime, extendSession, logout } = useSessionMonitor();
  const sessionExpired = useAuthStore(selectSessionExpired);
  const router = useRouter();
  const t = useTranslations();

  // C2: セッション失効時の通知 + リダイレクト
  useEffect(() => {
    if (!sessionExpired) return;

    toast.warning(t('auth.session.sessionExpired'));
    const timer = setTimeout(() => {
      router.push('/auth/login');
    }, 3000);
    return () => clearTimeout(timer);
  }, [sessionExpired, router, t]);

  return (
    <>
      {children}
      <SessionTimeoutDialog
        open={showTimeoutWarning}
        remainingTime={remainingTime}
        onExtend={extendSession}
        onLogout={logout}
      />
    </>
  );
}
