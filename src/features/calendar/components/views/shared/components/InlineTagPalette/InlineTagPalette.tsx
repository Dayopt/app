'use client';

/**
 * インラインタグパレット
 *
 * カレンダーグリッド上でドラッグ確定後に表示される。
 * 選択範囲のハイライトをグリッド上に描画し、
 * TagQuickSelector（Drawer/Dialog）でタグ選択 → エントリ作成。
 */

import { useCallback, useRef, useState } from 'react';

import { format, isSameDay } from 'date-fns';
import { enUS, ja } from 'date-fns/locale';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { ColonTagLabel } from '@/components/ui/colon-tag-label';
import { useEntryMutations } from '@/features/entry';
import type { HoveredTagInfo } from '@/features/tags';
import { TagQuickSelector, useCreateTag } from '@/features/tags';
import { convertFromTimezone } from '@/lib/date/timezone';
import { logger } from '@/lib/logger';
import { getTagColorClasses, resolveTagColor } from '@/lib/tag-colors';
import { useCalendarSettingsStore } from '@/stores/useCalendarSettingsStore';
import { formatTimeString } from '../../../../../interaction/time-math';
import { useInlineCreateStore } from '../../../../../stores/useInlineCreateStore';

import { Z_INDEX } from '../../constants/grid.constants';

/** InlineTagPalette コンポーネントのプロパティ */
interface InlineTagPaletteProps {
  /** 1時間あたりの高さ（px） */
  hourHeight: number;
  /** このカラムの日付（複数日ビューで対象カラムのみ表示するため） */
  date?: Date | undefined;
}

/** ドラッグ選択後にカレンダーグリッド上でタグ選択してエントリ作成するコンポーネント */
export function InlineTagPalette({ hourHeight, date }: InlineTagPaletteProps) {
  const pendingSelection = useInlineCreateStore.use.pendingSelection();
  const clearPendingSelection = useInlineCreateStore.use.clearPendingSelection();
  const timezone = useCalendarSettingsStore((s) => s.timezone);
  const locale = useLocale();
  const t = useTranslations('tags');
  const tCalendar = useTranslations('calendar');

  const { createEntry } = useEntryMutations();
  const createTagMutation = useCreateTag({ showToast: false });
  const [isCreating, setIsCreating] = useState(false);
  const [hoveredTag, setHoveredTag] = useState<HoveredTagInfo | null>(null);
  const lockedRef = useRef(false);
  const highlightRef = useRef<HTMLDivElement>(null);

  // 選択後はホバークリアを無視（mouseLeaveでちらつかないように）
  const handleTagHover = useCallback((tag: HoveredTagInfo | null) => {
    if (tag === null && lockedRef.current) return;
    setHoveredTag(tag);
  }, []);

  // エントリ作成ハンドラー（タグ必須、タグ名をタイトルに設定）
  const handleCreate = useCallback(
    (tagId: string, tagName: string) => {
      if (!pendingSelection || isCreating) return;

      lockedRef.current = true;
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

      // ハイライトを即座に消す（pendingSelectionの値は既にローカル変数に展開済み）
      clearPendingSelection();

      createEntry.mutate(
        {
          title: tagName,
          start_time: utcStart.toISOString(),
          end_time: utcEnd.toISOString(),
          tagId,
        },
        {
          onSuccess: () => setIsCreating(false),
          onError: () => setIsCreating(false),
        },
      );
    },
    [pendingSelection, isCreating, timezone, createEntry, clearPendingSelection],
  );

  // 新規タグ作成 → エントリ作成
  const handleCreateAndSelect = useCallback(
    async (name: string, color?: string | null, icon?: string | null) => {
      if (!pendingSelection || isCreating) return;

      setIsCreating(true);
      try {
        const newTag = await createTagMutation.mutateAsync({
          name,
          color: resolveTagColor(color),
          icon: icon ?? undefined,
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

  const timeFormat = useCalendarSettingsStore((s) => s.timeFormat);

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
  const timeLabel = `${formatTimeString(startHour, startMinute, timeFormat)} – ${formatTimeString(endHour, endMinute, timeFormat)}`;

  // タグピッカーヘッダー用の日付+時間ラベル（例: "3/30 (日) 14:00 – 15:30"）
  const dateFnsLocale = locale === 'ja' ? ja : enUS;
  const datePattern = locale === 'ja' ? 'M/d (E)' : 'E, MMM d';
  const pickerTimeLabel = `${format(pendingSelection.date, datePattern, { locale: dateFnsLocale })} ${timeLabel}`;

  // ホバー中タグの色を解決
  const accentColor = hoveredTag
    ? getTagColorClasses(hoveredTag.color).cssVar
    : 'var(--entry-default)';
  const tintColor = hoveredTag
    ? getTagColorClasses(hoveredTag.color).cssVarTint
    : 'color-mix(in oklch, var(--entry-default) 12%, var(--background))';
  const displayName = hoveredTag?.name ?? tCalendar('event.selectTag');

  return (
    <>
      {/* 選択範囲ハイライト（カレンダーグリッド上） */}
      <div
        data-tag-palette
        className="pointer-events-none absolute right-2 left-0"
        style={{ zIndex: Z_INDEX.POPOVER }}
      >
        <div
          ref={highlightRef}
          className="animate-in fade-in-0 zoom-in-95 absolute right-0 left-0 flex rounded-r-lg transition-colors duration-150 motion-reduce:animate-none"
          style={{
            top: selectionTop,
            height: selectionHeight,
          }}
        >
          {/* 左アクセントストリップ */}
          <div
            className="shrink-0 transition-colors duration-150"
            style={{
              width: '3px',
              backgroundColor: accentColor,
            }}
          />
          {/* カード本体 */}
          <div
            className="min-w-0 flex-1 overflow-hidden rounded-r-lg transition-colors duration-150"
            style={{
              backgroundColor: tintColor,
            }}
          >
            {selectionHeight < 40 ? (
              <div className="flex h-full items-center px-2">
                <span className="text-foreground truncate text-xs font-normal">
                  {hoveredTag ? <ColonTagLabel name={displayName} /> : timeLabel}
                </span>
              </div>
            ) : (
              <div className="flex h-full flex-col gap-1 p-2">
                <span className="text-foreground text-sm leading-tight font-normal">
                  {hoveredTag ? <ColonTagLabel name={displayName} /> : displayName}
                </span>
                <span className="text-muted-foreground text-xs leading-tight tabular-nums">
                  {timeLabel}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* タグ選択パネル */}
      <TagQuickSelector
        open={!!pendingSelection}
        onOpenChange={handleOpenChange}
        onSelect={handleCreate}
        onCreateAndSelect={handleCreateAndSelect}
        onTagHover={handleTagHover}
        anchorRef={highlightRef}
        timeLabel={pickerTimeLabel}
      />
    </>
  );
}
