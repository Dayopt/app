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

/** リトライの最大回数 */
const MAX_RETRY_COUNT = 5;
/** リトライ間隔の基数（ms） */
const RETRY_BASE_DELAY = 2000;

export function useRealtimeSubscription<
  T extends Record<string, unknown> = Record<string, unknown>,
>(config: RealtimeSubscriptionConfig<T>) {
  const channelRef = useRef<RealtimeChannelManager | null>(null);
  const configRef = useRef(config);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

    let supabase = createClient();
    let isCleanedUp = false;

    function subscribe() {
      if (isCleanedUp) return;

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
          if (isCleanedUp) return;

          if (status === 'SUBSCRIBED') {
            logger.debug(`[Realtime] Subscribed to channel: ${channelName}`);
            retryCountRef.current = 0; // 成功時にリトライカウントをリセット
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

            // リトライ: 指数バックオフで再接続
            if (retryCountRef.current < MAX_RETRY_COUNT) {
              const delay = RETRY_BASE_DELAY * 2 ** retryCountRef.current;
              retryCountRef.current++;
              logger.info(
                `[Realtime] Retrying channel ${channelName} in ${delay}ms (attempt ${retryCountRef.current}/${MAX_RETRY_COUNT})`,
              );

              // 既存チャンネルをクリーンアップしてから再接続
              supabase.removeChannel(channel);
              channelRef.current = null;

              retryTimerRef.current = setTimeout(() => {
                if (!isCleanedUp) {
                  supabase = createClient();
                  subscribe();
                }
              }, delay);
            } else {
              logger.error(
                `[Realtime] Max retries (${MAX_RETRY_COUNT}) reached for channel ${channelName}. Giving up.`,
              );
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
    }

    subscribe();

    // クリーンアップ: コンポーネントアンマウント時に購読解除
    return () => {
      isCleanedUp = true;
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      if (channelRef.current) {
        const { channel } = channelRef.current;
        supabase.removeChannel(channel);
        logger.debug(`[Realtime] Unsubscribed from channel: ${channelName}`);
        channelRef.current = null;
      }
      retryCountRef.current = 0;
    };
  }, [channelName, enabled]); // enabled/channelName変更時に購読を再作成
}
