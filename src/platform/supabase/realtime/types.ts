/**
 * Supabase Realtime 型定義
 *
 * @see https://supabase.com/docs/guides/realtime/postgres-changes
 */

import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

/**
 * Postgres変更イベントの型
 */
export type PostgresChangeEvent = 'INSERT' | 'UPDATE' | 'DELETE' | '*';

/**
 * Realtime購読設定
 */
export interface RealtimeSubscriptionConfig<
  T extends Record<string, unknown> = Record<string, unknown>,
> {
  /** チャンネル名（一意） */
  channelName: string;
  /** 監視対象テーブル */
  table: string;
  /** イベント種別 */
  event: PostgresChangeEvent;
  /** フィルター（例: "user_id=eq.123"） */
  filter?: string;
  /** スキーマ（デフォルト: 'public'） */
  schema?: string;
  /** 購読を有効化するか（デフォルト: true） */
  enabled?: boolean;
  /** 変更検知時のコールバック */
  onEvent: (payload: RealtimePostgresChangesPayload<T>) => void;
  /** エラー時のコールバック（オプション） */
  onError?: (error: Error) => void;
  /** 再接続成功時のコールバック（gap fill用） */
  onReconnect?: () => void;
  /** リトライ上限超過時のコールバック */
  onMaxRetriesExceeded?: () => void;
}

/**
 * Realtimeチャンネルの状態
 */
export type RealtimeChannelStatus = 'subscribing' | 'subscribed' | 'unsubscribed' | 'error';

/**
 * Realtimeチャンネル管理インターフェース
 */
export interface RealtimeChannelManager {
  /** チャンネル */
  channel: RealtimeChannel;
  /** 状態 */
  status: RealtimeChannelStatus;
  /** 購読解除 */
  unsubscribe: () => Promise<void>;
}

/**
 * Realtime購読エラー
 */
export class RealtimeSubscriptionError extends Error {
  constructor(
    message: string,
    public readonly channelName: string,
    public readonly originalError?: unknown,
  ) {
    super(message);
    this.name = 'RealtimeSubscriptionError';
  }
}
