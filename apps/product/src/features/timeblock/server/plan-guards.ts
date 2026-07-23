import 'server-only';

/**
 * Plan service のバリデーション・ガード・エラー整形
 *
 * PlanService の各 public メソッドから使う共有ロジック。overlap チェックは
 * TimeblockOverlapService に委譲し、ここでは「呼び出し順序と throw の意味」だけを持つ。
 */

import { databaseTables } from '@/lib/database';
import { captureUnexpectedDatabaseError } from '@/lib/sentry';

import type { TimeblockOverlapService } from './timeblock-overlap-service';
import { TimeblockServiceError } from './timeblock-service-error';
import type { ServiceSupabaseClient } from './types';

export function validateRange(startAt: string, endAt: string, code: string): void {
  const startMs = new Date(startAt).getTime();
  const endMs = new Date(endAt).getTime();
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) {
    throw new TimeblockServiceError(code, 'Time range end must be after start.');
  }
}

export function assertExactOptimisticLock(
  expectedUpdatedAt: string,
  actualUpdatedAt: string,
): void {
  if (expectedUpdatedAt !== actualUpdatedAt) {
    throw new TimeblockServiceError(
      'CONFLICT',
      'This plan was updated elsewhere. Reload the latest data.',
    );
  }
}

export async function ensureNoPlanOverlap(
  overlapService: TimeblockOverlapService,
  userId: string,
  startAt: string,
  endAt: string,
  excludePlanId?: string,
): Promise<void> {
  const overlappingIds = await overlapService.checkPlans({
    userId,
    startAt,
    endAt,
    ...(excludePlanId !== undefined && { excludePlanId }),
  });
  if (overlappingIds.length > 0) {
    throw new TimeblockServiceError(
      'TIME_OVERLAP',
      `Plan time overlaps with existing plans (${overlappingIds.length})`,
    );
  }
}

export async function ensurePlanNotRecorded(
  supabase: ServiceSupabaseClient,
  userId: string,
  planId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from(databaseTables.records)
    .select('id')
    .eq('user_id', userId)
    .eq('plan_id', planId)
    .is('deleted_at', null)
    .limit(1);

  if (error) {
    const original = captureUnexpectedDatabaseError(error, {
      feature: 'timeblock',
      operation: 'check_plan_recorded',
    });
    throw new TimeblockServiceError('FETCH_FAILED', 'Failed to check recorded plan', {
      cause: original,
    });
  }

  if ((data ?? []).length > 0) {
    throw new TimeblockServiceError('ALREADY_RECORDED', 'Plan already has an active record.');
  }
}

export function handleMutationError(
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

export function handleRecordMutationError(
  error: { code?: string; message: string },
  prefix: string,
): never {
  if (error.code === '23505') {
    throw new TimeblockServiceError('ALREADY_RECORDED', 'Plan already has an active record.');
  }
  handleMutationError(error, 'CREATE_FAILED', prefix);
}
