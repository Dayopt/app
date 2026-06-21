import { Heading, Text } from '@/components/ui/typography';
import { Button } from '@dayopt/components';
import { getTranslations } from 'next-intl/server';
import { headers } from 'next/headers';
import Link from 'next/link';

export default async function NotFound() {
  // Try to get locale from headers or fallback to 'en'
  const headersList = await headers();
  const pathname = headersList.get('x-pathname') || '';
  const locale = pathname.split('/')[1] || 'en';
  const t = await getTranslations({ locale, namespace: 'errors' });

  return (
    <div className="bg-background flex min-h-[60vh] items-center justify-center">
      <div className="mx-auto max-w-md text-center">
        <div className="text-muted-foreground/20 mb-4 text-9xl font-medium">404</div>

        <Heading as="h2" size="xl" className="mb-4">
          {t('notFound.title')}
        </Heading>

        <Text variant="muted" className="mb-8">
          {t('notFound.description')}
        </Text>

        <Button asChild className="w-full">
          <Link href={`/${locale}`}>{t('notFound.goHome')}</Link>
        </Button>
      </div>
    </div>
  );
}
