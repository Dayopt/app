'use client';

import { Button, Heading, Text } from '@dayopt/components';
import { Link } from '@dayopt/i18n/navigation';
import { useTranslations } from 'next-intl';

// Client Component にしている理由:
// この boundary で next-intl の server API（getTranslations / getLocale）を使うと、
// locale 解決のために request を読む可能性を Next が検出し、docs/[slug] 全体が
// 動的レンダリングへ降格する（記事ページが SSG されなくなる）。
// 文言は [locale]/layout.tsx の NextIntlClientProvider から client 側で取る。
export default function NotFound() {
  const t = useTranslations('errors');

  return (
    <div className="bg-background flex min-h-[60vh] items-center justify-center">
      <div className="mx-auto max-w-md text-center">
        <div className="text-muted-foreground mb-4 text-sm tabular-nums">404</div>

        <Heading as="h2" size="xl" className="mb-4">
          {t('notFound.title')}
        </Heading>

        <Text variant="muted" className="mb-8">
          {t('notFound.description')}
        </Text>

        <Button asChild className="w-full">
          <Link href="/">{t('notFound.goHome')}</Link>
        </Button>
      </div>
    </div>
  );
}
