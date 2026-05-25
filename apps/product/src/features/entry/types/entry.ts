// Entry型定義（Canonical source）
// plans + records を統合した entries テーブルに対応

/**
 * エントリの時間位置ベースの状態
 * - upcoming: 未来の予定
 * - active: 現在進行中
 * - past: 過去の記録
 */
export type EntryState = 'upcoming' | 'active' | 'past';

/**
 * エントリの起源
 * - planned: 計画済み（予定あり）
 * - unplanned: 計画外（記録のみ）
 */
export type EntryOrigin = 'planned' | 'unplanned';

/**
 * 充実度スコア（3段階）
 * 1: 微妙
 * 2: 普通
 * 3: 良い
 */
export type FulfillmentScore = 1 | 2 | 3;

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
  fulfillment_score?: FulfillmentScore;
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
  fulfillment_score?: FulfillmentScore | null;
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
