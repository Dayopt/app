'use client';

import { Heading } from '@dayopt/components';
import { Link } from '@dayopt/i18n/navigation';
import { useTranslations } from 'next-intl';
import type { ReleasePostMetaClient } from '../lib/releases';

interface ReleaseCardProps {
  release: ReleasePostMetaClient;
  priority?: boolean;
  layout?: 'list' | 'vertical';
  locale?: string;
}

export function ReleaseCard({ release, layout = 'vertical', locale }: ReleaseCardProps) {
  const t = useTranslations('releases');
  const { frontMatter } = release;

  const formatDate = (dateString: string) => {
    const localeCode = locale === 'ja' ? 'ja-JP' : 'en-US';
    return new Date(dateString).toLocaleDateString(localeCode, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formattedDate = formatDate(frontMatter.date);

  // List layout
  if (layout === 'list') {
    return (
      <article className="relative py-6 first:pt-0">
        <div className="hover:bg-state-hover -m-4 flex items-center gap-5 rounded-xl p-4 transition-colors">
          {/* コンテンツ: タイトル → バージョン + タグ → 日付 */}
          <div className="min-w-0 flex-1">
            {/* タイトル（stretched link でカード全体をクリック可能に） */}
            <Link
              href={`/releases/${frontMatter.version}`}
              className="after:absolute after:inset-0"
            >
              <Heading as="h2" size="md" className="text-foreground font-medium">
                {frontMatter.title}
              </Heading>
            </Link>

            {/* 日付 + バージョン */}
            <div className="text-muted-foreground mt-3 flex items-center gap-2 text-sm">
              <time dateTime={frontMatter.date}>{formattedDate}</time>
              <span>·</span>
              <span>v{frontMatter.version}</span>
            </div>
          </div>
        </div>
      </article>
    );
  }

  // Grid layout
  return (
    <article className="group bg-card overflow-hidden rounded-2xl">
      <Link href={`/releases/${frontMatter.version}`} className="block">
        <div className="p-6">
          {/* Version + Date */}
          <div className="mb-4 flex items-center gap-2">
            <span className="border-border bg-muted text-foreground inline-flex items-center rounded-lg border px-2 py-1 text-sm font-medium">
              v{frontMatter.version}
            </span>
            <span className="text-muted-foreground text-xs">·</span>
            <span className="text-muted-foreground text-xs">
              <time dateTime={frontMatter.date}>{formattedDate}</time>
            </span>
            {frontMatter.breaking && (
              <>
                <span className="text-muted-foreground text-xs">·</span>
                <span className="text-destructive text-xs font-medium">{t('breaking')}</span>
              </>
            )}
          </div>

          {/* Title */}
          <Heading
            as="h2"
            size="xl"
            className="line-clamp-2 cursor-pointer transition-colors hover:underline"
          >
            {frontMatter.title}
          </Heading>
        </div>
      </Link>
    </article>
  );
}
