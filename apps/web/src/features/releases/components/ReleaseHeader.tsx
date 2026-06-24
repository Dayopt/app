import { TagPill } from '@/components/ui/display/tag-pill';
import { Link } from '@/platform/i18n/navigation';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Image from 'next/image';
import { ShareButton } from './ShareButton';

interface ReleaseFrontMatter {
  version: string;
  date: string;
  title: string;
  description: string;
  tags: string[];
  breaking: boolean;
  featured: boolean;
  prerelease?: boolean;
  author?: string;
  authorAvatar?: string;
  coverImage?: string;
}

interface ReleaseHeaderProps {
  frontMatter: ReleaseFrontMatter;
  version: string;
  locale: string;
}

export async function ReleaseHeader({ frontMatter, locale }: ReleaseHeaderProps) {
  const t = await getTranslations({ locale, namespace: 'releases.detail' });
  const tNav = await getTranslations({ locale, namespace: 'common' });

  const localeCode = locale === 'ja' ? 'ja-JP' : 'en-US';
  const formattedDate = new Date(frontMatter.date).toLocaleDateString(localeCode, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <header className="mx-auto max-w-4xl px-6 py-16">
      {/* Breadcrumb */}
      <nav className="mb-8" aria-label="Breadcrumb">
        <ol className="text-muted-foreground flex items-center gap-1 text-sm">
          <li>
            <Link href="/" className="hover:text-foreground transition-colors">
              {tNav('navigation.home')}
            </Link>
          </li>
          <li>
            <ChevronRight className="size-4" />
          </li>
          <li>
            <Link href="/releases" className="hover:text-foreground transition-colors">
              {tNav('navigation.releases')}
            </Link>
          </li>
          <li>
            <ChevronRight className="size-4" />
          </li>
          <li className="text-foreground font-medium">v{frontMatter.version}</li>
        </ol>
      </nav>

      {/* Version badge */}
      <div className="mb-6">
        <span className="border-border bg-muted text-foreground inline-flex items-center rounded-lg border px-3 py-1 text-base font-medium">
          v{frontMatter.version}
        </span>
      </div>

      {/* Title */}
      <h1 className="text-foreground mb-4 text-3xl font-medium">{frontMatter.title}</h1>

      {/* Description */}
      <p className="text-muted-foreground mb-6 max-w-3xl text-lg">{frontMatter.description}</p>

      {/* Meta: date + author */}
      <div className="text-muted-foreground mb-6 flex items-center gap-3 text-sm">
        <time dateTime={frontMatter.date}>{formattedDate}</time>
        {frontMatter.author && (
          <>
            <span>·</span>
            <div className="flex items-center gap-2">
              {frontMatter.authorAvatar && (
                <Image
                  src={frontMatter.authorAvatar}
                  alt={frontMatter.author}
                  width={20}
                  height={20}
                  className="rounded-full"
                />
              )}
              <span>{frontMatter.author}</span>
            </div>
          </>
        )}
      </div>

      {/* Tags */}
      {frontMatter.tags.length > 0 && (
        <div className="mb-8 flex flex-wrap gap-2">
          {frontMatter.tags.map((tag) => (
            <Link key={tag} href={`/tags/${encodeURIComponent(tag)}`}>
              <TagPill tag={tag} />
            </Link>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-4">
        <Link
          href="/releases"
          className="border-border text-foreground hover:bg-muted inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors"
        >
          <ArrowLeft className="size-4" />
          {t('backToReleases')}
        </Link>
        <ShareButton title={frontMatter.title} version={frontMatter.version} />
      </div>
    </header>
  );
}
