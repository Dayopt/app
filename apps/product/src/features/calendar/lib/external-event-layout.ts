/**
 * 外部カレンダー ghost の日カラム内座標計算。
 *
 * plans / records の `two-lane-layout.ts` を流用できない理由が 2 つある:
 *
 * 1. **重なる**。`plans_no_overlap` / `records_no_overlap` の EXCLUDE 制約はミラーに無いので、
 *    ダブルブッキングした外部予定は普通に重なる。two-lane 側の「重ならない前提」の gap 補正では
 *    完全に重なった 2 件が読めなくなる
 * 2. **対象日を跨ぐ**。two-lane の `timeToPosition` は `top` をイベント自身の開始時刻（local）
 *    から出すため、前日から続く予定を翌日のカラムに置くと前日の時刻から座標が引かれる。ここは
 *    対象日の 00:00 を原点にした相対計算にして、両端でクリップする
 *
 * 呼び出し側は対象日の ghost だけを渡す（日をまたぐ絞り込みは呼び出し側の責務。
 * `two-lane-layout.ts` と同じ分担）。
 */

import type { TwoLanePosition } from './two-lane-layout';

const DAY_MINUTES = 24 * 60;
const MS_PER_MINUTE = 60 * 1000;

interface ExternalEventLayoutInput {
  id: string;
  startDate: Date;
  endDate: Date;
}

interface CalculateExternalEventLayoutOptions {
  /** 対象日の 00:00（ローカル）。ここを原点に top を出す。 */
  dayStart: Date;
  /** 1 時間あたりの px。 */
  hourHeight: number;
  /** ghost が使える横幅（%）。Plan レーン幅と同じ値を呼び出し側が渡す。 */
  laneWidthPercent: number;
}

interface ClippedEvent {
  id: string;
  topMinutes: number;
  bottomMinutes: number;
}

/** 対象日の範囲へ切り詰める。両端が日の外なら 00:00 / 24:00 に寄せる。 */
function clipToDay(event: ExternalEventLayoutInput, dayStart: Date): ClippedEvent | null {
  const startMinutes = (event.startDate.getTime() - dayStart.getTime()) / MS_PER_MINUTE;
  const endMinutes = (event.endDate.getTime() - dayStart.getTime()) / MS_PER_MINUTE;

  const topMinutes = Math.max(startMinutes, 0);
  const bottomMinutes = Math.min(endMinutes, DAY_MINUTES);

  if (bottomMinutes <= topMinutes) return null;
  return { id: event.id, topMinutes, bottomMinutes };
}

/**
 * 重なるものどうしを 1 グループにまとめる（sweep-line）。グループ内は等分カラムに割る。
 */
function groupOverlapping(events: ClippedEvent[]): ClippedEvent[][] {
  const groups: ClippedEvent[][] = [];
  let current: ClippedEvent[] = [];
  let groupBottom = -Infinity;

  for (const event of events) {
    if (current.length > 0 && event.topMinutes >= groupBottom) {
      groups.push(current);
      current = [];
      groupBottom = -Infinity;
    }
    current.push(event);
    groupBottom = Math.max(groupBottom, event.bottomMinutes);
  }

  if (current.length > 0) groups.push(current);
  return groups;
}

/** グループ内でカラム番号を割り当て、使ったカラム数を返す。 */
function assignColumns(group: ClippedEvent[]): { columnOf: Map<string, number>; columns: number } {
  const columnBottoms: number[] = [];
  const columnOf = new Map<string, number>();

  for (const event of group) {
    let column = columnBottoms.findIndex((bottom) => bottom <= event.topMinutes);
    if (column === -1) {
      column = columnBottoms.length;
      columnBottoms.push(event.bottomMinutes);
    } else {
      columnBottoms[column] = event.bottomMinutes;
    }
    columnOf.set(event.id, column);
  }

  return { columnOf, columns: columnBottoms.length };
}

export function calculateExternalEventLayout(
  events: ReadonlyArray<ExternalEventLayoutInput>,
  { dayStart, hourHeight, laneWidthPercent }: CalculateExternalEventLayoutOptions,
): Record<string, TwoLanePosition> {
  const positions: Record<string, TwoLanePosition> = {};
  if (laneWidthPercent <= 0) return positions;

  const clipped = events
    .map((event) => clipToDay(event, dayStart))
    .filter((event): event is ClippedEvent => event !== null)
    .sort((a, b) => a.topMinutes - b.topMinutes || a.id.localeCompare(b.id));

  for (const group of groupOverlapping(clipped)) {
    const { columnOf, columns } = assignColumns(group);
    const columnWidth = laneWidthPercent / columns;

    for (const event of group) {
      const column = columnOf.get(event.id) ?? 0;
      positions[event.id] = {
        top: (event.topMinutes / 60) * hourHeight,
        height: ((event.bottomMinutes - event.topMinutes) / 60) * hourHeight,
        left: column * columnWidth,
        width: columnWidth,
      };
    }
  }

  return positions;
}
