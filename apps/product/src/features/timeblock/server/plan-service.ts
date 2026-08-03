import 'server-only';

import { trackProductEvent, trackProductEvents } from '@/lib/analytics/product-events';
import { toPublicRecordRow } from '@/lib/database';
import { captureUnexpectedDatabaseError } from '@/lib/sentry';
import { createServiceRoleClient } from '@/lib/supabase/oauth';

import {
  assertOptimisticLock,
  ensureNoPlanOverlap,
  ensureNoRecordOverlap,
  ensurePlanCanBeCreated,
  ensurePlanNotRecorded,
  handleRecordMutationError,
  isPastPlan,
  toPlanUpdate,
  validateRange,
} from './plan-guards';
import { runPrivateTimeblockSearchQuery } from './private-timeblock-search-query';
import { assertTagAssignable } from './tag-assignment-guard';
import {
  createTimeblockCommandClient,
  type TimeblockCommandClient,
  toTimeblockSource,
} from './timeblock-command-client';
import { TimeblockOverlapService } from './timeblock-overlap-service';
import { buildTimeblockSearchFilter } from './timeblock-search-query';
import { TimeblockServiceError } from './timeblock-service-error';
import type {
  ConfirmDayPlansOptions,
  CreatePlanOptions,
  DeletePlanOptions,
  GetPlanByIdOptions,
  ListPlansOptions,
  PlanRow,
  RecordPlanOptions,
  RecordRow,
  UpdatePlanOptions,
} from './timeblock-types';
import type { ServiceSupabaseClient } from './types';

export class PlanService {
  private readonly overlapService: TimeblockOverlapService;
  private commandClient: TimeblockCommandClient | undefined;

  constructor(
    private readonly supabase: ServiceSupabaseClient,
    commands?: TimeblockCommandClient,
  ) {
    this.overlapService = new TimeblockOverlapService(supabase);
    this.commandClient = commands;
  }

  /**
   * Plan / Record の write は service-owned command 経由に限る。
   *
   * `authenticated` から plans / records の直接 DML を剥がしたため、この service に
   * 残る書き込み経路はすべてここを通る。read 専用の呼び出しで service-role client を
   * 作らないよう遅延生成する。
   */
  private get commands(): TimeblockCommandClient {
    this.commandClient ??= createTimeblockCommandClient();
    return this.commandClient;
  }

  async list(options: ListPlansOptions): Promise<PlanRow[]> {
    const {
      userId,
      ids,
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

    if (ids?.length === 0) return [];

    let query = this.supabase
      .from('plans')
      .select('*')
      .eq('user_id', userId)
      .is('deleted_at', null);

    if (ids) query = query.in('id', ids);
    if (tagId) query = query.eq('tag_id', tagId);
    if (!includeSkipped) query = query.is('skipped_at', null);

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
        operation: 'list_plans',
      });
      throw new TimeblockServiceError('FETCH_FAILED', 'Failed to fetch plans', {
        cause: original,
      });
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
      .maybeSingle();

    if (error) {
      const original = captureUnexpectedDatabaseError(error, {
        feature: 'timeblock',
        operation: 'get_plan_by_id',
      });
      throw new TimeblockServiceError('FETCH_FAILED', 'Failed to fetch plan', {
        cause: original,
      });
    }
    if (!data) {
      throw new TimeblockServiceError('NOT_FOUND', 'Plan not found');
    }

    return data;
  }

  async create(options: CreatePlanOptions): Promise<PlanRow> {
    const { userId, input, preventOverlappingPlans = true } = options;

    validateRange(input.start_at, input.end_at, 'INVALID_TIME_RANGE');
    ensurePlanCanBeCreated(input.end_at);
    await assertTagAssignable(this.supabase, userId, input.tagId);

    if (preventOverlappingPlans) {
      await ensureNoPlanOverlap(this.overlapService, userId, input.start_at, input.end_at);
    }

    const plan = await this.commands.createPlan({
      userId,
      title: input.title,
      note: input.note ?? null,
      tagId: input.tagId ?? null,
      externalCalendarEventId: input.externalCalendarEventId ?? null,
      source: input.externalCalendarEventId ? 'external_calendar' : 'manual',
      startAt: input.start_at,
      endAt: input.end_at,
    });

    await trackProductEvent({ eventName: 'plan_created', userId });
    return plan;
  }

  async update(options: UpdatePlanOptions): Promise<PlanRow> {
    const { userId, planId, input, expectedUpdatedAt, preventOverlappingPlans = true } = options;
    const existing = await this.getById({ userId, planId });

    assertOptimisticLock(expectedUpdatedAt, existing.updated_at);

    const nextStartAt = input.start_at ?? existing.start_at;
    const nextEndAt = input.end_at ?? existing.end_at;
    const updatesTime = input.start_at !== undefined || input.end_at !== undefined;

    if (updatesTime && isPastPlan(existing)) {
      throw new TimeblockServiceError(
        'PLAN_TIME_LOCKED',
        'Past plan time fields cannot be changed.',
      );
    }

    validateRange(nextStartAt, nextEndAt, 'INVALID_TIME_RANGE');
    if (updatesTime) ensurePlanCanBeCreated(nextEndAt);
    // 後からアーカイブされたタグを保持したままの編集は許可し、付け替えだけ拒否する
    if (input.tagId !== undefined && input.tagId !== existing.tag_id) {
      await assertTagAssignable(this.supabase, userId, input.tagId);
    }

    if (preventOverlappingPlans && updatesTime) {
      await ensureNoPlanOverlap(this.overlapService, userId, nextStartAt, nextEndAt, planId);
    }

    const updateData = toPlanUpdate(input);
    if (Object.keys(updateData).length === 0) return existing;

    // legacy route の input は raw CAS token を持たないため、いま読んだ行の
    // `updated_at` をそのまま command へ渡す read-then-write にする。
    // 呼び出し元が渡した expectedUpdatedAt は上の assertOptimisticLock が見る。
    return this.commands.updatePlan({
      userId,
      planId,
      expectedUpdatedAt: existing.updated_at,
      title: input.title ?? existing.title,
      note: input.note === undefined ? existing.note : input.note,
      tagId: input.tagId === undefined ? existing.tag_id : input.tagId,
      externalCalendarEventId:
        input.externalCalendarEventId === undefined
          ? existing.external_calendar_event_id
          : input.externalCalendarEventId,
      source: toTimeblockSource(existing.source),
      startAt: nextStartAt,
      endAt: nextEndAt,
    });
  }

  async delete(options: DeletePlanOptions): Promise<{ success: boolean }> {
    const { userId, planId } = options;
    const { error } = await this.supabase.rpc('soft_delete_plan', {
      p_plan_id: planId,
      p_user_id: userId,
    });

    if (error) {
      const original = captureUnexpectedDatabaseError(error, {
        feature: 'timeblock',
        operation: 'delete_plan',
      });
      throw new TimeblockServiceError('DELETE_FAILED', 'Failed to delete plan', {
        cause: original,
      });
    }

    return { success: true };
  }

  async restore(options: DeletePlanOptions): Promise<{ success: boolean }> {
    const { userId, planId } = options;
    const adminClient = createServiceRoleClient();
    const { error } = await adminClient.rpc('restore_plan', {
      p_plan_id: planId,
      p_user_id: userId,
    });

    if (error) {
      const original = captureUnexpectedDatabaseError(error, {
        feature: 'timeblock',
        operation: 'restore_plan',
      });
      throw new TimeblockServiceError('RESTORE_FAILED', 'Failed to restore plan', {
        cause: original,
      });
    }

    return { success: true };
  }

  async skip(options: DeletePlanOptions): Promise<PlanRow> {
    const { userId, planId } = options;
    const existing = await this.getById({ userId, planId });

    if (!isPastPlan(existing)) {
      throw new TimeblockServiceError(
        'SKIP_IN_FUTURE',
        'Future plans cannot be skipped. Delete the plan instead.',
      );
    }

    await ensurePlanNotRecorded(this.supabase, userId, planId);

    return this.commands.setPlanSkipped({
      userId,
      planId,
      expectedUpdatedAt: existing.updated_at,
      skipped: true,
    });
  }

  async unskip(options: DeletePlanOptions): Promise<PlanRow> {
    const { userId, planId } = options;
    const existing = await this.getById({ userId, planId });

    if (!existing.skipped_at) return existing;

    return this.commands.setPlanSkipped({
      userId,
      planId,
      expectedUpdatedAt: existing.updated_at,
      skipped: false,
    });
  }

  async record(options: RecordPlanOptions): Promise<RecordRow> {
    const { userId, planId } = options;
    const plan = await this.getById({ userId, planId });

    if (!isPastPlan(plan)) {
      throw new TimeblockServiceError('RECORD_IN_FUTURE', 'Future plans cannot be recorded.');
    }

    if (plan.skipped_at) {
      throw new TimeblockServiceError('INVALID_INPUT', 'Skipped plans cannot be recorded.');
    }

    await ensurePlanNotRecorded(this.supabase, userId, planId);
    await ensureNoRecordOverlap(this.overlapService, userId, plan.start_at, plan.end_at);

    const record = await this.commands.recordPlan({
      userId,
      planId,
      expectedUpdatedAt: plan.updated_at,
    });

    await trackProductEvent({ eventName: 'record_created', userId });
    return record;
  }

  async confirmDay(options: ConfirmDayPlansOptions): Promise<RecordRow[]> {
    const { userId, input } = options;
    validateRange(input.start_at, input.end_at, 'INVALID_TIME_RANGE');

    const { data, error } = await this.supabase.rpc('confirm_day_plans_to_records', {
      p_confirmed_at: new Date().toISOString(),
      p_end_at: input.end_at,
      p_start_at: input.start_at,
      p_user_id: userId,
    });

    if (error) {
      handleRecordMutationError(error, 'Failed to confirm day plans');
    }

    const records = (data ?? []).map(toPublicRecordRow);
    await trackProductEvents(records.map(() => ({ eventName: 'record_created' as const, userId })));
    return records;
  }
}

export function createPlanService(
  supabase: ServiceSupabaseClient,
  commands?: TimeblockCommandClient,
): PlanService {
  return new PlanService(supabase, commands);
}
