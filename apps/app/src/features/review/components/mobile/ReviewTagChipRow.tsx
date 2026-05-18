'use client';

import { useCallback, useMemo, useState } from 'react';

import { BarChart3 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter } from 'next/navigation';

import { TagDeleteStrategyDialog, TagIcon, useDeleteTag, useTags, type Tag } from '@/features/tags';
import { api } from '@/lib/trpc';
import { cn } from '@/lib/utils';

import { useReviewFilterStore } from '../../stores/useReviewFilterStore';
import { ReviewTagActionsMenu } from '../ReviewTagActionsMenu';

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
  const { data: tagStats, isError: isTagStatsError } = api.entries.getTagStats.useQuery();
  const deleteTagMutation = useDeleteTag();
  const currentDate = useReviewFilterStore((s) => s.currentDate);
  const granularity = useReviewFilterStore((s) => s.granularity);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
    entryCount: number;
  } | null>(null);

  const sortedTags = useMemo(() => sortActiveTags(tags), [tags]);
  const groupOptions = useMemo(
    () =>
      sortedTags
        .filter((tag) => tag.parent_id === null)
        .map((tag) => ({ id: tag.id, name: tag.name, color: tag.color, icon: tag.icon })),
    [sortedTags],
  );
  const activeTagId = useMemo(() => findActiveTagId(pathname), [pathname]);
  const isOverallActive = activeTagId === null;
  const tagPlanCounts = useMemo(
    () => (isTagStatsError ? null : (tagStats?.counts ?? {})),
    [isTagStatsError, tagStats?.counts],
  );

  const handleNavigate = useCallback(
    (tagId: string) => {
      router.push(buildReviewTagPath(locale, tagId, currentDate, granularity));
    },
    [currentDate, granularity, locale, router],
  );

  const handleRequestDelete = useCallback(
    (tag: Tag) => {
      const entryCount = tagPlanCounts === null ? 1 : (tagPlanCounts[tag.id] ?? 0);
      if (entryCount === 0) {
        deleteTagMutation.mutate({ id: tag.id });
      } else {
        setDeleteTarget({ id: tag.id, name: tag.name, entryCount });
      }
    },
    [deleteTagMutation, tagPlanCounts],
  );

  const handleConfirmDelete = async (
    strategy: 'delete_entries' | 'reassign',
    targetTagId?: string,
  ) => {
    if (!deleteTarget) return;
    try {
      await deleteTagMutation.mutateAsync({
        id: deleteTarget.id,
        strategy,
        targetTagId,
      });
    } finally {
      setDeleteTarget(null);
    }
  };

  const availableTagsForReassign = useMemo(
    () => sortedTags.filter((tag) => tag.id !== deleteTarget?.id),
    [deleteTarget?.id, sortedTags],
  );

  if (sortedTags.length === 0) return null;

  return (
    <>
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
            <div
              key={tag.id}
              role="listitem"
              aria-current={active ? 'page' : undefined}
              className={cn(
                'hover:bg-state-hover relative flex h-12 min-w-20 shrink-0 items-stretch rounded-lg transition-colors duration-150',
                active && 'bg-state-selected',
              )}
            >
              <button
                type="button"
                className="flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-2 pr-6"
                onClick={() => handleNavigate(tag.id)}
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
              <ReviewTagActionsMenu
                tag={tag}
                groupOptions={groupOptions}
                onNavigateToTag={handleNavigate}
                onRequestDelete={handleRequestDelete}
                contentSide="top"
                contentAlign="end"
                triggerClassName="absolute top-0.5 right-0.5 size-5"
              />
            </div>
          );
        })}
      </div>
      <TagDeleteStrategyDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        tagName={deleteTarget?.name ?? ''}
        entryCount={deleteTarget?.entryCount ?? 0}
        availableTags={availableTagsForReassign}
      />
    </>
  );
}
