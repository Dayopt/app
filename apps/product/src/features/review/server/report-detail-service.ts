import 'server-only';

import {
  clipMinutes,
  distributeToTimeOfDay,
  REPORT_TIME_OF_DAY_BUCKETS,
  resolveReportRange,
  shiftReportAnchor,
  type ReportGranularity,
  type ReportWeekStartsOn,
} from '../lib/report-period';

import {
  fetchReportDetailPlans,
  fetchReportDetailRecords,
  REPORT_DETAIL_RECORD_LIMIT,
  type ReportDetailRecordRow,
  type ReportFetchClient,
} from './report-fetchers';

/**
 * 詳細パネル（仕様 §6）が読む 1 アクティビティ分の明細。
 *
 * **期間集計（`getReportPeriod`）とは別 procedure。** 1〜4 章に要るのはスカラーだけで、
 * 箱の明細・中央値・時間帯分布はパネルを開いた時にしか要らない。同じ payload に載せると
 * 年粒度で Record 件数に線形比例して膨らむ（#2576 の設計）。
 *
 * **平均を出さない**（仕様 §0-4）。1 箱の代表値は中央値だけを返し、component 側で平均を
 * 計算する余地も作らない。
 */

/** 充実の 3 値。未回答の記録は数えない。 */
export interface ReportDetailFulfillment {
  low: number;
  medium: number;
  high: number;
}

export interface ReportDetailRecord {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  /** 期間へ clip 済みの長さ（分）。 */
  minutes: number;
  fulfillment: keyof ReportDetailFulfillment | null;
  note: string | null;
}

export interface ReportDetailTrendPoint {
  /** 期間の初日（`YYYY-MM-DD`）。表示側はラベルを持たず、並び順だけを使う。 */
  key: string;
  recordedMinutes: number;
}

export interface ReportActivityDetailResult {
  recordedMinutes: number;
  plannedMinutes: number;
  plannedPastMinutes: number;
  plannedPastBoxes: number;
  /** 期間内の記録ボックス長の中央値。0 件は `null`（**平均ではない**）。 */
  medianBoxMinutes: number | null;
  fulfillment: ReportDetailFulfillment;
  /** `REPORT_TIME_OF_DAY_BUCKETS` と同 index。分単位・重なり分は按分済み。 */
  timeOfDay: number[];
  /** 直近 6 期間（末尾が表示中の期間）。`includeTrend: false` なら空配列。 */
  trend: ReportDetailTrendPoint[];
  /** 期間内の記録明細。`start_at` 昇順、上限 200 件。 */
  records: ReportDetailRecord[];
}

interface ReportActivityDetailInput {
  /** `null` はアクティビティ未設定の記録。 */
  activityId: string | null;
  anchorDate: string;
  granularity: ReportGranularity;
  timezone: string;
  weekStartsOn: ReportWeekStartsOn;
  /** モバイルは推移を出さないので `false` で呼ぶ（#2582）。 */
  includeTrend: boolean;
}

/** 推移に出す期間数（表示中の期間を含む）。 */
const TREND_PERIOD_COUNT = 6;

function isFulfillmentLevel(value: string | null): value is keyof ReportDetailFulfillment {
  return value === 'low' || value === 'medium' || value === 'high';
}

/**
 * 中央値（分）。**平均を返さない。**
 *
 * 偶数個のときは中央 2 つの平均を取る（統計的な中央値の定義。1 箱の代表値としての
 * 「平均を出さない」とは別）。0 件は `null` で、表示側は `—` を出す。
 */
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? null;
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

class ReportDetailService {
  constructor(private readonly supabase: ReportFetchClient) {}

  async getActivityDetail(
    userId: string,
    input: ReportActivityDetailInput,
    now: Date = new Date(),
  ): Promise<ReportActivityDetailResult> {
    const { activityId, anchorDate, granularity, timezone, weekStartsOn, includeTrend } = input;
    const range = resolveReportRange(anchorDate, granularity, timezone, weekStartsOn);

    // 推移は「表示中を含む直近 6 期間」。6 回 fetch せず、最も古い期間の開始から
    // 現在の期間の終端までを 1 回で取り、期間ごとに clip する。
    // `shiftReportAnchor` は ±1 期間ずつしか動かないので、1 つずつ遡って古い順に並べ直す。
    const trendRanges = includeTrend
      ? this.resolveTrendRanges(anchorDate, granularity, timezone, weekStartsOn)
      : [range];

    const fetchRange = {
      startAt: trendRanges[0]?.startAt ?? range.startAt,
      endAt: range.endAt,
    };

    const [records, plans] = await Promise.all([
      fetchReportDetailRecords(this.supabase, userId, activityId, fetchRange),
      fetchReportDetailPlans(this.supabase, userId, activityId, range),
    ]);

    const periodRecords = records.filter(
      (record) => clipMinutes(record.start_at, record.end_at, range.startAt, range.endAt) > 0,
    );

    return {
      ...this.summarizeRecords(periodRecords, range, timezone),
      ...this.summarizePlans(plans, range, now.getTime()),
      trend: includeTrend ? this.buildTrend(records, trendRanges) : [],
      records: this.toDetailRecords(periodRecords, range),
    };
  }

  /** 表示中を含む直近 6 期間を、古い順に返す。 */
  private resolveTrendRanges(
    anchorDate: string,
    granularity: ReportGranularity,
    timezone: string,
    weekStartsOn: ReportWeekStartsOn,
  ) {
    const anchors = [anchorDate];
    for (let index = 1; index < TREND_PERIOD_COUNT; index += 1) {
      const previous = anchors[anchors.length - 1];
      if (previous === undefined) break;
      anchors.push(shiftReportAnchor(previous, granularity, -1));
    }

    return anchors
      .reverse()
      .map((anchor) => resolveReportRange(anchor, granularity, timezone, weekStartsOn));
  }

  private summarizeRecords(
    records: ReportDetailRecordRow[],
    range: { startAt: string; endAt: string },
    timezone: string,
  ): Pick<
    ReportActivityDetailResult,
    'recordedMinutes' | 'medianBoxMinutes' | 'fulfillment' | 'timeOfDay'
  > {
    const fulfillment: ReportDetailFulfillment = { low: 0, medium: 0, high: 0 };
    const timeOfDay = REPORT_TIME_OF_DAY_BUCKETS.map(() => 0);
    const boxMinutes: number[] = [];
    let recordedMinutes = 0;

    for (const record of records) {
      const minutes = clipMinutes(record.start_at, record.end_at, range.startAt, range.endAt);
      if (minutes <= 0) continue;

      recordedMinutes += minutes;
      boxMinutes.push(minutes);

      if (isFulfillmentLevel(record.fulfillment)) fulfillment[record.fulfillment] += 1;

      // 時間帯も期間の外へはみ出した分は数えない。clip してから按分する
      const clippedStart =
        Date.parse(record.start_at) < Date.parse(range.startAt) ? range.startAt : record.start_at;
      const clippedEnd =
        Date.parse(record.end_at) > Date.parse(range.endAt) ? range.endAt : record.end_at;

      const distributed = distributeToTimeOfDay(clippedStart, clippedEnd, timezone);
      for (let index = 0; index < distributed.length; index += 1) {
        timeOfDay[index] = (timeOfDay[index] ?? 0) + (distributed[index] ?? 0);
      }
    }

    return {
      recordedMinutes,
      medianBoxMinutes: median(boxMinutes),
      fulfillment,
      timeOfDay,
    };
  }

  private summarizePlans(
    plans: { start_at: string; end_at: string }[],
    range: { startAt: string; endAt: string },
    nowMs: number,
  ): Pick<
    ReportActivityDetailResult,
    'plannedMinutes' | 'plannedPastMinutes' | 'plannedPastBoxes'
  > {
    let plannedMinutes = 0;
    let plannedPastMinutes = 0;
    let plannedPastBoxes = 0;

    for (const plan of plans) {
      const minutes = clipMinutes(plan.start_at, plan.end_at, range.startAt, range.endAt);
      if (minutes <= 0) continue;

      plannedMinutes += minutes;
      // 「予定比」はまだ来ていない予定を分母に入れない（期間集計と同じ規則）。
      // ISO 文字列の辞書順比較は境界で誤判定しうるので数値で比べる
      if (Date.parse(plan.start_at) <= nowMs) {
        plannedPastMinutes += minutes;
        plannedPastBoxes += 1;
      }
    }

    return { plannedMinutes, plannedPastMinutes, plannedPastBoxes };
  }

  private buildTrend(
    records: ReportDetailRecordRow[],
    ranges: { startAt: string; endAt: string; buckets: { key: string }[] }[],
  ): ReportDetailTrendPoint[] {
    return ranges.map((periodRange) => ({
      key: periodRange.buckets[0]?.key ?? periodRange.startAt,
      recordedMinutes: records.reduce(
        (total, record) =>
          total +
          clipMinutes(record.start_at, record.end_at, periodRange.startAt, periodRange.endAt),
        0,
      ),
    }));
  }

  private toDetailRecords(
    records: ReportDetailRecordRow[],
    range: { startAt: string; endAt: string },
  ): ReportDetailRecord[] {
    return records
      .map((record) => ({
        id: record.id,
        title: record.title,
        startAt: record.start_at,
        endAt: record.end_at,
        minutes: clipMinutes(record.start_at, record.end_at, range.startAt, range.endAt),
        fulfillment: isFulfillmentLevel(record.fulfillment) ? record.fulfillment : null,
        note: record.note,
      }))
      .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt))
      .slice(0, REPORT_DETAIL_RECORD_LIMIT);
  }
}

export function createReportDetailService(supabase: ReportFetchClient) {
  return new ReportDetailService(supabase);
}
