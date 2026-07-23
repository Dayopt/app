import 'server-only';

import { captureUnexpectedDatabaseError } from '@/lib/sentry';

import { assertExactOptimisticLock, ensureNoPlanOverlap, validateRange } from './plan-guards';
import { runPrivateTimeblockSearchQuery } from './private-timeblock-search-query';
import {
  createTimeblockCommandClient,
  type TimeblockCommandClient,
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
  PlanInsert,
  PlanRow,
  RecordPlanOptions,
  RecordRow,
  UpdatePlanOptions,
} from './timeblock-types';
import type { ServiceSupabaseClient } from './types';

export class PlanService {
  private readonly overlapService: TimeblockOverlapService;
  private commands: TimeblockCommandClient | null = null;

  constructor(private readonly supabase: ServiceSupabaseClient) {
    this.overlapService = new TimeblockOverlapService(supabase);
  }

  private get commandClient(): TimeblockCommandClient {
    this.commands ??= createTimeblockCommandClient();
    return this.commands;
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

    if (preventOverlappingPlans) {
      await ensureNoPlanOverlap(this.overlapService, userId, input.start_at, input.end_at);
    }

    const insertData: Omit<PlanInsert, 'user_id'> = {
      title: input.title,
      note: input.note ?? null,
      tag_id: input.tagId ?? null,
      external_calendar_event_id: input.externalCalendarEventId ?? null,
      source: input.externalCalendarEventId ? 'external_calendar' : 'manual',
      start_at: input.start_at,
      end_at: input.end_at,
    };

    return this.commandClient.createPlan({
      userId,
      title: insertData.title,
      note: insertData.note ?? null,
      tagId: insertData.tag_id ?? null,
      externalCalendarEventId: insertData.external_calendar_event_id ?? null,
      source: insertData.source === 'external_calendar' ? 'external_calendar' : 'manual',
      startAt: insertData.start_at,
      endAt: insertData.end_at,
    });
  }

  async update(options: UpdatePlanOptions): Promise<PlanRow> {
    const { userId, planId, input, expectedUpdatedAt, preventOverlappingPlans = true } = options;
    const existing = await this.getById({ userId, planId });
    assertExactOptimisticLock(expectedUpdatedAt, existing.updated_at);

    const nextStartAt = input.start_at ?? existing.start_at;
    const nextEndAt = input.end_at ?? existing.end_at;
    const updatesTime = input.start_at !== undefined || input.end_at !== undefined;

    validateRange(nextStartAt, nextEndAt, 'INVALID_TIME_RANGE');

    if (preventOverlappingPlans && updatesTime) {
      await ensureNoPlanOverlap(this.overlapService, userId, nextStartAt, nextEndAt, planId);
    }

    return this.commandClient.updatePlan({
      userId,
      planId,
      expectedUpdatedAt,
      title: input.title ?? existing.title,
      note: input.note === undefined ? existing.note : input.note,
      tagId: input.tagId === undefined ? existing.tag_id : input.tagId,
      externalCalendarEventId:
        input.externalCalendarEventId === undefined
          ? existing.external_calendar_event_id
          : input.externalCalendarEventId,
      source: existing.source === 'external_calendar' ? 'external_calendar' : 'manual',
      startAt: nextStartAt,
      endAt: nextEndAt,
    });
  }

  async delete(options: DeletePlanOptions): Promise<PlanRow> {
    const { userId, planId, expectedUpdatedAt } = options;
    return this.commandClient.deletePlan({ userId, planId, expectedUpdatedAt });
  }

  async restore(options: DeletePlanOptions): Promise<PlanRow> {
    const { userId, planId, expectedUpdatedAt } = options;
    return this.commandClient.restorePlan({ userId, planId, expectedUpdatedAt });
  }

  async skip(options: DeletePlanOptions): Promise<PlanRow> {
    const { userId, planId, expectedUpdatedAt } = options;
    return this.commandClient.setPlanSkipped({ userId, planId, expectedUpdatedAt, skipped: true });
  }

  async unskip(options: DeletePlanOptions): Promise<PlanRow> {
    const { userId, planId, expectedUpdatedAt } = options;
    return this.commandClient.setPlanSkipped({ userId, planId, expectedUpdatedAt, skipped: false });
  }

  async record(options: RecordPlanOptions): Promise<RecordRow> {
    const { userId, planId, expectedUpdatedAt } = options;
    return this.commandClient.recordPlan({ userId, planId, expectedUpdatedAt });
  }

  async confirmDay(options: ConfirmDayPlansOptions): Promise<RecordRow[]> {
    const { userId, input } = options;
    validateRange(input.start_at, input.end_at, 'INVALID_TIME_RANGE');
    return this.commandClient.confirmDay({
      userId,
      startAt: input.start_at,
      endAt: input.end_at,
    });
  }
}

export function createPlanService(supabase: ServiceSupabaseClient): PlanService {
  return new PlanService(supabase);
}
