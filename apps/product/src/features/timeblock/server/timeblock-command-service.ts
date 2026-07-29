import 'server-only';

import type {
  ConfirmDayInput,
  CreatePlanInput,
  CreateRecordInput,
  UpdatePlanInput,
  UpdateRecordInput,
} from '../schemas/timeblock';
import { PlanService } from './plan-service';
import { RecordService } from './record-service';
import {
  createTimeblockCommandClient,
  type TimeblockCommandClient,
} from './timeblock-command-client';
import type { PlanRow, RecordRow } from './timeblock-types';
import type { ServiceSupabaseClient } from './types';

interface UserCommandOptions<TInput> {
  userId: string;
  input: TInput;
}

interface VersionedTargetOptions {
  userId: string;
  id: string;
  expectedUpdatedAt: string;
}

interface VersionedUpdateOptions<TInput> extends VersionedTargetOptions {
  input: TInput;
}

function toSource(source: string): 'api' | 'external_calendar' | 'manual' {
  if (source === 'api' || source === 'external_calendar') return source;
  return 'manual';
}

/**
 * UI向けのversioned command service。
 *
 * 既存のPlanService / RecordServiceは旧clientのdrain期間中そのまま残し、
 * このserviceだけがCandidate 1の原子的commandを呼ぶ。
 */
export class TimeblockCommandService {
  private readonly plans: PlanService;
  private readonly records: RecordService;

  constructor(
    supabase: ServiceSupabaseClient,
    private readonly commands: TimeblockCommandClient = createTimeblockCommandClient(),
  ) {
    this.plans = new PlanService(supabase);
    this.records = new RecordService(supabase);
  }

  createPlan(options: UserCommandOptions<CreatePlanInput>): Promise<PlanRow> {
    const { userId, input } = options;
    return this.commands.createPlan({
      userId,
      title: input.title,
      note: input.note ?? null,
      tagId: input.tagId ?? null,
      externalCalendarEventId: input.externalCalendarEventId ?? null,
      source: input.externalCalendarEventId ? 'external_calendar' : 'manual',
      startAt: input.start_at,
      endAt: input.end_at,
    });
  }

  async updatePlan(options: VersionedUpdateOptions<UpdatePlanInput>): Promise<PlanRow> {
    const { userId, id, input, expectedUpdatedAt } = options;
    const existing = await this.plans.getById({ userId, planId: id });
    return this.commands.updatePlan({
      userId,
      planId: id,
      expectedUpdatedAt,
      title: input.title ?? existing.title,
      note: input.note === undefined ? existing.note : input.note,
      tagId: input.tagId === undefined ? existing.tag_id : input.tagId,
      externalCalendarEventId:
        input.externalCalendarEventId === undefined
          ? existing.external_calendar_event_id
          : input.externalCalendarEventId,
      source: toSource(existing.source),
      startAt: input.start_at ?? existing.start_at,
      endAt: input.end_at ?? existing.end_at,
    });
  }

  deletePlan(options: VersionedTargetOptions): Promise<PlanRow> {
    return this.commands.deletePlan({
      userId: options.userId,
      planId: options.id,
      expectedUpdatedAt: options.expectedUpdatedAt,
    });
  }

  restorePlan(options: VersionedTargetOptions): Promise<PlanRow> {
    return this.commands.restorePlan({
      userId: options.userId,
      planId: options.id,
      expectedUpdatedAt: options.expectedUpdatedAt,
    });
  }

  setPlanSkipped(options: VersionedTargetOptions & { skipped: boolean }): Promise<PlanRow> {
    return this.commands.setPlanSkipped({
      userId: options.userId,
      planId: options.id,
      expectedUpdatedAt: options.expectedUpdatedAt,
      skipped: options.skipped,
    });
  }

  recordPlan(options: VersionedTargetOptions): Promise<RecordRow> {
    return this.commands.recordPlan({
      userId: options.userId,
      planId: options.id,
      expectedUpdatedAt: options.expectedUpdatedAt,
    });
  }

  confirmDay(options: UserCommandOptions<ConfirmDayInput>): Promise<RecordRow[]> {
    return this.commands.confirmDay({
      userId: options.userId,
      startAt: options.input.start_at,
      endAt: options.input.end_at,
    });
  }

  createRecord(options: UserCommandOptions<CreateRecordInput>): Promise<RecordRow> {
    const { userId, input } = options;
    return this.commands.createRecord({
      userId,
      title: input.title,
      note: input.note ?? null,
      tagId: input.tagId ?? null,
      planId: input.planId ?? null,
      externalCalendarEventId: input.externalCalendarEventId ?? null,
      source: input.externalCalendarEventId ? 'external_calendar' : 'manual',
      startAt: input.start_at,
      endAt: input.end_at,
    });
  }

  async updateRecord(options: VersionedUpdateOptions<UpdateRecordInput>): Promise<RecordRow> {
    const { userId, id, input, expectedUpdatedAt } = options;
    const existing = await this.records.getById({ userId, recordId: id });
    return this.commands.updateRecord({
      userId,
      recordId: id,
      expectedUpdatedAt,
      title: input.title ?? existing.title,
      note: input.note === undefined ? existing.note : input.note,
      tagId: input.tagId === undefined ? existing.tag_id : input.tagId,
      planId: input.planId === undefined ? existing.plan_id : input.planId,
      externalCalendarEventId:
        input.externalCalendarEventId === undefined
          ? existing.external_calendar_event_id
          : input.externalCalendarEventId,
      source: toSource(existing.source),
      startAt: input.start_at ?? existing.start_at,
      endAt: input.end_at ?? existing.end_at,
    });
  }

  deleteRecord(options: VersionedTargetOptions): Promise<RecordRow> {
    return this.commands.deleteRecord({
      userId: options.userId,
      recordId: options.id,
      expectedUpdatedAt: options.expectedUpdatedAt,
    });
  }

  restoreRecord(options: VersionedTargetOptions): Promise<RecordRow> {
    return this.commands.restoreRecord({
      userId: options.userId,
      recordId: options.id,
      expectedUpdatedAt: options.expectedUpdatedAt,
    });
  }
}

export function createTimeblockCommandService(
  supabase: ServiceSupabaseClient,
): TimeblockCommandService {
  return new TimeblockCommandService(supabase);
}
