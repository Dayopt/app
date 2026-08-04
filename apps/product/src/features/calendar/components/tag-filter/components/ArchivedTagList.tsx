'use client';

import { useState } from 'react';

import { ArchiveRestore, ChevronRight, MoreHorizontal, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { ErrorState } from '@/components/ui/feedback/ErrorState';
import { TagIcon, useArchivedTags, useRestoreTag } from '@/features/tags';
import {
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@dayopt/components';

interface ArchivedTagListProps {
  /** 完全削除フロー（確認ダイアログ）は親の既存ハンドラに委ねる */
  onDeleteTag: (tagId: string, tagName: string) => void;
}

/**
 * サイドバー末尾の「アーカイブ済み」折りたたみセクション
 *
 * アーカイブ済みタグの参照・復元・完全削除の入口。アーカイブ済みタグが
 * 1 件も無ければ何も描画しない。取得失敗時はこれらの唯一の UI が消えて
 * しまわないよう、0 件（空）とは区別して ErrorState + リトライを表示する。
 */
export function ArchivedTagList({ onDeleteTag }: ArchivedTagListProps) {
  const t = useTranslations();
  const [expanded, setExpanded] = useState(false);
  const { data: archivedTags, isError, refetch } = useArchivedTags();
  const restoreTagMutation = useRestoreTag();

  if (isError) {
    return (
      <div className="w-full min-w-0">
        <div className="text-muted-foreground flex h-8 w-full items-center gap-1 px-2 text-xs">
          {t('calendar.filter.archivedSection')}
        </div>
        <ErrorState
          title={t('calendar.filter.archivedLoadFailed')}
          onRetry={() => refetch()}
          size="sm"
        />
      </div>
    );
  }

  if (!archivedTags || archivedTags.length === 0) return null;

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
        <span className="ml-auto tabular-nums">{archivedTags.length}</span>
      </button>

      {expanded ? (
        <div role="list" className="space-y-1 py-1">
          {archivedTags.map((tag) => (
            <div
              key={tag.id}
              role="listitem"
              className="group/item hover:bg-state-hover flex h-8 w-full min-w-0 items-center rounded-lg text-sm"
            >
              <span className="ml-2 shrink-0">
                <TagIcon icon={tag.icon} color={tag.color} size="sm" />
              </span>
              <span className="text-muted-foreground ml-2 min-w-0 flex-1 truncate">{tag.name}</span>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label={t('calendar.filter.tagMenu')}
                    // eslint-disable-next-line tailwindcss/no-arbitrary-value -- 擬似要素の 44px ヒットエリアに空 content が必要
                    className="text-muted-foreground hover:text-foreground hover:bg-state-hover focus-visible:ring-ring relative mr-1 flex size-6 shrink-0 items-center justify-center rounded-lg opacity-0 transition-opacity group-focus-within/item:opacity-100 group-hover/item:opacity-100 after:absolute after:inset-0 after:m-auto after:size-11 after:content-[''] focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none [@media(hover:none)]:opacity-100"
                  >
                    <MoreHorizontal className="size-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" side="right">
                  <DropdownMenuItem onClick={() => restoreTagMutation.mutate({ id: tag.id })}>
                    <ArchiveRestore className="mr-2 size-4" />
                    {t('calendar.filter.restore')}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => onDeleteTag(tag.id, tag.name)}
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
