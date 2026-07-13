/**
 * 1 日分の Plan レーン + Record レーンを合成する read 側コンポーネント（Step 5）。
 *
 * `two-lane-layout.ts` で座標を計算し、`PlanLaneCard`/`RecordLaneCard` を配置する。
 * 既存ビュー（DayView/WeekView）への接続は Step 8 のフリップで行うため、
 * このコンポーネント自体はどこからも呼ばれない dormant な状態で追加する。
 */
'use client';

import { useTagsMap } from '@/features/tags';
import { cn } from '@dayopt/components';

import { calculateTwoLaneLayout } from '../../../../../lib/two-lane-layout';

import type { PlanEvent, RecordEvent } from '@/features/timeblock';
import { PlanLaneCard } from './PlanLaneCard';
import { RecordLaneCard } from './RecordLaneCard';

interface TwoLaneDayColumnProps {
  plans: ReadonlyArray<PlanEvent>;
  records: ReadonlyArray<RecordEvent>;
  /** 1 時間あたりの px */
  hourHeight: number;
  /** Plan レーンの幅（%）。既定は `calculateTwoLaneLayout` のデフォルトに従う */
  planLaneWidthPercent?: number | undefined;
  className?: string | undefined;
}

export function TwoLaneDayColumn({
  plans,
  records,
  hourHeight,
  planLaneWidthPercent,
  className,
}: TwoLaneDayColumnProps) {
  const { getTagById } = useTagsMap();

  const { planLayouts, recordLayouts } = calculateTwoLaneLayout({
    plans,
    records,
    hourHeight,
    ...(planLaneWidthPercent !== undefined && { planLaneWidthPercent }),
  });

  return (
    <div data-two-lane-day-column className={cn('relative h-full w-full', className)}>
      {planLayouts.map(({ entry, position }) => {
        const tag = entry.tagId ? getTagById(entry.tagId) : undefined;
        return (
          <PlanLaneCard
            key={entry.id}
            event={entry}
            position={position}
            tagName={tag?.name ?? null}
            tagColor={tag?.color ?? null}
            tagIcon={tag?.icon ?? null}
          />
        );
      })}
      {recordLayouts.map(({ entry, position }) => {
        const tag = entry.tagId ? getTagById(entry.tagId) : undefined;
        return (
          <RecordLaneCard
            key={entry.id}
            event={entry}
            position={position}
            tagName={tag?.name ?? null}
            tagColor={tag?.color ?? null}
            tagIcon={tag?.icon ?? null}
          />
        );
      })}
    </div>
  );
}
