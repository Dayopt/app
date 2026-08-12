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
 *    対象日の暦日と突き合わせて、両端を 00:00 / 24:00 でクリップする
 *
 * 呼び出し側は対象日の ghost だけを渡す（日をまたぐ絞り込みは呼び出し側の責務。
 * `two-lane-layout.ts` と同じ分担）。
 */

import { convertToTimezone } from '@/lib/date/timezone';

import type { TwoLanePosition } from './two-lane-layout';

const DAY_MINUTES = 24 * 60;

interface ExternalEventLayoutInput {
  id: string;
  startDate: Date;
  endDate: Date;
}

/**
 * ghost をグリッドと同じ「壁時計」空間へ移す。
 *
 * plan / record は `applyTimezoneToDisplayDates` で `toZonedTime` 済みの表示用日時を持ち、
 * `two-lane-layout` はその **ローカルフィールド**（getHours / getMinutes）から座標を出す。ghost に
 * 生の UTC instant を渡すと、ユーザー TZ ≠ ブラウザ TZ のときに ghost だけが時差分ずれて描かれる。
 * 表示に使う日時（座標とカード内の時刻表示）はここを通したものに揃える。
 */
export function toZonedExternalEvents<T extends ExternalEventLayoutInput>(
  events: ReadonlyArray<T>,
  timezone: string,
): T[] {
  return events.map((event) => ({
    ...event,
    startDate: convertToTimezone(event.startDate, timezone),
    endDate: convertToTimezone(event.endDate, timezone),
  }));
}

interface CalculateExternalEventLayoutOptions {
  /** このカラムが担当する日。時刻は見ず、ローカルの暦日だけを使う。 */
  day: Date;
  /** 1 時間あたりの px。 */
  hourHeight: number;
  /** ghost が使える横幅（%）。Plan レーン幅と同じ値を呼び出し側が渡す。 */
  laneWidthPercent: number;
}

/**
 * `TwoLanePosition` に、対象日の 00:00/24:00 でクリップした表示用の開始・終了時刻を足したもの。
 *
 * 日跨ぎの予定は座標（top/height）を日の範囲へクリップするが、カード内の時刻表示に元の
 * `event.startDate`/`endDate` をそのまま使うと、座標とラベルが食い違う（例: 前日 23:00〜当日
 * 02:00 の予定が当日カラムでは 00:00〜02:00 の位置にあるのに「23:00–02:00」と表示される）。
 * 表示側もこの座標計算と同じクリップ結果を使うよう、ここで一緒に返す。
 */
export interface ExternalEventPosition extends TwoLanePosition {
  displayStartDate: Date;
  displayEndDate: Date;
}

interface ClippedEvent {
  id: string;
  topMinutes: number;
  bottomMinutes: number;
}

/** `day` の暦日 + 分（0-1440）から、表示用のローカル Date を組み立てる。 */
function minutesToLocalDate(day: Date, minutes: number): Date {
  const result = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0, 0);
  result.setMinutes(minutes);
  return result;
}

/** `two-lane-layout` の同名関数と同じ、ローカルフィールドからの分換算。 */
function minutesSinceMidnight(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

/** ローカルの暦日を比較する（-1 / 0 / 1）。 */
function compareLocalDay(a: Date, b: Date): number {
  const dayA = [a.getFullYear(), a.getMonth(), a.getDate()] as const;
  const dayB = [b.getFullYear(), b.getMonth(), b.getDate()] as const;

  for (let i = 0; i < dayA.length; i += 1) {
    const left = dayA[i] as number;
    const right = dayB[i] as number;
    if (left !== right) return left < right ? -1 : 1;
  }
  return 0;
}

/**
 * 対象日の範囲へ切り詰める。両端が日の外なら 00:00 / 24:00 に寄せる。
 *
 * **epoch の引き算を使わない。** 分の算出は `two-lane-layout` と同じくローカルフィールドの
 * 読み取りだけで行い、日の内外は暦日の比較で決める。epoch 差で分を出すと、対象日が
 * システム TZ の DST 切替日に当たった時に日の長さが 24h でなくなり、plan / record（フィールド
 * 読み取り）との間に最大 1 時間のズレが生まれる。同じ方式に揃えて、その差自体を無くす。
 */
function clipToDay(event: ExternalEventLayoutInput, day: Date): ClippedEvent | null {
  const startCompare = compareLocalDay(event.startDate, day);
  const endCompare = compareLocalDay(event.endDate, day);

  // 対象日より後に始まる / 対象日より前に終わるものは、この日のカラムに出ない。
  if (startCompare > 0 || endCompare < 0) return null;

  const topMinutes = startCompare < 0 ? 0 : minutesSinceMidnight(event.startDate);
  const bottomMinutes = endCompare > 0 ? DAY_MINUTES : minutesSinceMidnight(event.endDate);

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
  { day, hourHeight, laneWidthPercent }: CalculateExternalEventLayoutOptions,
): Record<string, ExternalEventPosition> {
  const positions: Record<string, ExternalEventPosition> = {};
  if (laneWidthPercent <= 0) return positions;

  const clipped = events
    .map((event) => clipToDay(event, day))
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
        displayStartDate: minutesToLocalDate(day, event.topMinutes),
        displayEndDate: minutesToLocalDate(day, event.bottomMinutes),
      };
    }
  }

  return positions;
}
