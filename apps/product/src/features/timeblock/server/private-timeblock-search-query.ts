import 'server-only';

import * as Sentry from '@sentry/nextjs';

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
      // Supabase integrationがDB errorを自動captureしても、このprivate scopeから送信しない。
      scope.addEventProcessor(() => null);

      return Sentry.suppressTracing(async () => {
        // thenableのawaitまで抑止scope内で行い、実際のfetchを外へ漏らさない。
        const result = await operation();
        return result;
      });
    });
  } catch {
    throw new TimeblockServiceError('FETCH_FAILED', PRIVATE_SEARCH_FAILED_MESSAGE);
  }
}
