import type { EntryOrigin, EntryState } from './entry';

/** Entry の表示用射影型（カレンダー上でのレンダリングに使用） */
export interface CalendarEvent {
  id: string;
  title: string;
  description?: string | undefined;
  startDate: Date | null;
  endDate: Date | null;
  status: 'open' | 'closed';
  color: string;
  /** タグID。1エントリ1タグ。タグの詳細情報はtags.listキャッシュから取得する。 */
  tagId?: string | null | undefined;
  createdAt: Date;
  updatedAt: Date;
  // Display-specific properties
  displayStartDate: Date;
  displayEndDate: Date;
  duration: number; // minutes
  isMultiDay: boolean;
  // === Entry 統合フィールド ===
  /** エントリの起源 */
  origin?: EntryOrigin | undefined;
  /** 時間位置ベースの状態（upcoming/active/past） */
  entryState?: EntryState | undefined;
  /** 実記録の開始時刻（actual_start_time から変換） */
  actualStartDate?: Date | null | undefined;
  /** 実記録の終了時刻（actual_end_time から変換） */
  actualEndDate?: Date | null | undefined;
  /** 予定の開始時刻（start_time から変換。unplanned では null） */
  plannedStartDate?: Date | null | undefined;
  /** 予定の終了時刻（end_time から変換。unplanned では null） */
  plannedEndDate?: Date | null | undefined;
  /** 計画したがやらなかった（skipped_at あり）。実績集計から除外される */
  isSkipped?: boolean | undefined;
  // Optional properties used in various contexts
  userId?: string | undefined; // 所有者ID
  location?: string | undefined; // 場所
  url?: string | undefined; // 関連URL
  priority?: 'urgent' | 'important' | 'necessary' | 'delegate' | 'optional' | undefined; // 優先度
  // ドラフト状態（未保存のプレビュー）
  isDraft?: boolean | undefined;
}
