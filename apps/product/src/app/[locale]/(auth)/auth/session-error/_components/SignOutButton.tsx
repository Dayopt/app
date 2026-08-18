'use client';

import { useTranslations } from 'next-intl';

import { Button } from '@dayopt/components';

import { useLogout } from '@/lib/hooks/useLogout';

/**
 * `/auth/session-error` の脱出手段。
 *
 * MFA無効化フローの最終ステップ（factor unenroll）はaal2セッションのJWT claimを
 * 更新しないため、token refreshまでAAL遷移判定が invalid のまま
 * lookupFailed が persistent になりうる（#2144）。retry（/weekへ戻る）だけでは
 * このユーザーは抜け出せないため、既存の useLogout（cookieをclientで確実にclear）
 * を再利用した明示的な脱出経路を用意する。
 */
export function SignOutButton() {
  const t = useTranslations('auth.sessionError');
  const { logout, isLoggingOut } = useLogout();

  return (
    <Button variant="outline" className="w-full" onClick={logout} disabled={isLoggingOut}>
      {t('signOut')}
    </Button>
  );
}
