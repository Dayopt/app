/**
 * settings ルートのロジックを集約した composition layer
 *
 * 画面側（page.tsx）は構造のみを保持し、デバイス判定/リダイレクト処理は
 * こちらへ集約して app 層の薄肉化を実現する。
 */
'use client';

import { useRouter } from '@dayopt/i18n/navigation';
import { useSearchParams } from 'next/navigation';
import { useEffect } from 'react';

import { MobileAccountOverview } from '@/features/settings';
import { MEDIA_QUERIES } from '@/lib/breakpoints';
import { useHasMounted } from '@/lib/hooks/useHasMounted';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { useShellStore } from '@/lib/stores/useShellStore';

import { buildSettingsReturnQuery, normalizeSettingsReturnPath } from '../_utils/settings-return';

export function SettingsRoute() {
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
