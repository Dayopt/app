'use client';

import { useState } from 'react';

import { logger } from '@/lib/logger';
import { toast } from '@/lib/toast';
import { useRouter } from '@/platform/i18n/navigation';
import { createClient } from '@/platform/supabase/client';
import { useTranslations } from 'next-intl';

/**
 * ログアウト処理を提供するhook
 *
 * Supabase Auth のサインアウト → トースト通知 → ログインページへリダイレクト
 *
 * @example
 * ```tsx
 * const { logout, isLoggingOut } = useLogout();
 * <Button onClick={logout} disabled={isLoggingOut}>Logout</Button>
 * ```
 */
export function useLogout() {
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const t = useTranslations();

  const logout = async () => {
    setIsLoggingOut(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      toast.success(t('navigation.navUser.logoutSuccess'));
      router.push('/auth/login');
      router.refresh();
    } catch (error) {
      logger.error('Logout error:', error);
      toast.error(t('navigation.navUser.logoutFailed'));
    } finally {
      setIsLoggingOut(false);
    }
  };

  return { logout, isLoggingOut };
}
