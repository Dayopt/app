/**
 * Next.js instrumentation hook
 *
 * server start 時に 1 度だけ呼ばれる。public marketing pages の static
 * build 中には呼ばれないため、production secret の存在検証はここで行う。
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
import { assertProductionRuntimeEnv } from '@/platform/config/env';
import {
  createTechnicalErrorTags,
  resolveTechnicalRequestId,
} from '@/platform/observability/technical-error-context';

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    assertProductionRuntimeEnv();
    await import('../sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config');
  }
}

/** Capture unhandled App Router request failures in the active runtime. */
export const onRequestError = async (
  error: unknown,
  request: {
    path: string;
    method: string;
    headers: Record<string, string | string[] | undefined>;
  },
  context: {
    routerKind: string;
    routePath: string;
    routeType: string;
    renderSource?: string;
    revalidateReason?: string;
  },
): Promise<void> => {
  if (process.env.VERCEL_ENV !== 'production') return;

  const Sentry = await import('@sentry/nextjs');
  const tags = createTechnicalErrorTags({
    feature: 'web',
    operation: 'next_request_error',
    route: context.routePath || request.path,
    requestId: resolveTechnicalRequestId(request.headers),
    source: 'nextjs',
  });
  Sentry.withScope((scope) => {
    scope.setTags(tags);
    Sentry.captureRequestError(error, request, context);
  });
};
