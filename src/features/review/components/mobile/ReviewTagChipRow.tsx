'use client';

import { useMemo } from 'react';

import { BarChart3 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter } from 'next/navigation';

import { TagIcon, useTags, type Tag } from '@/features/tags';
import { cn } from '@/lib/utils';

import { useReviewFilterStore } from '../../stores/useReviewFilterStore';

function formatDateParam(date: Date): string {
  return date.toISOString().split('T')[0]!;
}

function sortActiveTags(tags: Tag[] | undefined): Tag[] {
  if (!tags) return [];
  return tags.filter((tag) => tag.is_active !== false);
}

function findActiveTagId(pathname: string): string | null {
  const match = pathname.match(/\/review\/tags\/([^/?#]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function buildReviewTagPath(
  locale: string,
  tagId: string,
  date: Date,
  granularity: string,
): string {
  const params = new URLSearchParams({
    g: granularity,
    d: formatDateParam(date),
  });
  return `/${locale}/review/tags/${tagId}?${params.toString()}`;
}

function buildReviewPath(locale: string, date: Date, granularity: string): string {
  const params = new URLSearchParams({
    g: granularity,
    d: formatDateParam(date),
  });
  return `/${locale}/review?${params.toString()}`;
}

/**
 * Review モバイル専用タグチップ行。
 *
 * Calendar のモバイルタグ行と同じ位置に表示するが、作成導線は持たず、
 * タップでタグ別 Review に遷移する。
 */
export function ReviewTagChipRow({ className }: { className?: string }) {
  const t = useTranslations('calendar.stats');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const { data: tags } = useTags();
  const currentDate = useReviewFilterStore((s) => s.currentDate);
  const granularity = useReviewFilterStore((s) => s.granularity);

  const sortedTags = useMemo(() => sortActiveTags(tags), [tags]);
  const activeTagId = useMemo(() => findActiveTagId(pathname), [pathname]);
  const isOverallActive = activeTagId === null;

  if (sortedTags.length === 0) return null;

  return (
    <div
      className={cn(
        'bg-surface-container border-border-subtle z-bottom-tab fixed inset-x-0 flex h-14 items-center gap-1 overflow-x-auto border-t px-2',
        'scrollbar-hide overscroll-x-contain',
        className,
      )}
      style={{
        bottom: 'calc(3.5rem + env(safe-area-inset-bottom, 0px))',
      }}
      role="list"
      aria-label="Review tags"
    >
      <button
        type="button"
        role="listitem"
        aria-current={isOverallActive ? 'page' : undefined}
        onClick={() => {
          router.push(buildReviewPath(locale, currentDate, granularity));
        }}
        className={cn(
          'hover:bg-state-hover flex h-12 min-w-16 shrink-0 flex-col items-center justify-center gap-1 rounded-lg px-2 transition-colors duration-150',
          isOverallActive && 'bg-state-selected',
        )}
      >
        <BarChart3 className="text-muted-foreground size-5" aria-hidden />
        <span
          className={cn(
            'text-muted-foreground max-w-16 truncate text-xs',
            isOverallActive && 'text-foreground',
          )}
        >
          {t('overall')}
        </span>
      </button>

      {sortedTags.map((tag) => {
        const active = activeTagId === tag.id;

        return (
          <button
            key={tag.id}
            type="button"
            role="listitem"
            aria-current={active ? 'page' : undefined}
            onClick={() => {
              router.push(buildReviewTagPath(locale, tag.id, currentDate, granularity));
            }}
            className={cn(
              'hover:bg-state-hover flex h-12 min-w-16 shrink-0 flex-col items-center justify-center gap-1 rounded-lg px-2 transition-colors duration-150',
              active && 'bg-state-selected',
            )}
          >
            <TagIcon icon={tag.icon} color={tag.color} size="md" />
            <span
              className={cn(
                'text-muted-foreground max-w-16 truncate text-xs',
                active && 'text-foreground',
              )}
            >
              {tag.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}
