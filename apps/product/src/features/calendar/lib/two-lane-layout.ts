/**
 * Plan レーン + Log レーンの固定 2 レーン座標計算（Step 5、read 側専用）。
 *
 * `plans_no_overlap` / `logs_no_overlap`（DB EXCLUDE 制約、半開区間）により、
 * 同一ユーザーの plans 同士・logs 同士は決して時間的に重ならない。そのため
 * 既存 `layout.ts` の `calculateGroupLayout`（時間重複を動的に検出して
 * column を割り当てる sweep-line）は不要で、各レーン内は「その日の時刻から
 * 座標を出すだけ」で足りる。レーン自体は Plan=左・Log=右の固定幅分割。
 *
 * 呼び出し側は対象日の plans/logs だけを渡す想定（日をまたぐ絞り込みは
 * 呼び出し側の責務、既存 DayColumn 系コンポーネントと同じ分担）。
 */

import type { LogEvent, PlanEvent } from '@/features/entry';

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
  logLayouts: TwoLaneLayoutItem<LogEvent>[];
}

interface CalculateTwoLaneLayoutOptions {
  plans: ReadonlyArray<PlanEvent>;
  logs: ReadonlyArray<LogEvent>;
  /** 1 時間あたりの px */
  hourHeight: number;
  /** Plan レーンの幅（%）。既定 38（Log レーンが主役で広め、overview.md §4） */
  planLaneWidthPercent?: number;
}

const DAY_MINUTES = 24 * 60;
const DEFAULT_PLAN_LANE_WIDTH_PERCENT = 38;

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
  logs,
  hourHeight,
  planLaneWidthPercent = DEFAULT_PLAN_LANE_WIDTH_PERCENT,
}: CalculateTwoLaneLayoutOptions): TwoLaneLayoutResult {
  const logLaneWidthPercent = 100 - planLaneWidthPercent;

  const planLayouts = plans.map((entry) => {
    const { top, height } = timeToPosition(
      entry.displayStartDate,
      entry.displayEndDate,
      hourHeight,
    );
    return { entry, position: { top, height, left: 0, width: planLaneWidthPercent } };
  });

  const logLayouts = logs.map((entry) => {
    const { top, height } = timeToPosition(
      entry.displayStartDate,
      entry.displayEndDate,
      hourHeight,
    );
    return {
      entry,
      position: { top, height, left: planLaneWidthPercent, width: logLaneWidthPercent },
    };
  });

  return { planLayouts, logLayouts };
}
