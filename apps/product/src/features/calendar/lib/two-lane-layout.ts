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
 * 呼び出し側の責務、TwoLaneDayColumn と同じ分担）。
 */

import type { PlanEvent, RecordEvent } from '@/features/timeblock';

import type { CalendarDisplayEvent } from '../types/calendar.types';

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
/** day / week / multi-day で共有する Plan / Record レーン幅の契約。 */
export const DEFAULT_PLAN_LANE_WIDTH_PERCENT = 38;
const TWO_LANE_MIN_GAP_PX: number = 2;

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

function buildLaneLayout<T extends { displayStartDate: Date; displayEndDate: Date; id: string }>(
  items: ReadonlyArray<T>,
  laneLeft: number,
  laneWidth: number,
  hourHeight: number,
): Array<TwoLaneLayoutItem<T>> {
  const sorted = items
    .map((entry) => {
      const { top, height } = timeToPosition(
        entry.displayStartDate,
        entry.displayEndDate,
        hourHeight,
      );
      return { entry, top, height };
    })
    .sort((a, b) => a.top - b.top || a.entry.id.localeCompare(b.entry.id));

  const layouts: Array<TwoLaneLayoutItem<T>> = [];
  let previousOriginalBottomPx: number | null = null;

  for (const item of sorted) {
    const gapOffset =
      previousOriginalBottomPx === null
        ? 0
        : Math.max(previousOriginalBottomPx + TWO_LANE_MIN_GAP_PX - item.top, 0);
    const top = item.top + gapOffset;
    const height = Math.max(item.height - gapOffset, 0);
    const position: TwoLanePosition = {
      top,
      height,
      left: laneLeft,
      width: laneWidth,
    };

    layouts.push({ entry: item.entry, position });
    previousOriginalBottomPx = item.top + item.height;
  }

  return layouts;
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
  const planLayouts = buildLaneLayout(plans, 0, planLaneWidthPercent, hourHeight);
  const recordLayouts = buildLaneLayout(
    records,
    planLaneWidthPercent,
    recordLaneWidthPercent,
    hourHeight,
  );

  return { planLayouts, recordLayouts };
}

/**
 * `CalendarDisplayEvent[]`（Step 8 の time model 射影、`kind` 付き）から直接 2 レーン座標を計算する。
 * `TwoLaneTimeblockRenderer` はインタラクション状態（drag/resize preview）を CalendarDisplayEvent 単位で
 * 持つ既存 `useInteraction` をそのまま使うため、PlanEvent/RecordEvent への変換を経由しない。
 */
export function calculateTwoLaneStylesForCalendarEvents(
  events: ReadonlyArray<CalendarDisplayEvent>,
  hourHeight: number,
  planLaneWidthPercent: number = DEFAULT_PLAN_LANE_WIDTH_PERCENT,
): Record<string, TwoLanePosition> {
  const recordLaneWidthPercent = 100 - planLaneWidthPercent;
  const styles: Record<string, TwoLanePosition> = {};
  const records = [];
  const plans = [];

  for (const event of events) {
    const start = event.displayStartDate ?? event.startDate;
    const end = event.displayEndDate ?? event.endDate;
    if (!start || !end) continue;
    if (event.kind === 'record') {
      records.push({
        ...event,
        displayStartDate: start,
        displayEndDate: end,
      });
    } else {
      plans.push({
        ...event,
        displayStartDate: start,
        displayEndDate: end,
      });
    }
  }

  for (const { entry, position } of buildLaneLayout(plans, 0, planLaneWidthPercent, hourHeight)) {
    styles[entry.id] = position;
  }

  for (const { entry, position } of buildLaneLayout(
    records,
    planLaneWidthPercent,
    recordLaneWidthPercent,
    hourHeight,
  )) {
    styles[entry.id] = position;
  }

  return styles;
}
