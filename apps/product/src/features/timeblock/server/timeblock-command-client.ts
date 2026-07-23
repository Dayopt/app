import 'server-only';

import { captureUnexpectedDatabaseError } from '@/lib/sentry';
import { createServiceRoleClient } from '@/lib/supabase/oauth';

import { TimeblockServiceError } from './timeblock-service-error';
import type { PlanRow, RecordRow } from './timeblock-types';

type TimeblockSource = 'api' | 'external_calendar' | 'manual';

interface CommandError {
  code?: string | undefined;
  message: string;
}

interface CommandResult<TRow> {
  data: TRow[] | null;
  error: CommandError | null;
}

interface CreatePlanCommandInput {
  userId: string;
  title: string;
  note: string | null;
  tagId: string | null;
  externalCalendarEventId: string | null;
  source: TimeblockSource;
  startAt: string;
  endAt: string;
}

interface UpdatePlanCommandInput extends CreatePlanCommandInput {
  planId: string;
  expectedUpdatedAt: string;
}

interface VersionedPlanCommandInput {
  userId: string;
  planId: string;
  expectedUpdatedAt: string;
}

interface CreateRecordCommandInput extends CreatePlanCommandInput {
  planId: string | null;
}

interface UpdateRecordCommandInput extends CreateRecordCommandInput {
  recordId: string;
  expectedUpdatedAt: string;
}

interface VersionedRecordCommandInput {
  userId: string;
  recordId: string;
  expectedUpdatedAt: string;
}

interface ConfirmDayCommandInput {
  userId: string;
  startAt: string;
  endAt: string;
}

const EXPECTED_COMMAND_ERRORS: Readonly<Record<string, string>> = {
  '22023': 'INVALID_INPUT',
  '23P01': 'TIME_OVERLAP',
  DT001: 'NOT_FOUND',
  DT002: 'CONFLICT',
  DT003: 'INVALID_TIME_RANGE',
  DT004: 'PLAN_IN_PAST',
  DT005: 'RECORD_IN_FUTURE',
  DT006: 'PLAN_TIME_LOCKED',
  DT007: 'SKIP_IN_FUTURE',
  DT008: 'INVALID_INPUT',
  DT009: 'FORBIDDEN',
  DT011: 'ALREADY_RECORDED',
  DT012: 'INVALID_INPUT',
};

const EXPECTED_COMMAND_MESSAGES: Readonly<Record<string, string>> = {
  ALREADY_RECORDED: 'Plan already has an active record.',
  CONFLICT: 'This item was updated elsewhere. Reload the latest data.',
  FORBIDDEN: 'This item cannot be changed.',
  INVALID_INPUT: 'The timeblock input is invalid.',
  INVALID_TIME_RANGE: 'Time range end must be after start.',
  NOT_FOUND: 'Timeblock not found.',
  PLAN_IN_PAST: 'Plans must end in the future.',
  PLAN_TIME_LOCKED: 'Past plan time fields cannot be changed.',
  RECORD_IN_FUTURE: 'Records cannot end in the future.',
  SKIP_IN_FUTURE: 'Future plans cannot be skipped. Delete the plan instead.',
  TIME_OVERLAP: 'This time range overlaps with an existing item.',
};

function throwCommandError(error: CommandError, operation: string): never {
  const mappedCode = error.code ? EXPECTED_COMMAND_ERRORS[error.code] : undefined;
  if (mappedCode) {
    throw new TimeblockServiceError(
      mappedCode,
      EXPECTED_COMMAND_MESSAGES[mappedCode] ?? 'The timeblock command was rejected.',
    );
  }

  if (error.code === '23505') {
    const code = operation === 'record_plan' ? 'ALREADY_RECORDED' : 'CONFLICT';
    throw new TimeblockServiceError(code, EXPECTED_COMMAND_MESSAGES[code] ?? 'Conflict');
  }

  if (error.code === '40P01') {
    throw new TimeblockServiceError('CONFLICT', EXPECTED_COMMAND_MESSAGES.CONFLICT ?? 'Conflict');
  }

  const original = captureUnexpectedDatabaseError(error, {
    feature: 'timeblock',
    operation,
  });
  throw new TimeblockServiceError('COMMAND_FAILED', 'Failed to apply timeblock command', {
    cause: original,
  });
}

/**
 * Service-role access is intentionally contained in this typed command adapter.
 * Callers can only invoke tenant-scoped Plan / Record commands and cannot obtain
 * the underlying administrative client.
 */
export class TimeblockCommandClient {
  private readonly admin = createServiceRoleClient();

  async createPlan(input: CreatePlanCommandInput): Promise<PlanRow> {
    return this.run('create_plan', () =>
      this.admin.rpc('create_plan_command_v1', {
        p_end_at: input.endAt,
        p_external_calendar_event_id: input.externalCalendarEventId as never,
        p_note: input.note as never,
        p_source: input.source,
        p_start_at: input.startAt,
        p_tag_id: input.tagId as never,
        p_title: input.title,
        p_user_id: input.userId,
      }),
    );
  }

  async updatePlan(input: UpdatePlanCommandInput): Promise<PlanRow> {
    return this.run('update_plan', () =>
      this.admin.rpc('update_plan_command_v1', {
        p_end_at: input.endAt,
        p_expected_updated_at: input.expectedUpdatedAt,
        p_external_calendar_event_id: input.externalCalendarEventId as never,
        p_note: input.note as never,
        p_plan_id: input.planId,
        p_start_at: input.startAt,
        p_tag_id: input.tagId as never,
        p_title: input.title,
        p_user_id: input.userId,
      }),
    );
  }

  async deletePlan(input: VersionedPlanCommandInput): Promise<PlanRow> {
    return this.run('delete_plan', () =>
      this.admin.rpc('delete_plan_command_v1', {
        p_expected_updated_at: input.expectedUpdatedAt,
        p_plan_id: input.planId,
        p_user_id: input.userId,
      }),
    );
  }

  async restorePlan(input: VersionedPlanCommandInput): Promise<PlanRow> {
    return this.run('restore_plan', () =>
      this.admin.rpc('restore_plan_command_v1', {
        p_expected_updated_at: input.expectedUpdatedAt,
        p_plan_id: input.planId,
        p_user_id: input.userId,
      }),
    );
  }

  async setPlanSkipped(input: VersionedPlanCommandInput & { skipped: boolean }): Promise<PlanRow> {
    return this.run(input.skipped ? 'skip_plan' : 'unskip_plan', () =>
      this.admin.rpc('set_plan_skipped_command_v1', {
        p_expected_updated_at: input.expectedUpdatedAt,
        p_plan_id: input.planId,
        p_skipped: input.skipped,
        p_user_id: input.userId,
      }),
    );
  }

  async recordPlan(input: VersionedPlanCommandInput): Promise<RecordRow> {
    return this.run('record_plan', () =>
      this.admin.rpc('record_plan_command_v1', {
        p_expected_updated_at: input.expectedUpdatedAt,
        p_plan_id: input.planId,
        p_user_id: input.userId,
      }),
    );
  }

  async confirmDay(input: ConfirmDayCommandInput): Promise<RecordRow[]> {
    return this.runMany('confirm_day_plans', () =>
      this.admin.rpc('confirm_day_plans_command_v1', {
        p_end_at: input.endAt,
        p_start_at: input.startAt,
        p_user_id: input.userId,
      }),
    );
  }

  async createRecord(input: CreateRecordCommandInput): Promise<RecordRow> {
    return this.run('create_record', () =>
      this.admin.rpc('create_record_command_v1', {
        p_end_at: input.endAt,
        p_external_calendar_event_id: input.externalCalendarEventId as never,
        p_note: input.note as never,
        p_plan_id: input.planId as never,
        p_source: input.source,
        p_start_at: input.startAt,
        p_tag_id: input.tagId as never,
        p_title: input.title,
        p_user_id: input.userId,
      }),
    );
  }

  async updateRecord(input: UpdateRecordCommandInput): Promise<RecordRow> {
    return this.run('update_record', () =>
      this.admin.rpc('update_record_command_v1', {
        p_end_at: input.endAt,
        p_expected_updated_at: input.expectedUpdatedAt,
        p_external_calendar_event_id: input.externalCalendarEventId as never,
        p_note: input.note as never,
        p_plan_id: input.planId as never,
        p_record_id: input.recordId,
        p_start_at: input.startAt,
        p_tag_id: input.tagId as never,
        p_title: input.title,
        p_user_id: input.userId,
      }),
    );
  }

  async deleteRecord(input: VersionedRecordCommandInput): Promise<RecordRow> {
    return this.run('delete_record', () =>
      this.admin.rpc('delete_record_command_v1', {
        p_expected_updated_at: input.expectedUpdatedAt,
        p_record_id: input.recordId,
        p_user_id: input.userId,
      }),
    );
  }

  async restoreRecord(input: VersionedRecordCommandInput): Promise<RecordRow> {
    return this.run('restore_record', () =>
      this.admin.rpc('restore_record_command_v1', {
        p_expected_updated_at: input.expectedUpdatedAt,
        p_record_id: input.recordId,
        p_user_id: input.userId,
      }),
    );
  }

  private async run<TRow>(
    operation: string,
    request: () => PromiseLike<CommandResult<TRow>>,
  ): Promise<TRow> {
    const rows = await this.runMany(operation, request);
    const row = rows[0];
    if (row) return row;

    const original = captureUnexpectedDatabaseError(
      { message: 'Timeblock command returned no row' },
      { feature: 'timeblock', operation },
    );
    throw new TimeblockServiceError('COMMAND_FAILED', 'Failed to apply timeblock command', {
      cause: original,
    });
  }

  private async runMany<TRow>(
    operation: string,
    request: () => PromiseLike<CommandResult<TRow>>,
  ): Promise<TRow[]> {
    let result = await request();
    if (result.error?.code === '40P01') result = await request();
    if (result.error) throwCommandError(result.error, operation);
    return result.data ?? [];
  }
}

export function createTimeblockCommandClient(): TimeblockCommandClient {
  return new TimeblockCommandClient();
}
