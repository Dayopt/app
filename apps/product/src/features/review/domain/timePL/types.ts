/**
 * Time P/L — 正規化された入力型
 *
 * 予実比較（BarComparison）と精度・損益計算（deriveStatement / deriveAccuracy）が
 * この1つの入力型から導出される。ビュー固有の計算値はここに持たず、derivers で算出する。
 */

import type { CategoryColorName } from '@/features/activities';

/** P/Lの表示粒度 */
export type TimePLGranularity = 'day' | 'week' | 'range' | 'month' | 'year';

/** 予算精度のステータス（±0が理想） */
export type AccuracyStatus = 'excellent' | 'good' | 'fair' | 'poor';

/**
 * アクティビティ別の予実データ（正規化された入力）。
 *
 * 色・アイコンはカテゴリー由来（アクティビティ自身は持たず継承する。#2162）。
 */
export interface TimePLActivityTimeblock {
  activityId: string | null;
  activityName: string | null;
  categoryColor: CategoryColorName | null;
  categoryIcon?: string | null | undefined;
  /** 予定時間（分） */
  budgetMinutes: number;
  /** 記録時間（分） */
  actualMinutes: number;
  /** 予算があったか（false = 計画外のみのアクティビティ） */
  isPlanned: boolean;
  /** 削除済み・未設定のアクティビティをまとめた synthetic bucket */
  isNoActivity: boolean;
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
  /** アクティビティ別の予実データ */
  activities: TimePLActivityTimeblock[];
  /** 前期間のアクティビティ別データ（トレンド比較用） */
  prevActivities?: TimePLActivityTimeblock[] | undefined;
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
  activityId: string | null;
  activityName: string | null;
  categoryColor: CategoryColorName | null;
  categoryIcon?: string | null | undefined;
  isNoActivity: boolean;
  minutes: number;
  percentage: number;
}

/** Statement 用の差異行 */
export interface TimePLVarianceRow {
  activityId: string | null;
  activityName: string | null;
  categoryColor: CategoryColorName | null;
  categoryIcon?: string | null | undefined;
  isNoActivity: boolean;
  varianceMinutes: number;
  /** 乖離率。予算0のアクティビティは null */
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
  activityId: string | null;
  activityName: string | null;
  categoryColor: CategoryColorName | null;
  categoryIcon?: string | null | undefined;
  isNoActivity: boolean;
  budgetMinutes: number;
  actualMinutes: number;
  varianceMinutes: number;
  variancePercent: number | null;
}
