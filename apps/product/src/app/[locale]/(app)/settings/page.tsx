'use client';

import { useRouter } from '@dayopt/i18n/navigation';
import { useSearchParams } from 'next/navigation';
import { useEffect } from 'react';

import { MobileAccountOverview } from '@/features/settings';
import { MEDIA_QUERIES } from '@/lib/breakpoints';
import { useHasMounted } from '@/lib/hooks/useHasMounted';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { useShellStore } from '@/lib/stores/useShellStore';

import { buildSettingsReturnQuery, normalizeSettingsReturnPath } from './_utils/settings-return';

/**
 * 設定ページのルート
 *
 * PC: ホームにリダイレクトし、設定モーダルを開く
 * Mobile: Instagram風アカウント概要ページ
 */
export default function SettingsPage() {
  const hasMounted = useHasMounted();
  const isMobile = useMediaQuery(MEDIA_QUERIES.mobile);
  const router = useRouter();
  const searchParams = useSearchParams();
  const openSettings = useShellStore((s) => s.openSettings);

  const rawReturnTo = searchParams.get('returnTo');
  const returnPath = normalizeSettingsReturnPath(rawReturnTo);
  const settingsReturnQuery = rawReturnTo ? buildSettingsReturnQuery(returnPath) : '';

  // PC: ホームにリダイレクトし、設定モーダルを開く
  useEffect(() => {
    if (hasMounted && !isMobile) {
      openSettings('profile');
      router.replace('/');
    }
  }, [hasMounted, isMobile, openSettings, router]);

  if (!hasMounted || !isMobile) {
    return null;
  }

  return (
    <MobileAccountOverview returnPath={returnPath} settingsReturnQuery={settingsReturnQuery} />
  );
}
