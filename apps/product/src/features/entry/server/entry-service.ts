import 'server-only';

/**
 * Entries Service
 *
 * entries テーブルのビジネスロジック
 */

import { logger } from '@/lib/logger';
import { ServiceError } from '@/lib/trpc/errors';
import type { TablesInsert, TablesUpdate } from '@dayopt/database';
import { determineEntryOrigin } from '../domain';
import { normalizeDateTimeConsistency, removeUndefinedFields } from '../lib/entry-normalization';

import type {
  ConvertPlannedToUnplannedOptions,
  ConvertUnplannedToPlannedOptions,
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

interface EntryRange {
  start: string;
  end: string;
}

type NormalizedEntryInput = TablesInsert<'entries'>;

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

    let query = this.supabase.from('entries').select('*').eq('user_id', userId);

    // タグフィルター
    if (tagId) {
      query = query.eq('tag_id', tagId);
    }

    // origin フィルター
    if (origin) {
      query = query.eq('origin', origin);
    }

    // 検索フィルター（PostgREST演算子インジェクション対策）
    if (search) {
      const sanitized = search.replace(/[.,()\\%*:]/g, '');
      if (sanitized.length > 0) {
        // タグ名でもヒットさせるため、マッチするタグIDを先に取得
        const { data: matchingTags } = await this.supabase
          .from('tags')
          .select('id')
          .eq('user_id', userId)
          .ilike('name', `%${sanitized}%`);

        const matchingTagIds = matchingTags?.map((t) => t.id) ?? [];

        if (matchingTagIds.length > 0) {
          query = query.or(
            `title.ilike.%${sanitized}%,description.ilike.%${sanitized}%,tag_id.in.(${matchingTagIds.join(',')})`,
          );
        } else {
          query = query.or(`title.ilike.%${sanitized}%,description.ilike.%${sanitized}%`);
        }
      }
    }

    // 日付範囲フィルタ（planned range または actual range の交差）
    if (startDate && endDate) {
      query = query.or(
        [
          `and(start_time.lt.${endDate},end_time.gt.${startDate})`,
          `and(actual_start_time.lt.${endDate},actual_end_time.gt.${startDate})`,
        ].join(','),
      );
    } else if (startDate) {
      query = query.or(`start_time.gte.${startDate},actual_start_time.gte.${startDate}`);
    } else if (endDate) {
      query = query.or(`start_time.lte.${endDate},actual_start_time.lte.${endDate}`);
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

    return (data as unknown as EntryWithTags[]).map((entry) => ({
      ...entry,
      tagId: entry.tag_id ?? null,
    }));
  }

  /**
   * エントリをIDで取得
   */
  async getById(options: GetEntryByIdOptions): Promise<EntryWithTags> {
    const { userId, entryId } = options;

    const { data, error } = await this.supabase
      .from('entries')
      .select('*')
      .eq('id', entryId)
      .eq('user_id', userId)
      .single();

    if (error) {
      throw new EntryServiceError('NOT_FOUND', `Entry not found: ${error.message}`);
    }

    return { ...data, tagId: data.tag_id ?? null } as EntryWithTags;
  }

  /**
   * planned range の時間重複をチェック
   */
  async checkPlannedTimeOverlap(options: {
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
      .is('deleted_at', null)
      .not('start_time', 'is', null)
      .not('end_time', 'is', null)
      .lt('start_time', endTime)
      .gt('end_time', startTime);

    if (excludeEntryId) {
      query = query.neq('id', excludeEntryId);
    }

    const { data, error } = await query;

    if (error) {
      logger.error('Planned time overlap check failed:', error);
      return [];
    }

    return data?.map((row) => row.id) ?? [];
  }

  /**
   * effective actual range の時間重複をチェック
   *
   * 自動記録モデルでは「過去の planned（actual 未編集・未スキップ）」も
   * 実績レイヤーを占有する。DB の EXCLUDE 制約は actual NULL の行を見ないため、
   * 自動記録との二重計上はこのチェックが唯一の防衛線になる。
   */
  async checkActualTimeOverlap(options: {
    userId: string;
    startTime: string;
    endTime: string;
    excludeEntryId?: string;
  }): Promise<string[]> {
    const { userId, startTime, endTime, excludeEntryId } = options;
    const nowIso = new Date().toISOString();

    let query = this.supabase
      .from('entries')
      .select('id')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .or(
        [
          // ユーザーが確定した実績
          `and(actual_start_time.lt.${endTime},actual_end_time.gt.${startTime})`,
          // 自動記録（過去の planned、actual 未編集・未スキップ）
          `and(origin.eq.planned,skipped_at.is.null,actual_start_time.is.null,start_time.lt.${endTime},end_time.gt.${startTime},end_time.lte.${nowIso})`,
        ].join(','),
      );

    if (excludeEntryId) {
      query = query.neq('id', excludeEntryId);
    }

    const { data, error } = await query;

    if (error) {
      logger.error('Actual time overlap check failed:', error);
      return [];
    }

    return data?.map((row) => row.id) ?? [];
  }

  /**
   * @deprecated use checkPlannedTimeOverlap / checkActualTimeOverlap
   */
  async checkTimeOverlap(options: {
    userId: string;
    startTime: string;
    endTime: string;
    excludeEntryId?: string;
  }): Promise<string[]> {
    return this.checkActualTimeOverlap(options);
  }

  /**
   * エントリを作成
   */
  async create(options: CreateEntryOptions): Promise<EntryRow> {
    const { userId, input, preventOverlappingEntries, timezone } = options;

    const normalizedInput = this.normalizeCreateInput(userId, input, timezone);

    // 重複チェック
    if (preventOverlappingEntries) {
      await this.ensureNoOverlaps(userId, normalizedInput);
    }

    const insertData = removeUndefinedFields(normalizedInput) as TablesInsert<'entries'>;

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

    if (!oldData) {
      throw new EntryServiceError('NOT_FOUND', 'Entry not found');
    }

    const normalizedInput = this.normalizeUpdateInput(input, oldData, timezone);
    const finalEntry = {
      ...oldData,
      ...removeUndefinedFields(normalizedInput),
    } as EntryRow;

    this.validateEntryShape(finalEntry);

    // 重複チェック
    if (preventOverlappingEntries) {
      await this.ensureNoOverlaps(userId, finalEntry, entryId);
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
   * planned entry を「予定外記録」に明示変換する
   *
   * origin は通常 update では変更不可。分類修正としての planned → unplanned だけを
   * 専用操作に分離し、planned range を破棄して actual range のみを残す。
   */
  async convertPlannedToUnplanned(options: ConvertPlannedToUnplannedOptions): Promise<EntryRow> {
    const { userId, entryId } = options;
    const oldData = await this.getExistingEntry(entryId, userId);

    if (!oldData) {
      throw new EntryServiceError('NOT_FOUND', 'Entry not found');
    }

    if (oldData.origin !== 'planned') {
      throw new EntryServiceError(
        'INVALID_ENTRY_SHAPE',
        'Only planned entries can be converted to unplanned.',
      );
    }

    this.validateRange(oldData.start_time, oldData.end_time, 'INVALID_TIME_RANGE');

    // 自動記録モデル: actual 未編集の planned は plan range が実績（effective actual）
    const actualStart = oldData.actual_start_time ?? oldData.start_time;
    const actualEnd = oldData.actual_end_time ?? oldData.end_time;
    this.validateRange(actualStart, actualEnd, 'INVALID_TIME_RANGE');

    if (new Date(actualEnd!).getTime() > Date.now()) {
      throw new EntryServiceError(
        'UNPLANNED_IN_FUTURE',
        'Unplanned entries cannot end in the future.',
      );
    }

    const finalEntry = {
      ...oldData,
      origin: 'unplanned',
      start_time: null,
      end_time: null,
      duration_minutes: null,
      actual_start_time: actualStart,
      actual_end_time: actualEnd,
      skipped_at: null,
    } as EntryRow;

    this.validateEntryShape(finalEntry);
    await this.ensureNoOverlaps(userId, finalEntry, entryId);

    const { data, error } = await this.supabase
      .from('entries')
      .update({
        origin: 'unplanned',
        start_time: null,
        end_time: null,
        actual_start_time: actualStart,
        actual_end_time: actualEnd,
        skipped_at: null,
      })
      .eq('id', entryId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      if (this.isExclusionViolation(error)) {
        throw new EntryServiceError('TIME_OVERLAP', 'この時間帯には既にエントリがある');
      }
      throw new EntryServiceError('UPDATE_FAILED', `Failed to convert entry: ${error.message}`);
    }

    return data;
  }

  /**
   * unplanned entry を「予定」に明示変換する
   *
   * 誤って予定外として作った過去記録を、同じ actual range の planned entry に戻す。
   * future への自動変換ではなく、Inspector の明示操作からのみ呼ばれる。
   */
  async convertUnplannedToPlanned(options: ConvertUnplannedToPlannedOptions): Promise<EntryRow> {
    const { userId, entryId } = options;
    const oldData = await this.getExistingEntry(entryId, userId);

    if (!oldData) {
      throw new EntryServiceError('NOT_FOUND', 'Entry not found');
    }

    if (oldData.origin !== 'unplanned') {
      throw new EntryServiceError(
        'INVALID_ENTRY_SHAPE',
        'Only unplanned entries can be converted to planned.',
      );
    }

    this.validateRange(oldData.actual_start_time, oldData.actual_end_time, 'INVALID_TIME_RANGE');

    const finalEntry = {
      ...oldData,
      origin: 'planned',
      start_time: oldData.actual_start_time,
      end_time: oldData.actual_end_time,
    } as EntryRow;

    this.validateEntryShape(finalEntry);
    await this.ensureNoOverlaps(userId, finalEntry, entryId);

    const { data, error } = await this.supabase
      .from('entries')
      .update({
        origin: 'planned',
        start_time: oldData.actual_start_time,
        end_time: oldData.actual_end_time,
      })
      .eq('id', entryId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      if (this.isExclusionViolation(error)) {
        throw new EntryServiceError('TIME_OVERLAP', 'この時間帯には既にエントリがある');
      }
      throw new EntryServiceError('UPDATE_FAILED', `Failed to convert entry: ${error.message}`);
    }

    return data;
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

  /**
   * planned エントリをスキップ（計画したがやらなかった）
   *
   * 計画履歴は残し、実績集計から除外する。実績レイヤーが空くので、
   * 同じ時間帯に予定外記録を入れられるようになる。可逆（unskip で解除）。
   */
  async skip(options: DeleteEntryOptions): Promise<EntryRow> {
    const { userId, entryId } = options;
    const oldData = await this.getExistingEntry(entryId, userId);

    if (!oldData) {
      throw new EntryServiceError('NOT_FOUND', 'Entry not found');
    }

    if (oldData.origin !== 'planned') {
      throw new EntryServiceError('INVALID_ENTRY_SHAPE', 'Only planned entries can be skipped.');
    }

    if (oldData.end_time && new Date(oldData.end_time).getTime() > Date.now()) {
      throw new EntryServiceError(
        'SKIP_IN_FUTURE',
        'Future planned entries cannot be skipped. Delete the entry instead.',
      );
    }

    // entries_skip_shape 制約: skipped は actual 未編集のみ。編集済み actual は破棄する
    const { data, error } = await this.supabase
      .from('entries')
      .update({
        skipped_at: new Date().toISOString(),
        actual_start_time: null,
        actual_end_time: null,
      })
      .eq('id', entryId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      throw new EntryServiceError('UPDATE_FAILED', `Failed to skip entry: ${error.message}`);
    }

    return data;
  }

  /**
   * スキップを解除（自動記録が復活する）
   *
   * 解除すると plan range が実績レイヤーを再占有するため、
   * スキップ後に入れた予定外記録と重複する場合は拒否する。
   */
  async unskip(options: DeleteEntryOptions): Promise<EntryRow> {
    const { userId, entryId } = options;
    const oldData = await this.getExistingEntry(entryId, userId);

    if (!oldData) {
      throw new EntryServiceError('NOT_FOUND', 'Entry not found');
    }

    if (!oldData.skipped_at) {
      return oldData;
    }

    await this.ensureNoOverlaps(userId, { ...oldData, skipped_at: null }, entryId);

    const { data, error } = await this.supabase
      .from('entries')
      .update({ skipped_at: null })
      .eq('id', entryId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      throw new EntryServiceError('UPDATE_FAILED', `Failed to unskip entry: ${error.message}`);
    }

    return data;
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

  private normalizeCreateInput(
    userId: string,
    input: CreateEntryOptions['input'],
    timezone?: string,
  ): NormalizedEntryInput {
    const selectedRange = this.resolveCreateRange(input, timezone);
    const origin = determineEntryOrigin(selectedRange.end);

    // 自動記録モデル: actual はユーザーが編集・確定した時だけ値が入る。
    // planned は actual NULL で作成し、過去になったら読み取り側が
    // plan range を実績として扱う（effective actual）。
    const normalized: NormalizedEntryInput = {
      user_id: userId,
      title: input.title,
      description: input.description ?? null,
      origin,
      fulfillment_score: input.fulfillment_score ?? null,
      actual_start_time: origin === 'unplanned' ? selectedRange.start : null,
      actual_end_time: origin === 'unplanned' ? selectedRange.end : null,
      start_time: origin === 'planned' ? selectedRange.start : null,
      end_time: origin === 'planned' ? selectedRange.end : null,
    };

    this.validateEntryShape(normalized);
    return normalized;
  }

  private normalizeUpdateInput(
    input: UpdateEntryOptions['input'],
    existingData: EntryRow,
    timezone?: string,
  ): Record<string, unknown> {
    if (input.origin !== undefined && input.origin !== existingData.origin) {
      throw new EntryServiceError(
        'INVALID_ENTRY_SHAPE',
        'Entry origin cannot be changed. Create a new entry instead.',
      );
    }

    const baseInput = { ...input };
    const existingIsFuturePlanned =
      existingData.origin === 'planned' &&
      existingData.start_time !== null &&
      new Date(existingData.start_time).getTime() > Date.now();

    if (
      existingIsFuturePlanned &&
      (baseInput.start_time !== undefined || baseInput.end_time !== undefined)
    ) {
      const plannedRange = this.resolveMergedRange(
        {
          start: baseInput.start_time ?? existingData.start_time,
          end: baseInput.end_time ?? existingData.end_time,
        },
        timezone,
      );
      // 自動記録モデル: 未来 planned の時間変更は plan range のみ。
      // actual へのコピーはしない（actual NULL = 未編集を維持する）。
      return removeUndefinedFields({
        ...baseInput,
        start_time: plannedRange.start,
        end_time: plannedRange.end,
      });
    }

    if (
      existingData.origin === 'unplanned' &&
      (baseInput.start_time !== undefined || baseInput.end_time !== undefined)
    ) {
      throw new EntryServiceError(
        'INVALID_ENTRY_SHAPE',
        'Unplanned entries do not have planned time ranges.',
      );
    }

    return removeUndefinedFields(baseInput);
  }

  private resolveCreateRange(input: CreateEntryOptions['input'], timezone?: string): EntryRange {
    const start = input.start_time ?? input.actual_start_time ?? null;
    const end = input.end_time ?? input.actual_end_time ?? null;
    return this.resolveMergedRange({ start, end }, timezone);
  }

  private resolveMergedRange(
    range: { start: string | null | undefined; end: string | null | undefined },
    timezone?: string,
  ): EntryRange {
    if (!range.start || !range.end) {
      throw new EntryServiceError('INVALID_ENTRY_SHAPE', 'Entry time range is required');
    }

    const normalized = {
      start_time: range.start,
      end_time: range.end,
    };
    normalizeDateTimeConsistency(normalized, timezone);
    this.validateRange(normalized.start_time, normalized.end_time, 'INVALID_TIME_RANGE');
    return { start: normalized.start_time, end: normalized.end_time };
  }

  private validateEntryShape(entry: {
    origin?: string;
    start_time?: string | null;
    end_time?: string | null;
    actual_start_time?: string | null;
    actual_end_time?: string | null;
  }): void {
    // 自動記録モデル: actual は「両方 NULL（未編集）」か「両方あり」のみ
    const hasActualStart = entry.actual_start_time != null;
    const hasActualEnd = entry.actual_end_time != null;
    if (hasActualStart !== hasActualEnd) {
      throw new EntryServiceError(
        'INVALID_ENTRY_SHAPE',
        'Actual time range must be set or cleared together.',
      );
    }
    if (hasActualStart && hasActualEnd) {
      this.validateRange(entry.actual_start_time!, entry.actual_end_time!, 'INVALID_TIME_RANGE');
    }

    if (entry.origin === 'planned') {
      this.validateRange(entry.start_time ?? null, entry.end_time ?? null, 'INVALID_TIME_RANGE');
      return;
    }

    if (entry.origin === 'unplanned') {
      if (!hasActualStart || !hasActualEnd) {
        throw new EntryServiceError(
          'INVALID_ENTRY_SHAPE',
          'Unplanned entries must have an actual time range.',
        );
      }
      if (entry.start_time !== null || entry.end_time !== null) {
        throw new EntryServiceError(
          'INVALID_ENTRY_SHAPE',
          'Unplanned entries must not have planned time ranges.',
        );
      }
      if (new Date(entry.actual_end_time!).getTime() > Date.now()) {
        throw new EntryServiceError(
          'UNPLANNED_IN_FUTURE',
          'Unplanned entries cannot end in the future.',
        );
      }
      return;
    }

    throw new EntryServiceError('INVALID_ENTRY_SHAPE', 'Invalid entry origin');
  }

  private validateRange(start: string | null, end: string | null, code: string): void {
    if (!start || !end) {
      throw new EntryServiceError(code, 'Entry time range is required');
    }

    const startMs = new Date(start).getTime();
    const endMs = new Date(end).getTime();
    if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) {
      throw new EntryServiceError(code, 'Entry end time must be after start time');
    }
  }

  private async ensureNoOverlaps(
    userId: string,
    entry: {
      origin?: string;
      start_time?: string | null;
      end_time?: string | null;
      actual_start_time?: string | null;
      actual_end_time?: string | null;
      skipped_at?: string | null;
    },
    excludeEntryId?: string,
  ): Promise<void> {
    if (entry.origin === 'planned' && entry.start_time && entry.end_time) {
      const plannedOverlappingIds = await this.checkPlannedTimeOverlap({
        userId,
        startTime: entry.start_time,
        endTime: entry.end_time,
        ...(excludeEntryId !== undefined && { excludeEntryId }),
      });

      if (plannedOverlappingIds.length > 0) {
        throw new EntryServiceError(
          'TIME_OVERLAP',
          `予定時間が既存エントリと重複している（${plannedOverlappingIds.length}件）`,
        );
      }
    }

    // この entry が実績レイヤーで占有する range（effective actual）。
    // 確定済み actual か、自動記録（過去の planned・未編集・未スキップ）の plan range。
    let effectiveStart = entry.actual_start_time ?? null;
    let effectiveEnd = entry.actual_end_time ?? null;
    if (
      !effectiveStart &&
      !effectiveEnd &&
      entry.origin === 'planned' &&
      !entry.skipped_at &&
      entry.start_time &&
      entry.end_time &&
      new Date(entry.end_time).getTime() <= Date.now()
    ) {
      effectiveStart = entry.start_time;
      effectiveEnd = entry.end_time;
    }

    if (effectiveStart && effectiveEnd) {
      const actualOverlappingIds = await this.checkActualTimeOverlap({
        userId,
        startTime: effectiveStart,
        endTime: effectiveEnd,
        ...(excludeEntryId !== undefined && { excludeEntryId }),
      });

      if (actualOverlappingIds.length > 0) {
        throw new EntryServiceError(
          'TIME_OVERLAP',
          `実績時間が既存エントリと重複している（${actualOverlappingIds.length}件）`,
        );
      }
    }
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
