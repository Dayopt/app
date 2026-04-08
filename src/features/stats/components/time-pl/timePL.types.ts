/**
 * Time P/L Statement Types
 *
 * 時間損益計算書の型定義。予定（Budget）と記録（Actual）を
 * 財務諸表のP/L形式で比較するコンポーネント用。
 */

import type { TagColorName } from '@/lib/tag-colors';

/** P/Lの表示粒度 */
export type TimePLGranularity = 'day' | 'week' | 'month';

/** 予算精度のステータス（±0が理想） */
export type AccuracyStatus = 'excellent' | 'good' | 'fair' | 'poor';

/** P/Lセクション内の1行（タグ別） */
export interface TimePLRowData {
  tagId: string;
  tagName: string;
  tagColor: TagColorName;
  tagIcon?: string | null;
  /** 時間（分） */
  minutes: number;
  /** セクション合計に対する割合（0-100） */
  percentage: number;
}

/** P/Lのセクション（Budget または Actual） */
export interface TimePLSectionData {
  label: string;
  rows: TimePLRowData[];
  totalMinutes: number;
}

/** 差異セクションの1行 */
export interface TimePLVarianceRow {
  tagId: string;
  tagName: string;
  tagColor: TagColorName;
  tagIcon?: string | null;
  /** Budget - Actual（正=予算余り、負=超過） */
  varianceMinutes: number;
  /** 乖離率: variance / budget * 100。予算0のタグは null */
  variancePercent: number | null;
}

/** P/L全体のデータ */
export interface TimePLData {
  period: {
    granularity: TimePLGranularity;
    label: string;
    startDate: string;
    endDate: string;
  };
  budget: TimePLSectionData;
  actual: TimePLSectionData;
  varianceRows: TimePLVarianceRow[];
  /** Budget total - Actual total */
  netVarianceMinutes: number;
  /** 予算精度: 1 - |netVariance| / budgetTotal（0-1） */
  accuracyRate: number;
  accuracyStatus: AccuracyStatus;
  /** 前期間の精度率（トレンド表示用） */
  prevAccuracyRate?: number | undefined;
}
