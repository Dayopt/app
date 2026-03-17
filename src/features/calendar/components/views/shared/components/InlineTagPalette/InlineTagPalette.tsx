'use client';

/**
 * インラインタグパレット
 *
 * カレンダーグリッド上でドラッグ確定後に表示される。
 * 選択範囲のハイライトをグリッド上に描画し、
 * TagQuickSelector（Drawer/Dialog）でタグ選択 → エントリ作成。
 */

import { useCallback, useRef, useState } from 'react';

import { isSameDay } from 'date-fns';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { useEntryMutations } from '@/features/entry';
import { TagQuickSelector, useCreateTag } from '@/features/tags';
import { convertFromTimezone } from '@/lib/date/timezone';
import { logger } from '@/lib/logger';
import { resolveTagColor } from '@/lib/tag-colors';
import { useCalendarSettingsStore } from '@/stores/useCalendarSettingsStore';
import { useInlineCreateStore } from '../../../../../stores/useInlineCreateStore';

import { Z_INDEX } from '../../constants/grid.constants';

interface InlineTagPaletteProps {
  /** 1時間あたりの高さ（px） */
  hourHeight: number;
  /** このカラムの日付（複数日ビューで対象カラムのみ表示するため） */
  date?: Date | undefined;
}

export function InlineTagPalette({ hourHeight, date }: InlineTagPaletteProps) {
  const pendingSelection = useInlineCreateStore.use.pendingSelection();
  const clearPendingSelection = useInlineCreateStore.use.clearPendingSelection();
  const timezone = useCalendarSettingsStore((s) => s.timezone);
  const t = useTranslations('tags');

  const { createEntry, bulkAddTags } = useEntryMutations();
  const createTagMutation = useCreateTag({ showToast: false });
  const [isCreating, setIsCreating] = useState(false);
  const highlightRef = useRef<HTMLDivElement>(null);

  // エントリ作成ハンドラー（タグ必須、タグ名をタイトルに設定）
  const handleCreate = useCallback(
    (tagId: string, tagName: string) => {
      if (!pendingSelection || isCreating) return;

      setIsCreating(true);

      const { date: selDate, startHour, startMinute, endHour, endMinute } = pendingSelection;

      // ローカル時刻 → UTC変換
      const localStart = new Date(
        selDate.getFullYear(),
        selDate.getMonth(),
        selDate.getDate(),
        startHour,
        startMinute,
      );
      const localEnd = new Date(
        selDate.getFullYear(),
        selDate.getMonth(),
        selDate.getDate(),
        endHour,
        endMinute,
      );

      const utcStart = convertFromTimezone(localStart, timezone);
      const utcEnd = convertFromTimezone(localEnd, timezone);

      logger.log('🏷️ InlineTagPalette: Creating entry', {
        start: utcStart.toISOString(),
        end: utcEnd.toISOString(),
        tagId,
        title: tagName,
      });

      createEntry.mutate(
        {
          title: tagName,
          start_time: utcStart.toISOString(),
          end_time: utcEnd.toISOString(),
        },
        {
          onSuccess: (result) => {
            if (result?.id) {
              bulkAddTags.mutate({
                entryIds: [result.id],
                tagId,
              });
            }
            clearPendingSelection();
            setIsCreating(false);
          },
          onError: () => {
            setIsCreating(false);
          },
        },
      );
    },
    [pendingSelection, isCreating, timezone, createEntry, bulkAddTags, clearPendingSelection],
  );

  // 新規タグ作成 → エントリ作成
  const handleCreateAndSelect = useCallback(
    async (name: string, color?: string | null) => {
      if (!pendingSelection || isCreating) return;

      setIsCreating(true);
      try {
        const newTag = await createTagMutation.mutateAsync({
          name,
          color: resolveTagColor(color),
        });
        // mutateAsync resolved → handleCreate で続行
        handleCreate(newTag.id, name);
      } catch (err) {
        setIsCreating(false);
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes('GROUP_NAME_CONFLICT') || message.includes('group_conflict')) {
          toast.error(t('errors.groupNameConflict'));
        } else if (message.includes('duplicate') || message.includes('already exists')) {
          toast.error(t('errors.duplicateName'));
        } else {
          toast.error(t('errors.createFailed'));
        }
      }
    },
    [pendingSelection, isCreating, createTagMutation, handleCreate, t],
  );

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        clearPendingSelection();
      }
    },
    [clearPendingSelection],
  );

  // 日付が指定されている場合、対象日と一致するカラムのみ表示
  if (!pendingSelection) return null;
  if (date && !isSameDay(date, pendingSelection.date)) return null;

  const { startHour, startMinute, endHour, endMinute } = pendingSelection;

  // 選択範囲のピクセル計算
  const startMinutes = startHour * 60 + startMinute;
  const endMinutes = endHour * 60 + endMinute;
  const selectionTop = startMinutes * (hourHeight / 60);
  const selectionHeight = (endMinutes - startMinutes) * (hourHeight / 60);

  // 時間ラベル + 合計時間
  const formatTime = (h: number, m: number) =>
    `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  const timeLabel = `${formatTime(startHour, startMinute)} – ${formatTime(endHour, endMinute)}`;

  const totalMinutes = endMinutes - startMinutes;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const durationText =
    hours > 0 ? (minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`) : `${minutes}m`;

  return (
    <>
      {/* 選択範囲ハイライト（カレンダーグリッド上） */}
      <div
        data-tag-palette
        className="pointer-events-none absolute right-0 left-0"
        style={{ zIndex: Z_INDEX.POPOVER }}
      >
        <div
          ref={highlightRef}
          className="absolute right-0 left-0 rounded-r-lg border-l-[3px]"
          style={{
            top: selectionTop,
            height: selectionHeight,
            borderLeftColor: 'var(--entry-default)',
            backgroundColor: 'color-mix(in oklch, var(--entry-default) 12%, var(--background))',
          }}
        >
          <div className="flex h-full flex-col justify-between p-2">
            <span className="text-foreground text-sm font-semibold tabular-nums">{timeLabel}</span>
            <span className="text-foreground/60 text-sm font-medium tabular-nums">
              {durationText}
            </span>
          </div>
        </div>
      </div>

      {/* タグ選択パネル */}
      <TagQuickSelector
        open={!!pendingSelection}
        onOpenChange={handleOpenChange}
        onSelect={handleCreate}
        onCreateAndSelect={handleCreateAndSelect}
        anchorRef={highlightRef}
      />
    </>
  );
}
