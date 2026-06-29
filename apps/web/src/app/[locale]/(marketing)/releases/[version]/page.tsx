import { createMDXComponents } from '@/components/content/ContentMDXComponents';
import {
  ReleaseCard,
  ReleaseHeader,
  changeTypes,
  getAllReleaseMetas,
  getRelatedReleases,
  getRelease,
} from '@/features/releases';
import { Link } from '@/platform/i18n/navigation';
import { Container } from '@dayopt/components';
import { ArrowLeft, ArrowLeftRight, Info, TriangleAlert } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { MDXRemote } from 'next-mdx-remote/rsc';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import type { ComponentPropsWithoutRef } from 'react';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';

type HeadingProps = ComponentPropsWithoutRef<'h1'>;

interface ReleasePageProps {
  params: Promise<{
    locale: string;
    version: string;
  }>;
}

// Generate metadata
export async function generateMetadata({ params }: ReleasePageProps): Promise<Metadata> {
  const { locale, version } = await params;
  const release = await getRelease(version, locale);

  if (!release) {
    return {
      title: 'Release not found',
    };
  }

  const { frontMatter } = release;
  const releaseDate = new Date(frontMatter.date).toISOString();

  return {
    title: `${frontMatter.title} - v${frontMatter.version}`,
    description: frontMatter.description,
    authors: frontMatter.author ? [{ name: frontMatter.author }] : undefined,
    openGraph: {
      title: `${frontMatter.title} - v${frontMatter.version}`,
      description: frontMatter.description,
      type: 'article',
      publishedTime: releaseDate,
      authors: frontMatter.author ? [frontMatter.author] : undefined,
      images: frontMatter.coverImage
        ? [
            {
              url: frontMatter.coverImage,
              width: 1200,
              height: 630,
              alt: frontMatter.title,
            },
          ]
        : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title: `${frontMatter.title} - v${frontMatter.version}`,
      description: frontMatter.description,
      images: frontMatter.coverImage ? [frontMatter.coverImage] : undefined,
    },
    alternates: {
      canonical: `/releases/${version}`,
    },
  };
}

// ISR: リリースノートは1日ごとに再検証
export const revalidate = 86400;

// Generate static paths
export async function generateStaticParams() {
  const locales = ['en', 'ja'];
  const params = [];

  for (const locale of locales) {
    const releases = await getAllReleaseMetas(locale);
    for (const release of releases) {
      params.push({ locale, version: release.frontMatter.version });
    }
  }

  return params;
}

// Releases-specific MDX Components (overrides for shared base)
const mdxComponents = createMDXComponents({
  // Releases: h2 with bottom border for visual separation
  h2: (props: HeadingProps) => (
    <h2
      className="border-border text-foreground mt-8 mb-4 border-b pb-2 text-3xl font-medium"
      {...props}
    />
  ),

  // Release notes specific components
  ChangeLog: ({ type, children }: { type: string; children: React.ReactNode }) => {
    const changeType = changeTypes.find((ct) => ct.id === type);
    if (!changeType) return <div>{children}</div>;

    return (
      <div
        className={`my-6 rounded-r-lg border-l-4 p-4 ${changeType.color.replace('text-', 'border-').replace('bg-', 'bg-').replace('border-', 'border-l-')}`}
      >
        <div className="mb-2 flex items-center gap-2">
          <span className="text-lg" role="img" aria-label={changeType.label}>
            {changeType.icon}
          </span>
          <h4 className="font-medium">{changeType.label}</h4>
        </div>
        <div className="prose prose-sm max-w-none">{children}</div>
      </div>
    );
  },

  Warning: ({ children }: { children: React.ReactNode }) => (
    <div className="border-warning bg-muted my-6 rounded-lg border p-4">
      <div className="flex items-start">
        <TriangleAlert className="text-warning mt-1 mr-4 size-5 flex-shrink-0" />
        <div className="prose prose-sm text-warning max-w-none">{children}</div>
      </div>
    </div>
  ),

  Info: ({ children }: { children: React.ReactNode }) => (
    <div className="border-info bg-muted my-6 rounded-lg border p-4">
      <div className="flex items-start">
        <Info className="text-info mt-1 mr-4 size-5 flex-shrink-0" />
        <div className="prose prose-sm text-info max-w-none">{children}</div>
      </div>
    </div>
  ),

  Migration: ({ children, title }: { children: React.ReactNode; title?: string }) => (
    <div className="border-primary bg-muted my-6 rounded-lg border p-4">
      <div className="flex items-start">
        <ArrowLeftRight className="text-primary mt-1 mr-4 size-5 flex-shrink-0" />
        <div>
          <h4 className="text-primary mb-2 font-medium">{title || 'Migration Information'}</h4>
          <div className="prose prose-sm text-primary max-w-none">{children}</div>
        </div>
      </div>
    </div>
  ),
});

export default async function ReleaseDetailPage({ params }: ReleasePageProps) {
  const { locale, version } = await params;
  setRequestLocale(locale);

  const release = await getRelease(version, locale);

  if (!release) {
    notFound();
  }

  const t = await getTranslations({ locale, namespace: 'releases.detail' });
  const relatedReleases = await getRelatedReleases(version, 3, locale);

  // Structured data (JSON-LD)
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Dayopt',
    applicationCategory: 'BusinessApplication',
    releaseNotes: {
      '@type': 'TechArticle',
      headline: release.frontMatter.title,
      description: release.frontMatter.description,
      author: {
        '@type': 'Person',
        name: release.frontMatter.author || 'Dayopt Team',
      },
      datePublished: release.frontMatter.date,
      about: {
        '@type': 'SoftwareApplication',
        name: 'Dayopt',
        softwareVersion: release.frontMatter.version,
      },
    },
  };

  return (
    <>
      {/* Structured data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="bg-background min-h-screen">
        {/* Release header */}
        <ReleaseHeader frontMatter={release.frontMatter} version={version} locale={locale} />

        {/* Cover image */}
        {release.frontMatter.coverImage && (
          <section className="py-8">
            <Container>
              <div className="mx-auto max-w-4xl">
                <Image
                  src={release.frontMatter.coverImage}
                  alt={release.frontMatter.title}
                  width={1200}
                  height={630}
                  className="h-auto w-full rounded-2xl shadow-lg"
                  priority
                />
              </div>
            </Container>
          </section>
        )}

        {/* Release content */}
        <article id="changes" className="py-16">
          <Container>
            <div className="mx-auto max-w-4xl">
              <div>
                <MDXRemote
                  source={release.content}
                  components={mdxComponents}
                  options={{
                    mdxOptions: {
                      remarkPlugins: [remarkGfm],
                      rehypePlugins: [rehypeHighlight],
                    },
                  }}
                />
              </div>

              {/* Release end marker */}
              <div className="border-border mt-16 border-t pt-8">
                <div className="flex items-center justify-center">
                  <div className="flex space-x-2">
                    <div className="bg-border size-2 rounded-full"></div>
                    <div className="bg-border size-2 rounded-full"></div>
                    <div className="bg-border size-2 rounded-full"></div>
                  </div>
                </div>
              </div>

              {/* Release information footer */}
              <div className="bg-container mt-8 rounded-2xl p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-muted-foreground text-sm">
                    {t('readingTime', { minutes: release.readingTime })}
                  </p>

                  <Link
                    href="/releases"
                    className="text-primary hover:text-primary/80 text-sm font-medium"
                  >
                    {t('viewAllReleases')}
                  </Link>
                </div>
              </div>
            </div>
          </Container>
        </article>

        {/* Related releases */}
        {relatedReleases.length > 0 && (
          <section className="py-16">
            <Container>
              <div className="mx-auto max-w-6xl">
                <div className="mb-8">
                  <h2 className="text-foreground mb-4 text-2xl font-medium">
                    {t('relatedReleases')}
                  </h2>
                  <p className="text-muted-foreground">{t('relatedDescription')}</p>
                </div>

                <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
                  {relatedReleases.map((relatedRelease) => (
                    <ReleaseCard
                      key={relatedRelease.frontMatter.version}
                      release={relatedRelease}
                      layout="vertical"
                    />
                  ))}
                </div>

                <div className="mt-8 text-center">
                  <Link
                    href="/releases"
                    className="border-border bg-card text-foreground hover:bg-muted inline-flex items-center rounded-lg border px-6 py-4 text-sm font-medium transition-colors"
                  >
                    <ArrowLeft className="mr-2 size-4" />
                    {t('viewAllReleases')}
                  </Link>
                </div>
              </div>
            </Container>
          </section>
        )}
      </div>
    </>
  );
}
