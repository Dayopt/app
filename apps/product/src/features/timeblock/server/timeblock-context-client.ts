import 'server-only';

import { captureUnexpectedDatabaseError } from '@/lib/sentry';
import { createServiceRoleClient } from '@/lib/supabase/oauth';

import { TimeblockServiceError } from './timeblock-service-error';

export interface TimeblockContextMarker {
  revision: string;
  databaseNow: string;
  timezone: string;
}

/**
 * Contains service-role access behind one tenant-scoped marker operation.
 * Callers cannot obtain or reuse the administrative Supabase client.
 */
export class TimeblockContextClient {
  private readonly admin = createServiceRoleClient();

  async getMarker(userId: string): Promise<TimeblockContextMarker> {
    const { data, error } = await this.admin
      .rpc('get_timeblock_context_marker_v1', { p_user_id: userId })
      .single();

    if (error || !data) {
      const original = captureUnexpectedDatabaseError(error ?? new Error('Marker row missing'), {
        feature: 'timeblock',
        operation: 'get_timeblock_context_marker',
      });
      throw new TimeblockServiceError('FETCH_FAILED', 'Failed to read timeblock context marker', {
        cause: original,
      });
    }

    return {
      revision: data.revision,
      databaseNow: data.database_now,
      timezone: data.timezone,
    };
  }
}

export function createTimeblockContextClient(): TimeblockContextClient {
  return new TimeblockContextClient();
}
