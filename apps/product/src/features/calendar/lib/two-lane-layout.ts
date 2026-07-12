/**
 * Plan レーン + Record レーンの固定 2 レーン座標計算（Step 5、read 側専用）。
 *
 * `plans_no_overlap` / `records_no_overlap`（DB EXCLUDE 制約、半開区間）により、
 * 同一ユーザーの plans 同士・records 同士は決して時間的に重ならない。そのため
 * 既存 `layout.ts` の `calculateGroupLayout`（時間重複を動的に検出して
 * column を割り当てる sweep-line）は不要で、各レーン内は「その日の時刻から
 * 座標を出すだけ」で足りる。レーン自体は Plan=左・Record=右の固定幅分割。
 *
 * 呼び出し側は対象日の plans/records だけを渡す想定（日をまたぐ絞り込みは
 * 呼び出し側の責務、既存 DayColumn 系コンポーネントと同じ分担）。
 */

import type { PlanEvent, RecordEvent } from '@/features/timeblock';

import type { CalendarEvent } from '../types/calendar.types';

export interface TwoLanePosition {
  /** px */
  top: number;
  /** px */
  height: number;
  /** % */
  left: number;
  /** % */
  width: number;
}

interface TwoLaneLayoutItem<T> {
  entry: T;
  position: TwoLanePosition;
}

interface TwoLaneLayoutResult {
  planLayouts: TwoLaneLayoutItem<PlanEvent>[];
  recordLayouts: TwoLaneLayoutItem<RecordEvent>[];
}

interface CalculateTwoLaneLayoutOptions {
  plans: ReadonlyArray<PlanEvent>;
  records: ReadonlyArray<RecordEvent>;
  /** 1 時間あたりの px */
  hourHeight: number;
  /** Plan レーンの幅（%）。既定 38（Record レーンが主役で広め、overview.md §4） */
  planLaneWidthPercent?: number;
}

const DAY_MINUTES = 24 * 60;
const DEFAULT_PLAN_LANE_WIDTH_PERCENT = 38;

/** カラム内の pointer X から Plan / Record の drop 先レーンを決める。 */
export function resolveTwoLaneFromPointer(
  clientX: number,
  columnLeft: number,
  columnWidth: number,
  planLaneWidthPercent: number = DEFAULT_PLAN_LANE_WIDTH_PERCENT,
): 'plan' | 'record' {
  const boundary = columnLeft + columnWidth * (planLaneWidthPercent / 100);
  return clientX < boundary ? 'plan' : 'record';
}

function minutesSinceMidnight(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

/**
 * 日カラム内での top/height（px）を計算する。
 *
 * 日をまたぐ（`end` が `start` と別日、または `end <= start`）場合は
 * 当日の終端（24:00）でクランプする。複数日にまたがる描画は呼び出し側の
 * 責務（このカラムは 1 日分の座標だけを担当する）。
 */
function timeToPosition(
  start: Date,
  end: Date,
  hourHeight: number,
): { top: number; height: number } {
  const startMinutes = minutesSinceMidnight(start);
  const crossesMidnight = end.getTime() <= start.getTime() || end.getDate() !== start.getDate();
  const endMinutes = crossesMidnight ? DAY_MINUTES : minutesSinceMidnight(end);

  const top = (startMinutes / 60) * hourHeight;
  const height = Math.max(((endMinutes - startMinutes) / 60) * hourHeight, 0);
  return { top, height };
}

export function calculateTwoLaneLayout({
  plans,
  records,
  hourHeight,
  planLaneWidthPercent = DEFAULT_PLAN_LANE_WIDTH_PERCENT,
}: CalculateTwoLaneLayoutOptions): TwoLaneLayoutResult {
  const recordLaneWidthPercent = 100 - planLaneWidthPercent;

  const planLayouts = plans.map((entry) => {
    const { top, height } = timeToPosition(
      entry.displayStartDate,
      entry.displayEndDate,
      hourHeight,
    );
    return { entry, position: { top, height, left: 0, width: planLaneWidthPercent } };
  });

  const recordLayouts = records.map((entry) => {
    const { top, height } = timeToPosition(
      entry.displayStartDate,
      entry.displayEndDate,
      hourHeight,
    );
    return {
      entry,
      position: { top, height, left: planLaneWidthPercent, width: recordLaneWidthPercent },
    };
  });

  return { planLayouts, recordLayouts };
}

/**
 * `CalendarEvent[]`（Step 8 の time model 射影、`kind` 付き）から直接 2 レーン座標を計算する。
 * `TwoLaneTimeblockRenderer` はインタラクション状態（drag/resize preview）を CalendarEvent 単位で
 * 持つ既存 `useInteraction` をそのまま使うため、PlanEvent/RecordEvent への変換を経由しない。
 */
export function calculateTwoLaneStylesForCalendarEvents(
  events: ReadonlyArray<CalendarEvent>,
  hourHeight: number,
  planLaneWidthPercent: number = DEFAULT_PLAN_LANE_WIDTH_PERCENT,
): Record<string, TwoLanePosition> {
  const recordLaneWidthPercent = 100 - planLaneWidthPercent;
  const styles: Record<string, TwoLanePosition> = {};

  for (const event of events) {
    const start = event.displayStartDate ?? event.startDate;
    const end = event.displayEndDate ?? event.endDate;
    if (!start || !end) continue;

    const { top, height } = timeToPosition(start, end, hourHeight);
    const isLog = event.kind === 'record';
    styles[event.id] = {
      top,
      height,
      left: isLog ? planLaneWidthPercent : 0,
      width: isLog ? recordLaneWidthPercent : planLaneWidthPercent,
    };
  }

  return styles;
}
