'use client';

import { useTranslations } from 'next-intl';

import { formatTimeRange } from '@/lib/date';
import { cn } from '@dayopt/components';
import type { TimeFormat } from '@dayopt/domain';

import type { TwoLanePosition } from '../../../../../lib/two-lane-layout';

/**
 * 外部カレンダーの予定を表す読み取り専用カード（ghost）。
 *
 * `PlanLaneCard` の亜種だが別コンポーネントにしてある。ghost はタグも記録状態も持たず、
 * `PlanEvent` を組もうとすると偽の値を埋めることになるため。
 *
 * **ハンドラを一切受け取らない**のが読み取り専用の担保。`TwoLaneTimeblockRenderer` を通らないので、
 * 過去ブロックの編集制約（`temporal-constraints.md`）とはそもそも交差しない。
 *
 * 視覚区別に塗りを使わないのは、`PlanLaneCard` が `bg-transparent` だから。ghost に背景色を敷くと
 * 上に重なる plan カードの中身の背景として透け、plan が ghost に飲まれて見える。破線も未記録 plan の
 * シグナルとして使用済みなので、左のインジケータ線と減光で区別する。
 */

const MIN_HEIGHT = 20;
const DETAIL_HEIGHT_THRESHOLD = 40;

interface ExternalEventCardProps {
  event: {
    id: string;
    title: string | null;
    calendarName: string | null;
    startDate: Date;
    endDate: Date;
  };
  position: TwoLanePosition;
  timeFormat?: TimeFormat;
  compact?: boolean;
  className?: string;
}

export function ExternalEventCard({
  event,
  position,
  timeFormat = '24h',
  compact = false,
  className,
}: ExternalEventCardProps) {
  const t = useTranslations('calendar.external');
  const displayTitle = event.title ?? t('untitled');
  const showDetails = !compact && position.height >= DETAIL_HEIGHT_THRESHOLD;

  return (
    <div
      data-external-event-card
      className={cn(
        'border-border-subtle absolute flex flex-col gap-1 overflow-hidden rounded-lg border py-1 text-xs',
        'border-l-indicator border-l-border pointer-events-none',
        compact ? 'px-1' : 'px-2',
        // 自分の計画より一段沈める。plan の skip(50%) / 記録済み(60%) とは別のレンジに置き、
        // 「Dayopt の外にある予定」として読ませる。
        'text-muted-foreground bg-transparent opacity-75',
        className,
      )}
      style={{
        top: `${position.top}px`,
        left: `${position.left}%`,
        width: `calc(${position.width}% - 4px)`,
        height: `${Math.max(position.height, MIN_HEIGHT)}px`,
      }}
    >
      <p className="truncate font-medium">
        <span className="sr-only">{t('screenReaderPrefix')}</span>
        {displayTitle}
      </p>
      {showDetails && (
        <p className="truncate">
          {formatTimeRange(event.startDate, event.endDate, timeFormat)}
          {event.calendarName ? ` · ${event.calendarName}` : ''}
        </p>
      )}
    </div>
  );
}
