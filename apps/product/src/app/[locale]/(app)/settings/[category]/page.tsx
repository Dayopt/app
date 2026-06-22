'use client';

import { useParams } from 'next/navigation';
import { useEffect } from 'react';

import { ArrowLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { isValidCategory, SETTINGS_CATEGORIES, SettingsContent } from '@/features/settings';
import { MEDIA_QUERIES } from '@/lib/breakpoints';
import { AppHeader } from '@/lib/components/shell/AppHeader';
import { useHasMounted } from '@/lib/hooks/useHasMounted';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { Link, useRouter } from '@/lib/i18n/navigation';
import { useShellStore } from '@/lib/stores/useShellStore';
import { Button } from '@dayopt/components';

/**
 * 設定カテゴリページ
 *
 * PC: ホームにリダイレクトし、設定モーダルを開く
 * Mobile: ヘッダー（戻るボタン）+ コンテンツ
 */
export default function SettingsCategoryPage() {
  const params = useParams<{ category: string }>();
  const hasMounted = useHasMounted();
  const t = useTranslations();
  const isMobile = useMediaQuery(MEDIA_QUERIES.mobile);
  const router = useRouter();
  const openSettings = useShellStore((s) => s.openSettings);

  const category = params?.category ?? 'general';
  const isValid = isValidCategory(category);

  // PC: ホームにリダイレクトし、設定モーダルを開く
  useEffect(() => {
    if (hasMounted && !isMobile && isValid) {
      openSettings(category);
      router.replace('/');
    }
  }, [hasMounted, isMobile, isValid, category, openSettings, router]);

  if (!isValid) {
    return null;
  }

  // PC: リダイレクト中は何も表示しない
  if (!hasMounted || !isMobile) {
    return null;
  }

  const categoryMeta = SETTINGS_CATEGORIES.find((c) => c.id === category);

  // Mobile: ヘッダー付き
  return (
    <>
      <AppHeader
        leftSlot={
          <Button variant="ghost" size="sm" icon asChild className="-ml-2">
            <Link href="/settings" aria-label={t('common.back')}>
              <ArrowLeft className="size-5" />
            </Link>
          </Button>
        }
      >
        <h1 className="text-lg font-medium">{categoryMeta ? t(categoryMeta.labelKey) : ''}</h1>
      </AppHeader>
      <SettingsContent category={category} />
    </>
  );
}
