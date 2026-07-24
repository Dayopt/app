import { UserCancellationError } from '@dayopt/observability';
import {
  createTimeblockContextClient,
  type TimeblockContextMarker,
  type TimeblockContextOccupancyRow,
  type TimeblockContextReadClient,
} from './timeblock-context-client';
import {
  TIMEBLOCK_CONTEXT_MAX_ITEMS_PER_LANE,
  TIMEBLOCK_CONTEXT_RULES,
  type TimeblockConstraints,
  type TimeblockContextOccupancy,
  type TimeblockContextRange,
} from './timeblock-context-contract';
import { TimeblockServiceError } from './timeblock-service-error';

const TIMEBLOCK_CONTEXT_PAGE_SIZE = 1_000;
const TIMEBLOCK_CONTEXT_MAX_ROWS_TO_READ = TIMEBLOCK_CONTEXT_MAX_ITEMS_PER_LANE + 1;
const TIMEBLOCK_CONTEXT_MAX_PAGES = Math.ceil(
  TIMEBLOCK_CONTEXT_MAX_ROWS_TO_READ / TIMEBLOCK_CONTEXT_PAGE_SIZE,
);
export const TIMEBLOCK_CONTEXT_READ_DEADLINE_MS = 20_000;

export class TimeblockContextService {
  constructor(private readonly contextClient: TimeblockContextReadClient) {}

  getMarker(userId: string, signal?: AbortSignal): Promise<TimeblockContextMarker> {
    return this.contextClient.getMarker(userId, signal);
  }

  async getRevision(userId: string): Promise<{ revision: string }> {
    const marker = await this.getMarker(userId);
    return { revision: marker.revision };
  }

  async getConstraints(
    userId: string,
    range: TimeblockContextRange,
    requestSignal?: AbortSignal,
  ): Promise<TimeblockConstraints> {
    const deadlineSignal = AbortSignal.timeout(TIMEBLOCK_CONTEXT_READ_DEADLINE_MS);
    const signal = requestSignal
      ? AbortSignal.any([requestSignal, deadlineSignal])
      : deadlineSignal;

    try {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        this.throwIfAborted(signal);
        const before = await this.getMarker(userId, signal);
        const [plans, records] = await Promise.all([
          this.listLane(userId, 'plans', range, signal),
          this.listLane(userId, 'records', range, signal),
        ]);
        const after = await this.getMarker(userId, signal);

        if (!markersMatch(before, after)) {
          if (attempt === 0) continue;
          throw new TimeblockServiceError(
            'CONTEXT_CHANGED',
            'Timeblock context changed while it was being read',
          );
        }

        if (
          plans.length > TIMEBLOCK_CONTEXT_MAX_ITEMS_PER_LANE ||
          records.length > TIMEBLOCK_CONTEXT_MAX_ITEMS_PER_LANE
        ) {
          throw new TimeblockServiceError(
            'RANGE_TOO_DENSE',
            'Timeblock context range contains too many items',
          );
        }

        return {
          asOf: after.databaseNow,
          timezone: after.timezone,
          range: {
            ...range,
            endExclusive: true,
          },
          completeness: {
            complete: true,
            maxItemsPerLane: TIMEBLOCK_CONTEXT_MAX_ITEMS_PER_LANE,
          },
          occupancy: {
            plans: toPublicOccupancy(plans),
            records: toPublicOccupancy(records),
          },
          rules: TIMEBLOCK_CONTEXT_RULES,
        };
      }
    } catch (error) {
      if (requestSignal?.aborted) {
        throw new TimeblockServiceError(
          'REQUEST_CANCELLED',
          'Timeblock context request was cancelled',
          {
            cause: new UserCancellationError(),
          },
        );
      }
      if (deadlineSignal.aborted) {
        throw new TimeblockServiceError('READ_TIMEOUT', 'Timeblock context read timed out', {
          cause: error,
        });
      }
      throw error;
    }

    throw new TimeblockServiceError('CONTEXT_CHANGED', 'Timeblock context could not be stabilized');
  }

  private async listLane(
    userId: string,
    lane: 'plans' | 'records',
    range: TimeblockContextRange,
    signal: AbortSignal,
  ): Promise<TimeblockContextOccupancyRow[]> {
    const rows: TimeblockContextOccupancyRow[] = [];

    for (let page = 0; page < TIMEBLOCK_CONTEXT_MAX_PAGES; page += 1) {
      this.throwIfAborted(signal);
      const remaining = TIMEBLOCK_CONTEXT_MAX_ROWS_TO_READ - rows.length;
      const limit = Math.min(TIMEBLOCK_CONTEXT_PAGE_SIZE, remaining);
      const pageRows = await this.contextClient.listOccupancyPage(
        {
          userId,
          lane,
          startDate: range.startDate,
          endDate: range.endDate,
          offset: rows.length,
          limit,
        },
        signal,
      );

      if (pageRows.length > limit) {
        throw new TimeblockServiceError(
          'FETCH_FAILED',
          'Timeblock occupancy page exceeded its requested limit',
        );
      }

      rows.push(...pageRows);
      if (pageRows.length < limit) return rows;
    }

    return rows;
  }

  private throwIfAborted(signal: AbortSignal): void {
    if (signal.aborted) {
      throw new TimeblockServiceError('FETCH_FAILED', 'Timeblock context read was interrupted');
    }
  }
}

export function createTimeblockContextService(): TimeblockContextService {
  return new TimeblockContextService(createTimeblockContextClient());
}

function markersMatch(before: TimeblockContextMarker, after: TimeblockContextMarker): boolean {
  return before.revision === after.revision && before.timezone === after.timezone;
}

function toPublicOccupancy(rows: TimeblockContextOccupancyRow[]): TimeblockContextOccupancy[] {
  return rows.map(({ startAt, endAt }) => ({ startAt, endAt }));
}
