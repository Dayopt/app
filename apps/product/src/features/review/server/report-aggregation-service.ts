import 'server-only';

import {
  clipMinutes,
  distributeToBuckets,
  resolveNextReportRange,
  resolvePreviousReportRange,
  resolveReportRange,
  resolveZonedDayKey,
  type ReportGranularity,
  type ReportWeekStartsOn,
} from '../lib/report-period';

import {
  fetchReportActivities,
  fetchReportCategories,
  fetchReportPlans,
  fetchReportRecords,
  fetchReportUnconvertedExternalEvents,
  type ReportActivityRow,
  type ReportCategoryRow,
  type ReportFetchClient,
  type ReportGhostEventRow,
  type ReportPlanRow,
  type ReportRecordRow,
} from './report-fetchers';

/**
 * `/report` の 1〜4 章が読む期間集計。
 *
 * **返すのはアクティビティ別のスカラーだけ。** フィルタ（カテゴリ / 未分類 / 余白）・
 * セグメントレンズ・分母・見積もりの鏡・羅針盤の座標は、すべて client の純粋関数
 * （`domain/report/`）が導出する。トグルのたびにサーバーへ往復させないため。
 *
 * **箱の明細は載せない。** 1〜4 章に要る箱の情報は件数（`plannedPastBoxes` / `recordBoxes`）と
 * 充実の回答数だけで、どちらもスカラーに畳める。明細・中央値・時間帯分布が要るのは
 * 詳細パネルだけなので、開いた時に専用 procedure で取る。年粒度で payload が Record 件数に
 * 線形比例するのを構造的に断つ。
 */

/** 充実の 3 値（`records.fulfillment`）。UI では 消耗 / 普通 / 充実。 */
export interface ReportFulfillmentCounts {
  low: number;
  medium: number;
  high: number;
}

export interface ReportActivityAggregate {
  /** `null` はアクティビティ未設定の記録・予定。表示側は未分類として扱う。 */
  activityId: string | null;
  activityName: string | null;
  /** `null` は未分類（`activities.category_id IS NULL`、またはアクティビティ未設定）。 */
  categoryId: string | null;
  categoryName: string | null;
  /** カテゴリーの色名（10 色）。表示側が semantic token へ写す。 */
  categoryColor: string | null;
  categoryIcon: string | null;
  /** アーカイブ済みでも期間内にインクがあれば行を返す。表示側の注記に使う。 */
  archived: boolean;
  /** 仕様の `rec`。期間へ clip 済み。 */
  recordedMinutes: number;
  /** 仕様の `plan`。期間へ clip 済み。 */
  plannedMinutes: number;
  /** 仕様の `planPast`。開始が `nowAt` 以下の予定だけ。未来の予定で係数を汚さない。 */
  plannedPastMinutes: number;
  /** 仕様の `planBoxesPast`。見積もりの鏡の候補条件に使う。 */
  plannedPastBoxes: number;
  recordBoxes: number;
  fulfillment: ReportFulfillmentCounts;
  /** `period.bucketKeys` と同 index。記録ぶん。0 時またぎは按分済み。 */
  byBucket: number[];
}

interface ReportPeriodSummary {
  startAt: string;
  endAt: string;
  /** 余白の分母（仕様の `L`）。DST を無視した公称値。 */
  lengthMinutes: number;
  bucketKeys: string[];
}

interface ReportPeriodResult {
  period: ReportPeriodSummary;
  previous: Omit<ReportPeriodSummary, 'bucketKeys'>;
  /** `plannedPastMinutes` の判定基準。client の時計とずれてもサーバーの値で一貫させる。 */
  nowAt: string;
  activities: ReportActivityAggregate[];
  /** 前期間の Δ 表示用。記録合計だけを持つ。 */
  previousActivities: { activityId: string | null; recordedMinutes: number }[];
  /** 4 章「来週はすでに N 分の箱が置かれています」。次期間の予定合計。 */
  nextPeriodPlannedMinutes: number;
  /** 4 章「未分類の記録が N 件」。期間内の記録のうちカテゴリー未設定のもの。 */
  uncategorizedRecordCount: number;
  /**
   * 4 章「未確認の外部カレンダー予定が N 件」。**期間に限定しない**（仕様 §4.4）。
   * 外部カレンダー未接続・選択なしなら 0。
   *
   * **Free / Pro の切れ目はここ。** カレンダー画面の ghost 表示（`externalCalendar.listEvents`）は
   * `proProcedure` にある（#1962）。課金 enforcement を有効にする時（#1669 配下）、この件数も
   * 同じゲートに揃える必要がある — 揃えないと「Pro を切ると ghost は見えないのに、レポートは
   * 件数を出して押せる」非対称になる。enforcement が off の今は実害が無いので、切れ目の
   * 明示だけに留める。
   */
  unconvertedExternalEventCount: number;
  /** 4 章「仕分ける」のジャンプ先。期間内で最も早い未分類の記録。無ければ `null`。 */
  firstUncategorizedRecord: ReportJumpTarget | null;
  /** 4 章「確認する」のジャンプ先。最も早い未変換の外部予定。無ければ `null`。 */
  firstUnconvertedExternalEvent: Omit<ReportJumpTarget, 'id'> | null;
}

/** カレンダーへのジャンプ先（4 章）。`dayKey` はユーザーの timezone での壁時計日付。 */
interface ReportJumpTarget {
  id: string;
  dayKey: string;
}

interface ReportPeriodInput {
  anchorDate: string;
  granularity: ReportGranularity;
  timezone: string;
  weekStartsOn: ReportWeekStartsOn;
}

/** 集計の途中状態。`ReportActivityAggregate` から表示用のメタを除いたもの。 */
interface ActivityBucketState {
  recordedMinutes: number;
  plannedMinutes: number;
  plannedPastMinutes: number;
  plannedPastBoxes: number;
  recordBoxes: number;
  fulfillment: ReportFulfillmentCounts;
  byBucket: number[];
}

function createState(bucketCount: number): ActivityBucketState {
  return {
    recordedMinutes: 0,
    plannedMinutes: 0,
    plannedPastMinutes: 0,
    plannedPastBoxes: 0,
    recordBoxes: 0,
    fulfillment: { low: 0, medium: 0, high: 0 },
    byBucket: Array.from({ length: bucketCount }, () => 0),
  };
}

function isFulfillmentLevel(value: string | null): value is keyof ReportFulfillmentCounts {
  return value === 'low' || value === 'medium' || value === 'high';
}

/**
 * 公開するのは `createReportAggregationService` だけ。呼び出し側（router / test）は
 * factory 経由で受け取り、戻り値の型は推論で拾う。
 */
class ReportAggregationService {
  constructor(private readonly supabase: ReportFetchClient) {}

  async getReportPeriod(
    userId: string,
    input: ReportPeriodInput,
    now: Date = new Date(),
  ): Promise<ReportPeriodResult> {
    const { anchorDate, granularity, timezone, weekStartsOn } = input;
    const range = resolveReportRange(anchorDate, granularity, timezone, weekStartsOn);
    const previousRange = resolvePreviousReportRange(
      anchorDate,
      granularity,
      timezone,
      weekStartsOn,
    );
    const nextRange = resolveNextReportRange(anchorDate, granularity, timezone, weekStartsOn);
    const nowAt = now.toISOString();

    const [records, plans, previousRecords, nextPlans, activities, categories, ghostEvents] =
      await Promise.all([
        fetchReportRecords(this.supabase, userId, range),
        fetchReportPlans(this.supabase, userId, range),
        fetchReportRecords(this.supabase, userId, previousRange),
        fetchReportPlans(this.supabase, userId, nextRange),
        fetchReportActivities(this.supabase, userId),
        fetchReportCategories(this.supabase, userId),
        fetchReportUnconvertedExternalEvents(this.supabase, userId, now),
      ]);

    const activityById = new Map(activities.map((row) => [row.id, row]));
    const categoryById = new Map(categories.map((row) => [row.id, row]));

    const states = this.buildStates(records, plans, range, now.getTime());
    const uncategorizedRecords = this.selectUncategorizedRecords(records, activityById, range);

    return {
      period: {
        startAt: range.startAt,
        endAt: range.endAt,
        lengthMinutes: range.lengthMinutes,
        bucketKeys: range.buckets.map((bucket) => bucket.key),
      },
      previous: {
        startAt: previousRange.startAt,
        endAt: previousRange.endAt,
        lengthMinutes: previousRange.lengthMinutes,
      },
      nowAt,
      activities: [...states].map(([activityId, state]) =>
        this.toAggregate(activityId, state, activityById, categoryById),
      ),
      previousActivities: this.buildPreviousTotals(previousRecords, previousRange),
      nextPeriodPlannedMinutes: nextPlans.reduce(
        (total, plan) =>
          total + clipMinutes(plan.start_at, plan.end_at, nextRange.startAt, nextRange.endAt),
        0,
      ),
      uncategorizedRecordCount: uncategorizedRecords.length,
      unconvertedExternalEventCount: ghostEvents.length,
      firstUncategorizedRecord: this.toFirstJumpTarget(uncategorizedRecords, timezone),
      firstUnconvertedExternalEvent: this.toFirstGhostDay(ghostEvents, timezone),
    };
  }

  private buildStates(
    records: ReportRecordRow[],
    plans: ReportPlanRow[],
    range: ReturnType<typeof resolveReportRange>,
    nowMs: number,
  ): Map<string | null, ActivityBucketState> {
    // `activityId` は null を取りうる。Map は null をキーにできるので番兵文字列を作らない
    // （UUID と衝突しない値を捻り出す必要がなく、変換の往復も消える）。
    const states = new Map<string | null, ActivityBucketState>();
    const ensure = (activityId: string | null): ActivityBucketState => {
      const existing = states.get(activityId);
      if (existing) return existing;
      const created = createState(range.buckets.length);
      states.set(activityId, created);
      return created;
    };

    for (const record of records) {
      const minutes = clipMinutes(record.start_at, record.end_at, range.startAt, range.endAt);
      if (minutes <= 0) continue;

      const state = ensure(record.activity_id);
      state.recordedMinutes += minutes;
      state.recordBoxes += 1;

      // 0 時またぎはここで日境界へ按分される。ブロック自体は分割しない。
      const distributed = distributeToBuckets(record.start_at, record.end_at, range.buckets);
      for (let index = 0; index < distributed.length; index += 1) {
        state.byBucket[index] = (state.byBucket[index] ?? 0) + (distributed[index] ?? 0);
      }

      if (isFulfillmentLevel(record.fulfillment)) {
        state.fulfillment[record.fulfillment] += 1;
      }
    }

    for (const plan of plans) {
      const minutes = clipMinutes(plan.start_at, plan.end_at, range.startAt, range.endAt);
      if (minutes <= 0) continue;

      const state = ensure(plan.activity_id);
      state.plannedMinutes += minutes;

      // 「予定比」と「見積もりの鏡」は、まだ来ていない予定を分母に入れない。
      // 開始が現在時刻を過ぎた予定だけを planPast として数える。
      //
      // ISO 文字列を直接比較しない。Supabase の timestamptz は `+00:00` 付きで返り、
      // `Date#toISOString()` の `Z` 表記や小数秒の有無と字面が揃わないため、
      // 辞書順比較は境界付近で誤判定しうる。必ず数値へ落として比べる。
      if (Date.parse(plan.start_at) <= nowMs) {
        state.plannedPastMinutes += minutes;
        state.plannedPastBoxes += 1;
      }
    }

    return states;
  }

  private toAggregate(
    activityId: string | null,
    state: ActivityBucketState,
    activityById: Map<string, ReportActivityRow>,
    categoryById: Map<string, ReportCategoryRow>,
  ): ReportActivityAggregate {
    const activity = activityId === null ? undefined : activityById.get(activityId);
    const category =
      activity?.category_id == null ? undefined : categoryById.get(activity.category_id);

    return {
      activityId,
      activityName: activity?.name ?? null,
      categoryId: category?.id ?? null,
      categoryName: category?.name ?? null,
      categoryColor: category?.color ?? null,
      categoryIcon: category?.icon ?? null,
      archived: activity?.archived_at != null,
      recordedMinutes: state.recordedMinutes,
      plannedMinutes: state.plannedMinutes,
      plannedPastMinutes: state.plannedPastMinutes,
      plannedPastBoxes: state.plannedPastBoxes,
      recordBoxes: state.recordBoxes,
      fulfillment: state.fulfillment,
      byBucket: state.byBucket,
    };
  }

  private buildPreviousTotals(
    records: ReportRecordRow[],
    range: { startAt: string; endAt: string },
  ): { activityId: string | null; recordedMinutes: number }[] {
    const totals = new Map<string | null, number>();

    for (const record of records) {
      const minutes = clipMinutes(record.start_at, record.end_at, range.startAt, range.endAt);
      if (minutes <= 0) continue;
      totals.set(record.activity_id, (totals.get(record.activity_id) ?? 0) + minutes);
    }

    return [...totals].map(([activityId, recordedMinutes]) => ({ activityId, recordedMinutes }));
  }

  /**
   * 未分類の記録（4 章 1 行目）。
   *
   * アクティビティ未設定の記録も「カテゴリーが決まっていない記録」として数える。
   * 仕分けの導線が向かう先は同じ（記録を開いてアクティビティ / カテゴリーを付ける）。
   *
   * **件数とジャンプ先を同じ集合から出す。** 別々の query で数えると、「N 件」と
   * 「最初の 1 件」が食い違って、押した先に何も無い日が開きうる。
   */
  private selectUncategorizedRecords(
    records: ReportRecordRow[],
    activityById: Map<string, ReportActivityRow>,
    range: { startAt: string; endAt: string },
  ): ReportRecordRow[] {
    return records.filter((record) => {
      // 期間へ clip すると長さ 0 になる行（境界に接するだけ・長さ 0 の記録）は数えない。
      // `recordBoxes` と件数がずれると、4 章の「N 件」を押した先に何も無い事故になる。
      if (clipMinutes(record.start_at, record.end_at, range.startAt, range.endAt) <= 0) {
        return false;
      }
      if (record.activity_id === null) return true;
      return activityById.get(record.activity_id)?.category_id == null;
    });
  }

  /** 最も早い記録をジャンプ先に選ぶ。`start_at` は文字列比較せず数値で比べる。 */
  private toFirstJumpTarget(records: ReportRecordRow[], timezone: string): ReportJumpTarget | null {
    const first = records.reduce<ReportRecordRow | null>(
      (earliest, record) =>
        earliest === null || Date.parse(record.start_at) < Date.parse(earliest.start_at)
          ? record
          : earliest,
      null,
    );

    if (first === null) return null;
    return { id: first.id, dayKey: resolveZonedDayKey(first.start_at, timezone) };
  }

  /** 最も早い未変換の外部予定の日。id は使わない（ghost を開く UI が無い）。 */
  private toFirstGhostDay(
    events: ReportGhostEventRow[],
    timezone: string,
  ): { dayKey: string } | null {
    const first = events.reduce<ReportGhostEventRow | null>(
      (earliest, event) =>
        earliest === null || Date.parse(event.start_at) < Date.parse(earliest.start_at)
          ? event
          : earliest,
      null,
    );

    if (first === null) return null;
    return { dayKey: resolveZonedDayKey(first.start_at, timezone) };
  }
}

export function createReportAggregationService(supabase: ReportFetchClient) {
  return new ReportAggregationService(supabase);
}
