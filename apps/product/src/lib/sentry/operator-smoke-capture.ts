import 'server-only';

import * as Sentry from '@sentry/nextjs';

import {
  OPERATOR_SMOKE_RESPONSE_HEADERS,
  operatorSmokeUnavailableResponse,
} from './operator-smoke-auth';

type ProductOperatorSmokeRuntime = 'server' | 'edge';

class ProductOperatorSmokeError extends Error {
  constructor(runtime: ProductOperatorSmokeRuntime) {
    super('Dayopt Product operator Sentry smoke');
    this.name =
      runtime === 'edge' ? 'ProductOperatorEdgeSmokeError' : 'ProductOperatorServerSmokeError';
  }
}

export async function captureProductOperatorSmoke(
  runtime: ProductOperatorSmokeRuntime,
): Promise<Response> {
  const route = `/api/v1/system/sentry-smoke/${runtime}`;
  let eventId = '';

  await Sentry.startNewTrace(() =>
    Sentry.startSpan(
      {
        name: `operator.sentry_smoke.${runtime}`,
        op: 'test.observability',
        forceTransaction: true,
      },
      () => {
        const error = new ProductOperatorSmokeError(runtime);
        eventId = Sentry.withScope((scope) => {
          scope.setTags({
            feature: 'observability',
            operation: `operator_sentry_smoke_${runtime}`,
            route,
            runtime,
          });
          return Sentry.captureException(error);
        });
      },
    ),
  );
  const flushed = await Sentry.flush(5_000);
  if (!flushed) return operatorSmokeUnavailableResponse(503);

  return Response.json(
    { eventId, flushed, runtime },
    {
      status: 202,
      headers: OPERATOR_SMOKE_RESPONSE_HEADERS,
    },
  );
}
