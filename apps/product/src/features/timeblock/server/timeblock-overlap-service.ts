import 'server-only';

import { logger } from '@/lib/logger';
import type { ServiceSupabaseClient } from './types';

interface TimeModelOverlapOptions {
  userId: string;
  startAt: string;
  endAt: string;
}

interface PlanOverlapOptions extends TimeModelOverlapOptions {
  excludePlanId?: string;
}

interface LogOverlapOptions extends TimeModelOverlapOptions {
  excludeLogId?: string;
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
      logger.error('Plan overlap check failed', { error });
      return [];
    }

    return data?.map((row) => row.id) ?? [];
  }

  async checkLogs(options: LogOverlapOptions): Promise<string[]> {
    const { userId, startAt, endAt, excludeLogId } = options;
    let query = this.supabase
      .from('logs')
      .select('id')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .lt('start_at', endAt)
      .gt('end_at', startAt);

    if (excludeLogId) query = query.neq('id', excludeLogId);

    const { data, error } = await query;
    if (error) {
      logger.error('Log overlap check failed', { error });
      return [];
    }

    return data?.map((row) => row.id) ?? [];
  }
}
