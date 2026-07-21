/**
 * Next.js Instrumentation Hook
 * サーバー起動時にSentry SDKを初期化
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 * @see https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/
 */

import { sanitizeTechnicalContext, type TechnicalErrorContext } from '@dayopt/observability';

function createTechnicalErrorTags(context: TechnicalErrorContext): Record<string, string> {
  const tags: Record<string, string> = {};
  for (const [key, value] of Object.entries(sanitizeTechnicalContext({ ...context }))) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      tags[key] = String(value);
    }
  }
  return tags;
}

function resolveTechnicalRequestId(
  headers: Record<string, string | string[] | undefined>,
): string | undefined {
  const rawValue = Object.entries(headers).find(
    ([key]) => key.toLowerCase() === 'x-vercel-id',
  )?.[1];
  const candidate = (Array.isArray(rawValue) ? rawValue[0] : rawValue)?.trim();
  if (candidate && candidate.length <= 128 && /^[A-Za-z0-9_.:-]+$/u.test(candidate)) {
    return candidate;
  }
  return undefined;
}

export async function register() {
  // Node.jsランタイム（サーバーサイド）
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }

  // Edgeランタイム（Middleware、Edge API Routes）
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

/**
 * サーバーサイドでキャッチされなかったエラーをSentryに報告
 */
export const onRequestError = async (
  err: Error,
  request: {
    path: string;
    method: string;
    headers: Record<string, string | string[] | undefined>;
  },
  context: {
    routerKind: 'Pages Router' | 'App Router';
    routeType: 'render' | 'route' | 'action' | 'middleware';
    routePath: string;
    revalidateReason: 'on-demand' | 'stale' | undefined;
    renderSource:
      | 'react-server-components'
      | 'react-server-components-payload'
      | 'server-rendering'
      | undefined;
  },
) => {
  const isSentryProduction = process.env.VERCEL_ENV === 'production';
  const hasSentryDsn = Boolean(process.env.SENTRY_DSN);
  if (!isSentryProduction || !hasSentryDsn) return;

  const Sentry = await import('@sentry/nextjs');
  const requestId = resolveTechnicalRequestId(request.headers);
  const tags = createTechnicalErrorTags({
    feature: 'product',
    operation: 'next_request_error',
    route: context.routePath || request.path,
    ...(requestId ? { requestId } : {}),
    source: 'nextjs',
  });

  Sentry.withScope((scope) => {
    scope.setTags(tags);
    Sentry.captureRequestError(err, request, context);
  });
};
