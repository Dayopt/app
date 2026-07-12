/**
 * Time P/L — 正規化された入力型
 *
 * 予実比較（BarComparison）と精度・損益計算（deriveStatement / deriveAccuracy）が
 * この1つの入力型から導出される。ビュー固有の計算値はここに持たず、derivers で算出する。
 */

import type { TagColorName } from '@/features/tags';

/** P/Lの表示粒度 */
export type TimePLGranularity = 'day' | 'week' | 'month' | 'year';

/** 予算精度のステータス（±0が理想） */
export type AccuracyStatus = 'excellent' | 'good' | 'fair' | 'poor';

/** タグ別の予実データ（正規化された入力） */
export interface TimePLTagTimeblock {
  tagId: string;
  tagName: string;
  tagColor: TagColorName;
  tagIcon?: string | null | undefined;
  /** 予定時間（分） */
  budgetMinutes: number;
  /** 記録時間（分） */
  actualMinutes: number;
  /** 予算があったか（false = 計画外のみのタグ） */
  isPlanned: boolean;
}

/** 全ビュー共通の入力型 */
export interface TimePLInput {
  period: {
    granularity: TimePLGranularity;
    label: string;
    startDate: string;
    endDate: string;
  };
  /** 可処分時間（起床〜就寝 × 日数、分） */
  availableMinutes: number;
  /** タグ別の予実データ */
  tags: TimePLTagTimeblock[];
  /** 前期間のタグ別データ（トレンド比較用） */
  prevTags?: TimePLTagTimeblock[] | undefined;
}

// ── Derived types（derivers の出力型）──

/** 精度情報（共通） */
export interface TimePLAccuracy {
  rate: number;
  status: AccuracyStatus;
  prevRate?: number | undefined;
}

/** Statement / Section 用の行 */
export interface TimePLRow {
  tagId: string;
  tagName: string;
  tagColor: TagColorName;
  tagIcon?: string | null | undefined;
  minutes: number;
  percentage: number;
}

/** Statement 用の差異行 */
export interface TimePLVarianceRow {
  tagId: string;
  tagName: string;
  tagColor: TagColorName;
  tagIcon?: string | null | undefined;
  varianceMinutes: number;
  /** 乖離率。予算0のタグは null */
  variancePercent: number | null;
}

/** Statement ビューのデータ */
export interface StatementViewData {
  budgetRows: TimePLRow[];
  budgetTotal: number;
  actualRows: TimePLRow[];
  actualTotal: number;
  varianceRows: TimePLVarianceRow[];
  netVarianceMinutes: number;
}

/** BarComparison の行 */
export interface BarComparisonRow {
  tagId: string;
  tagName: string;
  tagColor: TagColorName;
  tagIcon?: string | null | undefined;
  budgetMinutes: number;
  actualMinutes: number;
  varianceMinutes: number;
  variancePercent: number | null;
}
