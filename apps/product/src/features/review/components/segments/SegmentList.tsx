'use client';

import { useState } from 'react';

import { MoreHorizontal, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { EmptyState } from '@/components/ui/feedback/EmptyState';
import { ConfirmDialog } from '@/components/ui/overlays/confirm-dialog';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Skeleton,
} from '@dayopt/components';

import {
  useCreateSegment,
  useDeleteSegment,
  useRenameSegment,
  useSegments,
  useSetSegmentActivities,
} from '../../hooks/useSegments';
import { SegmentEditPopover } from './SegmentEditPopover';

/**
 * サイドバーのセグメント一覧（#2181 Step 5、overview.md §5-5）。
 *
 * CRUD はコンテキストメニューで行う（右パネル廃止に伴い、旧「右パネル内で完結」から
 * 移設。#2162 §6-4 の追補。カテゴリー/アクティビティが確立した操作語彙と揃える）。
 * 並び替え・フォルダ分け・共有は持たない（v1 スコープ外）。
 */
export function SegmentList() {
  const t = useTranslations('calendar.stats.review.segments');
  const { data: segments, isPending } = useSegments();
  const createSegment = useCreateSegment();
  const renameSegment = useRenameSegment();
  const setSegmentActivities = useSetSegmentActivities();
  const deleteSegment = useDeleteSegment();
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const pendingDeleteSegment = segments?.find((s) => s.id === pendingDeleteId) ?? null;

  return (
    <div className="flex flex-col gap-1 px-2">
      <div className="flex items-center justify-between px-1 py-1">
        <span className="text-muted-foreground text-xs font-medium">{t('title')}</span>
        <SegmentEditPopover
          trigger={
            <Button type="button" variant="ghost" icon className="size-6" aria-label={t('create')}>
              <Plus className="size-4" />
            </Button>
          }
          isSubmitting={createSegment.isPending}
          onSubmit={(input) => createSegment.mutate(input)}
        />
      </div>

      {isPending ? (
        <div className="flex flex-col gap-1">
          <Skeleton className="h-9 rounded-lg" />
          <Skeleton className="h-9 rounded-lg" />
        </div>
      ) : !segments || segments.length === 0 ? (
        <EmptyState
          title={t('emptyTitle')}
          description={t('emptyDescription')}
          size="sm"
          className="py-4"
        />
      ) : (
        <ul className="flex flex-col gap-1">
          {segments.map((segment) => (
            <li
              key={segment.id}
              className="group hover:bg-state-hover flex min-h-9 items-center gap-1 rounded-lg px-2"
            >
              <span className="min-w-0 flex-1 truncate text-sm">{segment.name}</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    icon
                    className="size-6 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
                    aria-label={segment.name}
                  >
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <SegmentEditPopover
                    trigger={
                      <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                        {t('editActivities')}
                      </DropdownMenuItem>
                    }
                    initialName={segment.name}
                    initialActivityIds={segment.activityIds}
                    isSubmitting={renameSegment.isPending || setSegmentActivities.isPending}
                    onSubmit={(input) => {
                      if (input.name !== segment.name) {
                        renameSegment.mutate({ segmentId: segment.id, name: input.name });
                      }
                      setSegmentActivities.mutate({
                        segmentId: segment.id,
                        activityIds: input.activityIds,
                      });
                    }}
                  />
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => setPendingDeleteId(segment.id)}
                  >
                    {t('delete')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={pendingDeleteSegment != null}
        onClose={() => setPendingDeleteId(null)}
        onConfirm={() => {
          if (pendingDeleteSegment) deleteSegment.mutate({ segmentId: pendingDeleteSegment.id });
          setPendingDeleteId(null);
        }}
        title={t('deleteConfirmTitle')}
        description={
          pendingDeleteSegment
            ? t('deleteConfirmDescription', { name: pendingDeleteSegment.name })
            : ''
        }
        variant="destructive"
      />
    </div>
  );
}
