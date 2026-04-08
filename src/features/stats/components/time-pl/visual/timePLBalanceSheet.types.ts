/**
 * Time P/L Balance Sheet Types
 *
 * 時間貸借対照表の型定義。可処分時間を
 * 資産（実績側）と負債＋資本（計画側）に分解する。
 * 左右は必ず一致する。
 */

import type { TimePLGranularity, TimePLRowData } from '../timePL.types';

/** B/Sの1セクション（記録済み / 予定 / 空白 / 自由） */
export interface TimePLBSSection {
  label: string;
  rows: TimePLRowData[];
  totalMinutes: number;
}

/** B/Sの片側（左: 資産 / 右: 負債＋資本） */
export interface TimePLBSSide {
  label: string;
  sections: TimePLBSSection[];
  totalMinutes: number;
}

/** バランスシート全体のデータ */
export interface TimePLBalanceSheetData {
  period: {
    granularity: TimePLGranularity;
    label: string;
    startDate: string;
    endDate: string;
  };
  /** 可処分時間（起床〜就寝 × 日数） */
  availableMinutes: number;
  /** 左側: 資産（実績の使い方） */
  assets: TimePLBSSide;
  /** 右側: 負債＋資本（計画側） */
  liabilitiesAndEquity: TimePLBSSide;
  /** 左右一致チェック（常に true） */
  isBalanced: boolean;
}
