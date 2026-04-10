'use client';

import { useState } from 'react';

import { useRouter } from '@/lib/i18n/navigation';
import { logger } from '@/lib/logger';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';
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
