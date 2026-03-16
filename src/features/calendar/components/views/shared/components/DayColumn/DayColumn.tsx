/**
 * 1日分の列コンポーネント（再利用可能）
 */

'use client';

import { Calendar } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import React, { memo, useMemo } from 'react';

import { EmptyState } from '@/components/ui/empty-state';
import { isWeekend } from '@/lib/date';
import { GRID_BACKGROUND, HOUR_HEIGHT } from '../../constants/grid.constants';
import { useEntryPosition } from '../../hooks/useEntryPosition';
import type { DayColumnProps } from '../../types/view.types';

import { EntryCard, useEntryInspectorStore } from '@/features/entry';
import { useTagsMap } from '@/features/tags';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { MEDIA_QUERIES } from '@/lib/breakpoints';
import { filterEntriesByDate, sortTimedEntries } from '../../utils/entryPositioning';

export const DayColumn = memo<DayColumnProps>(function DayColumn({
  date,
  events,
  hourHeight = HOUR_HEIGHT,
  isToday: _isTodayProp,
  isWeekend: isWeekendProp,
  onTimeClick,
  onEventClick,
  onEventContextMenu,
  className = '',
}) {
  const t = useTranslations('common.aria');
  const setAnchorRect = useEntryInspectorStore((state) => state.setAnchorRect);
  const { getTagById } = useTagsMap();
  const isMobile = useMediaQuery(MEDIA_QUERIES.mobile);
  const format = useFormatter();

  // 今日・週末の判定（propsで上書き可能）
  const isWeekendActual = isWeekendProp ?? isWeekend(date);

  // この日のエントリをフィルタリング
  const dayEntries = useMemo(() => {
    // CalendarEventをTimedEntryに変換
    const timedEntries = events.map((entry) => ({
      ...entry,
      start: entry.startDate || new Date(),
      end: entry.endDate || new Date(),
    }));
    const filtered = filterEntriesByDate(timedEntries, date);
    return sortTimedEntries(filtered);
  }, [events, date]);

  // エントリの位置を計算
  const entryPositions = useEntryPosition(dayEntries, { hourHeight });

  // グリッド高さ
  const columnHeight = 24 * hourHeight;

  // 時間クリックハンドラー
  const handleTimeClick = (e: React.MouseEvent) => {
    if (!onTimeClick) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;

    // 時間計算（15分単位で丸める）
    const totalMinutes = (y * 60) / hourHeight;
    const hour = Math.floor(totalMinutes / 60);
    const minute = Math.floor((totalMinutes % 60) / 15) * 15;
    onTimeClick(date, hour, minute);
  };

  // カラムのスタイル
  const columnClasses = [
    'relative flex-1 min-w-0',
    GRID_BACKGROUND,
    'border-r border-border last:border-r-0',
    isWeekendActual ? 'bg-surface-container/50' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const formattedDate = format.dateTime(date, { dateStyle: 'full' });

  return (
    <div
      role="gridcell"
      className={columnClasses}
      aria-label={t('selectDate', { date: formattedDate })}
    >
      {/* イベント表示エリア */}
      <div
        className="relative flex-1 cursor-pointer"
        onClick={handleTimeClick}
        style={{
          minHeight: `${columnHeight}px`,
        }}
      >
        {/* 現在時刻線はScrollableCalendarLayoutで統一表示 */}

        {/* エントリ */}
        {dayEntries.map((entry) => {
          const position = entryPositions.get(entry.id);
          // positionが見つからない場合は、デフォルト位置を使用してレンダリング

          return (
            <EntryCard
              key={entry.id}
              entry={entry}
              tagName={entry.tagId ? (getTagById(entry.tagId)?.name ?? null) : null}
              tagColor={entry.tagId ? (getTagById(entry.tagId)?.color ?? null) : null}
              onAnchorRect={setAnchorRect}
              isMobile={isMobile}
              position={position} // undefinedでも大丈夫（EntryCard側で対応済み）
              hourHeight={hourHeight}
              onClick={onEventClick}
              onContextMenu={onEventContextMenu}
            />
          );
        })}

        {/* 空状態（エントリがない場合） */}
        {dayEntries.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center opacity-30">
            <EmptyState title="" icon={Calendar} size="sm" />
          </div>
        )}
      </div>
    </div>
  );
});
