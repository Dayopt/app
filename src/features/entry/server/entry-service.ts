/**
 * Entries Service
 *
 * plans + records を統合した entries テーブルのビジネスロジック
 */

import { logger } from '@/lib/logger';
import { normalizeDateTimeConsistency, removeUndefinedFields } from '../lib/entry-utils';

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

    // 検索フィルター
    if (search) {
      query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
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

    let query = this.supabase
      .from('entries')
      .select('id')
      .eq('user_id', userId)
      .not('start_time', 'is', null)
      .not('end_time', 'is', null)
      .lt('start_time', endTime)
      .gt('end_time', startTime);

    if (excludeEntryId) {
      query = query.neq('id', excludeEntryId);
    }

    const { data, error } = await query;

    if (error) {
      logger.error('Time overlap check failed:', error);
      return [];
    }

    return data?.map((row) => row.id) ?? [];
  }

  /**
   * エントリを作成
   */
  async create(options: CreateEntryOptions): Promise<EntryRow> {
    const { userId, input, preventOverlappingEntries } = options;

    // 日時の正規化
    const normalizedInput = this.normalizeDateTimeFields(input);

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
          `この時間帯には既にエントリがあります（${overlappingIds.length}件）`,
        );
      }
    }

    const insertData = {
      user_id: userId,
      origin,
      ...removeUndefinedFields(normalizedInput),
    };

    const { data, error } = await this.supabase
      .from('entries')
      .insert(insertData as never)
      .select()
      .single();

    if (error) {
      throw new EntryServiceError('CREATE_FAILED', `Failed to create entry: ${error.message}`);
    }

    return data;
  }

  /**
   * エントリを更新
   *
   * actual_start_time / actual_end_time の変更時は、隣接エントリの記録時間を
   * 自動調整（auto-shrink）し、adjustedEntries に含めて返す。
   */
  async update(options: UpdateEntryOptions): Promise<UpdateEntryResult> {
    const { userId, entryId, input, preventOverlappingEntries } = options;

    // 既存データを取得
    const oldData = await this.getExistingEntry(entryId, userId);

    // 日時の正規化
    const normalizedInput = this.normalizeDateTimeFieldsForUpdate(input, oldData);

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
          `この時間帯には既にエントリがあります（${overlappingIds.length}件）`,
        );
      }
    }

    const updateData = removeUndefinedFields(normalizedInput) as Record<string, unknown>;

    // reviewed_at 自動設定: fulfillment_score が設定されたら reviewed_at をセット
    const inputWithFulfillment = input as { fulfillment_score?: number | null };
    if (
      inputWithFulfillment.fulfillment_score != null &&
      oldData?.fulfillment_score !== inputWithFulfillment.fulfillment_score
    ) {
      updateData.reviewed_at = new Date().toISOString();
    } else if (inputWithFulfillment.fulfillment_score === null && oldData?.reviewed_at) {
      // 充実度をクリアした場合、reviewed_at もクリア
      updateData.reviewed_at = null;
    }

    const { data, error } = await this.supabase
      .from('entries')
      .update(updateData)
      .eq('id', entryId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      throw new EntryServiceError('UPDATE_FAILED', `Failed to update entry: ${error.message}`);
    }

    // actual_* 変更時: 隣接エントリの記録時間を自動調整
    const typedInput = input as {
      actual_start_time?: string | null;
      actual_end_time?: string | null;
    };
    const hasActualTimeChange =
      typedInput.actual_start_time !== undefined || typedInput.actual_end_time !== undefined;

    if (hasActualTimeChange) {
      const adjustedEntries = await this.autoShrinkNeighbors({
        userId,
        entryId,
        actualStart: data.actual_start_time ?? data.start_time,
        actualEnd: data.actual_end_time ?? data.end_time,
      });
      return { ...data, adjustedEntries };
    }

    return { ...data, adjustedEntries: [] };
  }

  /**
   * エントリを削除
   */
  async delete(options: DeleteEntryOptions): Promise<{ success: boolean }> {
    const { userId, entryId } = options;

    const { error } = await this.supabase
      .from('entries')
      .delete()
      .eq('id', entryId)
      .eq('user_id', userId);

    if (error) {
      throw new EntryServiceError('DELETE_FAILED', `Failed to delete entry: ${error.message}`);
    }

    return { success: true };
  }

  // ========================================
  // プライベートメソッド
  // ========================================

  /**
   * 隣接エントリの記録時間を自動調整（auto-shrink）
   *
   * 記録時間は「事実の修正」なので、変更されたエントリ側が正として
   * 隣接エントリの記録時間を引き戻す/押し出す。
   *
   * - 左隣（開始が自分より前、終了が自分の開始に食い込む）→ actual_end_time を引き戻す
   * - 右隣（開始が自分の終了に食い込む、終了が自分より後）→ actual_start_time を押し出す
   */
  private async autoShrinkNeighbors(options: {
    userId: string;
    entryId: string;
    actualStart: string | null;
    actualEnd: string | null;
  }): Promise<EntryRow[]> {
    const { userId, entryId, actualStart, actualEnd } = options;
    if (!actualStart || !actualEnd) return [];

    const myStart = new Date(actualStart);
    const myEnd = new Date(actualEnd);
    if (isNaN(myStart.getTime()) || isNaN(myEnd.getTime())) return [];

    // 同ユーザーの他エントリで時間データを持つものを取得
    const { data: entries, error } = await this.supabase
      .from('entries')
      .select('id, start_time, end_time, actual_start_time, actual_end_time')
      .eq('user_id', userId)
      .neq('id', entryId)
      .not('start_time', 'is', null);

    if (error || !entries) return [];

    const adjustments: Array<{ id: string; data: Record<string, string> }> = [];

    for (const entry of entries) {
      const nStart = new Date(entry.actual_start_time ?? entry.start_time ?? '');
      const nEnd = new Date(entry.actual_end_time ?? entry.end_time ?? '');
      if (isNaN(nStart.getTime()) || isNaN(nEnd.getTime())) continue;

      // 左隣: 自分より前に始まり、終了が自分の開始に食い込む → 終了を引き戻す
      if (nStart < myStart && nEnd > myStart && nEnd <= myEnd) {
        adjustments.push({ id: entry.id, data: { actual_end_time: actualStart } });
      }

      // 右隣: 自分の範囲内に始まり、自分より後に終わる → 開始を押し出す
      if (nStart >= myStart && nStart < myEnd && nEnd > myEnd) {
        adjustments.push({ id: entry.id, data: { actual_start_time: actualEnd } });
      }
    }

    if (adjustments.length === 0) return [];

    const updatedEntries: EntryRow[] = [];
    for (const adj of adjustments) {
      const { data, error: updateError } = await this.supabase
        .from('entries')
        .update(adj.data)
        .eq('id', adj.id)
        .eq('user_id', userId)
        .select()
        .single();

      if (!updateError && data) {
        updatedEntries.push(data);
      }
    }

    return updatedEntries;
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

  private normalizeDateTimeFields<T extends Record<string, unknown>>(input: T): T {
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

    normalizeDateTimeConsistency(dateTimeData);

    return {
      ...input,
      ...dateTimeData,
    };
  }

  private normalizeDateTimeFieldsForUpdate<T extends Record<string, unknown>>(
    input: T,
    existingData: EntryRow | null,
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

    normalizeDateTimeConsistency(mergedData);

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
export class EntryServiceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'EntryServiceError';
  }
}

/**
 * サービスインスタンスを作成
 */
export function createEntryService(supabase: ServiceSupabaseClient): EntryService {
  return new EntryService(supabase);
}
