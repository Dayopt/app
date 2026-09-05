/**
 * レポート 1〜4 章の派生（client 側の純粋関数）。
 *
 * サーバーはアクティビティ別のスカラーだけを返し、フィルタ・レンズ・分母・鏡・羅針盤は
 * すべてここで導出する。カテゴリのトグルや余白の on/off でサーバーへ往復させないため。
 *
 * **評価しない。** スコア・達成率・平均・ストリーク・良し悪しの判定はここに置かない
 * （仕様 §0-2 / §12）。閾値未満は数字を作らず沈黙する。
 */

import type { ReportActivityAggregate } from '../../server/report-aggregation-service';

// ============================================================
// 閾値（仕様 付録A）
// ============================================================

/**
 * 羅針盤に点が生まれる充実の回答数。これ未満は待機リストへ。
 */
export const COMPASS_MIN_FULFILLMENT = 5;
/**
 * 見積もりの鏡の候補になる過去予定の箱数。
 */
const MIRROR_MIN_PLAN_BOXES = 3;
/**
 * 見積もりの鏡の候補になる過去予定の分数。
 */
const MIRROR_MIN_PLAN_MINUTES = 30;
/**
 * 予定比を出す最小の過去予定分数。これ未満は比率を作らない。
 */
const EXECUTION_MIN_PLAN_MINUTES = 15;
/**
 * 見積もりの鏡に出す最大件数。
 */
const MIRROR_MAX_ROWS = 3;

// ============================================================
// フィルタとレンズ
// ============================================================

/** 未分類（カテゴリー未設定）を表す擬似カテゴリのキー。 */
export const UNCATEGORIZED_KEY = '__uncategorized';

export interface ReportFilterState {
  /** ここに載っていないカテゴリは可視。新しく作ったカテゴリが自動で可視になる。 */
  hiddenCategoryIds: readonly string[];
  uncategorizedHidden: boolean;
  /** 余白（未記録時間）を分母に入れるか。仕様の `__margin`。 */
  marginHidden: boolean;
}

export const defaultReportFilterState: ReportFilterState = {
  hiddenCategoryIds: [],
  uncategorizedHidden: false,
  marginHidden: false,
};

/**
 * 分母に入れるアクティビティを絞る（仕様の `visA`）。
 *
 * カテゴリー未設定のアクティビティと、アクティビティ未設定の行は「未分類」として
 * まとめて扱う。
 */
export function resolveVisibleActivities(
  activities: readonly ReportActivityAggregate[],
  filter: ReportFilterState,
): ReportActivityAggregate[] {
  const hidden = new Set(filter.hiddenCategoryIds);
  return activities.filter((activity) => {
    if (activity.categoryId === null) return !filter.uncategorizedHidden;
    return !hidden.has(activity.categoryId);
  });
}

/**
 * セグメントレンズを重ねる（仕様 §2.4）。
 *
 * `activityIds` が `null` なら「すべて」（レンズなし）。レンズ中は宇宙が
 * `segment.activityIds ∩ visible` に縮む。
 */
export function applySegmentLens(
  activities: readonly ReportActivityAggregate[],
  activityIds: readonly string[] | null,
): ReportActivityAggregate[] {
  if (activityIds === null) return [...activities];
  const members = new Set(activityIds);
  return activities.filter(
    (activity) => activity.activityId !== null && members.has(activity.activityId),
  );
}

// ============================================================
// 分母（1 章）
// ============================================================

export interface ReportDenominators {
  /** フィルタを無視した全アクティビティの記録合計。余白の計算に使う。 */
  totalAllMinutes: number;
  /** 余白（未記録時間）。**フィルタで変わらない**。 */
  marginMinutes: number;
  /** 見えているインク（仕様の `V`）。 */
  visibleMinutes: number;
  /** 決算バーの全長（仕様の `track`）。0 除算を避けるため最小 1。 */
  trackMinutes: number;
}

/**
 * 決算バーの分母を出す（仕様 §2.3）。
 *
 * `marginMinutes` はフィルタに依存しない。カテゴリを 1 つ隠しても余白の値は動かず、
 * 動くのは `visibleMinutes` と `trackMinutes` だけ（仕様 §13-2）。
 *
 * レンズ中は余白を分母に入れない（セグメント内の記録合計が 100%）。
 */
export function computeDenominators(options: {
  allActivities: readonly ReportActivityAggregate[];
  visibleActivities: readonly ReportActivityAggregate[];
  lengthMinutes: number;
  marginVisible: boolean;
}): ReportDenominators {
  const totalAllMinutes = sumRecorded(options.allActivities);
  const marginMinutes = options.lengthMinutes - totalAllMinutes;
  const visibleMinutes = sumRecorded(options.visibleActivities);
  const trackMinutes = Math.max(
    1,
    visibleMinutes + (options.marginVisible ? Math.max(0, marginMinutes) : 0),
  );

  return { totalAllMinutes, marginMinutes, visibleMinutes, trackMinutes };
}

function sumRecorded(activities: readonly ReportActivityAggregate[]): number {
  return activities.reduce((total, activity) => total + activity.recordedMinutes, 0);
}

/** `track` に対する百分率。表示直前に整数へ丸める。 */
export function toPercent(minutes: number, trackMinutes: number): number {
  return Math.round((minutes / Math.max(1, trackMinutes)) * 100);
}

// ============================================================
// 1 章: 決算バーと凡例
// ============================================================

export interface ReportAllocationSlice {
  /** カテゴリー ID。未分類は `UNCATEGORIZED_KEY`。レンズ中はアクティビティ ID。 */
  key: string;
  label: string | null;
  color: string | null;
  icon: string | null;
  minutes: number;
  percent: number;
}

/**
 * 決算バーと凡例のセグメント（仕様 §4.1）。
 *
 * 通常モードはカテゴリー別、レンズ中はアクティビティ別に割る。
 * **余白のセグメントは作らない** — 余白は背景トラック（紙）として残し、塗らない。
 * 記録が 0 のセグメントは行を持たない。
 */
export function buildAllocationSlices(
  visibleActivities: readonly ReportActivityAggregate[],
  trackMinutes: number,
  mode: 'category' | 'activity',
): ReportAllocationSlice[] {
  const slices = new Map<string, ReportAllocationSlice>();

  for (const activity of visibleActivities) {
    if (activity.recordedMinutes <= 0) continue;

    const key =
      mode === 'activity'
        ? (activity.activityId ?? UNCATEGORIZED_KEY)
        : (activity.categoryId ?? UNCATEGORIZED_KEY);
    const existing = slices.get(key);

    if (existing) {
      existing.minutes += activity.recordedMinutes;
      continue;
    }

    slices.set(key, {
      key,
      label: mode === 'activity' ? activity.activityName : activity.categoryName,
      color: activity.categoryColor,
      icon: activity.categoryIcon,
      minutes: activity.recordedMinutes,
      percent: 0,
    });
  }

  return [...slices.values()]
    .map((slice) => ({ ...slice, percent: toPercent(slice.minutes, trackMinutes) }))
    .sort((a, b) => b.minutes - a.minutes);
}

/** 未分類の占める割合（1 章ヘッドライン右端）。`V` が 0 なら 0%。 */
export function computeUncategorizedPercent(
  visibleActivities: readonly ReportActivityAggregate[],
  visibleMinutes: number,
): number {
  if (visibleMinutes <= 0) return 0;
  const uncategorized = visibleActivities
    .filter((activity) => activity.categoryId === null)
    .reduce((total, activity) => total + activity.recordedMinutes, 0);
  return Math.round((uncategorized / visibleMinutes) * 100);
}

/**
 * 前期間との差（1 章ヘッドラインの Δ）。
 *
 * 前期間にインクが 1 分も無ければ `null`（比較する相手がいないので数字を作らない）。
 * 比較は現在と同じフィルタ・レンズを通した集合で行う。
 */
export function computePreviousDelta(options: {
  visibleMinutes: number;
  previousActivities: readonly { activityId: string | null; recordedMinutes: number }[];
  visibleActivityIds: ReadonlySet<string | null>;
}): number | null {
  const previousVisible = options.previousActivities
    .filter((row) => options.visibleActivityIds.has(row.activityId))
    .reduce((total, row) => total + row.recordedMinutes, 0);

  const previousTotal = options.previousActivities.reduce(
    (total, row) => total + row.recordedMinutes,
    0,
  );
  if (previousTotal < 1) return null;

  return options.visibleMinutes - previousVisible;
}

// ============================================================
// 1 章: セグメント別バー
// ============================================================

export interface ReportSegmentBar {
  segmentId: string;
  name: string;
  minutes: number;
  /** `track` に対する割合。100% で頭打ち。 */
  percent: number;
}

/**
 * セグメント別のバー（仕様 §4.1）。
 *
 * セグメント同士は**重複してよい**。合計・円グラフは作らない。
 */
export function buildSegmentBars(
  visibleActivities: readonly ReportActivityAggregate[],
  segments: readonly { id: string; name: string; activityIds: readonly string[] }[],
  trackMinutes: number,
): ReportSegmentBar[] {
  const minutesByActivity = new Map<string, number>();
  for (const activity of visibleActivities) {
    if (activity.activityId === null) continue;
    minutesByActivity.set(
      activity.activityId,
      (minutesByActivity.get(activity.activityId) ?? 0) + activity.recordedMinutes,
    );
  }

  return segments.map((segment) => {
    const minutes = segment.activityIds.reduce(
      (total, activityId) => total + (minutesByActivity.get(activityId) ?? 0),
      0,
    );
    return {
      segmentId: segment.id,
      name: segment.name,
      minutes,
      percent: Math.min(100, toPercent(minutes, trackMinutes)),
    };
  });
}

// ============================================================
// 1 章: 日別のインク
// ============================================================

export interface ReportInkColumn {
  key: string;
  /** カテゴリー別の積み上げ。記録 0 のカテゴリは含まない。 */
  stacks: { key: string; label: string | null; color: string | null; minutes: number }[];
  totalMinutes: number;
}

/**
 * 日別（週）／週別（月）／月別（年）のインク（仕様 §4.1）。
 *
 * 高さは呼び出し側が `maxColumnMinutes` で比例配分する。ここでは数値だけを返す。
 */
export function buildInkColumns(
  visibleActivities: readonly ReportActivityAggregate[],
  bucketKeys: readonly string[],
): ReportInkColumn[] {
  return bucketKeys.map((key, index) => {
    const stacks = new Map<string, ReportInkColumn['stacks'][number]>();

    for (const activity of visibleActivities) {
      const minutes = activity.byBucket[index] ?? 0;
      if (minutes <= 0) continue;

      const stackKey = activity.categoryId ?? UNCATEGORIZED_KEY;
      const existing = stacks.get(stackKey);
      if (existing) {
        existing.minutes += minutes;
        continue;
      }
      stacks.set(stackKey, {
        key: stackKey,
        label: activity.categoryName,
        color: activity.categoryColor,
        minutes,
      });
    }

    const list = [...stacks.values()].sort((a, b) => b.minutes - a.minutes);
    return {
      key,
      stacks: list,
      totalMinutes: list.reduce((total, stack) => total + stack.minutes, 0),
    };
  });
}

/** 日別インクの縦軸スケール。全列が 0 でも 1 を返す（0 除算防止）。 */
export function maxInkColumnMinutes(columns: readonly ReportInkColumn[]): number {
  return Math.max(1, ...columns.map((column) => column.totalMinutes));
}

// ============================================================
// 2 章: 執行
// ============================================================

export interface ReportExecutionRow {
  activityId: string | null;
  name: string | null;
  categoryName: string | null;
  color: string | null;
  archived: boolean;
  recordedMinutes: number;
  plannedMinutes: number;
  plannedPastMinutes: number;
  /** 記録バーの幅（0〜1）。 */
  recordedRatio: number;
  /** 予定バー（破線）の幅（0〜1）。予定が無ければ `null` で、バーを描かない。 */
  plannedRatio: number | null;
  /**
   * 予定比（%）。`plannedPastMinutes` が閾値未満なら `null`。
   * 数えるに足りない回数で比率を作らない（仕様 §0-4）。
   */
  planRatioPercent: number | null;
}

/**
 * 2 章の行（仕様 §4.2）。
 *
 * 記録か予定のどちらかがある行をすべて出す。**足切りしない**（決算の完全性）。
 */
export function buildExecutionRows(
  visibleActivities: readonly ReportActivityAggregate[],
): ReportExecutionRow[] {
  const rows = visibleActivities.filter(
    (activity) => activity.recordedMinutes > 0 || activity.plannedMinutes > 0,
  );

  const scale = Math.max(
    1,
    ...rows.map((row) => Math.max(row.recordedMinutes, row.plannedMinutes)),
  );

  return rows
    .map((activity) => ({
      activityId: activity.activityId,
      name: activity.activityName,
      categoryName: activity.categoryName,
      color: activity.categoryColor,
      archived: activity.archived,
      recordedMinutes: activity.recordedMinutes,
      plannedMinutes: activity.plannedMinutes,
      plannedPastMinutes: activity.plannedPastMinutes,
      recordedRatio: activity.recordedMinutes / scale,
      plannedRatio: activity.plannedMinutes > 0 ? activity.plannedMinutes / scale : null,
      planRatioPercent:
        activity.plannedPastMinutes >= EXECUTION_MIN_PLAN_MINUTES
          ? Math.round((activity.recordedMinutes / activity.plannedPastMinutes) * 100)
          : null,
    }))
    .sort((a, b) => b.recordedMinutes - a.recordedMinutes);
}

// ============================================================
// 2 章: 見積もりの鏡
// ============================================================

export type ReportMirrorTone = 'over' | 'under' | 'onPlan';

export interface ReportMirrorRow {
  activityId: string | null;
  name: string | null;
  categoryName: string | null;
  color: string | null;
  /** `rec / planPast`。1 より大きいほど予定より伸びている。 */
  coefficient: number;
  tone: ReportMirrorTone;
}

/** 「予定より伸びる」と読む係数の下限。 */
const MIRROR_OVER_THRESHOLD = 1.12;
/** 「切り上げがち」と読む係数の上限。 */
const MIRROR_UNDER_THRESHOLD = 0.88;

/**
 * 見積もりの鏡（仕様 §4.2）。
 *
 * 候補は「過去予定が 30 分以上」「記録がある」「過去予定の箱が 3 つ以上」の 3 条件をすべて
 * 満たす行だけ。`|coef − 1|` の降順（癖の強い順）で最大 3 件。
 * **全体遵守率のような合成値は作らない。**
 */
export function buildMirrorRows(
  visibleActivities: readonly ReportActivityAggregate[],
): ReportMirrorRow[] {
  return visibleActivities
    .filter(
      (activity) =>
        activity.plannedPastMinutes >= MIRROR_MIN_PLAN_MINUTES &&
        activity.recordedMinutes > 0 &&
        activity.plannedPastBoxes >= MIRROR_MIN_PLAN_BOXES,
    )
    .map((activity) => {
      const coefficient = activity.recordedMinutes / activity.plannedPastMinutes;
      return {
        activityId: activity.activityId,
        name: activity.activityName,
        categoryName: activity.categoryName,
        color: activity.categoryColor,
        coefficient,
        tone: resolveMirrorTone(coefficient),
      };
    })
    .sort((a, b) => Math.abs(b.coefficient - 1) - Math.abs(a.coefficient - 1))
    .slice(0, MIRROR_MAX_ROWS);
}

function resolveMirrorTone(coefficient: number): ReportMirrorTone {
  if (coefficient >= MIRROR_OVER_THRESHOLD) return 'over';
  if (coefficient <= MIRROR_UNDER_THRESHOLD) return 'under';
  return 'onPlan';
}

// ============================================================
// 3 章: 羅針盤
// ============================================================

export interface ReportCompassPoint {
  activityId: string | null;
  name: string | null;
  categoryName: string | null;
  color: string | null;
  /** 盤の左からの位置（%）。投下時間に比例。 */
  x: number;
  /** 盤の下からの位置（%）。充実と消耗の差に比例。 */
  y: number;
  /** 濃度＝回答数。回数が少ない点ほど薄い。 */
  opacity: number;
  /** 充実の回答数。 */
  answerCount: number;
  /** 投下時間（分）。読み上げラベルに使う。 */
  recordedMinutes: number;
}

/**
 * 羅針盤の点（仕様 §4.3）。
 *
 * 充実の回答が 5 件に満たないアクティビティは点にしない（待機リストへ回す）。
 * **平均・回帰線・象限の塗り分け・ランキングは作らない。**
 */
export function buildCompassPoints(
  visibleActivities: readonly ReportActivityAggregate[],
): ReportCompassPoint[] {
  const eligible = visibleActivities.filter(
    (activity) =>
      activity.recordedMinutes > 0 && answerCountOf(activity) >= COMPASS_MIN_FULFILLMENT,
  );

  const maxRecorded = Math.max(1, ...eligible.map((activity) => activity.recordedMinutes));

  return eligible.map((activity) => {
    const answerCount = answerCountOf(activity);
    const slope = (activity.fulfillment.high - activity.fulfillment.low) / answerCount;
    return {
      activityId: activity.activityId,
      name: activity.activityName,
      categoryName: activity.categoryName,
      color: activity.categoryColor,
      x: 6 + (activity.recordedMinutes / maxRecorded) * 86,
      y: 14 + ((slope + 1) / 2) * 72,
      opacity: 0.35 + Math.min(answerCount, 5) * 0.13,
      answerCount,
      recordedMinutes: activity.recordedMinutes,
    };
  });
}

export interface ReportWaitingActivity {
  activityId: string | null;
  name: string | null;
}

/**
 * 点になるのを待っているアクティビティ（仕様 §4.3）。
 *
 * 記録はあるが充実の回答がまだ足りない行。名前だけを並べる。
 */
export function buildCompassWaitingList(
  visibleActivities: readonly ReportActivityAggregate[],
): ReportWaitingActivity[] {
  return visibleActivities
    .filter(
      (activity) =>
        activity.recordedMinutes > 0 && answerCountOf(activity) < COMPASS_MIN_FULFILLMENT,
    )
    .sort((a, b) => b.recordedMinutes - a.recordedMinutes)
    .map((activity) => ({ activityId: activity.activityId, name: activity.activityName }));
}

/** 充実の回答数（仕様の `n`）。未回答の記録は数えない。 */
export function answerCountOf(activity: ReportActivityAggregate): number {
  const { low, medium, high } = activity.fulfillment;
  return low + medium + high;
}
