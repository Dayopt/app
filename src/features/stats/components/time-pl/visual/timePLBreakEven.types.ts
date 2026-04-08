/**
 * Time P/L Break-Even Chart Types
 *
 * 時間版の損益分岐点グラフ。期間内の日次累積で
 * 予算ライン vs 実績ラインの推移と交差を可視化する。
 */

import type { AccuracyStatus, TimePLGranularity } from '../timePL.types';

/** 1日分のデータポイント */
export interface TimePLDailyPoint {
  /** 日付ラベル（"4/1", "月" 等） */
  label: string;
  /** その日の予算（分） */
  budgetMinutes: number;
  /** その日の実績（分） */
  actualMinutes: number;
  /** 累積予算（分） */
  cumulativeBudget: number;
  /** 累積実績（分） */
  cumulativeActual: number;
}

/** 損益分岐点グラフ全体のデータ */
export interface TimePLBreakEvenData {
  period: {
    granularity: TimePLGranularity;
    label: string;
  };
  /** 日次データポイント（期間分） */
  points: TimePLDailyPoint[];
  /** 予算合計（分） */
  budgetTotal: number;
  /** 実績合計（分） */
  actualTotal: number;
  /** 損益分岐日のインデックス（交差しない場合は null） */
  breakEvenIndex: number | null;
  accuracyRate: number;
  accuracyStatus: AccuracyStatus;
}
