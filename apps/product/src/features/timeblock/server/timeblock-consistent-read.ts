import { UserCancellationError } from '@dayopt/observability';

import type { TimeblockContextMarker } from './timeblock-context-client';
import { TimeblockServiceError } from './timeblock-service-error';

const TIMEBLOCK_CONSISTENT_READ_DEADLINE_MS = 20_000;

interface StableTimeblockReadOptions<T> {
  userId: string;
  subject: 'context' | 'review';
  requestSignal?: AbortSignal | undefined;
  getMarker: (userId: string, signal: AbortSignal) => Promise<TimeblockContextMarker>;
  read: (signal: AbortSignal) => Promise<T>;
}

interface StableTimeblockSnapshot<T> {
  marker: TimeblockContextMarker;
  data: T;
}

interface TimeblockReadPage<T> {
  rows: T[];
  totalCount: number | null;
}

interface CompleteTimeblockPagesOptions<T> {
  subject: 'occupancy' | 'review';
  maxItems: number;
  pageSize: number;
  signal: AbortSignal;
  readPage: (offset: number, limit: number) => Promise<TimeblockReadPage<T>>;
}

/**
 * 複数のPostgREST readを一つのrevision/timezone時点へ揃える。
 * 一度だけ全体を再試行し、request cancellationとdeadlineも全queryで共有する。
 */
export async function readStableTimeblockSnapshot<T>(
  options: StableTimeblockReadOptions<T>,
): Promise<StableTimeblockSnapshot<T>> {
  const deadlineSignal = AbortSignal.timeout(TIMEBLOCK_CONSISTENT_READ_DEADLINE_MS);
  const signal = options.requestSignal
    ? AbortSignal.any([options.requestSignal, deadlineSignal])
    : deadlineSignal;

  try {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      throwIfAborted(signal, options.subject);
      const before = await options.getMarker(options.userId, signal);
      let data: T;
      try {
        data = await options.read(signal);
      } catch (error) {
        if (!isIncompletePageError(error)) throw error;

        const afterIncompletePage = await options.getMarker(options.userId, signal);
        if (!markersMatch(before, afterIncompletePage)) {
          if (attempt === 0) continue;
          throw new TimeblockServiceError(
            'CONTEXT_CHANGED',
            `Timeblock ${options.subject} changed while it was being read`,
          );
        }
        throw new TimeblockServiceError(
          'FETCH_FAILED',
          `Timeblock ${options.subject} page was incomplete`,
          { cause: error },
        );
      }
      const after = await options.getMarker(options.userId, signal);

      if (markersMatch(before, after)) return { marker: after, data };
      if (attempt === 1) {
        throw new TimeblockServiceError(
          'CONTEXT_CHANGED',
          `Timeblock ${options.subject} changed while it was being read`,
        );
      }
    }
  } catch (error) {
    if (options.requestSignal?.aborted) {
      throw new TimeblockServiceError(
        'REQUEST_CANCELLED',
        `Timeblock ${options.subject} request was cancelled`,
        {
          cause: new UserCancellationError(),
        },
      );
    }
    if (deadlineSignal.aborted) {
      throw new TimeblockServiceError(
        'READ_TIMEOUT',
        `Timeblock ${options.subject} read timed out`,
        {
          cause: error,
        },
      );
    }
    throw error;
  }

  throw new TimeblockServiceError(
    'CONTEXT_CHANGED',
    `Timeblock ${options.subject} could not be stabilized`,
  );
}

/** exact countへ到達するまで読み、環境のrow capによるshort pageをcomplete扱いしない。 */
export async function readCompleteTimeblockPages<T>(
  options: CompleteTimeblockPagesOptions<T>,
): Promise<T[]> {
  const maxRowsToRead = options.maxItems + 1;
  const maxPages = Math.ceil(maxRowsToRead / options.pageSize);
  const rows: T[] = [];
  let expectedRows: number | null = null;

  for (let page = 0; page < maxPages; page += 1) {
    throwIfAborted(options.signal, options.subject);
    const remaining = maxRowsToRead - rows.length;
    const remainingExpected = expectedRows == null ? remaining : expectedRows - rows.length;
    const limit = Math.min(options.pageSize, remaining, remainingExpected);
    const result = await options.readPage(rows.length, limit);

    if (result.rows.length > limit) {
      throw new TimeblockServiceError(
        'FETCH_FAILED',
        `Timeblock ${options.subject} page exceeded its requested limit`,
      );
    }

    if (expectedRows == null) {
      if (
        result.totalCount == null ||
        !Number.isSafeInteger(result.totalCount) ||
        result.totalCount < 0
      ) {
        throw new TimeblockServiceError(
          'FETCH_FAILED',
          `Timeblock ${options.subject} count was not available`,
        );
      }
      expectedRows = Math.min(result.totalCount, maxRowsToRead);
    }

    rows.push(...result.rows);
    if (rows.length === expectedRows) return rows;
    if (rows.length > expectedRows || result.rows.length < limit) {
      throw new TimeblockServiceError(
        'PAGE_INCOMPLETE',
        `Timeblock ${options.subject} page was incomplete`,
      );
    }
  }

  return rows;
}

function markersMatch(before: TimeblockContextMarker, after: TimeblockContextMarker): boolean {
  return before.revision === after.revision && before.timezone === after.timezone;
}

function throwIfAborted(signal: AbortSignal, subject: string): void {
  if (signal.aborted) {
    throw new TimeblockServiceError('FETCH_FAILED', `Timeblock ${subject} read was interrupted`);
  }
}

function isIncompletePageError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as { code: unknown }).code === 'PAGE_INCOMPLETE'
  );
}
