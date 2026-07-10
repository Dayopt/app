import 'server-only';

import { TimeModelOverlapService } from './time-model-overlap-service';
import { TimeModelServiceError } from './time-model-service-error';
import type {
  ConfirmDayPlansOptions,
  CreatePlanOptions,
  DeletePlanOptions,
  GetPlanByIdOptions,
  ListPlansOptions,
  LogRow,
  PlanInsert,
  PlanRow,
  PlanUpdate,
  RecordPlanOptions,
  UpdatePlanOptions,
} from './time-model-types';
import type { ServiceSupabaseClient } from './types';

export class PlanService {
  private readonly overlapService: TimeModelOverlapService;

  constructor(private readonly supabase: ServiceSupabaseClient) {
    this.overlapService = new TimeModelOverlapService(supabase);
  }

  async list(options: ListPlansOptions): Promise<PlanRow[]> {
    const {
      userId,
      tagId,
      search,
      startDate,
      endDate,
      includeSkipped = true,
      sortBy = 'start_at',
      sortOrder = 'asc',
      limit,
      offset,
    } = options;

    let query = this.supabase
      .from('plans')
      .select('*')
      .eq('user_id', userId)
      .is('deleted_at', null);

    if (tagId) query = query.eq('tag_id', tagId);
    if (!includeSkipped) query = query.is('skipped_at', null);

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
      throw new TimeModelServiceError('FETCH_FAILED', `Failed to fetch plans: ${error.message}`);
    }

    return data ?? [];
  }

  async getById(options: GetPlanByIdOptions): Promise<PlanRow> {
    const { userId, planId } = options;
    const { data, error } = await this.supabase
      .from('plans')
      .select('*')
      .eq('id', planId)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .single();

    if (error || !data) {
      throw new TimeModelServiceError('NOT_FOUND', 'Plan not found');
    }

    return data;
  }

  async create(options: CreatePlanOptions): Promise<PlanRow> {
    const { userId, input, preventOverlappingPlans = true } = options;

    this.validateRange(input.start_at, input.end_at, 'INVALID_TIME_RANGE');
    this.ensurePlanCanBeCreated(input.end_at);

    if (preventOverlappingPlans) {
      await this.ensureNoPlanOverlap(userId, input.start_at, input.end_at);
    }

    const insertData: PlanInsert = {
      user_id: userId,
      title: input.title,
      note: input.note ?? null,
      tag_id: input.tagId ?? null,
      external_calendar_event_id: input.externalCalendarEventId ?? null,
      source: input.externalCalendarEventId ? 'external_calendar' : 'manual',
      start_at: input.start_at,
      end_at: input.end_at,
    };

    const { data, error } = await this.supabase.from('plans').insert(insertData).select().single();

    if (error) {
      this.handleMutationError(error, 'CREATE_FAILED', 'Failed to create plan');
    }

    return data;
  }

  async update(options: UpdatePlanOptions): Promise<PlanRow> {
    const { userId, planId, input, expectedUpdatedAt, preventOverlappingPlans = true } = options;
    const existing = await this.getById({ userId, planId });

    this.assertOptimisticLock(expectedUpdatedAt, existing.updated_at);

    const nextStartAt = input.start_at ?? existing.start_at;
    const nextEndAt = input.end_at ?? existing.end_at;
    const updatesTime = input.start_at !== undefined || input.end_at !== undefined;

    if (updatesTime && this.isPastPlan(existing)) {
      throw new TimeModelServiceError(
        'PLAN_TIME_LOCKED',
        'Past plan time fields cannot be changed.',
      );
    }

    this.validateRange(nextStartAt, nextEndAt, 'INVALID_TIME_RANGE');
    if (updatesTime) this.ensurePlanCanBeCreated(nextEndAt);

    if (preventOverlappingPlans && updatesTime) {
      await this.ensureNoPlanOverlap(userId, nextStartAt, nextEndAt, planId);
    }

    const updateData = this.toPlanUpdate(input);
    if (Object.keys(updateData).length === 0) return existing;

    const { data, error } = await this.supabase
      .from('plans')
      .update(updateData)
      .eq('id', planId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      this.handleMutationError(error, 'UPDATE_FAILED', 'Failed to update plan');
    }

    return data;
  }

  async delete(options: DeletePlanOptions): Promise<{ success: boolean }> {
    const { userId, planId } = options;
    const { error } = await this.supabase.rpc('soft_delete_plan', {
      p_plan_id: planId,
      p_user_id: userId,
    });

    if (error) {
      throw new TimeModelServiceError('DELETE_FAILED', `Failed to delete plan: ${error.message}`);
    }

    return { success: true };
  }

  async restore(options: DeletePlanOptions): Promise<{ success: boolean }> {
    const { userId, planId } = options;
    const { error } = await this.supabase.rpc('restore_plan', {
      p_plan_id: planId,
      p_user_id: userId,
    });

    if (error) {
      throw new TimeModelServiceError('RESTORE_FAILED', `Failed to restore plan: ${error.message}`);
    }

    return { success: true };
  }

  async skip(options: DeletePlanOptions): Promise<PlanRow> {
    const { userId, planId } = options;
    const existing = await this.getById({ userId, planId });

    if (!this.isPastPlan(existing)) {
      throw new TimeModelServiceError(
        'SKIP_IN_FUTURE',
        'Future plans cannot be skipped. Delete the plan instead.',
      );
    }

    await this.ensurePlanNotRecorded(userId, planId);

    const { data, error } = await this.supabase
      .from('plans')
      .update({ skipped_at: new Date().toISOString() })
      .eq('id', planId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      throw new TimeModelServiceError('UPDATE_FAILED', `Failed to skip plan: ${error.message}`);
    }

    return data;
  }

  async unskip(options: DeletePlanOptions): Promise<PlanRow> {
    const { userId, planId } = options;
    const existing = await this.getById({ userId, planId });

    if (!existing.skipped_at) return existing;

    const { data, error } = await this.supabase
      .from('plans')
      .update({ skipped_at: null })
      .eq('id', planId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      throw new TimeModelServiceError('UPDATE_FAILED', `Failed to unskip plan: ${error.message}`);
    }

    return data;
  }

  async record(options: RecordPlanOptions): Promise<LogRow> {
    const { userId, planId } = options;
    const plan = await this.getById({ userId, planId });

    if (!this.isPastPlan(plan)) {
      throw new TimeModelServiceError('RECORD_IN_FUTURE', 'Future plans cannot be recorded.');
    }

    if (plan.skipped_at) {
      throw new TimeModelServiceError('INVALID_INPUT', 'Skipped plans cannot be recorded.');
    }

    await this.ensurePlanNotRecorded(userId, planId);
    await this.ensureNoLogOverlap(userId, plan.start_at, plan.end_at);

    const { data, error } = await this.supabase
      .from('logs')
      .insert({
        user_id: userId,
        title: plan.title,
        note: plan.note,
        tag_id: plan.tag_id,
        plan_id: plan.id,
        external_calendar_event_id: null,
        source: 'from_plan',
        start_at: plan.start_at,
        end_at: plan.end_at,
      })
      .select()
      .single();

    if (error) {
      this.handleRecordMutationError(error, 'Failed to record plan');
    }

    return data;
  }

  async confirmDay(options: ConfirmDayPlansOptions): Promise<LogRow[]> {
    const { userId, input } = options;
    this.validateRange(input.start_at, input.end_at, 'INVALID_TIME_RANGE');

    const { data, error } = await this.supabase.rpc('confirm_day_plans_to_logs', {
      p_confirmed_at: new Date().toISOString(),
      p_end_at: input.end_at,
      p_start_at: input.start_at,
      p_user_id: userId,
    });

    if (error) {
      this.handleRecordMutationError(error, 'Failed to confirm day plans');
    }

    return data ?? [];
  }

  private toPlanUpdate(input: UpdatePlanOptions['input']): PlanUpdate {
    const updateData: PlanUpdate = {};
    if (input.title !== undefined) updateData.title = input.title;
    if (input.note !== undefined) updateData.note = input.note;
    if (input.tagId !== undefined) updateData.tag_id = input.tagId;
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
      throw new TimeModelServiceError(code, 'Time range end must be after start.');
    }
  }

  private ensurePlanCanBeCreated(endAt: string): void {
    if (new Date(endAt).getTime() <= Date.now()) {
      throw new TimeModelServiceError('PLAN_IN_PAST', 'Plans must end in the future.');
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
        'This plan was updated elsewhere. Reload the latest data.',
      );
    }
  }

  private isPastPlan(plan: PlanRow): boolean {
    return new Date(plan.end_at).getTime() <= Date.now();
  }

  private async ensureNoPlanOverlap(
    userId: string,
    startAt: string,
    endAt: string,
    excludePlanId?: string,
  ): Promise<void> {
    const overlappingIds = await this.overlapService.checkPlans({
      userId,
      startAt,
      endAt,
      ...(excludePlanId !== undefined && { excludePlanId }),
    });
    if (overlappingIds.length > 0) {
      throw new TimeModelServiceError(
        'TIME_OVERLAP',
        `Plan time overlaps with existing plans (${overlappingIds.length})`,
      );
    }
  }

  private async ensureNoLogOverlap(userId: string, startAt: string, endAt: string): Promise<void> {
    const overlappingIds = await this.overlapService.checkLogs({ userId, startAt, endAt });
    if (overlappingIds.length > 0) {
      throw new TimeModelServiceError(
        'TIME_OVERLAP',
        `Log time overlaps with existing logs (${overlappingIds.length})`,
      );
    }
  }

  private async ensurePlanNotRecorded(userId: string, planId: string): Promise<void> {
    const { data, error } = await this.supabase
      .from('logs')
      .select('id')
      .eq('user_id', userId)
      .eq('plan_id', planId)
      .is('deleted_at', null)
      .limit(1);

    if (error) {
      throw new TimeModelServiceError(
        'FETCH_FAILED',
        `Failed to check recorded plan: ${error.message}`,
      );
    }

    if ((data ?? []).length > 0) {
      throw new TimeModelServiceError('ALREADY_RECORDED', 'Plan already has an active log.');
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
    throw new TimeModelServiceError(code, `${prefix}: ${error.message}`);
  }

  private handleRecordMutationError(
    error: { code?: string; message: string },
    prefix: string,
  ): never {
    if (error.code === '23505') {
      throw new TimeModelServiceError(
        'ALREADY_RECORDED',
        'Plan already has an active recorded log.',
      );
    }
    this.handleMutationError(error, 'CREATE_FAILED', prefix);
  }

  private sanitizeSearch(search: string): string {
    return search.replace(/[.,()\\%*:]/g, '');
  }
}

export function createPlanService(supabase: ServiceSupabaseClient): PlanService {
  return new PlanService(supabase);
}
