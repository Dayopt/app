/**
 * Palette Router
 *
 * よく使うブロック（タグ + duration）の管理。
 * ピン留め（手動）と自動集計の2種類。
 */

import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { logger } from '@/lib/logger';
import { createTRPCRouter, protectedProcedure } from '@/platform/trpc/procedures';
import * as Sentry from '@sentry/nextjs';

/** Palette操作の共通エラーハンドラ */
function handlePaletteError(operation: string, error: unknown): never {
  if (error instanceof TRPCError) throw error;
  Sentry.captureException(error, { tags: { source: 'palette_router', operation } });
  logger.error('Palette operation failed', {
    operation,
    error: error instanceof Error ? error.message : String(error),
  });
  throw new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: `Palette operation failed (${operation}): ${error instanceof Error ? error.message : String(error)}`,
    cause: error,
  });
}

/** ピン留めアイテム一覧取得 */
const list = protectedProcedure
  .meta({ description: 'ピン留めパレットアイテム一覧' })
  .query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from('palette_items')
      .select('id, tag_id, duration_minutes, sort_order, is_pinned')
      .eq('user_id', ctx.userId)
      .eq('is_pinned', true)
      .order('sort_order', { ascending: true });

    if (error) {
      return handlePaletteError('list', error);
    }

    return data;
  });

/** エントリ使用頻度から自動集計（ピン留め済みを除外） */
const getFrequentBlocks = protectedProcedure
  .meta({ description: '使用頻度の高いブロックを自動集計' })
  .query(async ({ ctx }) => {
    // ピン留め済みの tag_id + duration の組み合わせを取得
    const { data: pinned } = await ctx.supabase
      .from('palette_items')
      .select('tag_id, duration_minutes')
      .eq('user_id', ctx.userId)
      .eq('is_pinned', true);

    const pinnedSet = new Set((pinned ?? []).map((p) => `${p.tag_id}:${p.duration_minutes}`));

    // entry_tags + entries を結合して tag_id + duration_minutes を集計
    const { data, error } = await ctx.supabase
      .from('entry_tags')
      .select('tag_id, entries!inner(duration_minutes, deleted_at)')
      .eq('user_id', ctx.userId);

    if (error) {
      return handlePaletteError('getFrequentBlocks', error);
    }

    // 集計
    const counts = new Map<string, { tagId: string; durationMinutes: number; count: number }>();
    for (const row of data ?? []) {
      const entry = row.entries as unknown as {
        duration_minutes: number | null;
        deleted_at: string | null;
      };
      if (entry.deleted_at) continue;
      if (!entry.duration_minutes) continue;
      const key = `${row.tag_id}:${entry.duration_minutes}`;
      if (pinnedSet.has(key)) continue;

      const existing = counts.get(key);
      if (existing) {
        existing.count++;
      } else {
        counts.set(key, {
          tagId: row.tag_id,
          durationMinutes: entry.duration_minutes,
          count: 1,
        });
      }
    }

    // 使用回数が2回以上のものを上位8件
    return Array.from(counts.values())
      .filter((item) => item.count >= 2)
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  });

/** ピン留め追加 */
const pin = protectedProcedure
  .meta({ description: 'パレットにピン留め' })
  .input(
    z.object({
      tagId: z.string().uuid(),
      durationMinutes: z.number().int().min(1),
    }),
  )
  .mutation(async ({ ctx, input }) => {
    // 現在の最大 sort_order を取得
    const { data: existing } = await ctx.supabase
      .from('palette_items')
      .select('sort_order')
      .eq('user_id', ctx.userId)
      .eq('is_pinned', true)
      .order('sort_order', { ascending: false })
      .limit(1);

    const nextOrder = (existing?.[0]?.sort_order ?? -1) + 1;

    const { data, error } = await ctx.supabase
      .from('palette_items')
      .upsert(
        {
          user_id: ctx.userId,
          tag_id: input.tagId,
          duration_minutes: input.durationMinutes,
          is_pinned: true,
          sort_order: nextOrder,
        },
        { onConflict: 'user_id,tag_id,duration_minutes' },
      )
      .select('id')
      .single();

    if (error) {
      return handlePaletteError('pin', error);
    }

    return data;
  });

/** ピン解除（削除） */
const unpin = protectedProcedure
  .meta({ description: 'パレットからピン解除' })
  .input(z.object({ id: z.string().uuid() }))
  .mutation(async ({ ctx, input }) => {
    const { error } = await ctx.supabase
      .from('palette_items')
      .delete()
      .eq('id', input.id)
      .eq('user_id', ctx.userId);

    if (error) {
      return handlePaletteError('unpin', error);
    }

    return { success: true };
  });

/** 並び替え */
const reorder = protectedProcedure
  .meta({ description: 'パレットアイテムの並び替え' })
  .input(z.object({ ids: z.array(z.string().uuid()).min(1).max(50) }))
  .mutation(async ({ ctx, input }) => {
    // バッチ更新: 各IDに新しい sort_order を設定
    const updates = input.ids.map((id, index) =>
      ctx.supabase
        .from('palette_items')
        .update({ sort_order: index })
        .eq('id', id)
        .eq('user_id', ctx.userId),
    );

    const results = await Promise.all(updates);
    const firstError = results.find((r) => r.error);
    if (firstError?.error) {
      logger.error('Palette reorder failed', { error: firstError.error.message });
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to reorder palette items',
      });
    }

    return { success: true };
  });

export const paletteRouter = createTRPCRouter({
  list,
  getFrequentBlocks,
  pin,
  unpin,
  reorder,
});
