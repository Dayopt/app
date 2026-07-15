/**
 * Record の表示用射影型（Calendar の Record レーンでのレンダリングに使用）。
 *
 * `CalendarEvent`（entries 統合型）から独立した Step 5 の新規型。
 * `diffMinutes` は `planId` が紐づく record のみ算出される（実績 − 予定、分）。
 * ±0 を非表示にする判断は表示コンポーネント側の責務（copywriting「判定せず数字で示す」）。
 */
export interface RecordEvent {
  id: string;
  title: string;
  note: string | null;
  tagId: string | null;
  /** 紐づく plan の id。null なら予定外の記録。 */
  planId: string | null;
  startDate: Date;
  endDate: Date;
  /** タイムゾーン変換済みの表示用開始時刻 */
  displayStartDate: Date;
  /** タイムゾーン変換済みの表示用終了時刻 */
  displayEndDate: Date;
  /** 分単位の所要時間 */
  duration: number;
  /** 実績 − 予定（分）。`planId` が無い record では undefined。 */
  diffMinutes?: number | undefined;
  /** 未保存のプレビュー状態 */
  isDraft?: boolean | undefined;
}
