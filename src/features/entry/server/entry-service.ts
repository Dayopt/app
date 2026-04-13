import 'server-only';

/**
 * Entries Service
 *
 * entries テーブルのビジネスロジック
 */

import type { TablesInsert, TablesUpdate } from '@/lib/database.types';
import { logger } from '@/lib/logger';
import { ServiceError } from '@/lib/trpc/errors';
import { normalizeDateTimeConsistency, removeUndefinedFields } from '../lib/entry-normalization';

import type {
  CreateEntryOptions,
  DeleteEntryOptions,
  EntryRow,
  EntryWithTags,
  GetEntryByIdOptions,
  ListEntriesOptions,
  ServiceSupabaseClient,
  UpdateEntryOptions,
  UpdateEntryResult,
} from './types';

/**
 * エントリサービスクラス
 */
export class EntryService {
  constructor(private readonly supabase: ServiceSupabaseClient) {}

  /**
   * エントリ一覧を取得
   */
  async list(options: ListEntriesOptions): Promise<EntryWithTags[]> {
    const {
      userId,
      tagId,
      origin,
      search,
      startDate,
      endDate,
      fulfillmentScoreMin,
      fulfillmentScoreMax,
      sortBy = 'created_at',
      sortOrder = 'desc',
      limit,
      offset,
    } = options;

    let query = this.supabase.from('entries').select('*, entry_tags(tag_id)').eq('user_id', userId);

    // タグフィルター
    if (tagId) {
      const entryIds = await this.getEntryIdsByTagId(tagId);
      if (entryIds.length === 0) {
        return [];
      }
      query = query.in('id', entryIds);
    }

    // origin フィルター
    if (origin) {
      query = query.eq('origin', origin);
    }

    // 検索フィルター（PostgREST演算子インジェクション対策）
    if (search) {
      const sanitized = search.replace(/[.,()\\%*:]/g, '');
      if (sanitized.length > 0) {
        query = query.or(`title.ilike.%${sanitized}%,description.ilike.%${sanitized}%`);
      }
    }

    // 日付範囲フィルタ（start_time基準）
    if (startDate) {
      query = query.gte('start_time', startDate);
    }
    if (endDate) {
      query = query.lte('start_time', endDate);
    }

    // 充実度フィルタ
    if (fulfillmentScoreMin) {
      query = query.gte('fulfillment_score', fulfillmentScoreMin);
    }
    if (fulfillmentScoreMax) {
      query = query.lte('fulfillment_score', fulfillmentScoreMax);
    }

    // ソート
    query = query.order(sortBy, { ascending: sortOrder === 'asc' });

    // ページネーション
    if (limit) {
      query = query.limit(limit);
    }
    if (offset) {
      query = query.range(offset, offset + (limit ?? 100) - 1);
    }

    const { data, error } = await query;

    if (error) {
      throw new EntryServiceError('FETCH_FAILED', `Failed to fetch entries: ${error.message}`);
    }

    return (data as unknown as EntryWithTags[]).map((entry) => this.formatEntryWithTags(entry));
  }

  /**
   * エントリをIDで取得
   */
  async getById(options: GetEntryByIdOptions): Promise<EntryWithTags> {
    const { userId, entryId, includeTags } = options;

    if (includeTags) {
      const { data, error } = await this.supabase
        .from('entries')
        .select('*, entry_tags(tag_id)')
        .eq('id', entryId)
        .eq('user_id', userId)
        .single();

      if (error) {
        throw new EntryServiceError('NOT_FOUND', `Entry not found: ${error.message}`);
      }

      return this.formatEntryWithTags(data as unknown as EntryWithTags);
    }

    const { data, error } = await this.supabase
      .from('entries')
      .select('*')
      .eq('id', entryId)
      .eq('user_id', userId)
      .single();

    if (error) {
      throw new EntryServiceError('NOT_FOUND', `Entry not found: ${error.message}`);
    }

    return data as EntryWithTags;
  }

  /**
   * 時間重複をチェック
   */
  async checkTimeOverlap(options: {
    userId: string;
    startTime: string;
    endTime: string;
    excludeEntryId?: string;
  }): Promise<string[]> {
    const { userId, startTime, endTime, excludeEntryId } = options;

    // 半開区間 [start, end) の重複判定
    // 境界精度の問題を回避するため、1秒バッファを設けて lte/gte で比較
    // （最小エントリ幅15分に対して1秒は十分安全なマージン）
    const endTimeExclusive = new Date(new Date(endTime).getTime() - 1000).toISOString();
    const startTimeExclusive = new Date(new Date(startTime).getTime() + 1000).toISOString();

    // まず予定時間ベースで候補を取得
    let query = this.supabase
      .from('entries')
      .select('id, actual_start_time, actual_end_time, start_time, end_time')
      .eq('user_id', userId)
      .not('start_time', 'is', null)
      .not('end_time', 'is', null)
      .lte('start_time', endTimeExclusive)
      .gte('end_time', startTimeExclusive);

    if (excludeEntryId) {
      query = query.neq('id', excludeEntryId);
    }

    const { data, error } = await query;

    if (error) {
      logger.error('Time overlap check failed:', error);
      return [];
    }

    if (!data) return [];

    // actual 時間が記録されているエントリは、実質的な占有範囲で再判定
    // 「予定9:00-10:00、実績9:00-9:45」→ 9:45-10:00は空きとみなす
    const newStart = new Date(startTime).getTime() + 1000;
    const newEnd = new Date(endTime).getTime() - 1000;

    return data
      .filter((row) => {
        const effectiveStart = new Date(row.actual_start_time ?? row.start_time!).getTime();
        const effectiveEnd = new Date(row.actual_end_time ?? row.end_time!).getTime();
        return effectiveStart < newEnd && effectiveEnd > newStart;
      })
      .map((row) => row.id);
  }

  /**
   * エントリを作成
   */
  async create(options: CreateEntryOptions): Promise<EntryRow> {
    const { userId, input, preventOverlappingEntries, timezone } = options;

    // 日時の正規化（ユーザーTZで日跨ぎを判定）
    const normalizedInput = this.normalizeDateTimeFields(input, timezone);

    const origin = normalizedInput.origin ?? 'planned';

    // 重複チェック
    if (preventOverlappingEntries && normalizedInput.start_time && normalizedInput.end_time) {
      const overlappingIds = await this.checkTimeOverlap({
        userId,
        startTime: normalizedInput.start_time as string,
        endTime: normalizedInput.end_time as string,
      });

      if (overlappingIds.length > 0) {
        throw new EntryServiceError(
          'TIME_OVERLAP',
          `この時間帯には既にエントリがある（${overlappingIds.length}件）`,
        );
      }
    }

    const insertData = {
      user_id: userId,
      origin,
      title: normalizedInput.title,
      ...removeUndefinedFields(normalizedInput),
    } as TablesInsert<'entries'>;

    const { data, error } = await this.supabase
      .from('entries')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      if (this.isExclusionViolation(error)) {
        throw new EntryServiceError('TIME_OVERLAP', 'この時間帯には既にエントリがある');
      }
      throw new EntryServiceError('CREATE_FAILED', `Failed to create entry: ${error.message}`);
    }

    return data;
  }

  /**
   * エントリを更新
   */
  async update(options: UpdateEntryOptions): Promise<UpdateEntryResult> {
    const { userId, entryId, input, preventOverlappingEntries, expectedUpdatedAt, timezone } =
      options;

    // 既存データを取得
    const oldData = await this.getExistingEntry(entryId, userId);

    // 楽観的ロック: 他タブ/デバイスでの変更を検出
    // Date比較で形式差異（+00:00 vs Z、マイクロ秒精度の違い等）を吸収
    if (expectedUpdatedAt && oldData?.updated_at) {
      const expected = new Date(expectedUpdatedAt).getTime();
      const actual = new Date(oldData.updated_at).getTime();
      if (expected !== actual) {
        throw new EntryServiceError(
          'CONFLICT',
          'このエントリは他の場所で更新された。最新データをリロードして',
        );
      }
    }

    // 日時の正規化（ユーザーTZで日跨ぎを判定）
    const normalizedInput = this.normalizeDateTimeFieldsForUpdate(input, oldData, timezone);

    // 重複チェック
    const finalStartTime =
      (normalizedInput as { start_time?: string }).start_time ?? oldData?.start_time;
    const finalEndTime = (normalizedInput as { end_time?: string }).end_time ?? oldData?.end_time;

    if (preventOverlappingEntries && finalStartTime && finalEndTime) {
      const overlappingIds = await this.checkTimeOverlap({
        userId,
        startTime: finalStartTime,
        endTime: finalEndTime,
        excludeEntryId: entryId,
      });

      if (overlappingIds.length > 0) {
        throw new EntryServiceError(
          'TIME_OVERLAP',
          `この時間帯には既にエントリがある（${overlappingIds.length}件）`,
        );
      }
    }

    const updateData = removeUndefinedFields(normalizedInput) as TablesUpdate<'entries'>;

    const { data, error } = await this.supabase
      .from('entries')
      .update(updateData)
      .eq('id', entryId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      if (this.isExclusionViolation(error)) {
        throw new EntryServiceError('TIME_OVERLAP', 'この時間帯には既にエントリがある');
      }
      throw new EntryServiceError('UPDATE_FAILED', `Failed to update entry: ${error.message}`);
    }

    return { ...data, adjustedEntries: [] };
  }

  /**
   * エントリをソフト削除（deleted_at を設定）
   *
   * SECURITY DEFINER の RPC 関数でRLSをバイパス。
   * SELECT ポリシーの deleted_at IS NULL が UPDATE の WITH CHECK に
   * 適用されるため、直接 UPDATE では RLS 違反になる。
   */
  async delete(options: DeleteEntryOptions): Promise<{ success: boolean }> {
    const { userId, entryId } = options;

    const { error } = await this.supabase.rpc('soft_delete_entry', {
      p_entry_id: entryId,
      p_user_id: userId,
    });

    if (error) {
      throw new EntryServiceError('DELETE_FAILED', `Failed to delete entry: ${error.message}`);
    }

    return { success: true };
  }

  /**
   * ソフト削除されたエントリを復元（Undo用）
   *
   * SECURITY DEFINER の RPC 関数でRLSをバイパス。
   */
  async restore(options: DeleteEntryOptions): Promise<{ success: boolean }> {
    const { userId, entryId } = options;

    const { error } = await this.supabase.rpc('restore_entry', {
      p_entry_id: entryId,
      p_user_id: userId,
    });

    if (error) {
      throw new EntryServiceError('RESTORE_FAILED', `Failed to restore entry: ${error.message}`);
    }

    return { success: true };
  }

  // ========================================
  // プライベートメソッド
  // ========================================

  /**
   * PostgreSQL exclusion constraint violation (23P01) を判定
   */
  private isExclusionViolation(error: { code?: string }): boolean {
    return error.code === '23P01';
  }

  private async getEntryIdsByTagId(tagId: string): Promise<string[]> {
    const { data, error } = await this.supabase
      .from('entry_tags')
      .select('entry_id')
      .eq('tag_id', tagId);

    if (error) {
      throw new EntryServiceError(
        'TAG_FILTER_FAILED',
        `Failed to apply tag filter: ${error.message}`,
      );
    }

    return data.map((row) => row.entry_id);
  }

  private formatEntryWithTags(entry: EntryWithTags): EntryWithTags {
    // PostgREST は entry_id にユニーク制約がある場合オブジェクトを返す（配列ではなく）
    const tags = entry.entry_tags;
    const tagId = Array.isArray(tags) ? (tags[0]?.tag_id ?? null) : (tags?.tag_id ?? null);
    const { entry_tags: _, ...entryData } = entry;
    return { ...entryData, tagId };
  }

  private normalizeDateTimeFields<T extends Record<string, unknown>>(
    input: T,
    timezone?: string,
  ): T {
    const dateTimeData: {
      start_time?: string | null;
      end_time?: string | null;
    } = {};

    const typedInput = input as {
      start_time?: string | null;
      end_time?: string | null;
    };
    if (typedInput.start_time !== undefined) dateTimeData.start_time = typedInput.start_time;
    if (typedInput.end_time !== undefined) dateTimeData.end_time = typedInput.end_time;

    normalizeDateTimeConsistency(dateTimeData, timezone);

    return {
      ...input,
      ...dateTimeData,
    };
  }

  private normalizeDateTimeFieldsForUpdate<T extends Record<string, unknown>>(
    input: T,
    existingData: EntryRow | null,
    timezone?: string,
  ): T {
    const typedInput = input as {
      start_time?: string | null;
      end_time?: string | null;
    };
    const hasDateTimeUpdate = !!(typedInput.start_time || typedInput.end_time);

    if (!hasDateTimeUpdate || !existingData) {
      return input;
    }

    const mergedData: {
      start_time?: string | null;
      end_time?: string | null;
    } = {};

    const startTimeValue = typedInput.start_time ?? existingData.start_time;
    if (startTimeValue !== undefined) mergedData.start_time = startTimeValue;

    const endTimeValue = typedInput.end_time ?? existingData.end_time;
    if (endTimeValue !== undefined) mergedData.end_time = endTimeValue;

    normalizeDateTimeConsistency(mergedData, timezone);

    const result = { ...input } as Record<string, unknown>;

    if (mergedData.start_time !== undefined) result.start_time = mergedData.start_time;
    if (mergedData.end_time !== undefined) result.end_time = mergedData.end_time;

    return result as T;
  }

  private async getExistingEntry(entryId: string, userId: string): Promise<EntryRow | null> {
    const { data } = await this.supabase
      .from('entries')
      .select('*')
      .eq('id', entryId)
      .eq('user_id', userId)
      .single();

    return data;
  }
}

/**
 * エントリサービスエラー
 */
export class EntryServiceError extends ServiceError {
  constructor(code: string, message: string) {
    super(code, message);
    this.name = 'EntryServiceError';
  }
}

/**
 * サービスインスタンスを作成
 */
export function createEntryService(supabase: ServiceSupabaseClient): EntryService {
  return new EntryService(supabase);
}
