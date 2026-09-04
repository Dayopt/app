'use client';

import { useState } from 'react';

import { MoreHorizontal, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { EmptyState } from '@/components/ui/feedback/EmptyState';
import { ConfirmDialog } from '@/components/ui/overlays/confirm-dialog';
import { useIsMobile } from '@/lib/hooks/useIsMobile';
import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Skeleton,
} from '@dayopt/components';

import { useActiveSegment } from '../../hooks/useActiveSegment';
import {
  useCreateSegment,
  useDeleteSegment,
  useRenameSegment,
  useSegments,
  useSetSegmentActivities,
} from '../../hooks/useSegments';
import { useReportViewStore } from '../../stores/useReportViewStore';
import { SegmentEditPopover } from './SegmentEditPopover';

/**
 * サイドバーの「セグメント — 保存した問い」（仕様 §3.3-2）。
 *
 * 1 本の一覧がレンズ選択（行クリック）と CRUD（⋯ メニュー）の両方を担う。同じ名前を
 * 2 度並べない — 狭いサイドバーで同じ一覧が 2 つあると、どちらを押せばよいか読めなくなる
 * （2026-09-04 User 裁可）。
 *
 * レンズは「すべて」が既定。選ぶと 1 章の宇宙が `segment.activityIds ∩ visible` に縮む
 * （仕様 §2.4）。並び替え・フォルダ分け・共有は持たない（v1 スコープ外）。
 */
export function SegmentList() {
  const t = useTranslations('calendar.stats.review.segments');
  const tSidebar = useTranslations('report.sidebar');
  const isMobile = useIsMobile();
  const { data: segments, isPending } = useSegments();
  const createSegment = useCreateSegment();
  const renameSegment = useRenameSegment();
  const setSegmentActivities = useSetSegmentActivities();
  const deleteSegment = useDeleteSegment();
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const segmentId = useReportViewStore((state) => state.segmentId);
  const setSegmentId = useReportViewStore((state) => state.setSegmentId);

  const pendingDeleteSegment = segments?.find((s) => s.id === pendingDeleteId) ?? null;

  // 削除済みセグメントの縮退は hook が持つ（1 章・カテゴリーフィルタと同じ答えを使う）
  const { activeSegment } = useActiveSegment();
  const activeSegmentId = activeSegment?.id ?? null;
  const rowHeight = isMobile ? 'min-h-11' : 'min-h-9';

  return (
    <div className="flex flex-col gap-1 px-2">
      <div className="flex items-center justify-between px-1 py-1">
        <span className="text-muted-foreground text-xs font-medium">{tSidebar('lensHeading')}</span>
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
      ) : (
        <ul className="flex flex-col gap-1">
          {/* レンズ無し。セグメントが 1 つも無くても押せる状態として常に置く */}
          <li>
            <button
              type="button"
              aria-pressed={activeSegmentId === null}
              onClick={() => setSegmentId(null)}
              className={cn(
                'hover:bg-state-hover flex w-full items-center rounded-lg px-2 text-left text-sm',
                rowHeight,
                activeSegmentId === null && 'bg-state-selected',
              )}
            >
              {tSidebar('lensAll')}
            </button>
          </li>

          {segments?.map((segment) => (
            <li
              key={segment.id}
              className={cn(
                'group hover:bg-state-hover flex items-center gap-1 rounded-lg pr-2',
                rowHeight,
                activeSegmentId === segment.id && 'bg-state-selected',
              )}
            >
              <button
                type="button"
                aria-pressed={activeSegmentId === segment.id}
                onClick={() => setSegmentId(segment.id)}
                className={cn(
                  'min-w-0 flex-1 truncate rounded-lg px-2 text-left text-sm',
                  rowHeight,
                )}
              >
                {segment.name}
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    icon
                    className="size-6 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
                    // 行そのものがレンズ切替のボタンになったので、名前だけだと
                    // 読み上げで区別できず、切替のつもりで破壊的メニューを開いてしまう
                    aria-label={tSidebar('segmentMenu', { name: segment.name })}
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

      {!isPending && (!segments || segments.length === 0) ? (
        <EmptyState
          title={t('emptyTitle')}
          description={t('emptyDescription')}
          size="sm"
          className="py-4"
        />
      ) : null}

      <ConfirmDialog
        open={pendingDeleteSegment != null}
        onClose={() => setPendingDeleteId(null)}
        onConfirm={() => {
          if (pendingDeleteSegment) {
            // 削除するセグメントをレンズにしていたら「すべて」へ戻す
            if (segmentId === pendingDeleteSegment.id) setSegmentId(null);
            deleteSegment.mutate({ segmentId: pendingDeleteSegment.id });
          }
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
