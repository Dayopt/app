import 'server-only';

import { databaseTables } from '@/lib/database';
import { logger } from '@/lib/logger';
import { captureUnexpectedDatabaseError } from '@/lib/sentry';
import type { ServiceSupabaseClient } from './types';

interface TimeModelOverlapOptions {
  userId: string;
  startAt: string;
  endAt: string;
}

interface PlanOverlapOptions extends TimeModelOverlapOptions {
  excludePlanId?: string;
}

interface RecordOverlapOptions extends TimeModelOverlapOptions {
  excludeRecordId?: string;
}

export class TimeblockOverlapService {
  constructor(private readonly supabase: ServiceSupabaseClient) {}

  async checkPlans(options: PlanOverlapOptions): Promise<string[]> {
    const { userId, startAt, endAt, excludePlanId } = options;
    let query = this.supabase
      .from('plans')
      .select('id')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .lt('start_at', endAt)
      .gt('end_at', startAt);

    if (excludePlanId) query = query.neq('id', excludePlanId);

    const { data, error } = await query;
    if (error) {
      logger.error('Plan overlap check failed');
      throw captureUnexpectedDatabaseError(error, {
        feature: 'timeblock',
        operation: 'check_plan_overlap',
      });
    }

    return data?.map((row) => row.id) ?? [];
  }

  async checkRecords(options: RecordOverlapOptions): Promise<string[]> {
    const { userId, startAt, endAt, excludeRecordId } = options;
    let query = this.supabase
      .from(databaseTables.records)
      .select('id')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .lt('start_at', endAt)
      .gt('end_at', startAt);

    if (excludeRecordId) query = query.neq('id', excludeRecordId);

    const { data, error } = await query;
    if (error) {
      logger.error('Record overlap check failed');
      throw captureUnexpectedDatabaseError(error, {
        feature: 'timeblock',
        operation: 'check_record_overlap',
      });
    }

    return data?.map((row) => row.id) ?? [];
  }
}
