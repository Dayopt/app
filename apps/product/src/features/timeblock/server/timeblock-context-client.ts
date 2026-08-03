import 'server-only';

import { databaseTables } from '@/lib/database';
import { captureUnexpectedDatabaseError } from '@/lib/sentry';
import { createServiceRoleClient } from '@/lib/supabase/oauth';

import { TimeblockServiceError } from './timeblock-service-error';
import type { ServiceSupabaseClient } from './types';

export interface TimeblockContextMarker {
  revision: string;
  databaseNow: string;
  timezone: string;
}

type TimeblockContextLane = 'plans' | 'records';

export interface TimeblockContextOccupancyRow {
  id: string;
  startAt: string;
  endAt: string;
}

export interface TimeblockContextOccupancyPage {
  rows: TimeblockContextOccupancyRow[];
  totalCount: number | null;
}

export interface ListTimeblockContextOccupancyPageInput {
  userId: string;
  lane: TimeblockContextLane;
  startDate: string;
  endDate: string;
  offset: number;
  limit: number;
}

export interface TimeblockContextReadClient {
  getMarker(userId: string, signal?: AbortSignal): Promise<TimeblockContextMarker>;
  listOccupancyPage(
    input: ListTimeblockContextOccupancyPageInput,
    signal?: AbortSignal,
  ): Promise<TimeblockContextOccupancyPage>;
}

/**
 * Contains service-role access behind one tenant-scoped marker operation.
 * Callers cannot obtain or reuse the administrative Supabase client.
 */
class TimeblockContextClient implements TimeblockContextReadClient {
  private readonly admin = createServiceRoleClient();

  async getMarker(userId: string, signal?: AbortSignal): Promise<TimeblockContextMarker> {
    return readTimeblockContextMarker(this.admin, userId, signal);
  }

  async listOccupancyPage(
    input: ListTimeblockContextOccupancyPageInput,
    signal?: AbortSignal,
  ): Promise<TimeblockContextOccupancyPage> {
    const table = input.lane === 'plans' ? databaseTables.plans : databaseTables.records;
    const tableQuery = this.admin.from(table);
    const query =
      input.offset === 0
        ? tableQuery.select('id,start_at,end_at', { count: 'exact' })
        : tableQuery.select('id,start_at,end_at');
    query
      .eq('user_id', input.userId)
      .is('deleted_at', null)
      .lt('start_at', input.endDate)
      .gt('end_at', input.startDate)
      .order('start_at', { ascending: true })
      .order('end_at', { ascending: true })
      .order('id', { ascending: true })
      .range(input.offset, input.offset + input.limit - 1);
    if (signal) query.abortSignal(signal);

    const { data, error, count } = await query;
    if (error || !data) {
      if (signal?.aborted) {
        throw new TimeblockServiceError('FETCH_FAILED', 'Timeblock context read was interrupted');
      }
      const original = captureUnexpectedDatabaseError(
        error ?? new Error('Occupancy page missing'),
        {
          feature: 'timeblock',
          operation: `list_${input.lane}_context_occupancy`,
        },
      );
      throw new TimeblockServiceError('FETCH_FAILED', 'Failed to read timeblock occupancy', {
        cause: original,
      });
    }

    return {
      rows: data.map((row) => ({
        id: row.id,
        startAt: row.start_at,
        endAt: row.end_at,
      })),
      totalCount: count,
    };
  }
}

export function createTimeblockContextClient(): TimeblockContextClient {
  return new TimeblockContextClient();
}

export async function readTimeblockContextMarker(
  admin: ServiceSupabaseClient,
  userId: string,
  signal?: AbortSignal,
): Promise<TimeblockContextMarker> {
  const query = admin.rpc('get_timeblock_context_marker_v1', { p_user_id: userId });
  if (signal) query.abortSignal(signal);
  const { data, error } = await query.single();

  if (error || !data) {
    if (signal?.aborted) {
      throw new TimeblockServiceError('FETCH_FAILED', 'Timeblock context read was interrupted');
    }
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
