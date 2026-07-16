import 'server-only';

import * as Sentry from '@sentry/nextjs';

import { captureUnexpectedError } from '@/lib/sentry';

import { TimeblockServiceError } from './timeblock-service-error';

const PRIVATE_SEARCH_FAILED_MESSAGE = 'Failed to execute timeblock search';

/**
 * 検索語を含むPostgREST URLをSentryのspan / breadcrumb / auto errorから隔離する。
 * 呼び出し側にはDB詳細を含まない固定errorだけを返す。
 */
export async function runPrivateTimeblockSearchQuery<T>(
  operation: () => PromiseLike<T>,
): Promise<T> {
  try {
    return await Sentry.withScope(async (scope) => {
      // SDK breadcrumbやoperation内のcaptureが検索条件を送らないよう、このscopeでは破棄する。
      scope.addEventProcessor(() => null);

      return Sentry.suppressTracing(async () => {
        // thenableのawaitまで抑止scope内で行い、実際のfetchを外へ漏らさない。
        const result = await operation();
        return result;
      });
    });
  } catch (error) {
    const originalError =
      error instanceof Error ? error : new Error('Unknown timeblock search transport failure');
    captureUnexpectedError(originalError, {
      feature: 'timeblock',
      operation: 'private_search_query',
      source: 'supabase_query',
    });
    throw new TimeblockServiceError('FETCH_FAILED', PRIVATE_SEARCH_FAILED_MESSAGE, {
      cause: originalError,
    });
  }
}
