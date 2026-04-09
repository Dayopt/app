// Entry型定義（Canonical source）
// plans + records を統合した entries テーブルに対応

// 共有層が必要とする型は @/types/entry に残置（shared layerはfeaturesをimportできない）
import type { EntryOrigin, FulfillmentScore } from '@/types/entry';

export type { EntryOrigin, EntryState, FulfillmentScore } from '@/types/entry';

/**
 * エントリ基本型（entries テーブルに対応）
 *
 * 「Time waits for no one」原則:
 * - 未来の時間帯 = 予定（upcoming）
 * - 現在の時間帯 = 進行中（active）
 * - 過去の時間帯 = 記録（past）
 * ステータスは時間位置から自動判定（getEntryState）
 */
export interface Entry {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  origin: EntryOrigin;
  start_time: string | null;
  end_time: string | null;
  actual_start_time: string | null;
  actual_end_time: string | null;
  duration_minutes: number | null;
  fulfillment_score: FulfillmentScore | null;
  reminder_minutes: number | null;
  reviewed_at: string | null;
  /** 計画外にする前の予定開始時刻（復元用） */
  backed_up_start_time: string | null;
  /** 計画外にする前の予定終了時刻（復元用） */
  backed_up_end_time: string | null;
  created_at: string | null;
  updated_at: string | null;
}

/**
 * タグID付きエントリ（リレーション取得時）
 * 1エントリ1タグ制約
 */
export interface EntryWithTags extends Entry {
  tagId: string | null;
}

/**
 * エントリ作成入力
 */
export interface CreateEntryInput {
  title: string;
  description?: string;
  origin?: EntryOrigin;
  start_time?: string;
  end_time?: string;
  duration_minutes?: number;
  fulfillment_score?: FulfillmentScore;
  reminder_minutes?: number;
}

/**
 * エントリ更新入力
 */
export interface UpdateEntryInput {
  title?: string;
  description?: string;
  origin?: EntryOrigin;
  start_time?: string;
  end_time?: string;
  actual_start_time?: string | null;
  actual_end_time?: string | null;
  duration_minutes?: number;
  fulfillment_score?: FulfillmentScore | null;
  reminder_minutes?: number;
  reviewed_at?: string | null;
  backed_up_start_time?: string | null;
  backed_up_end_time?: string | null;
}

/**
 * フィルター条件
 */
export interface EntryFilters {
  origin?: EntryOrigin;
  search?: string;
  tagId?: string;
  startDate?: string;
  endDate?: string;
  fulfillmentScoreMin?: FulfillmentScore;
  fulfillmentScoreMax?: FulfillmentScore;
  sortBy?: 'created_at' | 'updated_at' | 'title' | 'start_time';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}
