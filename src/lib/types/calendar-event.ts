import type { EntryOrigin, EntryState, FulfillmentScore } from './entry';

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
  /** エントリの起源（常に planned） */
  origin?: EntryOrigin | undefined;
  /** 時間位置ベースの状態（upcoming/active/past） */
  entryState?: EntryState | undefined;
  /** 充実度スコア（1-3） */
  fulfillmentScore?: FulfillmentScore | null | undefined;
  /** 実記録の開始時刻（actual_start_time から変換） */
  actualStartDate?: Date | null | undefined;
  /** 実記録の終了時刻（actual_end_time から変換） */
  actualEndDate?: Date | null | undefined;
  // Optional properties used in various contexts
  userId?: string | undefined; // 所有者ID
  location?: string | undefined; // 場所
  url?: string | undefined; // 関連URL
  priority?: 'urgent' | 'important' | 'necessary' | 'delegate' | 'optional' | undefined; // 優先度
  // ドラフト状態（未保存のプレビュー）
  isDraft?: boolean | undefined;
}
