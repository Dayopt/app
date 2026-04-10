/**
 * Palette Router
 *
 * よく使うブロック（タグ + duration）の管理。
 * ピン留め（手動管理）のCRUD。自動集計は history feature に移管。
 */

import { z } from 'zod';

import { handleServiceError } from '@/lib/trpc/errors';
import { createTRPCRouter, protectedProcedure } from '@/lib/trpc/procedures';

import { createPaletteService } from './palette-service';

/** ピン留めアイテム一覧取得 */
const list = protectedProcedure
  .meta({ description: 'ピン留めパレットアイテム一覧' })
  .query(async ({ ctx }) => {
    try {
      const service = createPaletteService(ctx.supabase);
      return await service.list(ctx.userId);
    } catch (error) {
      handleServiceError(error);
    }
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
    try {
      const service = createPaletteService(ctx.supabase);
      return await service.pin(ctx.userId, input);
    } catch (error) {
      handleServiceError(error);
    }
  });

/** duration 更新 */
const updateDuration = protectedProcedure
  .meta({ description: 'パレットアイテムの duration 更新' })
  .input(
    z.object({
      id: z.string().uuid(),
      durationMinutes: z.number().int().min(1),
    }),
  )
  .mutation(async ({ ctx, input }) => {
    try {
      const service = createPaletteService(ctx.supabase);
      return await service.updateDuration(ctx.userId, input.id, input.durationMinutes);
    } catch (error) {
      handleServiceError(error);
    }
  });

/** ピン解除（削除） */
const unpin = protectedProcedure
  .meta({ description: 'パレットからピン解除' })
  .input(z.object({ id: z.string().uuid() }))
  .mutation(async ({ ctx, input }) => {
    try {
      const service = createPaletteService(ctx.supabase);
      return await service.unpin(ctx.userId, input.id);
    } catch (error) {
      handleServiceError(error);
    }
  });

export const paletteRouter = createTRPCRouter({
  list,
  pin,
  updateDuration,
  unpin,
});
