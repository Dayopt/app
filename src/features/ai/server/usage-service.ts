/**
 * AI Usage Service
 *
 * 無料枠ユーザーの月間利用量を管理するサービス。
 * ai_usage テーブルに対するCRUD操作を提供。
 */

import { logger } from '@/lib/logger';

import { FREE_TIER_MONTHLY_LIMIT } from './types';

import type { AISupabaseClient, FreeTierUsage } from './types';

/**
 * 現在の月を 'YYYY-MM' 形式で取得
 */
function getCurrentMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/** AI使用量サービスを生成する（無料枠の月間リクエスト数を管理） */
function createAIUsageService(supabase: AISupabaseClient) {
  return {
    /**
     * 今月の利用状況を取得
     */
    async getUsage(userId: string): Promise<FreeTierUsage> {
      const month = getCurrentMonth();

      const { data, error } = await supabase
        .from('ai_usage')
        .select('request_count')
        .eq('user_id', userId)
        .eq('month', month)
        .maybeSingle();

      if (error) {
        logger.error('Failed to get AI usage', { error, userId, month });
        throw error;
      }

      return {
        used: data?.request_count ?? 0,
        limit: FREE_TIER_MONTHLY_LIMIT,
      };
    },

    /**
     * 利用回数をアトミックにインクリメント（INSERT ON CONFLICT DO UPDATE）
     */
    async incrementUsage(userId: string): Promise<void> {
      const month = getCurrentMonth();

      const { error } = await supabase.rpc('increment_ai_usage', {
        p_user_id: userId,
        p_month: month,
      });

      if (error) {
        logger.error('Failed to increment AI usage', { error, userId, month });
        throw error;
      }
    },

    /**
     * 無料枠の残りがあるかチェック
     */
    async hasQuota(userId: string): Promise<boolean> {
      const usage = await this.getUsage(userId);
      return usage.used < usage.limit;
    },
  };
}

export { createAIUsageService };
