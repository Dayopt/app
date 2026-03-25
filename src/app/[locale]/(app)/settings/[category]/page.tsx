'use client';

import { useParams } from 'next/navigation';

import { ChevronLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { isValidCategory, SETTINGS_CATEGORIES, SettingsContent } from '@/features/settings';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { MEDIA_QUERIES } from '@/lib/breakpoints';
import { Link } from '@/platform/i18n/navigation';
import { AppHeader } from '@/shell/components/AppHeader';

/**
 * 設定カテゴリページ
 *
 * PC: サイドバー付きレイアウト内のコンテンツエリア
 * Mobile: ヘッダー（戻るボタン）+ コンテンツ
 */
export default function SettingsCategoryPage() {
  const params = useParams<{ category: string }>();
  const t = useTranslations();
  const isMobile = useMediaQuery(MEDIA_QUERIES.mobile);

  const category = params?.category ?? 'general';
  if (!isValidCategory(category)) {
    return null;
  }

  const categoryMeta = SETTINGS_CATEGORIES.find((c) => c.id === category);

  // Mobile: ヘッダー付き
  if (isMobile) {
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

  // PC: コンテンツのみ（サイドバーはlayoutで表示）
  return <SettingsContent category={category} />;
}
