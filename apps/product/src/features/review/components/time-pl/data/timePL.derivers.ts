/**
 * Time P/L Derivers — 純粋な変換関数群
 *
 * TimePLInput → 各ビュー用データへの変換。
 * 全てのパーセンテージ・ステータス・集計値はここで算出する。
 */

import { computeVariance } from '@/features/review/domain/variance';

import type {
  AccuracyStatus,
  BalanceSheetData,
  BarComparisonRow,
  BreakEvenCurve,
  StatementViewData,
  TimePLAccuracy,
  TimePLInput,
  TimePLRow,
  TimePLVarianceRow,
  WaterfallStep,
} from './timePL.types';

// ── 共通ユーティリティ ──

/** 分を "2h 30m" 形式にフォーマット */
export function formatMinutesDuration(minutes: number): string {
  const abs = Math.abs(minutes);
  if (abs >= 60) {
    const h = Math.floor(abs / 60);
    const m = Math.round(abs % 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${Math.round(abs)}m`;
}

/** 差異を符号付きフォーマット */
export function formatVariance(minutes: number): string {
  if (minutes === 0) return '±0';
  const sign = minutes > 0 ? '+' : '-';
  return `${sign}${formatMinutesDuration(minutes)}`;
}

/** 精度率 → ステータス */
export function getAccuracyStatus(rate: number): AccuracyStatus {
  if (rate >= 0.95) return 'excellent';
  if (rate >= 0.85) return 'good';
  if (rate >= 0.7) return 'fair';
  return 'poor';
}

/** 乖離率 → テキストカラークラス */
export function getVarianceColor(variancePercent: number | null): string {
  if (variancePercent === null) return 'text-muted-foreground';
  const abs = Math.abs(variancePercent);
  if (abs <= 5) return 'text-success';
  if (abs <= 15) return 'text-foreground';
  if (abs <= 30) return 'text-warning';
  return 'text-destructive';
}

/** AccuracyStatus → バッジ用カラー */
export function getAccuracyColors(status: AccuracyStatus): { bg: string; text: string } {
  switch (status) {
    case 'excellent':
    case 'good':
      return { bg: 'bg-success/10', text: 'text-success' };
    case 'fair':
      return { bg: 'bg-warning/10', text: 'text-warning' };
    case 'poor':
      return { bg: 'bg-destructive/10', text: 'text-destructive' };
  }
}

// ── Derivers ──

/** 精度を算出 */
export function deriveAccuracy(input: TimePLInput): TimePLAccuracy {
  const budgetTotal = input.tags.reduce((s, t) => s + t.budgetMinutes, 0);
  const actualTotal = input.tags.reduce((s, t) => s + t.actualMinutes, 0);

  const rate =
    budgetTotal === 0
      ? actualTotal === 0
        ? 1
        : 0
      : Math.max(0, Math.min(1, 1 - Math.abs(budgetTotal - actualTotal) / budgetTotal));

  let prevRate: number | undefined;
  if (input.prevTags) {
    const prevBudget = input.prevTags.reduce((s, t) => s + t.budgetMinutes, 0);
    const prevActual = input.prevTags.reduce((s, t) => s + t.actualMinutes, 0);
    prevRate =
      prevBudget === 0
        ? prevActual === 0
          ? 1
          : 0
        : Math.max(0, Math.min(1, 1 - Math.abs(prevBudget - prevActual) / prevBudget));
  }

  return { rate, status: getAccuracyStatus(rate), prevRate };
}

/** タグ配列 → ソート済みの行配列 + 合計 */
function toRows(
  tags: TimePLInput['tags'],
  getMinutes: (t: TimePLInput['tags'][0]) => number,
): { rows: TimePLRow[]; total: number } {
  const items = tags
    .map((t) => ({ ...t, minutes: getMinutes(t) }))
    .filter((t) => t.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes);
  const total = items.reduce((s, t) => s + t.minutes, 0);
  const rows: TimePLRow[] = items.map((t) => ({
    tagId: t.tagId,
    tagName: t.tagName,
    tagColor: t.tagColor,
    tagIcon: t.tagIcon,
    minutes: t.minutes,
    percentage: total > 0 ? Math.round((t.minutes / total) * 100) : 0,
  }));
  return { rows, total };
}

/** Statement ビュー用データを導出 */
export function deriveStatement(input: TimePLInput): StatementViewData {
  const budget = toRows(input.tags, (t) => t.budgetMinutes);
  const actual = toRows(input.tags, (t) => t.actualMinutes);

  const varianceRows: TimePLVarianceRow[] = [];
  const allTagIds = new Set(input.tags.map((t) => t.tagId));
  for (const tagId of allTagIds) {
    const tag = input.tags.find((t) => t.tagId === tagId)!;
    if (tag.budgetMinutes === 0 && tag.actualMinutes === 0) continue;
    const { varianceMinutes, variancePercent } = computeVariance(
      tag.budgetMinutes,
      tag.actualMinutes,
      tag.isPlanned,
    );
    varianceRows.push({
      tagId: tag.tagId,
      tagName: tag.tagName,
      tagColor: tag.tagColor,
      tagIcon: tag.tagIcon,
      varianceMinutes,
      variancePercent,
    });
  }

  varianceRows.sort((a, b) => Math.abs(b.varianceMinutes) - Math.abs(a.varianceMinutes));

  return {
    budgetRows: budget.rows,
    budgetTotal: budget.total,
    actualRows: actual.rows,
    actualTotal: actual.total,
    varianceRows,
    netVarianceMinutes: budget.total - actual.total,
  };
}

/** Waterfall ステップを導出 */
export function deriveWaterfall(input: TimePLInput): WaterfallStep[] {
  const statement = deriveStatement(input);
  const steps: WaterfallStep[] = [];

  // Budget (start)
  steps.push({
    label: '予算',
    value: statement.budgetTotal,
    type: 'total',
    runningTotal: statement.budgetTotal,
    prevRunningTotal: 0,
  });

  // 差異ステップ
  let running = statement.budgetTotal;
  for (const row of statement.varianceRows) {
    const prev = running;
    running -= row.varianceMinutes;
    steps.push({
      label: row.tagName,
      value: -row.varianceMinutes,
      type: row.varianceMinutes > 0 ? 'decrease' : row.varianceMinutes < 0 ? 'increase' : 'neutral',
      runningTotal: running,
      prevRunningTotal: prev,
    });
  }

  // Actual (end)
  steps.push({
    label: '実績',
    value: statement.actualTotal,
    type: 'total',
    runningTotal: statement.actualTotal,
    prevRunningTotal: 0,
  });

  return steps;
}

/** BarComparison 行を導出 */
export function deriveBarComparison(input: TimePLInput): BarComparisonRow[] {
  return input.tags
    .filter((t) => t.budgetMinutes > 0 || t.actualMinutes > 0)
    .map((t) => {
      const { varianceMinutes, variancePercent } = computeVariance(
        t.budgetMinutes,
        t.actualMinutes,
        t.isPlanned,
      );
      return {
        tagId: t.tagId,
        tagName: t.tagName,
        tagColor: t.tagColor,
        tagIcon: t.tagIcon,
        budgetMinutes: t.budgetMinutes,
        actualMinutes: t.actualMinutes,
        varianceMinutes,
        variancePercent,
      };
    })
    .sort(
      (a, b) =>
        Math.max(b.budgetMinutes, b.actualMinutes) - Math.max(a.budgetMinutes, a.actualMinutes),
    );
}

/** BreakEven カーブを導出 */
export function deriveBreakEven(input: TimePLInput): BreakEvenCurve | null {
  if (!input.dailyPoints || input.dailyPoints.length === 0) return null;

  let cumBudget = 0;
  let cumActual = 0;
  const points = input.dailyPoints.map((dp) => {
    cumBudget += dp.budgetMinutes;
    cumActual += dp.actualMinutes;
    return { label: dp.label, cumulativeBudget: cumBudget, cumulativeActual: cumActual };
  });

  // 最初の交差点
  let breakEvenIndex: number | null = null;
  for (let i = 1; i < points.length; i++) {
    const prevDiff = points[i - 1]!.cumulativeBudget - points[i - 1]!.cumulativeActual;
    const currDiff = points[i]!.cumulativeBudget - points[i]!.cumulativeActual;
    if (prevDiff * currDiff < 0) {
      breakEvenIndex = i;
      break;
    }
  }

  return {
    points,
    breakEvenIndex,
    budgetTotal: cumBudget,
    actualTotal: cumActual,
  };
}

/** BalanceSheet データを導出 */
export function deriveBalanceSheet(input: TimePLInput): BalanceSheetData {
  const actual = toRows(input.tags, (t) => t.actualMinutes);
  const budget = toRows(input.tags, (t) => t.budgetMinutes);

  const blankMinutes = input.availableMinutes - actual.total;
  const freeMinutes = input.availableMinutes - budget.total;

  return {
    availableMinutes: input.availableMinutes,
    assets: {
      label: '資産（実績）',
      totalMinutes: input.availableMinutes,
      sections: [
        { label: '記録済み時間', rows: actual.rows, totalMinutes: actual.total },
        { label: '空白時間', rows: [], totalMinutes: Math.max(blankMinutes, 0) },
      ],
    },
    liabilitiesAndEquity: {
      label: '負債＋資本（計画）',
      totalMinutes: input.availableMinutes,
      sections: [
        { label: '予定時間（負債）', rows: budget.rows, totalMinutes: budget.total },
        { label: '自由時間（資本）', rows: [], totalMinutes: Math.max(freeMinutes, 0) },
      ],
    },
  };
}
