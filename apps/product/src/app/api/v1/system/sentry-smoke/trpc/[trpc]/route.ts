import * as Sentry from '@sentry/nextjs';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';

import {
  authorizeProductOperatorSmoke,
  OPERATOR_SMOKE_RESPONSE_HEADERS,
  operatorSmokeUnavailableResponse,
} from '@/lib/sentry/operator-smoke-auth';
import { operatorSmokeRouter } from '@/lib/sentry/operator-smoke-router';
import { captureUnexpectedTrpcAdapterError } from '@/lib/trpc/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const ENDPOINT = '/api/v1/system/sentry-smoke/trpc';

export async function POST(request: Request): Promise<Response> {
  const authorization = await authorizeProductOperatorSmoke(request);
  if (!authorization.authorized) return authorization.response;

  const response = await Sentry.startNewTrace(() =>
    Sentry.startSpan(
      {
        name: 'operator.sentry_smoke.trpc',
        op: 'test.observability',
        forceTransaction: true,
      },
      () =>
        fetchRequestHandler({
          endpoint: ENDPOINT,
          req: request,
          router: operatorSmokeRouter,
          createContext: () => ({}),
          onError: ({ error, path }) => {
            captureUnexpectedTrpcAdapterError(error, path ?? 'capture', ENDPOINT);
          },
          responseMeta: () => ({ headers: OPERATOR_SMOKE_RESPONSE_HEADERS }),
        }),
    ),
  );
  return (await Sentry.flush(5_000)) ? response : operatorSmokeUnavailableResponse(503);
}

export function GET(): Response {
  return operatorSmokeUnavailableResponse();
}

export function OPTIONS(): Response {
  return operatorSmokeUnavailableResponse();
}
