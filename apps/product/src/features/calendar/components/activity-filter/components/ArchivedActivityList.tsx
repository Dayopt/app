'use client';

import { useMemo, useState } from 'react';

import { ArchiveRestore, ChevronRight, MoreHorizontal, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { ErrorState } from '@/components/ui/feedback/ErrorState';
import {
  ActivityIcon,
  useArchivedActivities,
  useArchivedCategories,
  useRestoreActivity,
  useRestoreCategory,
} from '@/features/activities';
import {
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@dayopt/components';

interface ArchivedActivityListProps {
  /**
   * 完全削除フロー（確認ダイアログ）は親のハンドラに委ねる。
   * アクティビティとカテゴリーで削除の影響が違う（前者は予定・記録がアクティビティ
   * なしになり、後者は所属アクティビティが未分類になる）ため、経路を分ける。
   */
  onDeleteActivity: (id: string, name: string) => void;
  onDeleteCategory: (id: string, name: string) => void;
}

/** 一覧に並べる 1 行。復元先の mutation が違うので種別を持たせる */
interface ArchivedEntry {
  kind: 'activity' | 'category';
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
}

/**
 * サイドバー末尾の「アーカイブ済み」折りたたみセクション。
 *
 * **アクティビティとカテゴリーの両方**を並べる。片方だけにすると、もう片方は
 * 復元も完全削除もできなくなる（サイドバー本体はアーカイブ済みを出さないため、
 * ここが唯一の入口）。
 *
 * 1 件も無ければ何も描画しない。取得失敗時は 0 件と区別して ErrorState を出す
 * （唯一の入口が黙って消えるのを避ける）。
 */
export function ArchivedActivityList({
  onDeleteActivity,
  onDeleteCategory,
}: ArchivedActivityListProps) {
  const t = useTranslations();
  const [expanded, setExpanded] = useState(false);

  const {
    data: archivedActivities,
    isError: isActivitiesError,
    refetch: refetchActivities,
  } = useArchivedActivities();
  const {
    data: archivedCategories,
    isError: isCategoriesError,
    refetch: refetchCategories,
  } = useArchivedCategories();

  const restoreActivity = useRestoreActivity();
  const restoreCategory = useRestoreCategory();

  // カテゴリーを先に出す。アクティビティの所属先なので、復元の順序としても自然
  const entries = useMemo<ArchivedEntry[]>(
    () => [
      ...(archivedCategories ?? []).map((category) => ({
        kind: 'category' as const,
        id: category.id,
        name: category.name,
        color: category.color,
        icon: category.icon,
      })),
      ...(archivedActivities ?? []).map((activity) => ({
        kind: 'activity' as const,
        id: activity.id,
        name: activity.name,
        // アクティビティは色を持たない。アーカイブ済みは所属カテゴリーも
        // 辿らず中立表示にする（復元後にカテゴリーの色が戻る）
        color: null,
        icon: null,
      })),
    ],
    [archivedCategories, archivedActivities],
  );

  const isError = isActivitiesError || isCategoriesError;

  if (isError) {
    return (
      <div className="w-full min-w-0">
        <div className="text-muted-foreground flex h-8 w-full items-center gap-1 px-2 text-xs">
          {t('calendar.filter.archivedSection')}
        </div>
        <ErrorState
          title={t('calendar.filter.archivedLoadFailed')}
          onRetry={() => {
            void refetchActivities();
            void refetchCategories();
          }}
          size="sm"
        />
      </div>
    );
  }

  if (entries.length === 0) return null;

  return (
    <div className="w-full min-w-0">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        className="text-muted-foreground hover:text-foreground hover:bg-state-hover flex h-8 w-full items-center gap-1 rounded-lg px-2 text-xs transition-colors duration-150"
      >
        <ChevronRight className={cn('size-3.5 transition-transform', expanded && 'rotate-90')} />
        <span>{t('calendar.filter.archivedSection')}</span>
        <span className="ml-auto tabular-nums">{entries.length}</span>
      </button>

      {expanded ? (
        <div role="list" className="space-y-1 py-1">
          {entries.map((entry) => (
            <div
              key={`${entry.kind}-${entry.id}`}
              role="listitem"
              className="group/item hover:bg-state-hover flex h-8 w-full min-w-0 items-center rounded-lg text-sm"
            >
              <span className="ml-2 shrink-0">
                <ActivityIcon
                  icon={entry.icon}
                  color={entry.color}
                  size="sm"
                  neutral={entry.kind === 'activity'}
                />
              </span>
              <span className="text-muted-foreground ml-2 min-w-0 flex-1 truncate">
                {entry.name}
              </span>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label={
                      entry.kind === 'category'
                        ? t('calendar.filter.categoryMenu')
                        : t('calendar.filter.activityMenu')
                    }
                    // eslint-disable-next-line tailwindcss/no-arbitrary-value -- 擬似要素の 44px ヒットエリアに空 content が必要
                    className="text-muted-foreground hover:text-foreground hover:bg-state-hover focus-visible:ring-ring relative mr-1 flex size-6 shrink-0 items-center justify-center rounded-lg opacity-0 transition-opacity group-focus-within/item:opacity-100 group-hover/item:opacity-100 after:absolute after:inset-0 after:m-auto after:size-11 after:content-[''] focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none [@media(hover:none)]:opacity-100"
                  >
                    <MoreHorizontal className="size-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" side="right">
                  <DropdownMenuItem
                    onClick={() =>
                      entry.kind === 'category'
                        ? restoreCategory.mutate({ id: entry.id })
                        : restoreActivity.mutate({ id: entry.id })
                    }
                  >
                    <ArchiveRestore className="mr-2 size-4" />
                    {t('calendar.filter.restore')}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() =>
                      entry.kind === 'category'
                        ? onDeleteCategory(entry.id, entry.name)
                        : onDeleteActivity(entry.id, entry.name)
                    }
                  >
                    <Trash2 className="mr-2 size-4" />
                    {t('common.actions.delete')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
