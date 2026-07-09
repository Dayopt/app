import 'server-only';

import { TimeModelOverlapService } from './time-model-overlap-service';
import { TimeModelServiceError } from './time-model-service-error';
import type {
  CreateLogOptions,
  DeleteLogOptions,
  GetLogByIdOptions,
  ListLogsOptions,
  LogInsert,
  LogRow,
  LogUpdate,
  UpdateLogOptions,
} from './time-model-types';
import type { ServiceSupabaseClient } from './types';

export class LogService {
  private readonly overlapService: TimeModelOverlapService;

  constructor(private readonly supabase: ServiceSupabaseClient) {
    this.overlapService = new TimeModelOverlapService(supabase);
  }

  async list(options: ListLogsOptions): Promise<LogRow[]> {
    const {
      userId,
      tagId,
      planId,
      search,
      startDate,
      endDate,
      sortBy = 'start_at',
      sortOrder = 'desc',
      limit,
      offset,
    } = options;

    let query = this.supabase.from('logs').select('*').eq('user_id', userId).is('deleted_at', null);

    if (tagId) query = query.eq('tag_id', tagId);
    if (planId) query = query.eq('plan_id', planId);

    if (search) {
      const sanitized = this.sanitizeSearch(search);
      if (sanitized.length > 0) {
        query = query.or(`title.ilike.%${sanitized}%,note.ilike.%${sanitized}%`);
      }
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

    const { data, error } = await query;

    if (error) {
      throw new TimeModelServiceError('FETCH_FAILED', `Failed to fetch logs: ${error.message}`);
    }

    return data ?? [];
  }

  async getById(options: GetLogByIdOptions): Promise<LogRow> {
    const { userId, logId } = options;
    const { data, error } = await this.supabase
      .from('logs')
      .select('*')
      .eq('id', logId)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .single();

    if (error || !data) {
      throw new TimeModelServiceError('NOT_FOUND', 'Log not found');
    }

    return data;
  }

  async create(options: CreateLogOptions): Promise<LogRow> {
    const { userId, input, preventOverlappingLogs = true } = options;

    this.validateRange(input.start_at, input.end_at, 'INVALID_TIME_RANGE');
    this.ensureLogCanBeCreated(input.end_at);

    if (preventOverlappingLogs) {
      await this.ensureNoLogOverlap(userId, input.start_at, input.end_at);
    }

    const insertData: LogInsert = {
      user_id: userId,
      title: input.title,
      note: input.note ?? null,
      tag_id: input.tagId ?? null,
      plan_id: input.planId ?? null,
      external_calendar_event_id: input.externalCalendarEventId ?? null,
      source: input.externalCalendarEventId ? 'external_calendar' : 'manual',
      start_at: input.start_at,
      end_at: input.end_at,
      fulfillment_score: input.fulfillmentScore ?? null,
    };

    const { data, error } = await this.supabase.from('logs').insert(insertData).select().single();

    if (error) {
      this.handleMutationError(error, 'CREATE_FAILED', 'Failed to create log');
    }

    return data;
  }

  async update(options: UpdateLogOptions): Promise<LogRow> {
    const { userId, logId, input, expectedUpdatedAt, preventOverlappingLogs = true } = options;
    const existing = await this.getById({ userId, logId });

    this.assertOptimisticLock(expectedUpdatedAt, existing.updated_at);

    const nextStartAt = input.start_at ?? existing.start_at;
    const nextEndAt = input.end_at ?? existing.end_at;
    const updatesTime = input.start_at !== undefined || input.end_at !== undefined;

    this.validateRange(nextStartAt, nextEndAt, 'INVALID_TIME_RANGE');
    if (updatesTime) this.ensureLogCanBeCreated(nextEndAt);

    if (preventOverlappingLogs && updatesTime) {
      await this.ensureNoLogOverlap(userId, nextStartAt, nextEndAt, logId);
    }

    const updateData = this.toLogUpdate(input);
    if (Object.keys(updateData).length === 0) return existing;

    const { data, error } = await this.supabase
      .from('logs')
      .update(updateData)
      .eq('id', logId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      this.handleMutationError(error, 'UPDATE_FAILED', 'Failed to update log');
    }

    return data;
  }

  async delete(options: DeleteLogOptions): Promise<{ success: boolean }> {
    const { userId, logId } = options;
    const { error } = await this.supabase.rpc('soft_delete_log', {
      p_log_id: logId,
      p_user_id: userId,
    });

    if (error) {
      throw new TimeModelServiceError('DELETE_FAILED', `Failed to delete log: ${error.message}`);
    }

    return { success: true };
  }

  async restore(options: DeleteLogOptions): Promise<{ success: boolean }> {
    const { userId, logId } = options;
    const { error } = await this.supabase.rpc('restore_log', {
      p_log_id: logId,
      p_user_id: userId,
    });

    if (error) {
      throw new TimeModelServiceError('RESTORE_FAILED', `Failed to restore log: ${error.message}`);
    }

    return { success: true };
  }

  private toLogUpdate(input: UpdateLogOptions['input']): LogUpdate {
    const updateData: LogUpdate = {};
    if (input.title !== undefined) updateData.title = input.title;
    if (input.note !== undefined) updateData.note = input.note;
    if (input.tagId !== undefined) updateData.tag_id = input.tagId;
    if (input.planId !== undefined) updateData.plan_id = input.planId;
    if (input.externalCalendarEventId !== undefined) {
      updateData.external_calendar_event_id = input.externalCalendarEventId;
    }
    if (input.start_at !== undefined) updateData.start_at = input.start_at;
    if (input.end_at !== undefined) updateData.end_at = input.end_at;
    if (input.fulfillmentScore !== undefined) {
      updateData.fulfillment_score = input.fulfillmentScore;
    }
    return updateData;
  }

  private validateRange(startAt: string, endAt: string, code: string): void {
    const startMs = new Date(startAt).getTime();
    const endMs = new Date(endAt).getTime();
    if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) {
      throw new TimeModelServiceError(code, 'Time range end must be after start.');
    }
  }

  private ensureLogCanBeCreated(endAt: string): void {
    if (new Date(endAt).getTime() > Date.now()) {
      throw new TimeModelServiceError('LOG_IN_FUTURE', 'Logs cannot end in the future.');
    }
  }

  private assertOptimisticLock(
    expectedUpdatedAt: string | undefined,
    actualUpdatedAt: string,
  ): void {
    if (!expectedUpdatedAt) return;
    if (new Date(expectedUpdatedAt).getTime() !== new Date(actualUpdatedAt).getTime()) {
      throw new TimeModelServiceError(
        'CONFLICT',
        'This log was updated elsewhere. Reload the latest data.',
      );
    }
  }

  private async ensureNoLogOverlap(
    userId: string,
    startAt: string,
    endAt: string,
    excludeLogId?: string,
  ): Promise<void> {
    const overlappingIds = await this.overlapService.checkLogs({
      userId,
      startAt,
      endAt,
      ...(excludeLogId !== undefined && { excludeLogId }),
    });
    if (overlappingIds.length > 0) {
      throw new TimeModelServiceError(
        'TIME_OVERLAP',
        `Log time overlaps with existing logs (${overlappingIds.length})`,
      );
    }
  }

  private handleMutationError(
    error: { code?: string; message: string },
    code: string,
    prefix: string,
  ): never {
    if (error.code === '23P01') {
      throw new TimeModelServiceError(
        'TIME_OVERLAP',
        'This time range overlaps with an existing item.',
      );
    }
    if (error.code === '23505') {
      throw new TimeModelServiceError('ALREADY_RECORDED', 'Plan already has an active log.');
    }
    throw new TimeModelServiceError(code, `${prefix}: ${error.message}`);
  }

  private sanitizeSearch(search: string): string {
    return search.replace(/[.,()\\%*:]/g, '');
  }
}

export function createLogService(supabase: ServiceSupabaseClient): LogService {
  return new LogService(supabase);
}
