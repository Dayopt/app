import { Container } from '@/components/ui/container';
import { ReleasesClient, getAllReleaseMetas, getAllReleaseTags } from '@/features/releases';
import { routing } from '@/platform/i18n/routing';
import { generateSEOMetadata } from '@/platform/seo/metadata';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

interface PageProps {
  params: Promise<{ locale: string }>;
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

// ISR: リリース一覧は1時間ごとに再検証
export const revalidate = 3600;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'common' });

  return generateSEOMetadata({
    title: t('navigation.releases'),
    description:
      locale === 'ja' ? '最新のリリースノートと更新情報' : 'Latest release notes and updates',
    url: `/${locale}/releases`,
    locale: locale,
    keywords:
      locale === 'ja'
        ? ['リリースノート', '更新', '新機能', 'バグ修正', 'Dayopt']
        : ['release notes', 'updates', 'new features', 'bug fixes', 'Dayopt'],
    type: 'website',
  });
}

export default async function ReleasesPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Fetch data server-side
  const [allReleases, allTags] = await Promise.all([
    getAllReleaseMetas(locale),
    getAllReleaseTags(locale),
  ]);

  // クライアントに不要なMDXコンテンツを転送しない
  const clientReleases = allReleases.map(({ content: _, ...rest }) => rest);

  return (
    <div className="bg-background min-h-screen">
      <section className="py-16">
        <Container>
          <div className="mx-auto max-w-6xl">
            <ReleasesClient
              initialReleases={clientReleases}
              initialTags={allTags}
              locale={locale}
            />
          </div>
        </Container>
      </section>
    </div>
  );
}
