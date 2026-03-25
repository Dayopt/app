'use client';

import { useParams } from 'next/navigation';
import { useEffect } from 'react';

import { ChevronLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { isValidCategory, SETTINGS_CATEGORIES, SettingsContent } from '@/features/settings';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { MEDIA_QUERIES } from '@/lib/breakpoints';
import { Link, useRouter } from '@/platform/i18n/navigation';
import { AppHeader } from '@/shell/components/AppHeader';
import { useSettingsStore } from '@/stores/useSettingsStore';

/**
 * 設定カテゴリページ
 *
 * PC: ホームにリダイレクトし、設定モーダルを開く
 * Mobile: ヘッダー（戻るボタン）+ コンテンツ
 */
export default function SettingsCategoryPage() {
  const params = useParams<{ category: string }>();
  const t = useTranslations();
  const isMobile = useMediaQuery(MEDIA_QUERIES.mobile);
  const router = useRouter();
  const openSettings = useSettingsStore((s) => s.open);

  const category = params?.category ?? 'general';
  const isValid = isValidCategory(category);

  // PC: ホームにリダイレクトし、設定モーダルを開く
  useEffect(() => {
    if (!isMobile && isValid) {
      openSettings(category);
      router.replace('/');
    }
  }, [isMobile, isValid, category, openSettings, router]);

  if (!isValid) {
    return null;
  }

  // PC: リダイレクト中は何も表示しない
  if (!isMobile) {
    return null;
  }

  const categoryMeta = SETTINGS_CATEGORIES.find((c) => c.id === category);

  // Mobile: ヘッダー付き
  return (
    <>
      <AppHeader
        leftSlot={
          <Button variant="ghost" icon asChild>
            <Link href="/settings" aria-label={t('common.back')}>
              <ChevronLeft className="size-5" />
            </Link>
          </Button>
        }
      >
        <h1 className="text-lg font-bold">{categoryMeta ? t(categoryMeta.labelKey) : ''}</h1>
      </AppHeader>
      <SettingsContent category={category} />
    </>
  );
}
