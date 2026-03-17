/**
 * 汎用Supabase Realtime購読フック
 *
 * @description
 * Supabase Realtimeの購読を管理する汎用フック。
 * React公式ベストプラクティス準拠：
 * - useEffectでのクリーンアップ
 * - 依存配列の適切な管理
 * - エラーハンドリング
 *
 * @see https://supabase.com/docs/guides/realtime/postgres-changes
 * @see https://react.dev/learn/synchronizing-with-effects
 *
 * @example
 * ```tsx
 * useRealtimeSubscription({
 *   channelName: 'calendar-changes',
 *   table: 'events',
 *   event: '*',
 *   filter: `user_id=eq.${userId}`,
 *   onEvent: () => {
 *     queryClient.invalidateQueries({ queryKey: ['events'] })
 *   },
 * })
 * ```
 */

'use client';

import { logger } from '@/lib/logger';

import { useEffect, useRef } from 'react';

import { createClient } from '@/platform/supabase/client';

import type { RealtimeChannelManager, RealtimeSubscriptionConfig } from './types';
import { RealtimeSubscriptionError } from './types';

export function useRealtimeSubscription<
  T extends Record<string, unknown> = Record<string, unknown>,
>(config: RealtimeSubscriptionConfig<T>) {
  const channelRef = useRef<RealtimeChannelManager | null>(null);
  const configRef = useRef(config);

  // 最新のconfigを保持（クロージャ問題を回避）
  useEffect(() => {
    configRef.current = config;
  });

  // enabled / channelName の変更時に購読を再作成するため、値レベルで依存
  const { channelName, enabled = true } = config;

  useEffect(() => {
    // enabled=false の場合は購読をスキップ
    if (!enabled) {
      logger.debug(`[Realtime] Subscription disabled: ${channelName}`);
      return;
    }

    const supabase = createClient();
    const { table, event, filter, schema = 'public', onEvent, onError } = configRef.current;

    try {
      // チャンネル作成
      const channel = supabase.channel(channelName);

      // Postgres変更イベントを購読
      // Supabase Realtime型定義の制約を回避するため、anyを使用
      const typedChannel = channel as {
        on: (
          event: string,
          config: Record<string, unknown>,
          callback: (payload: unknown) => void,
        ) => typeof channel;
      };

      typedChannel.on(
        'postgres_changes',
        {
          event,
          schema,
          table,
          filter,
        },
        (payload: unknown) => {
          try {
            onEvent(payload as never);
          } catch (error) {
            const subscriptionError = new RealtimeSubscriptionError(
              `Error in onEvent callback for channel "${channelName}"`,
              channelName,
              error,
            );
            if (onError) {
              onError(subscriptionError);
            } else {
              logger.error(subscriptionError);
            }
          }
        },
      );

      // 購読開始
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          logger.debug(`[Realtime] Subscribed to channel: ${channelName}`);
        } else if (status === 'CHANNEL_ERROR') {
          const error = new RealtimeSubscriptionError(
            `Failed to subscribe to channel: ${channelName}`,
            channelName,
          );
          if (onError) {
            onError(error);
          } else {
            logger.error(error);
          }
        }
      });

      // チャンネル管理情報を保存
      const manager: RealtimeChannelManager = {
        channel,
        status: 'subscribing',
        unsubscribe: async () => {
          await supabase.removeChannel(channel);
        },
      };
      channelRef.current = manager;
    } catch (error) {
      const subscriptionError = new RealtimeSubscriptionError(
        `Failed to create channel: ${channelName}`,
        channelName,
        error,
      );
      if (onError) {
        onError(subscriptionError);
      } else {
        logger.error(subscriptionError);
      }
    }

    // クリーンアップ: コンポーネントアンマウント時に購読解除
    return () => {
      if (channelRef.current) {
        const { channel } = channelRef.current;
        supabase.removeChannel(channel);
        logger.debug(`[Realtime] Unsubscribed from channel: ${channelName}`);
        channelRef.current = null;
      }
    };
  }, [channelName, enabled]); // enabled/channelName変更時に購読を再作成
}
