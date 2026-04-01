'use client';

/**
 * App レベル Not Found ページ
 *
 * (app) Route Group 内の404エラーをキャッチ。
 * BaseLayout（サイドバー等）の内側で描画されるため、
 * アプリの一部として自然に表示される。
 *
 * NextIntlClientProvider が利用可能なため i18n 対応。
 */

import { FileQuestion } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';

import { Button } from '@/components/ui/button';

export default function AppNotFound() {
  const t = useTranslations('error.notFound');

  return (
    // eslint-disable-next-line tailwindcss/no-arbitrary-value -- viewport unit
    <div className="grid min-h-[60vh] w-full place-items-center p-8">
      <div className="flex max-w-md flex-col items-center gap-6 text-center">
        <div className="border-border flex size-16 items-center justify-center rounded-full border-2">
          <FileQuestion className="text-muted-foreground size-8" />
        </div>

        <div>
          <h1 className="mb-2 text-xl font-bold">{t('title')}</h1>
          <p className="text-muted-foreground text-sm">{t('description')}</p>
        </div>

        <Button asChild>
          <Link href="/">{t('goHome')}</Link>
        </Button>
      </div>
    </div>
  );
}
