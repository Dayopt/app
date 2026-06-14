import 'server-only';

import { logger } from '@/lib/logger';
import type { ServiceSupabaseClient } from './types';

export interface EntryOverlapOptions {
  userId: string;
  startTime: string;
  endTime: string;
  excludeEntryId?: string;
}

export class EntryOverlapService {
  constructor(private readonly supabase: ServiceSupabaseClient) {}

  async checkPlanned(options: EntryOverlapOptions): Promise<string[]> {
    const { userId, startTime, endTime, excludeEntryId } = options;
    let query = this.supabase
      .from('entries')
      .select('id')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .not('start_time', 'is', null)
      .not('end_time', 'is', null)
      .lt('start_time', endTime)
      .gt('end_time', startTime);
    if (excludeEntryId) query = query.neq('id', excludeEntryId);
    const { data, error } = await query;
    if (error) {
      logger.error('Planned time overlap check failed:', error);
      return [];
    }
    return data?.map((row) => row.id) ?? [];
  }

  async checkActual(options: EntryOverlapOptions): Promise<string[]> {
    const { userId, startTime, endTime, excludeEntryId } = options;
    const nowIso = new Date().toISOString();
    let query = this.supabase
      .from('entries')
      .select('id')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .or(
        [
          `and(actual_start_time.lt.${endTime},actual_end_time.gt.${startTime})`,
          `and(origin.eq.planned,skipped_at.is.null,actual_start_time.is.null,start_time.lt.${endTime},end_time.gt.${startTime},end_time.lte.${nowIso})`,
        ].join(','),
      );
    if (excludeEntryId) query = query.neq('id', excludeEntryId);
    const { data, error } = await query;
    if (error) {
      logger.error('Actual time overlap check failed:', error);
      return [];
    }
    return data?.map((row) => row.id) ?? [];
  }
}
