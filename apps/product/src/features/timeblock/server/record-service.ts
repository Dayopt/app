import 'server-only';

import { databaseTables, publicRecordSelect } from '@/lib/database';
import { captureUnexpectedDatabaseError } from '@/lib/sentry';

import { assertExactOptimisticLock } from './plan-guards';
import { runPrivateTimeblockSearchQuery } from './private-timeblock-search-query';
import {
  createTimeblockCommandClient,
  type TimeblockCommandClient,
} from './timeblock-command-client';
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
  UpdateRecordOptions,
} from './timeblock-types';
import type { ServiceSupabaseClient } from './types';

export class RecordService {
  private readonly overlapService: TimeblockOverlapService;
  private commands: TimeblockCommandClient | null = null;

  constructor(private readonly supabase: ServiceSupabaseClient) {
    this.overlapService = new TimeblockOverlapService(supabase);
  }

  private get commandClient(): TimeblockCommandClient {
    this.commands ??= createTimeblockCommandClient();
    return this.commands;
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

    if (preventOverlappingRecords) {
      await this.ensureNoRecordOverlap(userId, input.start_at, input.end_at);
    }

    const insertData: Omit<RecordInsert, 'user_id'> = {
      title: input.title,
      note: input.note ?? null,
      tag_id: input.tagId ?? null,
      plan_id: input.planId ?? null,
      external_calendar_event_id: input.externalCalendarEventId ?? null,
      source: input.externalCalendarEventId ? 'external_calendar' : 'manual',
      start_at: input.start_at,
      end_at: input.end_at,
    };

    return this.commandClient.createRecord({
      userId,
      title: insertData.title,
      note: insertData.note ?? null,
      tagId: insertData.tag_id ?? null,
      planId: insertData.plan_id ?? null,
      externalCalendarEventId: insertData.external_calendar_event_id ?? null,
      source: insertData.source === 'external_calendar' ? 'external_calendar' : 'manual',
      startAt: insertData.start_at,
      endAt: insertData.end_at,
    });
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
    assertExactOptimisticLock(expectedUpdatedAt, existing.updated_at);

    const nextStartAt = input.start_at ?? existing.start_at;
    const nextEndAt = input.end_at ?? existing.end_at;
    const updatesTime = input.start_at !== undefined || input.end_at !== undefined;

    this.validateRange(nextStartAt, nextEndAt, 'INVALID_TIME_RANGE');

    if (preventOverlappingRecords && updatesTime) {
      await this.ensureNoRecordOverlap(userId, nextStartAt, nextEndAt, recordId);
    }

    return this.commandClient.updateRecord({
      userId,
      recordId,
      expectedUpdatedAt,
      title: input.title ?? existing.title,
      note: input.note === undefined ? existing.note : input.note,
      tagId: input.tagId === undefined ? existing.tag_id : input.tagId,
      planId: input.planId === undefined ? existing.plan_id : input.planId,
      externalCalendarEventId:
        input.externalCalendarEventId === undefined
          ? existing.external_calendar_event_id
          : input.externalCalendarEventId,
      source:
        existing.source === 'external_calendar'
          ? 'external_calendar'
          : existing.source === 'api'
            ? 'api'
            : 'manual',
      startAt: nextStartAt,
      endAt: nextEndAt,
    });
  }

  async delete(options: DeleteRecordOptions): Promise<RecordRow> {
    const { userId, recordId, expectedUpdatedAt } = options;
    return this.commandClient.deleteRecord({ userId, recordId, expectedUpdatedAt });
  }

  async restore(options: DeleteRecordOptions): Promise<RecordRow> {
    const { userId, recordId, expectedUpdatedAt } = options;
    return this.commandClient.restoreRecord({ userId, recordId, expectedUpdatedAt });
  }

  private validateRange(startAt: string, endAt: string, code: string): void {
    const startMs = new Date(startAt).getTime();
    const endMs = new Date(endAt).getTime();
    if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) {
      throw new TimeblockServiceError(code, 'Time range end must be after start.');
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
}

export function createRecordService(supabase: ServiceSupabaseClient): RecordService {
  return new RecordService(supabase);
}
