/**
 * 1 日分の Plan レーン + Log レーンを合成する read 側コンポーネント（Step 5）。
 *
 * `two-lane-layout.ts` で座標を計算し、`PlanLaneCard`/`LogLaneCard` を配置する。
 * 既存ビュー（DayView/WeekView）への接続は Step 8 のフリップで行うため、
 * このコンポーネント自体はどこからも呼ばれない dormant な状態で追加する。
 */
'use client';

import { useTagsMap } from '@/features/tags';
import { cn } from '@dayopt/components';

import { calculateTwoLaneLayout } from '../../../../../lib/two-lane-layout';

import type { LogEvent, PlanEvent } from '@/features/entry';
import { LogLaneCard } from './LogLaneCard';
import { PlanLaneCard } from './PlanLaneCard';

export interface TwoLaneDayColumnProps {
  plans: ReadonlyArray<PlanEvent>;
  logs: ReadonlyArray<LogEvent>;
  /** 1 時間あたりの px */
  hourHeight: number;
  /** Plan レーンの幅（%）。既定は `calculateTwoLaneLayout` のデフォルトに従う */
  planLaneWidthPercent?: number | undefined;
  className?: string | undefined;
}

export function TwoLaneDayColumn({
  plans,
  logs,
  hourHeight,
  planLaneWidthPercent,
  className,
}: TwoLaneDayColumnProps) {
  const { getTagById } = useTagsMap();

  const { planLayouts, logLayouts } = calculateTwoLaneLayout({
    plans,
    logs,
    hourHeight,
    ...(planLaneWidthPercent !== undefined && { planLaneWidthPercent }),
  });

  return (
    <div data-two-lane-day-column className={cn('relative h-full w-full', className)}>
      {planLayouts.map(({ entry, position }) => (
        <PlanLaneCard
          key={entry.id}
          event={entry}
          position={position}
          tagColor={entry.tagId ? (getTagById(entry.tagId)?.color ?? null) : null}
        />
      ))}
      {logLayouts.map(({ entry, position }) => (
        <LogLaneCard
          key={entry.id}
          event={entry}
          position={position}
          tagColor={entry.tagId ? (getTagById(entry.tagId)?.color ?? null) : null}
        />
      ))}
    </div>
  );
}
