import 'server-only';

import { trackProductEvent } from '@/lib/analytics/product-events';
import { databaseTables, publicRecordSelect } from '@/lib/database';
import { captureUnexpectedDatabaseError } from '@/lib/sentry';
import { createServiceRoleClient } from '@/lib/supabase/oauth';

import { runPrivateTimeblockSearchQuery } from './private-timeblock-search-query';
import { TimeblockOverlapService } from './timeblock-overlap-service';
import { buildTimeblockSearchFilter } from './timeblock-search-query';
import { TimeblockServiceError } from './timeblock-service-error';
import type {
  CreateRecordOptions,
  DeleteRecordOptions,
  GetRecordByIdOptions,
  ListRecordsOptions,
  RecordInsert,
  RecordRow,
  RecordUpdate,
  UpdateRecordOptions,
} from './timeblock-types';
import type { ServiceSupabaseClient } from './types';

export class RecordService {
  private readonly overlapService: TimeblockOverlapService;

  constructor(private readonly supabase: ServiceSupabaseClient) {
    this.overlapService = new TimeblockOverlapService(supabase);
  }

  async list(options: ListRecordsOptions): Promise<RecordRow[]> {
    const {
      userId,
      tagId,
      planId,
      planIds,
      search,
      startDate,
      endDate,
      sortBy = 'start_at',
      sortOrder = 'desc',
      limit,
      offset,
    } = options;

    if (planIds?.length === 0) return [];

    let query = this.supabase
      .from(databaseTables.records)
      .select(publicRecordSelect)
      .eq('user_id', userId)
      .is('deleted_at', null);

    if (tagId) query = query.eq('tag_id', tagId);
    if (planId) query = query.eq('plan_id', planId);
    if (planIds) query = query.in('plan_id', planIds);

    if (search) {
      const searchFilter = await buildTimeblockSearchFilter({
        supabase: this.supabase,
        userId,
        search,
      });
      query = query.or(searchFilter);
    }

    if (startDate && endDate) {
      query = query.lt('start_at', endDate).gt('end_at', startDate);
    } else if (startDate) {
      query = query.gte('start_at', startDate);
    } else if (endDate) {
      query = query.lte('start_at', endDate);
    }

    query = query.order(sortBy, { ascending: sortOrder === 'asc' });

    if (limit) query = query.limit(limit);
    if (offset) query = query.range(offset, offset + (limit ?? 100) - 1);

    const { data, error } = search
      ? await runPrivateTimeblockSearchQuery(() => query)
      : await query;

    if (error) {
      const original = captureUnexpectedDatabaseError(error, {
        feature: 'timeblock',
        operation: 'list_records',
      });
      throw new TimeblockServiceError('FETCH_FAILED', 'Failed to fetch records', {
        cause: original,
      });
    }

    return data ?? [];
  }

  async getById(options: GetRecordByIdOptions): Promise<RecordRow> {
    const { userId, recordId } = options;
    const { data, error } = await this.supabase
      .from(databaseTables.records)
      .select(publicRecordSelect)
      .eq('id', recordId)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) {
      const original = captureUnexpectedDatabaseError(error, {
        feature: 'timeblock',
        operation: 'get_record_by_id',
      });
      throw new TimeblockServiceError('FETCH_FAILED', 'Failed to fetch record', {
        cause: original,
      });
    }
    if (!data) {
      throw new TimeblockServiceError('NOT_FOUND', 'Record not found');
    }

    return data;
  }

  async create(options: CreateRecordOptions): Promise<RecordRow> {
    const { userId, input, preventOverlappingRecords = true } = options;

    this.validateRange(input.start_at, input.end_at, 'INVALID_TIME_RANGE');
    this.ensureRecordCanBeCreated(input.end_at);

    if (input.planId) {
      await this.ensureRecordablePlan(userId, input.planId);
    }

    if (preventOverlappingRecords) {
      await this.ensureNoRecordOverlap(userId, input.start_at, input.end_at);
    }

    const insertData: RecordInsert = {
      user_id: userId,
      title: input.title,
      note: input.note ?? null,
      tag_id: input.tagId ?? null,
      plan_id: input.planId ?? null,
      external_calendar_event_id: input.externalCalendarEventId ?? null,
      source: input.externalCalendarEventId ? 'external_calendar' : 'manual',
      start_at: input.start_at,
      end_at: input.end_at,
    };

    const { data, error } = await this.supabase
      .from(databaseTables.records)
      .insert(insertData)
      .select(publicRecordSelect)
      .single();

    if (error) {
      this.handleMutationError(error, 'CREATE_FAILED', 'Failed to create record');
    }

    await trackProductEvent({ eventName: 'record_created', userId });
    return data;
  }

  async update(options: UpdateRecordOptions): Promise<RecordRow> {
    const {
      userId,
      recordId,
      input,
      expectedUpdatedAt,
      preventOverlappingRecords = true,
    } = options;
    const existing = await this.getById({ userId, recordId });

    this.assertOptimisticLock(expectedUpdatedAt, existing.updated_at);

    const nextStartAt = input.start_at ?? existing.start_at;
    const nextEndAt = input.end_at ?? existing.end_at;
    const updatesTime = input.start_at !== undefined || input.end_at !== undefined;

    this.validateRange(nextStartAt, nextEndAt, 'INVALID_TIME_RANGE');
    if (updatesTime) this.ensureRecordCanBeCreated(nextEndAt);

    if (input.planId) {
      await this.ensureRecordablePlan(userId, input.planId);
    }

    if (preventOverlappingRecords && updatesTime) {
      await this.ensureNoRecordOverlap(userId, nextStartAt, nextEndAt, recordId);
    }

    const updateData = this.toRecordUpdate(input);
    if (Object.keys(updateData).length === 0) return existing;

    const { data, error } = await this.supabase
      .from(databaseTables.records)
      .update(updateData)
      .eq('id', recordId)
      .eq('user_id', userId)
      .select(publicRecordSelect)
      .single();

    if (error) {
      this.handleMutationError(error, 'UPDATE_FAILED', 'Failed to update record');
    }

    return data;
  }

  async delete(options: DeleteRecordOptions): Promise<{ success: boolean }> {
    const { userId, recordId } = options;
    const { error } = await this.supabase.rpc('soft_delete_record', {
      p_record_id: recordId,
      p_user_id: userId,
    });

    if (error) {
      const original = captureUnexpectedDatabaseError(error, {
        feature: 'timeblock',
        operation: 'delete_record',
      });
      throw new TimeblockServiceError('DELETE_FAILED', 'Failed to delete record', {
        cause: original,
      });
    }

    return { success: true };
  }

  async restore(options: DeleteRecordOptions): Promise<{ success: boolean }> {
    const { userId, recordId } = options;
    const adminClient = createServiceRoleClient();
    const { error } = await adminClient.rpc('restore_record', {
      p_record_id: recordId,
      p_user_id: userId,
    });

    if (error) {
      const original = captureUnexpectedDatabaseError(error, {
        feature: 'timeblock',
        operation: 'restore_record',
      });
      throw new TimeblockServiceError('RESTORE_FAILED', 'Failed to restore record', {
        cause: original,
      });
    }

    return { success: true };
  }

  private toRecordUpdate(input: UpdateRecordOptions['input']): RecordUpdate {
    const updateData: RecordUpdate = {};
    if (input.title !== undefined) updateData.title = input.title;
    if (input.note !== undefined) updateData.note = input.note;
    if (input.tagId !== undefined) updateData.tag_id = input.tagId;
    if (input.planId !== undefined) updateData.plan_id = input.planId;
    if (input.externalCalendarEventId !== undefined) {
      updateData.external_calendar_event_id = input.externalCalendarEventId;
    }
    if (input.start_at !== undefined) updateData.start_at = input.start_at;
    if (input.end_at !== undefined) updateData.end_at = input.end_at;
    return updateData;
  }

  private validateRange(startAt: string, endAt: string, code: string): void {
    const startMs = new Date(startAt).getTime();
    const endMs = new Date(endAt).getTime();
    if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) {
      throw new TimeblockServiceError(code, 'Time range end must be after start.');
    }
  }

  private ensureRecordCanBeCreated(endAt: string): void {
    if (new Date(endAt).getTime() > Date.now()) {
      throw new TimeblockServiceError('RECORD_IN_FUTURE', 'Records cannot end in the future.');
    }
  }

  private assertOptimisticLock(
    expectedUpdatedAt: string | undefined,
    actualUpdatedAt: string,
  ): void {
    if (!expectedUpdatedAt) return;
    if (new Date(expectedUpdatedAt).getTime() !== new Date(actualUpdatedAt).getTime()) {
      throw new TimeblockServiceError(
        'CONFLICT',
        'This record was updated elsewhere. Reload the latest data.',
      );
    }
  }

  private async ensureNoRecordOverlap(
    userId: string,
    startAt: string,
    endAt: string,
    excludeRecordId?: string,
  ): Promise<void> {
    const overlappingIds = await this.overlapService.checkRecords({
      userId,
      startAt,
      endAt,
      ...(excludeRecordId !== undefined && { excludeRecordId }),
    });
    if (overlappingIds.length > 0) {
      throw new TimeblockServiceError(
        'TIME_OVERLAP',
        `Record time overlaps with existing records (${overlappingIds.length})`,
      );
    }
  }

  private async ensureRecordablePlan(userId: string, planId: string): Promise<void> {
    const { data, error } = await this.supabase
      .from('plans')
      .select('id, end_at, skipped_at')
      .eq('id', planId)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) {
      const original = captureUnexpectedDatabaseError(error, {
        feature: 'timeblock',
        operation: 'get_recordable_plan',
      });
      throw new TimeblockServiceError('FETCH_FAILED', 'Failed to fetch linked plan', {
        cause: original,
      });
    }
    if (!data) {
      throw new TimeblockServiceError('NOT_FOUND', 'Plan not found');
    }

    if (new Date(data.end_at).getTime() > Date.now()) {
      throw new TimeblockServiceError(
        'RECORD_IN_FUTURE',
        'Future plans cannot have linked records.',
      );
    }

    if (data.skipped_at) {
      throw new TimeblockServiceError('INVALID_INPUT', 'Skipped plans cannot have linked records.');
    }
  }

  private handleMutationError(
    error: { code?: string; message: string },
    code: string,
    prefix: string,
  ): never {
    if (error.code === '23P01') {
      throw new TimeblockServiceError(
        'TIME_OVERLAP',
        'This time range overlaps with an existing item.',
      );
    }
    const original = captureUnexpectedDatabaseError(error, {
      feature: 'timeblock',
      operation: code.toLowerCase(),
    });
    throw new TimeblockServiceError(code, prefix, { cause: original });
  }
}

export function createRecordService(supabase: ServiceSupabaseClient): RecordService {
  return new RecordService(supabase);
}
