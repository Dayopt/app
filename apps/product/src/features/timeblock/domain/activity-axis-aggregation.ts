/**
 * 3 構造モデル（#2162）の集計軸。
 *
 * 旧タグは「所属」と「横断参照」を 1 つの仕組みに混ぜていたため、合計が何を意味するのか
 * 決まらなかった。3 構造ではこれを分離する:
 *
 * | 軸             | 合計の性質     |
 * | -------------- | -------------- |
 * | アクティビティ | 分割（重複なし） |
 * | カテゴリー     | 分割（重複なし） |
 * | セグメント     | **重複しうる**   |
 *
 * 分割の 2 軸では次の不変条件が成立し、これが「集計が濁らない」の実体になる:
 *
 * ```
 * Σ(各アクティビティの時間) + アクティビティなし = 対象期間の全ブロック時間
 * Σ(各カテゴリーの時間)     + 未分類             = 対象期間の全ブロック時間
 * ```
 *
 * セグメント軸ではこれが成立しない（1 アクティビティが複数セグメントに入れるため）。
 * そのため `SegmentAxisAggregate` は `totalMinutes` / `share` を**持たない**。
 * 比率を出せる形にしておくと、重複する軸を分割であるかのように見せる UI
 * （円グラフ・積み上げ棒・「合計 100%」）が書けてしまうため、型で塞いでいる。
 */

/** 集計対象の 1 ブロック（Plan または Record）。 */
export interface ActivityAxisDurationRow {
  /** アクティビティ未設定のブロックは null */
  activityId: string | null;
  minutes: number;
}

/** アクティビティ軸の 1 行。`activityId: null` は「アクティビティなし」。 */
interface ActivityAxisAggregate {
  activityId: string | null;
  plannedMinutes: number;
  recordedMinutes: number;
  hasPlan: boolean;
  hasRecord: boolean;
}

/** カテゴリー軸の 1 行。`categoryId: null` は「未分類」。 */
interface CategoryAxisAggregate {
  categoryId: string | null;
  plannedMinutes: number;
  recordedMinutes: number;
  hasPlan: boolean;
  hasRecord: boolean;
}

/**
 * セグメント軸の 1 行。
 *
 * 意図的に `totalMinutes` / `share` を持たない（重複しうる軸なので合計に意味が無い）。
 * 出してよいのは単体の数字と過去の自分との比較だけ。
 */
interface SegmentAxisAggregate {
  segmentId: string;
  plannedMinutes: number;
  recordedMinutes: number;
}

interface AxisAccumulator {
  plannedMinutes: number;
  recordedMinutes: number;
  hasPlan: boolean;
  hasRecord: boolean;
}

/**
 * Plan / Record duration をアクティビティ別に加算する。
 *
 * `activityId` が null の行（アクティビティ未設定、およびアクティビティ削除で
 * `activity_id = NULL` になった行）は単一の「アクティビティなし」バケットへ畳む。
 * 落とさずに畳むことで、上記の不変条件が成立する。
 */
export function aggregateByActivity(
  plans: ReadonlyArray<ActivityAxisDurationRow>,
  records: ReadonlyArray<ActivityAxisDurationRow>,
): ActivityAxisAggregate[] {
  const totals = new Map<string | null, AxisAccumulator>();
  accumulate(totals, plans, (row) => row.activityId, 'plannedMinutes', 'hasPlan');
  accumulate(totals, records, (row) => row.activityId, 'recordedMinutes', 'hasRecord');

  return Array.from(totals.entries()).map(([activityId, acc]) => ({
    activityId,
    plannedMinutes: roundToTenth(acc.plannedMinutes),
    recordedMinutes: roundToTenth(acc.recordedMinutes),
    hasPlan: acc.hasPlan,
    hasRecord: acc.hasRecord,
  }));
}

/**
 * Plan / Record duration をカテゴリー別に加算する。
 *
 * 「未分類」へ畳むのは 2 種類ある:
 * - カテゴリー未所属のアクティビティ（`categoryIdByActivityId` の値が null）
 * - アクティビティ未設定のブロック（`row.activityId` が null）
 *
 * ユーザーから見るとどちらも「どのカテゴリーにも入っていない時間」の 1 概念なので、
 * 単一バケットへ畳む（#2162 の凍結契約）。map に存在しない activityId
 * （削除済みアクティビティを参照している行）も同じ null バケットへ入れる —
 * 落とすと不変条件が壊れるため。
 */
export function aggregateByCategory(
  plans: ReadonlyArray<ActivityAxisDurationRow>,
  records: ReadonlyArray<ActivityAxisDurationRow>,
  categoryIdByActivityId: ReadonlyMap<string, string | null>,
): CategoryAxisAggregate[] {
  const resolve = (row: ActivityAxisDurationRow): string | null =>
    row.activityId === null ? null : (categoryIdByActivityId.get(row.activityId) ?? null);

  const totals = new Map<string | null, AxisAccumulator>();
  accumulate(totals, plans, resolve, 'plannedMinutes', 'hasPlan');
  accumulate(totals, records, resolve, 'recordedMinutes', 'hasRecord');

  return Array.from(totals.entries()).map(([categoryId, acc]) => ({
    categoryId,
    plannedMinutes: roundToTenth(acc.plannedMinutes),
    recordedMinutes: roundToTenth(acc.recordedMinutes),
    hasPlan: acc.hasPlan,
    hasRecord: acc.hasRecord,
  }));
}

/**
 * Plan / Record duration をセグメント別に加算する。
 *
 * **同じブロックが複数のセグメントに数えられる**（セグメントは所属ではなく横断参照）。
 * したがって戻り値の合計は対象期間の全ブロック時間と一致せず、比率にも意味が無い。
 * 残余バケット（「どのセグメントにも入らない時間」）も返さない — 分割軸ではないので
 * 残余という概念自体が成立しないため。
 *
 * 空のセグメント（アクティビティ 0 件）も 0 分の行として返す。UI が「今週の
 * 『深い仕事』は 0h」と過去比較を出せるようにするため、行ごと消さない。
 */
export function aggregateBySegment(
  plans: ReadonlyArray<ActivityAxisDurationRow>,
  records: ReadonlyArray<ActivityAxisDurationRow>,
  activityIdsBySegmentId: ReadonlyMap<string, ReadonlySet<string>>,
): SegmentAxisAggregate[] {
  return Array.from(activityIdsBySegmentId.entries()).map(([segmentId, activityIds]) => ({
    segmentId,
    plannedMinutes: roundToTenth(sumMatching(plans, activityIds)),
    recordedMinutes: roundToTenth(sumMatching(records, activityIds)),
  }));
}

function sumMatching(
  rows: ReadonlyArray<ActivityAxisDurationRow>,
  activityIds: ReadonlySet<string>,
): number {
  let total = 0;
  for (const row of rows) {
    if (row.activityId !== null && activityIds.has(row.activityId)) {
      total += row.minutes;
    }
  }
  return total;
}

function accumulate(
  totals: Map<string | null, AxisAccumulator>,
  rows: ReadonlyArray<ActivityAxisDurationRow>,
  resolveKey: (row: ActivityAxisDurationRow) => string | null,
  minutesField: 'plannedMinutes' | 'recordedMinutes',
  presenceField: 'hasPlan' | 'hasRecord',
): void {
  for (const row of rows) {
    const key = resolveKey(row);
    const acc = totals.get(key) ?? {
      plannedMinutes: 0,
      recordedMinutes: 0,
      hasPlan: false,
      hasRecord: false,
    };
    acc[minutesField] += row.minutes;
    acc[presenceField] = true;
    totals.set(key, acc);
  }
}

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}
