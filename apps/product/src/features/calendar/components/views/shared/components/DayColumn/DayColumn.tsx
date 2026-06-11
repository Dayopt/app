/**
 * 1日分の列コンポーネント（再利用可能）
 */

'use client';

import { formatInTimeZone } from 'date-fns-tz';
import { Plus } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import React, { memo, useMemo } from 'react';

import type { DayColumnProps } from '../../../../../types/view.types';
import { HOUR_HEIGHT } from '../../constants/grid.constants';
import { useEntryPosition } from '../../hooks/useEntryPosition';

import { EntryCard, isNewEntry, useEntryInspectorStore } from '@/features/entry';
import { useTagsMap } from '@/features/tags';
import { MEDIA_QUERIES } from '@/lib/breakpoints';
import { isTodayInTimezone } from '@/lib/date/timezone';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { useUserPreferenceStore } from '@/lib/stores/useUserPreferenceStore';
import { filterEntriesByDate, sortTimedEntries } from '../../../../../lib/layout';

export const DayColumn = memo<DayColumnProps>(function DayColumn({
  date,
  events,
  hourHeight = HOUR_HEIGHT,
  isToday: _isTodayProp,
  isWeekend: _isWeekendProp,
  onTimeClick,
  onEventClick,
  onEventContextMenu,
  className = '',
}) {
  const t = useTranslations('common.aria');
  const { getTagById } = useTagsMap();
  const setAnchorRect = useEntryInspectorStore((state) => state.setAnchorRect);
  const isMobile = useMediaQuery(MEDIA_QUERIES.mobile);
  const format = useFormatter();
  const timezone = useUserPreferenceStore((state) => state.timezone);

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
    'border-r border-border last:border-r-0',
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
              tagIcon={entry.tagId ? (getTagById(entry.tagId)?.icon ?? null) : null}
              onAnchorRect={setAnchorRect}
              isMobile={isMobile}
              position={position} // undefinedでも大丈夫（EntryCard側で対応済み）
              hourHeight={hourHeight}
              onClick={onEventClick}
              onContextMenu={onEventContextMenu}
              className={isNewEntry(entry.id) ? 'animate-entry-pop' : undefined}
            />
          );
        })}

        {/* 空状態CTA（エントリがない場合） */}
        {dayEntries.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <button
              type="button"
              className="text-muted-foreground hover:text-muted-foreground flex min-h-11 min-w-11 flex-col items-center justify-center gap-1 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                if (onTimeClick) {
                  // 「今日」判定 / 現在時 hour の両方をユーザー TZ で評価する。
                  // `now.getHours()` は OS TZ ベースなので、calendar TZ と乖離していると
                  // 「今日の今の時刻」を意図したつもりが UTC 深夜などで埋まり得る。
                  const now = new Date();
                  const isDateToday = isTodayInTimezone(date, timezone, now);
                  const tzHour = Number(formatInTimeZone(now, timezone, 'H'));
                  const hour = isDateToday ? Math.max(tzHour, 9) : 9;
                  onTimeClick(date, hour, 0);
                }
              }}
            >
              <Plus className="size-6" />
              <span className="text-xs">{t('addPlan')}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
});
