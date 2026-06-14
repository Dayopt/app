/**
 * Micro Insights — Inspector 向けの1行インサイト型定義
 *
 * 表示する `MicroInsight` 値は呼び出し側が直接組み立てる。
 * 動的な評価関数は現状未使用のため定義していない。
 */

/** マイクロインサイトの種別（見積もり精度 / ピーク時間帯） */
export type MicroInsightType = 'estimation_bias' | 'deep_hour';

/** Inspector に表示する1行インサイト */
export interface MicroInsight {
  type: MicroInsightType;
  /** i18n メッセージキー（calendar.stats.insights 配下） */
  messageKey: string;
  /** メッセージの動的パラメータ */
  messageParams?: Record<string, string | number>;
}
