/**
 * tRPC Router: Onboarding
 * オンボーディングの完了管理API
 */

import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/database.types';
import { logger } from '@/lib/logger';
import { handleServiceError } from '@/lib/trpc/errors';
import { createTRPCRouter, protectedProcedure } from '@/lib/trpc/procedures';

import { generateSampleEntries, PRESET_TAGS } from '../lib/sample-entries';

import type { PresetChronotypeType } from '@/lib/types/chronotype';

/** Chronotype type (inline to avoid cross-feature import) */
const chronotypeTypeSchema = z.enum(['lion', 'bear', 'wolf', 'dolphin', 'custom']);

/** オンボーディング完了管理のtRPCルーター */
export const onboardingRouter = createTRPCRouter({
  /**
   * プロフィール取得（名前の事前入力用）
   */
  getProfile: protectedProcedure
    .meta({ description: 'オンボーディング用プロフィール取得' })
    .query(async ({ ctx }) => {
      const [profileResult, userResult] = await Promise.all([
        ctx.supabase
          .from('profiles')
          .select('full_name, onboarding_completed_at')
          .eq('id', ctx.userId)
          .single(),
        ctx.supabase.auth.getUser(),
      ]);

      if (profileResult.error) {
        logger.error('Onboarding getProfile error:', profileResult.error);
        handleServiceError(profileResult.error);
      }

      if (userResult.error) {
        logger.error('Onboarding getUser error:', userResult.error);
        handleServiceError(userResult.error);
      }

      // OAuth名がなければメールアドレスの@前をフォールバックに
      const fullName = profileResult.data.full_name;
      const email = userResult.data.user?.email;
      const emailPrefix = email ? email.split('@')[0] : null;

      return {
        ...profileResult.data,
        full_name: fullName || emailPrefix,
      };
    }),

  /**
   * オンボーディング完了
   * 名前・クロノタイプを保存し、完了フラグをセット、サンプルプランを生成
   */
  complete: protectedProcedure
    .meta({ description: 'オンボーディング完了（名前・クロノタイプ保存+サンプルプラン生成）' })
    .input(
      z.object({
        fullName: z.string().min(1).max(100),
        chronotypeType: chronotypeTypeSchema.optional(),
        locale: z.enum(['en', 'ja']).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // プロフィール更新（名前 + 完了フラグ）
      const { error: profileError } = await ctx.supabase
        .from('profiles')
        .update({
          full_name: input.fullName,
          onboarding_completed_at: new Date().toISOString(),
        })
        .eq('id', ctx.userId);

      if (profileError) {
        logger.error('Onboarding complete profile error', { error: profileError });
        handleServiceError(profileError);
      }

      // クロノタイプ設定 or ロケール設定（指定がある場合）
      if (input.chronotypeType || input.locale) {
        const settingsUpsert: {
          user_id: string;
          chronotype_settings?: { type: string } | null;
          preferred_locale?: string;
        } = { user_id: ctx.userId };
        if (input.chronotypeType) {
          settingsUpsert.chronotype_settings = { type: input.chronotypeType };
        }
        if (input.locale) {
          settingsUpsert.preferred_locale = input.locale;
        }

        const { error: settingsError } = await ctx.supabase
          .from('user_settings')
          .upsert(settingsUpsert, { onConflict: 'user_id' })
          .select()
          .single();

        if (settingsError) {
          // クロノタイプ保存失敗は完了を妨げない（ログのみ）
          logger.error('Onboarding chronotype save error:', settingsError);
        }
      }

      // サンプルプラン生成（非ブロッキング）
      const chronotype = input.chronotypeType as PresetChronotypeType | undefined;
      createSampleEntriesForUser(ctx.supabase, ctx.userId, chronotype ?? null).catch((err) => {
        logger.error('Failed to create sample entries:', err);
        Sentry.captureException(err, {
          tags: { source: 'onboarding', operation: 'create_sample_entries' },
        });
      });

      return { success: true };
    }),

  /**
   * オンボーディングリセット
   * onboarding_completed_at を null にして再実行可能にする
   */
  reset: protectedProcedure
    .meta({ description: 'オンボーディングリセット（再実行可能にする）' })
    .mutation(async ({ ctx }) => {
      const { error } = await ctx.supabase
        .from('profiles')
        .update({ onboarding_completed_at: null })
        .eq('id', ctx.userId);

      if (error) {
        logger.error('Onboarding reset error', { error });
        handleServiceError(error);
      }

      return { success: true };
    }),
});

/**
 * サンプルプランを作成する（オンボーディング完了時）
 *
 * 1. プリセットタグ5個を tags テーブルに挿入
 * 2. サンプルエントリ7個を entries テーブルに挿入（tag_id で直接紐付け）
 *
 * feature boundary制約のため entry/tag service は使わず直接挿入する。
 * 失敗してもオンボーディング完了を妨げない（logger.error のみ）。
 */
async function createSampleEntriesForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
  chronotypeType: PresetChronotypeType | null,
): Promise<void> {
  const today = new Date();
  const plans = generateSampleEntries(chronotypeType, today);

  // ── Step 1: プリセットタグ作成 ──
  const tagEntries = Object.entries(PRESET_TAGS) as [
    keyof typeof PRESET_TAGS,
    (typeof PRESET_TAGS)[keyof typeof PRESET_TAGS],
  ][];
  const tagRows = tagEntries.map(([, tag], i) => ({
    user_id: userId,
    name: tag.name,
    color: tag.color,
    sort_order: i,
  }));

  const { data: insertedTags, error: tagsError } = await supabase
    .from('tags')
    .insert(tagRows)
    .select('id, name');

  if (tagsError || !insertedTags) {
    logger.error('Preset tags insert error:', tagsError);
    return;
  }

  // tagKey → tagId マッピング（name で照合）
  const tagNameToId = new Map(insertedTags.map((t) => [t.name, t.id as string]));

  // ── Step 2: サンプルエントリ作成（tag_id を直接含める） ──
  const entryRows = plans.map((plan) => ({
    user_id: userId,
    title: plan.title,
    origin: 'planned' as const,
    start_time: plan.startTime,
    end_time: plan.endTime,
    description: plan.description ?? '__onboarding_sample__',
    tag_id: tagNameToId.get(PRESET_TAGS[plan.tagKey].name) ?? null,
  }));

  const { error: entriesError } = await supabase.from('entries').insert(entryRows);

  if (entriesError) {
    logger.error('Sample entries insert error:', entriesError);
  }
}
