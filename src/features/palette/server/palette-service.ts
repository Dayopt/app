/**
 * Palette Service
 *
 * ピン留めパレットアイテムのビジネスロジック層。
 * Router → Service → Supabase の3層構造。
 */

import type { Database } from '@/lib/database.types';
import { ServiceError } from '@/lib/trpc/errors';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Palette Service エラー
 */
export class PaletteServiceError extends ServiceError {
  constructor(
    code: 'FETCH_FAILED' | 'PIN_FAILED' | 'UNPIN_FAILED' | 'UPDATE_FAILED',
    message: string,
  ) {
    super(code, message);
    this.name = 'PaletteServiceError';
  }
}

/**
 * Palette Service
 */
export class PaletteService {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  /** ピン留めアイテム一覧取得 */
  async list(userId: string) {
    const { data, error } = await this.supabase
      .from('palette_items')
      .select('id, tag_id, duration_minutes, sort_order, is_pinned')
      .eq('user_id', userId)
      .eq('is_pinned', true)
      .order('sort_order', { ascending: true });

    if (error) {
      throw new PaletteServiceError('FETCH_FAILED', error.message);
    }

    return data;
  }

  /** ピン留め追加 */
  async pin(userId: string, input: { tagId: string; durationMinutes: number }) {
    // 現在の最大 sort_order を取得
    const { data: existing } = await this.supabase
      .from('palette_items')
      .select('sort_order')
      .eq('user_id', userId)
      .eq('is_pinned', true)
      .order('sort_order', { ascending: false })
      .limit(1);

    const nextOrder = (existing?.[0]?.sort_order ?? -1) + 1;

    const { data, error } = await this.supabase
      .from('palette_items')
      .upsert(
        {
          user_id: userId,
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
      throw new PaletteServiceError('PIN_FAILED', error.message);
    }

    return data;
  }

  /** ピン解除（削除） */
  async unpin(userId: string, id: string) {
    const { error } = await this.supabase
      .from('palette_items')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      throw new PaletteServiceError('UNPIN_FAILED', error.message);
    }

    return { success: true as const };
  }

  /** duration 更新 */
  async updateDuration(userId: string, id: string, durationMinutes: number) {
    const { error } = await this.supabase
      .from('palette_items')
      .update({ duration_minutes: durationMinutes })
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      throw new PaletteServiceError('UPDATE_FAILED', error.message);
    }

    return { success: true as const };
  }
}

/** PaletteService インスタンス作成 */
export function createPaletteService(supabase: SupabaseClient<Database>) {
  return new PaletteService(supabase);
}
